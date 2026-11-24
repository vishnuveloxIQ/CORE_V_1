import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  backupTenant,
  connectionPartsFrom,
  restoreTenant,
  runTool,
  schemaFor,
  scrub,
} from '../../src/db/backup.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Phase N (e): per-tenant backup and restore. Example data is fictional.

const SLOW_TEST_MS = 60_000;

/** True when the PostgreSQL client tools can be started. The round trip is skipped otherwise. */
async function toolsAvailable(): Promise<boolean> {
  try {
    const run = await runTool('pg_dump', ['--version'], {});
    return run.code === 0;
  } catch {
    return false;
  }
}

const hasTools = TEST_DATABASE_URL ? await toolsAvailable() : false;

describe('backup helpers (hardening)', () => {
  it('maps a tenant id to its schema and rejects unsafe ids', () => {
    expect(schemaFor('acme')).toBe('tenant_acme');
    expect(() => schemaFor('acme; DROP SCHEMA public')).toThrow();
    expect(() => schemaFor('Acme')).toThrow();
    expect(() => schemaFor('')).toThrow();
  });

  it('splits a connection string into libpq variables', () => {
    const parts = connectionPartsFrom(
      'postgres://app%40user:s3cret%21@db.example.test:6543/velox_core?sslmode=require',
    );
    expect(parts.database).toBe('velox_core');
    expect(parts.env['PGHOST']).toBe('db.example.test');
    expect(parts.env['PGPORT']).toBe('6543');
    expect(parts.env['PGUSER']).toBe('app@user');
    expect(parts.env['PGPASSWORD']).toBe('s3cret!');
    expect(parts.env['PGSSLMODE']).toBe('require');
  });

  it('removes connection strings and password fragments from tool output', () => {
    const text = scrub('connection to postgres://u:p@h/db failed; password=hunter2');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('postgres://');
  });

  it('refuses a restore that is not confirmed with replace, before any tool runs', async () => {
    await expect(
      restoreTenant('postgres://u:p@127.0.0.1:1/none', 'acme', 'nowhere.dump', { replace: false }),
    ).rejects.toThrow(/--replace/);
  });
});

describe.skipIf(!TEST_DATABASE_URL || !hasTools)(
  'backup and restore round trip for one tenant (hardening)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let dir: string;

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, ['acme', 'beta']);
      dir = mkdtempSync(join(tmpdir(), 'velox-backup-'));
      await db.pool.query(
        `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
         VALUES ('backup-user', 'Backup Check', 'active', 'x', 0)`,
      );
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await db?.drop();
      rmSync(dir, { recursive: true, force: true });
    });

    it('restores the tenant schema from a dump and leaves the other tenant alone', async () => {
      await db.pool.query(
        `INSERT INTO tenant_beta.core_user (login_id, name, status, password_hash, failed_count)
         VALUES ('beta-user', 'Beta Check', 'active', 'x', 0)`,
      );
      const file = join(dir, 'acme.dump');
      await backupTenant(db.ownerUrl, 'acme', file);

      await db.pool.query(`DELETE FROM tenant_acme.core_user WHERE login_id = 'backup-user'`);
      const gone = await db.pool.query(`SELECT count(*)::int AS n FROM tenant_acme.core_user`);
      expect(gone.rows[0]?.n).toBe(0);

      await restoreTenant(db.ownerUrl, 'acme', file, { replace: true });

      const back = await db.pool.query<{ login_id: string }>(
        `SELECT login_id FROM tenant_acme.core_user ORDER BY login_id`,
      );
      expect(back.rows.map((row) => row.login_id)).toEqual(['backup-user']);
      const beta = await db.pool.query(`SELECT count(*)::int AS n FROM tenant_beta.core_user`);
      expect(beta.rows[0]?.n).toBe(1);
    });
  },
);
