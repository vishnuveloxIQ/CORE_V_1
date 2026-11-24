import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashRequest, runIdempotent } from '../../src/core/idempotency.js';
import { enqueueOutbound, recordInbound, type EventEnvelope } from '../../src/core/events.js';
import { withTenant } from '../../src/db/tenant.js';
import { recordOfflineOperation } from '../../src/modules/offline/service.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'project.created',
    eventVersion: '1',
    aggregateType: 'project',
    aggregateId: randomUUID(),
    occurredAt: new Date().toISOString(),
    payload: { code: 'P-1' },
    schemaVersion: '1',
    sourceModule: 'pm',
    ...overrides,
  };
}

describe.skipIf(!TEST_DATABASE_URL)('integration services', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe('idempotency', () => {
    it('runs the work once and replays the stored response for the same key and request', async () => {
      const requestHash = hashRequest({ method: 'POST', path: '/leave', body: { days: 2 } });
      let runs = 0;
      const work = async () => {
        runs += 1;
        return { leaveId: 'L-1' };
      };

      const first = await withTenant(db.pool, 'acme', (client) =>
        runIdempotent(client, { key: 'key-1', requestHash }, work),
      );
      const second = await withTenant(db.pool, 'acme', (client) =>
        runIdempotent(client, { key: 'key-1', requestHash }, work),
      );

      expect(first).toEqual({ replayed: false, value: { leaveId: 'L-1' } });
      expect(second).toEqual({ replayed: true, value: { leaveId: 'L-1' } });
      expect(runs).toBe(1);
    });

    it('refuses a key reused with a different request with 409', async () => {
      const other = hashRequest({ method: 'POST', path: '/leave', body: { days: 5 } });
      await expect(
        withTenant(db.pool, 'acme', (client) =>
          runIdempotent(client, { key: 'key-1', requestHash: other }, async () => 'unused'),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
    });

    it('rolls back the stored response when the work fails', async () => {
      await expect(
        withTenant(db.pool, 'acme', (client) =>
          runIdempotent(client, { key: 'key-2', requestHash: 'h' }, async () => {
            throw new Error('failed');
          }),
        ),
      ).rejects.toThrow('failed');

      const { rows } = await db.pool.query(
        `SELECT 1 FROM tenant_acme.integ_idempotency_key WHERE key = 'key-2'`,
      );
      expect(rows).toHaveLength(0);
    });

    it('rejects an empty key', async () => {
      await expect(
        withTenant(db.pool, 'acme', (client) =>
          runIdempotent(client, { key: '', requestHash: 'h' }, async () => 'x'),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_IDEMPOTENCY_KEY', status: 400 });
    });
  });

  describe('outbox and inbox', () => {
    it('numbers outbound events per aggregate, starting at 1 with no gaps', async () => {
      const aggregateId = randomUUID();
      const seqs: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const result = await withTenant(db.pool, 'acme', (client) =>
          enqueueOutbound(client, envelope({ aggregateId })),
        );
        seqs.push(result.aggregateSeq);
      }
      expect(seqs).toEqual([1, 2, 3]);

      const { rows } = await db.pool.query<{ direction: string; status: string }>(
        `SELECT direction, status FROM tenant_acme.integ_event WHERE aggregate_id = $1`,
        [aggregateId],
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.direction === 'outbound' && r.status === 'pending')).toBe(true);
    });

    it('records an inbound event once and reports a redelivery as a duplicate', async () => {
      const event = envelope({ sourceModule: 'hrms', aggregateSeq: 7 });
      const first = await withTenant(db.pool, 'acme', (client) => recordInbound(client, event));
      const second = await withTenant(db.pool, 'acme', (client) => recordInbound(client, event));

      expect(first.status).toBe('recorded');
      expect(second).toEqual({ status: 'duplicate', id: null });
    });
  });

  describe('offline operations', () => {
    const input = {
      clientDeviceKey: 'device-7',
      clientOperationKey: 'op-42',
      operationType: 'attendance.punch',
      capturedAt: '2026-11-19T08:30:00Z',
      payload: { lat: 12.97 },
    };

    it('stores an operation as received and returns the same row for a resent operation', async () => {
      const first = await withTenant(db.pool, 'acme', (client) =>
        recordOfflineOperation(client, input),
      );
      const again = await withTenant(db.pool, 'acme', (client) =>
        recordOfflineOperation(client, input),
      );

      expect(first.duplicate).toBe(false);
      expect(again).toEqual({ id: first.id, duplicate: true });

      const { rows } = await db.pool.query<{ sync_status: string }>(
        `SELECT sync_status FROM tenant_acme.integ_offline_operation WHERE id = $1`,
        [first.id],
      );
      expect(rows[0]?.sync_status).toBe('received');
    });
  });
});
