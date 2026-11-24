import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { type ChainReport, verifyAuditChain } from '../core/audit.js';
import { backupTenant, connectionPartsFrom, restoreTenant, runTool, schemaFor } from './backup.js';
import { createPool } from './client.js';
import { migrateGlobal, quoteIdent } from './migrate.js';
import { withTenant } from './tenant.js';

/**
 * Backup and restore drill for one tenant. It proves a backup can be restored, without touching the source:
 *  1. reads a fingerprint of the source tenant (every table's row count and a content checksum) and checks its audit chain;
 *  2. dumps the shared reference data (shared.uom) and the tenant schema with the same tools as db:backup;
 *  3. creates a scratch database, applies the global migrations, restores the shared data, then the tenant schema;
 *  4. fingerprints the restored copy, compares it table by table, and checks the restored audit chain;
 *  5. drops the scratch database and deletes the dump files (unless asked to keep them), and reports the timings.
 * The source database is only read. The connection string never appears in the report or in an error message.
 */

export interface TableFingerprint {
  table: string;
  rows: number;
  /** md5 over the md5 of every row's text, in a fixed order, so equal content gives an equal checksum. */
  checksum: string;
}

export interface DrillStep {
  name: string;
  ms: number;
}

export interface DrillReport {
  tenantId: string;
  startedAt: string;
  ok: boolean;
  steps: DrillStep[];
  totalMs: number;
  /** Time from the start of the restore (scratch database created) to a verified copy: the measured recovery time. */
  restoreMs: number;
  tables: number;
  rows: number;
  dumpBytes: number;
  mismatches: string[];
  auditChain: { source: ChainReport; restored: ChainReport };
  /** The scratch database this run used. It is dropped at the end; the report says so when it could not be. */
  scratchDatabase: string;
  /** Set when a step failed; the drill stops there. */
  error?: string;
  keptDumpDir?: string;
}

/** Every table of the tenant schema with its row count and content checksum, in table-name order. */
export async function fingerprintTenant(pool: Pool, tenantId: string): Promise<TableFingerprint[]> {
  const schema = schemaFor(tenantId);
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [schema],
  );
  const out: TableFingerprint[] = [];
  for (const { table_name } of tables) {
    const qualified = `${quoteIdent(schema)}.${quoteIdent(table_name)}`;
    const { rows } = await pool.query<{ n: string; sum: string | null }>(
      `SELECT count(*)::text AS n,
              md5(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), '')) AS sum
       FROM ${qualified} AS t`,
    );
    out.push({ table: table_name, rows: Number(rows[0]?.n ?? 0), checksum: rows[0]?.sum ?? '' });
  }
  return out;
}

/** Differences between two fingerprints, as plain sentences. Empty when the copies match. */
export function compareFingerprints(source: TableFingerprint[], restored: TableFingerprint[]): string[] {
  const problems: string[] = [];
  const restoredByTable = new Map(restored.map((t) => [t.table, t]));
  const sourceTables = new Set(source.map((t) => t.table));
  for (const s of source) {
    const r = restoredByTable.get(s.table);
    if (!r) {
      problems.push(`${s.table}: missing from the restored copy`);
    } else if (r.rows !== s.rows) {
      problems.push(`${s.table}: ${s.rows} rows in the source, ${r.rows} restored`);
    } else if (r.checksum !== s.checksum) {
      problems.push(`${s.table}: same row count (${s.rows}) but different content`);
    }
  }
  for (const r of restored) {
    if (!sourceTables.has(r.table)) problems.push(`${r.table}: in the restored copy but not in the source`);
  }
  return problems;
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function timed<T>(steps: DrillStep[], name: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    steps.push({ name, ms: Math.round(performance.now() - started) });
  }
}

async function chainOf(pool: Pool, tenantId: string): Promise<ChainReport> {
  return withTenant(pool, tenantId, (client) => verifyAuditChain(client));
}

/** Runs the drill. It never throws for a failed step: the report says what failed. Unsafe tenant ids throw at once. */
export async function runRestoreDrill(
  connectionString: string,
  tenantId: string,
  options: { keepDump?: boolean } = {},
): Promise<DrillReport> {
  schemaFor(tenantId);
  const steps: DrillStep[] = [];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const dir = mkdtempSync(join(tmpdir(), 'velox-drill-'));
  const scratchName = `velox_drill_${randomBytes(6).toString('hex')}`;
  const scratchUrl = withDatabase(connectionString, scratchName);
  const source = createPool(connectionString, 2);
  let scratch: Pool | undefined;
  let scratchCreated = false;
  let restoreStarted = 0;

  const report: DrillReport = {
    tenantId,
    startedAt,
    ok: false,
    steps,
    totalMs: 0,
    restoreMs: 0,
    tables: 0,
    rows: 0,
    dumpBytes: 0,
    mismatches: [],
    auditChain: { source: { rows: 0, brokenAt: null }, restored: { rows: 0, brokenAt: null } },
    scratchDatabase: scratchName,
  };

  try {
    const before = await timed(steps, 'Fingerprint the source tenant', () => fingerprintTenant(source, tenantId));
    report.tables = before.length;
    report.rows = before.reduce((n, t) => n + t.rows, 0);
    report.auditChain.source = await timed(steps, 'Check the source audit chain', () => chainOf(source, tenantId));

    const sharedFile = join(dir, 'shared.dump');
    const tenantFile = join(dir, `${tenantId}.dump`);
    await timed(steps, 'Dump the shared reference data', async () => {
      const { env, database } = connectionPartsFrom(connectionString);
      const run = await runTool(
        'pg_dump',
        ['--format=custom', '--data-only', '--schema=shared', '--no-owner', '--no-privileges', `--file=${sharedFile}`, database],
        env,
      );
      if (run.code !== 0) throw new Error(`pg_dump of the shared data failed with exit code ${run.code}${run.message ? `: ${run.message}` : ''}`);
    });
    await timed(steps, 'Dump the tenant schema', () => backupTenant(connectionString, tenantId, tenantFile));
    report.dumpBytes = statSync(sharedFile).size + statSync(tenantFile).size;

    restoreStarted = performance.now();
    await timed(steps, 'Create the scratch database', async () => {
      await source.query(`CREATE DATABASE ${quoteIdent(scratchName)}`);
      scratchCreated = true;
    });
    scratch = createPool(scratchUrl, 2);
    await timed(steps, 'Apply the global migrations', () => migrateGlobal(scratch!));
    await timed(steps, 'Restore the shared reference data', async () => {
      const { env } = connectionPartsFrom(scratchUrl);
      const run = await runTool(
        'pg_restore',
        ['--data-only', '--schema=shared', '--no-owner', '--no-privileges', `--dbname=${scratchName}`, sharedFile],
        env,
      );
      if (run.code !== 0) throw new Error(`pg_restore of the shared data failed with exit code ${run.code}${run.message ? `: ${run.message}` : ''}`);
    });
    await timed(steps, 'Restore the tenant schema', () => restoreTenant(scratchUrl, tenantId, tenantFile, { replace: true }));

    const after = await timed(steps, 'Fingerprint the restored copy', () => fingerprintTenant(scratch!, tenantId));
    report.mismatches = compareFingerprints(before, after);
    report.auditChain.restored = await timed(steps, 'Check the restored audit chain', () => chainOf(scratch!, tenantId));
    report.restoreMs = Math.round(performance.now() - restoreStarted);

    const chainOk =
      report.auditChain.restored.brokenAt === null &&
      report.auditChain.restored.rows === report.auditChain.source.rows &&
      report.auditChain.source.brokenAt === null;
    if (!chainOk) report.mismatches.push('audit chain: the restored chain does not verify, or its length differs from the source');
    report.ok = report.mismatches.length === 0;
  } catch (err) {
    report.error = err instanceof Error ? err.message : 'the drill stopped on an unknown error';
    if (restoreStarted && !report.restoreMs) report.restoreMs = Math.round(performance.now() - restoreStarted);
  } finally {
    await scratch?.end().catch(() => undefined);
    if (scratchCreated) {
      const drop = () => source.query(`DROP DATABASE IF EXISTS ${quoteIdent(scratchName)} WITH (FORCE)`);
      // one retry: a restore tool that has just exited can still hold a connection for a moment
      await timed(steps, 'Drop the scratch database', () =>
        drop().catch(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return drop();
        }),
      ).catch(() => {
        // always reported, even after another failure, so a leftover copy of tenant data is never silent
        const message = `the scratch database ${scratchName} could not be dropped; drop it by hand`;
        report.error = report.error ? `${report.error}; ${message}` : message;
        report.ok = false;
      });
    }
    await source.end().catch(() => undefined);
    if (options.keepDump) report.keptDumpDir = dir;
    else rmSync(dir, { recursive: true, force: true });
    report.totalMs = Math.round(performance.now() - started);
  }
  return report;
}

/** The report as Markdown, for a drill log. Contains counts and timings only: no data, no connection details. */
export function drillReportMarkdown(report: DrillReport): string {
  const lines = [
    `# Restore drill: tenant ${report.tenantId}`,
    '',
    `- Started: ${report.startedAt}`,
    `- Result: **${report.ok ? 'PASSED' : 'FAILED'}**${report.error ? ` (${report.error})` : ''}`,
    `- Tables: ${report.tables}, rows: ${report.rows}, dump size: ${(report.dumpBytes / 1024).toFixed(1)} KiB`,
    `- Audit chain: source ${report.auditChain.source.rows} rows${report.auditChain.source.brokenAt ? ' (broken)' : ' (intact)'}, restored ${report.auditChain.restored.rows} rows${report.auditChain.restored.brokenAt ? ' (broken)' : ' (intact)'}`,
    `- Restore time (scratch database to verified copy): ${(report.restoreMs / 1000).toFixed(1)} s; whole drill: ${(report.totalMs / 1000).toFixed(1)} s`,
    '',
    '| Step | Time |',
    '|---|---|',
    ...report.steps.map((s) => `| ${s.name} | ${(s.ms / 1000).toFixed(2)} s |`),
    '',
    report.mismatches.length ? '## Differences' : '## Differences: none',
    ...report.mismatches.map((m) => `- ${m}`),
  ];
  if (report.keptDumpDir) lines.push('', `Dump files kept in ${report.keptDumpDir}. They hold personal data: encrypt or delete them.`);
  return `${lines.join('\n')}\n`;
}
