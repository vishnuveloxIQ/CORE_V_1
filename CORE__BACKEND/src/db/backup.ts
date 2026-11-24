import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createPool } from './client.js';
import { quoteIdent } from './migrate.js';

// Per-tenant backup and restore (Phase N, design default e). Only the tenant schema is dumped or restored.
// The password travels in PGPASSWORD, never on the command line, and error output never contains the URL.

const TENANT_ID = /^[a-z][a-z0-9_]{0,39}$/;

/** Schema name for a tenant id. Rejects anything that is not a safe lowercase identifier. */
export function schemaFor(tenantId: string): string {
  if (!TENANT_ID.test(tenantId)) {
    throw new Error(
      'tenant id must start with a letter and use only a-z, 0-9 and _ (max 40 characters)',
    );
  }
  return `tenant_${tenantId}`;
}

export interface ConnectionParts {
  env: Record<string, string>;
  database: string;
}

/** Splits a postgres:// URL into libpq environment variables. */
export function connectionPartsFrom(connectionString: string): ConnectionParts {
  const url = new URL(connectionString);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
  };
  if (url.username) {
    env['PGUSER'] = decodeURIComponent(url.username);
  }
  if (url.password) {
    env['PGPASSWORD'] = decodeURIComponent(url.password);
  }
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) {
    env['PGSSLMODE'] = sslmode;
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return { env, database };
}

export interface ToolRun {
  code: number;
  /** First line of stderr, with anything that looks like a connection string removed. */
  message: string;
}

/** Removes URLs and password-like fragments from tool output before it can reach a log or the console. */
export function scrub(text: string): string {
  return text
    .replace(/postgres(ql)?:\/\/\S+/gi, '[connection string removed]')
    .replace(/password\s*=\s*\S+/gi, 'password=[removed]');
}

function binaryPath(name: string): string {
  const bin = process.env['PG_BIN'];
  return bin ? join(bin, name) : name;
}

/** Runs a PostgreSQL client tool and reports its exit code and first error line only. */
export function runTool(
  tool: 'pg_dump' | 'pg_restore',
  args: string[],
  env: Record<string, string>,
): Promise<ToolRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath(tool), args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'ENOENT'
            ? `${tool} was not found (set PG_BIN or add it to PATH)`
            : `${tool} could not start`,
        ),
      );
    });
    child.on('close', (code) => {
      const firstLine = stderr.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
      resolve({ code: code ?? 1, message: scrub(firstLine) });
    });
  });
}

/** Writes a custom-format dump of one tenant schema to `file`. */
export async function backupTenant(
  connectionString: string,
  tenantId: string,
  file: string,
): Promise<void> {
  const schema = schemaFor(tenantId);
  const { env, database } = connectionPartsFrom(connectionString);
  const run = await runTool(
    'pg_dump',
    [
      '--format=custom',
      `--schema=${schema}`,
      '--no-owner',
      '--no-privileges',
      `--file=${file}`,
      database,
    ],
    env,
  );
  if (run.code !== 0) {
    throw new Error(
      `pg_dump failed with exit code ${run.code}${run.message ? `: ${run.message}` : ''}`,
    );
  }
}

/**
 * Restores one tenant schema from a custom-format dump. Replaces the schema's objects, so the caller must
 * pass replace: true. Without it the function refuses and changes nothing.
 */
export async function restoreTenant(
  connectionString: string,
  tenantId: string,
  file: string,
  options: { replace: boolean },
): Promise<void> {
  if (!options.replace) {
    throw new Error('restore replaces the tenant schema; pass --replace to confirm');
  }
  const schema = schemaFor(tenantId);
  const { env, database } = connectionPartsFrom(connectionString);
  // pg_restore --schema restores the objects in the schema but not the schema itself, so a restore onto a fresh
  // server (no tenant schema yet) would fail. Create the empty schema first; an existing one is left as it is.
  const pool = createPool(connectionString, 1);
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  } catch {
    throw new Error(`could not create the schema ${schema} before the restore`);
  } finally {
    await pool.end().catch(() => undefined);
  }
  const run = await runTool(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      `--schema=${schema}`,
      '--no-owner',
      '--no-privileges',
      `--dbname=${database}`,
      file,
    ],
    env,
  );
  // Any non-zero exit is a failure; the first error line is reported without the connection string.
  if (run.code !== 0) {
    throw new Error(
      `pg_restore failed with exit code ${run.code}${run.message ? `: ${run.message}` : ''}`,
    );
  }
}
