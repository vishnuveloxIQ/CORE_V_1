import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAuditRow, verifyAuditChain } from '../../src/core/audit.js';
import { withTenant } from '../../src/db/tenant.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

// The app login is refused by the grants ("permission denied"); a refusal by the trigger says "append-only".
const REFUSED = /append-only|permission denied/;

// The tests run in order: the chain is built by the first test and checked by the later ones.
describe.skipIf(!TEST_DATABASE_URL)('audit_row_change', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('chains rows in order and stores no approved hash column in a snapshot', async () => {
    await withTenant(db.pool, 'acme', async (client) => {
      await appendAuditRow(client, {
        tableName: 'core_user',
        recordId: '11111111-1111-4111-8111-111111111111',
        op: 'INSERT',
        newRow: {
          username: 'asha',
          password_hash: 'SECRETHASHVALUE',
          nested: { pin_hash: 'PINHASHVALUE' },
        },
        moduleName: 'core',
      });
      await appendAuditRow(client, {
        tableName: 'core_user',
        recordId: '11111111-1111-4111-8111-111111111111',
        op: 'UPDATE',
        oldRow: { username: 'asha' },
        newRow: { username: 'asha.k' },
        moduleName: 'core',
      });
      await appendAuditRow(client, {
        tableName: 'core_user',
        recordId: '11111111-1111-4111-8111-111111111111',
        op: 'UPDATE',
        oldRow: { username: 'asha.k' },
        newRow: { username: 'asha.kumar' },
        moduleName: 'core',
      });
    });

    const { rows } = await db.pool.query<{
      new_row: unknown;
      prev_hash: string | null;
      row_hash: string;
    }>(`SELECT new_row, prev_hash, row_hash FROM tenant_acme.audit_row_change ORDER BY changed_at`);
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows[0]?.new_row)).not.toContain('SECRETHASHVALUE');
    expect(JSON.stringify(rows[0]?.new_row)).not.toContain('PINHASHVALUE');
    // The approved hash columns are removed from the snapshot, not replaced.
    expect(rows[0]?.new_row).toEqual({ username: 'asha', nested: {} });
    expect(rows[0]?.prev_hash).toBeNull();
    expect(rows[1]?.prev_hash).toBe(rows[0]?.row_hash);
    expect(rows[2]?.prev_hash).toBe(rows[1]?.row_hash);
  });

  it('verifies an intact chain', async () => {
    const report = await withTenant(db.pool, 'acme', (client) => verifyAuditChain(client));
    expect(report).toEqual({ rows: 3, brokenAt: null });
  });

  it('refuses UPDATE, DELETE and TRUNCATE on the audit table', async () => {
    await expect(
      withTenant(db.pool, 'acme', (client) =>
        client.query(`UPDATE audit_row_change SET op = 'DELETE'`),
      ),
    ).rejects.toThrow(REFUSED);
    await expect(
      withTenant(db.pool, 'acme', (client) => client.query(`DELETE FROM audit_row_change`)),
    ).rejects.toThrow(REFUSED);
    await expect(
      withTenant(db.pool, 'acme', (client) => client.query(`TRUNCATE audit_row_change`)),
    ).rejects.toThrow(REFUSED);
  });

  it('detects a row changed behind the trigger', async () => {
    // the owner bypasses the grants, and the trigger is what stops the change: the chain check must still catch it
    const report = await withTenant(db.owner, 'acme', async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM audit_row_change ORDER BY changed_at LIMIT 2 OFFSET 1`,
      );
      const target = rows[0]?.id;
      // The table owner can disable user triggers. The chain check must still catch the edit.
      await client.query('ALTER TABLE audit_row_change DISABLE TRIGGER USER');
      await client.query(
        `UPDATE audit_row_change SET new_row = '{"username":"forged"}'::jsonb WHERE id = $1`,
        [target],
      );
      const check = await verifyAuditChain(client);
      return { check, target };
    });
    expect(report.check.rows).toBe(3);
    expect(report.check.brokenAt).toBe(report.target);
  });
});
