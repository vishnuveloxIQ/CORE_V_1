import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { enqueueOutbound, type EventEnvelope } from '../../src/core/events.js';
import { MockPublisher, relayTenant, retryDelaySeconds, retryPolicyFrom, startRelay, type RetryPolicy } from '../../src/core/relay.js';
import { withTenant } from '../../src/db/tenant.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// CORE-23-05 to 24-08: the transactional outbox, the relay (order, retries, dead-letter, replay, wakeup), the monitor
// and the inbox that keeps the read models. The production transport is open (D13): a MockPublisher stands in.
// Example data is fictional.

const SLOW_TEST_MS = 120_000;
const POLICY: RetryPolicy = { maxAttempts: 3, baseDelaySeconds: 10, factor: 2, maxDelaySeconds: 60 };
const data = <T>(res: Reply) => (res.json() as { data: T }).data;

const envelope = (aggregateId: string, over: Partial<EventEnvelope> = {}): EventEnvelope => ({
  eventId: randomUUID(), eventType: 'approval_request.decided', eventVersion: '1', aggregateType: 'approval_request', aggregateId,
  occurredAt: new Date().toISOString(), payload: { status: 'pending', secretNote: 'never shown' }, schemaVersion: '1', sourceModule: 'core', ...over,
});

describe('retry policy (decision D14 open)', () => {
  it('has no defaults: missing values mean no policy, so the relay does not start', () => {
    expect(retryPolicyFrom({})).toBeNull()
    expect(retryPolicyFrom({ EVENT_RETRY_MAX_ATTEMPTS: '5', EVENT_RETRY_BASE_SECONDS: '30', EVENT_RETRY_FACTOR: '2' })).toBeNull();
    expect(retryPolicyFrom({ EVENT_RETRY_MAX_ATTEMPTS: '5', EVENT_RETRY_BASE_SECONDS: '30', EVENT_RETRY_FACTOR: '2', EVENT_RETRY_MAX_DELAY_SECONDS: '600' }))
      .toEqual({ maxAttempts: 5, baseDelaySeconds: 30, factor: 2, maxDelaySeconds: 600 });
  });

  it('backs off exponentially up to the cap', () => {
    expect([1, 2, 3, 4, 5].map((n) => retryDelaySeconds(POLICY, n))).toEqual([10, 20, 40, 60, 60]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('events: outbox, relay, monitor and inbox', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let admin: string;
  let plain: string;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    await db.pool.query(
      `INSERT INTO tenant_acme.core_number_series (series_code, prefix, year_scope, next_value) VALUES ('APR', 'APR', $1, 1)`,
      [new Date().getUTCFullYear()],
    );
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET }), pool: db.pool, globalRateLimit: { limit: 100_000, windowMs: 60_000 } });
    const adminLogin = uniqueLogin('evt-admin');
    await seedUser(db.pool, 'tenant_acme', adminLogin);
    await grant(db.pool, 'acme', adminLogin, ACCESS_MANAGE);
    await grant(db.pool, 'acme', adminLogin, APPROVALS_MANAGE);
    admin = await signIn(app, 'acme', adminLogin);
    const plainLogin = uniqueLogin('evt-plain');
    await seedUser(db.pool, 'tenant_acme', plainLogin);
    plain = await signIn(app, 'acme', plainLogin);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  const enqueue = (e: EventEnvelope) => withTenant(db.pool, 'acme', (client) => enqueueOutbound(client, e));
  const statusOf = async (eventId: string) =>
    (await db.pool.query<{ status: string; attempts: number; last_error: string | null }>(
      `SELECT status, attempts, last_error FROM tenant_acme.integ_event WHERE direction = 'outbound' AND event_id = $1`, [eventId],
    )).rows[0]!;

  it('an approval raise and decision write outbound events in order, without comments or decision text', async () => {
    const requestType = `REQ${randomUUID().slice(0, 8).toUpperCase()}`;
    const approverLogin = uniqueLogin('evt-approver');
    const approverId = await seedUser(db.pool, 'tenant_acme', approverLogin);
    const approver = await signIn(app, 'acme', approverLogin);
    const mk = async (url: string, body: object) => data<{ id: string; rowVersion: number }>(await call(app, 'POST', url, admin, body));
    const chain = await mk('/approval-chains', { scopeType: 'company', requestType, module: 'projects', name: 'Event chain' });
    const version = await mk('/matrix-versions', { chainId: chain.id, effectiveFrom: '2026-01-01' });
    await mk('/matrix-levels', { matrixVersionId: version.id, levelNo: 1, amountFrom: 0, approverUserId: approverId });
    await call(app, 'POST', `/matrix-versions/${version.id}/publish`, admin, { rowVersion: version.rowVersion });
    const raised = data<{ id: string; rowVersion: number }>(await call(app, 'POST', '/approval-requests', plain, { requestType, module: 'projects', amount: 100, title: 'Event case' }));
    // someone who is not the approver is refused, and the refused attempt leaves no event behind
    expect((await call(app, 'POST', `/approval-requests/${raised.id}/actions`, plain, { action: 'approve', rowVersion: raised.rowVersion })).statusCode).toBe(403);
    await call(app, 'POST', `/approval-requests/${raised.id}/actions`, approver, { action: 'approve', comment: 'Confidential reason', rowVersion: raised.rowVersion });

    const { rows } = await db.pool.query<{ event_type: string; aggregate_seq: string; payload: Record<string, unknown> }>(
      `SELECT event_type, aggregate_seq, payload FROM tenant_acme.integ_event WHERE aggregate_id = $1 ORDER BY aggregate_seq`, [raised.id],
    );
    expect(rows.map((r) => [r.event_type, Number(r.aggregate_seq)])).toEqual([['approval_request.raised', 1], ['approval_request.decided', 2]]);
    expect(rows[1]!.payload).toMatchObject({ status: 'approved', action: 'approve', actedAtLevel: 1 });
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain('Confidential reason');
  });

  it('the relay publishes each aggregate in sequence, and two relays never send one event twice', async () => {
    const aggregate = randomUUID();
    const events = [envelope(aggregate), envelope(aggregate), envelope(aggregate)];
    for (const e of events) await enqueue(e);
    const publisher = new MockPublisher();
    await Promise.all([relayTenant(db.pool, 'acme', publisher, POLICY), relayTenant(db.pool, 'acme', publisher, POLICY)]);
    const mine = publisher.sent.filter((m) => m.aggregateId === aggregate);
    expect(mine.map((m) => m.eventId)).toEqual(events.map((e) => e.eventId));
    expect(mine.map((m) => m.aggregateSeq)).toEqual([1, 2, 3]);
    for (const e of events) expect((await statusOf(e.eventId)).status).toBe('published');
  });

  it('retries a failure after the backoff, dead-letters it after the last attempt, holds back later events, and replays it', async () => {
    const aggregate = randomUUID();
    const first = envelope(aggregate);
    const second = envelope(aggregate);
    await enqueue(first);
    await enqueue(second);
    const publisher = new MockPublisher();
    publisher.failWith = (m) => (m.eventId === first.eventId ? 'Broker refused the message\n  at line 1' : null);
    let clock = Date.now();
    const now = () => new Date(clock);

    expect((await relayTenant(db.pool, 'acme', publisher, POLICY, { now })).retried).toBe(1);
    expect(await statusOf(first.eventId)).toMatchObject({ status: 'pending', attempts: 1, last_error: 'Broker refused the message at line 1' });
    // not yet due: nothing is sent, and the second event waits behind the first
    expect((await relayTenant(db.pool, 'acme', publisher, POLICY, { now })).retried).toBe(0);
    expect(publisher.sent.some((m) => m.eventId === second.eventId)).toBe(false);
    clock += 11_000;
    await relayTenant(db.pool, 'acme', publisher, POLICY, { now });
    clock += 21_000;
    const dead: string[] = [];
    await relayTenant(db.pool, 'acme', publisher, POLICY, { now, onDeadLetter: (m) => dead.push(m.eventId) });
    expect(await statusOf(first.eventId)).toMatchObject({ status: 'dead_lettered', attempts: 3 });
    expect(dead).toEqual([first.eventId]);
    clock += 3_600_000;
    await relayTenant(db.pool, 'acme', publisher, POLICY, { now });
    expect((await statusOf(second.eventId)).status).toBe('pending');

    const id = (await db.pool.query<{ id: string }>(`SELECT id FROM tenant_acme.integ_event WHERE event_id = $1`, [first.eventId])).rows[0]!.id;
    expect((await call(app, 'POST', `/integration-events/${id}/replay`, plain, {})).statusCode).toBe(403);
    const replayed = await call(app, 'POST', `/integration-events/${id}/replay`, admin, {});
    expect(replayed.statusCode, replayed.body).toBe(200);
    expect(data<{ status: string; replayStatus: string }>(replayed)).toMatchObject({ status: 'pending', replayStatus: 'requested' });
    publisher.failWith = null;
    await relayTenant(db.pool, 'acme', publisher, POLICY);
    expect(publisher.sent.filter((m) => m.aggregateId === aggregate).map((m) => m.eventId)).toEqual([first.eventId, second.eventId]);
    expect(data<{ replayStatus: string }>(await call(app, 'GET', `/integration-events/${id}`, admin)).replayStatus).toBe('replayed');
    const again = await call(app, 'POST', `/integration-events/${id}/replay`, admin, {});
    expect(again.statusCode).toBe(409);
    const audit = await db.pool.query(`SELECT 1 FROM tenant_acme.audit_row_change WHERE table_name = 'integ_event' AND record_id = $1`, [id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('a running relay is woken by the outbox signal, without waiting for its poll', async () => {
    const publisher = new MockPublisher();
    const stop = await startRelay({ pool: db.pool, publisher, policy: POLICY, pollSeconds: 3600, log: { info: () => undefined, error: () => undefined } });
    try {
      const e = envelope(randomUUID());
      await enqueue(e);
      const deadline = Date.now() + 10_000;
      while (!publisher.sent.some((m) => m.eventId === e.eventId) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      expect(publisher.sent.some((m) => m.eventId === e.eventId)).toBe(true);
    } finally {
      await stop();
    }
  });

  it('the monitor lists events newest first with field names only, never payload values, for access.manage only', async () => {
    expect((await call(app, 'GET', '/integration-events', plain)).statusCode).toBe(403);
    const res = await call(app, 'GET', '/integration-events?direction=outbound&limit=5', admin);
    expect(res.statusCode, res.body).toBe(200);
    const rows = data<Array<{ payloadKeys: string[]; direction: string }>>(res);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.direction === 'outbound')).toBe(true);
    expect(res.body).not.toContain('never shown');
    expect(rows.some((r) => r.payloadKeys.includes('secretNote'))).toBe(true);
    expect((res.json() as { meta: { total: number } }).meta.total).toBeGreaterThan(0);
    const summary = data<{ counts: Array<{ status: string }>; deadLettered: number }>(await call(app, 'GET', '/integration-events/summary', admin));
    expect(summary.counts.some((c) => c.status === 'published')).toBe(true);
  });

  it('the inbox applies a newer version, ignores an older or repeated one, and marks a deleted record', async () => {
    const sourceId = randomUUID();
    const inbound = (seq: number, payload: object, eventType = 'employee.updated', eventId = randomUUID()) =>
      call(app, 'POST', '/integration-events/inbound', admin, {
        eventId, eventType, eventVersion: '1', schemaVersion: '1', aggregateType: 'employee', aggregateId: sourceId, aggregateSeq: seq,
        occurredAt: new Date().toISOString(), sourceModule: 'hrms', payload,
      });
    const v2 = await inbound(2, { name: 'Asha Rao', siteId: randomUUID(), extraField: 'kept' });
    expect(v2.statusCode, v2.body).toBe(202);
    expect(data<{ outcome: string }>(v2).outcome).toBe('applied');
    const older = await inbound(1, { name: 'Old name' });
    expect(data<{ outcome: string }>(older).outcome).toBe('stale');
    const repeatId = randomUUID();
    await inbound(3, { name: 'Asha R.' }, 'employee.updated', repeatId);
    const repeat = await inbound(3, { name: 'Asha R.' }, 'employee.updated', repeatId);
    expect(repeat.statusCode).toBe(200);
    expect(data<{ outcome: string }>(repeat).outcome).toBe('duplicate');

    const list = data<Array<{ sourceId: string; sourceSeq: number; data: { name: string; extraField?: string }; deleted: boolean }>>(
      await call(app, 'GET', '/ref-records?sourceModule=hrms&entityType=employee&q=Asha', admin),
    );
    const mine = list.find((r) => r.sourceId === sourceId)!;
    expect(mine).toMatchObject({ sourceSeq: 3, deleted: false, data: { name: 'Asha R.' } });
    await inbound(4, {}, 'employee.deleted');
    const afterDelete = data<Array<{ sourceId: string; deleted: boolean }>>(await call(app, 'GET', '/ref-records?entityType=employee', admin));
    expect(afterDelete.find((r) => r.sourceId === sourceId)?.deleted).toBe(true);
    const status = data<Array<{ sourceModule: string; entityType: string; records: number; lastSeq: number }>>(await call(app, 'GET', '/ref-records/sync-status', admin));
    expect(status.find((s) => s.sourceModule === 'hrms' && s.entityType === 'employee')).toMatchObject({ records: 1, lastSeq: 4 });
    expect((await call(app, 'POST', '/integration-events/inbound', admin, { eventId: 'nope' })).statusCode).toBe(400);
  });
});
