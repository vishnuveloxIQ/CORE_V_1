import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { remindAllTenants, remindTenant } from '../../src/modules/approvals/reminders.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Owner decisions (2026-11-22): requests are never escalated; the same level is reminded again after each interval.
// A matrix version ends automatically when a newer published version starts. Example data is fictional.

const SLOW_TEST_MS = 120_000;
const HOUR = 3_600_000;

interface Row { id: string; rowVersion: number; [field: string]: unknown }

describe.skipIf(!TEST_DATABASE_URL)('approval reminders and version switchover', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let raiser: string;
  let approver: { id: string; token: string };

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    await db.pool.query(
      `INSERT INTO tenant_acme.core_number_series (series_code, prefix, year_scope, next_value) VALUES ('APR', 'APR', $1, 1)`,
      [new Date().getUTCFullYear()],
    );
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET }), pool: db.pool, globalRateLimit: { limit: 100_000, windowMs: 60_000 } });
    const managerLogin = uniqueLogin('rem-manager');
    await seedUser(db.pool, 'tenant_acme', managerLogin);
    await grant(db.pool, 'acme', managerLogin, APPROVALS_MANAGE);
    manager = await signIn(app, 'acme', managerLogin);
    const raiserLogin = uniqueLogin('rem-raiser');
    await seedUser(db.pool, 'tenant_acme', raiserLogin);
    raiser = await signIn(app, 'acme', raiserLogin);
    const approverLogin = uniqueLogin('rem-approver');
    approver = { id: await seedUser(db.pool, 'tenant_acme', approverLogin), token: '' };
    approver.token = await signIn(app, 'acme', approverLogin);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  const data = <T>(res: Reply) => (res.json() as { data: T }).data;
  async function create(url: string, body: object): Promise<Row> {
    const res = await call(app, 'POST', url, manager, body);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
    return data<Row>(res);
  }
  async function publish(version: Row) {
    expect((await call(app, 'POST', `/matrix-versions/${version.id}/publish`, manager, { rowVersion: version.rowVersion })).statusCode).toBe(200);
  }
  async function chain(timeoutHours: number | null): Promise<{ requestType: string; chainId: string }> {
    const requestType = `REQ${randomUUID().slice(0, 8).toUpperCase()}`;
    const c = await create('/approval-chains', { scopeType: 'company', requestType, module: 'projects', name: `Chain ${requestType}` });
    const v = await create('/matrix-versions', { chainId: c.id, effectiveFrom: '2026-01-01' });
    await create('/matrix-levels', { matrixVersionId: v.id, levelNo: 1, amountFrom: 0, approverUserId: approver.id, timeoutHours, onTimeout: 'hold' });
    await publish(v);
    return { requestType, chainId: c.id };
  }
  const raise = async (requestType: string) => {
    const res = await call(app, 'POST', '/approval-requests', raiser, { requestType, module: 'projects', amount: 500, title: 'Reminder case' });
    expect(res.statusCode, res.body).toBe(201);
    return data<Row>(res);
  };
  const remindersFor = async (requestId: string) =>
    (await db.pool.query<{ recipient_user_id: string; title: string }>(
      `SELECT recipient_user_id, title FROM tenant_acme.core_notification WHERE source_id = $1 AND notification_type = 'approval_reminder' ORDER BY created_at`,
      [requestId],
    )).rows;

  it('reminds the same approver once the interval has passed, and again after each further interval', async () => {
    const { requestType } = await chain(2);
    const request = await raise(requestType);
    const raisedAt = Date.parse(String(request.raisedAt));

    expect(await remindTenant(db.pool, 'acme', new Date(raisedAt + 1 * HOUR))).toBe(0);
    await remindTenant(db.pool, 'acme', new Date(raisedAt + 2 * HOUR + 1000));
    const first = await remindersFor(request.id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ recipient_user_id: approver.id, title: `Reminder: ${String(request.code)} is waiting for your decision` });

    // the clock restarts at the reminder: nothing more until another 2 hours have passed
    await remindTenant(db.pool, 'acme', new Date(raisedAt + 3 * HOUR));
    expect(await remindersFor(request.id)).toHaveLength(1);
    await remindTenant(db.pool, 'acme', new Date(raisedAt + 4 * HOUR + 2000));
    expect(await remindersFor(request.id)).toHaveLength(2);

    // still at level 1, still the same approver: never escalated to anyone else
    const reread = data<Row>(await call(app, 'GET', `/approval-requests/${request.id}`, approver.token));
    expect(reread).toMatchObject({ currentLevel: 1, assignedActorId: approver.id, status: 'pending', rowVersion: request.rowVersion });
  });

  it('does not remind a level without a time, or a decided request', async () => {
    const untimed = await raise((await chain(null)).requestType);
    const timed = await raise((await chain(1)).requestType);
    const decided = await call(app, 'POST', `/approval-requests/${timed.id}/actions`, approver.token, { action: 'approve', rowVersion: timed.rowVersion });
    expect([200, 201], decided.body).toContain(decided.statusCode);

    const later = new Date(Date.now() + 48 * HOUR);
    const results = await remindAllTenants(db.pool, later);
    expect(results.find((r) => r.tenant === 'acme')).toBeDefined();
    expect(await remindersFor(untimed.id)).toHaveLength(0);
    expect(await remindersFor(timed.id)).toHaveLength(0);
  });

  it('two sweeps at the same moment send one reminder', async () => {
    const request = await raise((await chain(1)).requestType);
    const at = new Date(Date.parse(String(request.raisedAt)) + 2 * HOUR);
    await Promise.all([remindTenant(db.pool, 'acme', at), remindTenant(db.pool, 'acme', at)]);
    expect(await remindersFor(request.id)).toHaveLength(1);
  });

  it('a version ends when a newer published version starts: a future-dated version is not used until its date', async () => {
    const { requestType, chainId } = await chain(null);
    const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString().slice(0, 10);
    const future = await create('/matrix-versions', { chainId, effectiveFrom: tomorrow });
    await create('/matrix-levels', { matrixVersionId: future.id, levelNo: 1, amountFrom: 0, approverUserId: approver.id });
    await publish(future);
    expect((await raise(requestType)).matrixVersion).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const current = await create('/matrix-versions', { chainId, effectiveFrom: today });
    await create('/matrix-levels', { matrixVersionId: current.id, levelNo: 1, amountFrom: 0, approverUserId: approver.id });
    await publish(current);
    // the version starting today replaces version 1 at once; the future one still waits for its date
    expect((await raise(requestType)).matrixVersion).toBe(3);
  });
});
