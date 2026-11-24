import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../../src/db/tenant.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

async function countEvents(db: TestDatabase, tenantId: string): Promise<number> {
  return withTenant(db.pool, tenantId, async (client) => {
    const { rows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM integ_event');
    return Number(rows[0]?.n);
  });
}

describe.skipIf(!TEST_DATABASE_URL)('tenant context', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme', 'beta']);
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('tenant A cannot read tenant B: rows written in A are invisible in B', async () => {
    await withTenant(db.pool, 'acme', (client) =>
      client.query(`INSERT INTO integ_event (direction) VALUES ('outbound')`),
    );

    expect(await countEvents(db, 'acme')).toBe(1);
    expect(await countEvents(db, 'beta')).toBe(0);
  });

  it('a tenant that was never provisioned has no tables to read', async () => {
    await expect(countEvents(db, 'gamma')).rejects.toThrow(/does not exist/);
  });

  it('rejects an unsafe tenant id before a connection is used', async () => {
    await expect(
      withTenant(db.pool, 'acme; DROP SCHEMA tenant_beta', async () => 'unreachable'),
    ).rejects.toThrow(/Invalid tenant id/);
  });

  it('rolls back the whole unit of work when it fails', async () => {
    const before = await countEvents(db, 'beta');
    await expect(
      withTenant(db.pool, 'beta', async (client) => {
        await client.query(`INSERT INTO integ_event (direction) VALUES ('inbound')`);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');
    expect(await countEvents(db, 'beta')).toBe(before);
  });

  it('does not leak the tenant search_path to the next user of a pooled connection', async () => {
    await withTenant(db.pool, 'acme', async () => undefined);
    const { rows } = await db.pool.query<{ search_path: string }>('SHOW search_path');
    expect(rows[0]?.search_path).not.toContain('tenant_acme');
  });
});
