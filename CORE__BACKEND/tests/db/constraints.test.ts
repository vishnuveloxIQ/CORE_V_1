import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashRequest, runIdempotent } from '../../src/core/idempotency.js';
import { withTenant } from '../../src/db/tenant.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

describe.skipIf(!TEST_DATABASE_URL)('approved constraints (migration 0004)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('keeps one idempotency row per key', async () => {
    await db.pool.query(
      `INSERT INTO tenant_acme.integ_idempotency_key (key, request_hash, response, expires_at)
       VALUES ('dup-key', 'h1', 'null', now() + interval '1 day')`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.integ_idempotency_key (key, request_hash, response, expires_at)
         VALUES ('dup-key', 'h2', 'null', now() + interval '1 day')`,
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('reuses a key whose stored response has expired', async () => {
    await db.pool.query(
      `INSERT INTO tenant_acme.integ_idempotency_key (key, request_hash, response, expires_at)
       VALUES ('stale-key', 'old', 'null', now() - interval '1 day')`,
    );
    const requestHash = hashRequest({ path: '/again' });
    const outcome = await withTenant(db.pool, 'acme', (client) =>
      runIdempotent(client, { key: 'stale-key', requestHash }, async () => ({ ok: true })),
    );
    expect(outcome).toEqual({ replayed: false, value: { ok: true } });
  });

  it('keeps one sequence row per aggregate', async () => {
    const aggregateId = randomUUID();
    await db.pool.query(
      `INSERT INTO tenant_acme.integ_aggregate_sequence (aggregate_type, aggregate_id, last_seq)
       VALUES ('project', $1, 1)`,
      [aggregateId],
    );
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.integ_aggregate_sequence (aggregate_type, aggregate_id, last_seq)
         VALUES ('project', $1, 1)`,
        [aggregateId],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('accepts only the status vocabulary for each direction', async () => {
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.integ_event (direction, status) VALUES ('outbound', 'received')`,
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.integ_event (direction, status) VALUES ('inbound', 'pending')`,
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.integ_event (direction, status) VALUES ('inbound', 'received')`,
      ),
    ).resolves.toBeDefined();
  });

  it('removes a passkey when its user is deleted', async () => {
    const userId = randomUUID();
    await db.pool.query(`INSERT INTO tenant_acme.core_user (id) VALUES ($1)`, [userId]);
    await db.pool.query(
      `INSERT INTO tenant_acme.core_user_passkey (user_id, credential_key) VALUES ($1, 'cred-1')`,
      [userId],
    );
    await db.pool.query(`DELETE FROM tenant_acme.core_user WHERE id = $1`, [userId]);
    const { rows } = await db.pool.query(
      `SELECT 1 FROM tenant_acme.core_user_passkey WHERE user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(0);
  });

  it('creates the lookup and foreign-key indexes', async () => {
    const { rows } = await db.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'tenant_acme'
         AND indexname IN ('ix_audit_row_change_changed_at', 'ix_core_user_passkey_user_id')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'ix_audit_row_change_changed_at',
      'ix_core_user_passkey_user_id',
    ]);
  });
});
