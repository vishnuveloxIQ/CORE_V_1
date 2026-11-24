import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAuditRow } from '../../src/core/audit.js';
import { runTool } from '../../src/db/backup.js';
import {
  compareFingerprints,
  drillReportMarkdown,
  runRestoreDrill,
  type TableFingerprint,
} from '../../src/db/restore-drill.js';
import { withTenant } from '../../src/db/tenant.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Backup and restore drill. Example data is fictional.

const SLOW_TEST_MS = 120_000;

async function toolsAvailable(): Promise<boolean> {
  try {
    return (await runTool('pg_dump', ['--version'], {})).code === 0;
  } catch {
    return false;
  }
}

const hasTools = TEST_DATABASE_URL ? await toolsAvailable() : false;

describe('restore drill comparison', () => {
  const base: TableFingerprint[] = [
    { table: 'core_user', rows: 2, checksum: 'a' },
    { table: 'core_vendor', rows: 1, checksum: 'b' },
  ];

  it('finds no difference between equal copies', () => {
    expect(compareFingerprints(base, [...base])).toEqual([]);
  });

  it('reports a missing table, a changed row count, changed content and an extra table', () => {
    const restored: TableFingerprint[] = [
      { table: 'core_user', rows: 1, checksum: 'a' },
      { table: 'core_extra', rows: 0, checksum: '' },
    ];
    expect(compareFingerprints(base, restored)).toEqual([
      'core_user: 2 rows in the source, 1 restored',
      'core_vendor: missing from the restored copy',
      'core_extra: in the restored copy but not in the source',
    ]);
    expect(compareFingerprints(base, [base[0]!, { table: 'core_vendor', rows: 1, checksum: 'changed' }])).toEqual([
      'core_vendor: same row count (1) but different content',
    ]);
  });
});

describe.skipIf(!TEST_DATABASE_URL || !hasTools)('restore drill against a real database', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme', 'beta']);
    // A unit in the shared schema and a material that points at it: the restore must bring the shared data back first.
    const uom = await db.pool.query<{ id: string }>(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ('BAG', 'Bag') RETURNING id`,
    );
    await db.pool.query(
      `INSERT INTO tenant_acme.core_material (code, name, uom_id) VALUES ('CEM-53', 'Cement OPC 53', $1)`,
      [uom.rows[0]!.id],
    );
    await db.pool.query(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ('drill-user', 'Drill Check', 'active', 'x', 0)`,
    );
    for (const name of ['First', 'Second']) {
      await withTenant(db.pool, 'acme', (client) =>
        appendAuditRow(client, {
          tableName: 'core_material',
          recordId: randomUUID(),
          op: 'INSERT',
          oldRow: null,
          newRow: { name },
          actorId: null,
          moduleName: 'core',
        }),
      );
    }
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await db?.drop();
  });

  it('restores the tenant into a scratch database, finds no difference, and verifies the audit chain', async () => {
    const before = await db.pool.query(`SELECT count(*)::int AS n FROM tenant_acme.core_material`);
    const report = await runRestoreDrill(db.url, 'acme');

    expect(report.error).toBeUndefined();
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.tables).toBeGreaterThan(50);
    expect(report.rows).toBeGreaterThanOrEqual(4);
    expect(report.auditChain.source).toEqual({ rows: 2, brokenAt: null });
    expect(report.auditChain.restored).toEqual({ rows: 2, brokenAt: null });
    expect(report.restoreMs).toBeGreaterThan(0);
    expect(report.steps.map((s) => s.name)).toContain('Drop the scratch database');

    // The source is untouched and this run's scratch database is gone (other runs' databases are not this test's).
    const after = await db.pool.query(`SELECT count(*)::int AS n FROM tenant_acme.core_material`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(report.scratchDatabase).toMatch(/^velox_drill_[0-9a-f]{12}$/);
    const scratch = await db.pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [report.scratchDatabase]);
    expect(scratch.rows).toHaveLength(0);

    const markdown = drillReportMarkdown(report);
    expect(markdown).toContain('PASSED');
    expect(markdown).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('refuses an unsafe tenant id before anything runs', async () => {
    await expect(runRestoreDrill(db.url, 'acme; DROP SCHEMA tenant_beta')).rejects.toThrow(/tenant id/);
  });

  it('reports a failure, and still cleans up, when the tenant schema does not exist', async () => {
    const report = await runRestoreDrill(db.url, 'nosuchtenant');
    expect(report.ok).toBe(false);
    expect(report.error).toBeDefined();
    const scratch = await db.pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [report.scratchDatabase]);
    expect(scratch.rows).toHaveLength(0);
  });
});
