import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// CORE-21-05/07/08: approval matrix edges. 1 and 4 levels (the most a chain may have), missing site, no matching level, the snapshot kept after
// the matrix changes, and one request per source record (module + source record id). Example data is fictional.

const SLOW_TEST_MS = 120_000;

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('approval matrix edges', { timeout: SLOW_TEST_MS }, () => {
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
    const managerLogin = uniqueLogin('edge-manager');
    await seedUser(db.pool, 'tenant_acme', managerLogin);
    await grant(db.pool, 'acme', managerLogin, APPROVALS_MANAGE);
    manager = await signIn(app, 'acme', managerLogin);
    const raiserLogin = uniqueLogin('edge-raiser');
    await seedUser(db.pool, 'tenant_acme', raiserLogin);
    raiser = await signIn(app, 'acme', raiserLogin);
    const approverLogin = uniqueLogin('edge-approver');
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

  /** A published company chain whose levels all cover amounts from 0 up to `amountTo` (no upper limit if omitted). */
  async function chainWith(levels: number, amountTo?: number): Promise<{ requestType: string; chainId: string }> {
    const requestType = `REQ${randomUUID().slice(0, 8).toUpperCase()}`;
    const chain = await create('/approval-chains', { scopeType: 'company', requestType, module: 'projects', name: `Chain ${requestType}` });
    const version = await create('/matrix-versions', { chainId: chain.id, effectiveFrom: '2026-01-01' });
    for (let n = 1; n <= levels; n += 1) {
      await create('/matrix-levels', { matrixVersionId: version.id, levelNo: n, amountFrom: 0, ...(amountTo !== undefined ? { amountTo } : {}), approverUserId: approver.id });
    }
    const published = await call(app, 'POST', `/matrix-versions/${version.id}/publish`, manager, { rowVersion: version.rowVersion });
    expect(published.statusCode, published.body).toBe(200);
    return { requestType, chainId: chain.id };
  }

  const raise = (requestType: string, extra: object = {}, module = 'projects') =>
    call(app, 'POST', '/approval-requests', raiser, { requestType, module, amount: 500, title: 'Edge case', ...extra });

  it('a 1-level chain: the request starts at level 1 and one approval completes it', async () => {
    const { requestType } = await chainWith(1);
    const raised = await raise(requestType);
    expect(raised.statusCode, raised.body).toBe(201);
    const request = data<Row>(raised);
    expect(request.levelsSnapshot as unknown[]).toHaveLength(1);
    expect(request.currentLevel).toBe(1);
    const approved = await call(app, 'POST', `/approval-requests/${request.id}/actions`, approver.token, { action: 'approve', rowVersion: request.rowVersion });
    expect(approved.statusCode, approved.body).toBe(201);
    const after = data<Row>(await call(app, 'GET', `/approval-requests/${request.id}`, raiser));
    expect(after.status).toBe('approved');
  });

  it('a 4-level chain is allowed and snapshotted whole; level 5 is refused by the API and by the database', async () => {
    const { requestType } = await chainWith(4);
    const request = data<Row>(await raise(requestType));
    expect(request.levelsSnapshot as unknown[]).toHaveLength(4);

    const chain = await create('/approval-chains', { scopeType: 'company', requestType: `REQ${randomUUID().slice(0, 8).toUpperCase()}`, module: 'projects', name: 'Too deep' });
    const version = await create('/matrix-versions', { chainId: chain.id, effectiveFrom: '2026-01-01' });
    const tooDeep = await call(app, 'POST', '/matrix-levels', manager, { matrixVersionId: version.id, levelNo: 5, approverUserId: approver.id });
    expect(tooDeep.statusCode).toBe(400);
    await expect(
      db.pool.query(`INSERT INTO tenant_acme.core_matrix_level (matrix_version_id, level_no, amount_from, approver_user_id) VALUES ($1, 5, 0, $2)`, [version.id, approver.id]),
    ).rejects.toThrow(/core_matrix_level_no_check/);
  });

  it('a request without a site is accepted, with no location', async () => {
    const { requestType } = await chainWith(1);
    const raised = await raise(requestType);
    expect(raised.statusCode).toBe(201);
  });

  it('an amount no level covers is refused with 409 APPROVAL_NO_MATCHING_LEVEL', async () => {
    const { requestType } = await chainWith(1, 100);
    const res = await raise(requestType, { amount: 5000 });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('APPROVAL_NO_MATCHING_LEVEL');
  });

  it('a matrix change after a request was raised keeps that request on its own snapshot', async () => {
    const { requestType, chainId } = await chainWith(2);
    const before = data<Row>(await raise(requestType));
    expect(before.levelsSnapshot as unknown[]).toHaveLength(2);

    const v2 = await create('/matrix-versions', { chainId, effectiveFrom: '2026-02-01' });
    await create('/matrix-levels', { matrixVersionId: v2.id, levelNo: 1, amountFrom: 0, approverUserId: approver.id });
    expect((await call(app, 'POST', `/matrix-versions/${v2.id}/publish`, manager, { rowVersion: v2.rowVersion })).statusCode).toBe(200);

    const reread = data<Row>(await call(app, 'GET', `/approval-requests/${before.id}`, raiser));
    expect(reread.levelsSnapshot).toEqual(before.levelsSnapshot);
    expect(reread.matrixVersion).toBe(1);
    const after = data<Row>(await raise(requestType));
    expect(after.matrixVersion).toBe(2);
    expect(after.levelsSnapshot as unknown[]).toHaveLength(1);
  });

  it('keeps the date a request is needed by, and leaves it empty when none is sent (0036)', async () => {
    const { requestType } = await chainWith(1);
    const dated = await raise(requestType, { neededBy: '2026-12-15' });
    expect(dated.statusCode, dated.body).toBe(201);
    expect(data<Row>(dated).neededBy).toBe('2026-12-15');
    const reread = data<Row>(await call(app, 'GET', `/approval-requests/${data<Row>(dated).id}`, raiser));
    expect(reread.neededBy).toBe('2026-12-15');
    expect(data<Row>(await raise(requestType, { emergency: true })).neededBy).toBeNull();
    expect((await raise(requestType, { neededBy: 'next week' })).statusCode).toBe(400);
  });

  describe('one request per source record (module + source record id)', () => {
    const countFor = async (sourceRecordId: string) =>
      Number((await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM tenant_acme.core_approval_request WHERE source_record_id = $1`, [sourceRecordId])).rows[0]!.n);

    it('a second raise for the same source record returns the first request (200), with no new row or audit entry', async () => {
      const { requestType } = await chainWith(1);
      const sourceRecordId = randomUUID();
      const first = await raise(requestType, { sourceRecordId });
      expect(first.statusCode).toBe(201);
      const again = await raise(requestType, { sourceRecordId, title: 'Retried after a timeout' });
      expect(again.statusCode).toBe(200);
      expect(data<Row>(again).id).toBe(data<Row>(first).id);
      expect(data<Row>(again).title).toBe('Edge case');
      expect(await countFor(sourceRecordId)).toBe(1);
      const audit = await db.pool.query(`SELECT 1 FROM tenant_acme.audit_row_change WHERE table_name = 'core_approval_request' AND record_id = $1`, [data<Row>(first).id]);
      expect(audit.rows).toHaveLength(1);
    });

    it('two raises for the same source record at the same moment give one request', async () => {
      const { requestType } = await chainWith(1);
      const sourceRecordId = randomUUID();
      const [a, b] = await Promise.all([raise(requestType, { sourceRecordId }), raise(requestType, { sourceRecordId })]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
      expect(data<Row>(a).id).toBe(data<Row>(b).id);
      expect(await countFor(sourceRecordId)).toBe(1);
    });

    it('the same source record id from another module is a different request; no source record means no limit', async () => {
      const { requestType } = await chainWith(1);
      const sourceRecordId = randomUUID();
      const fromProjects = await raise(requestType, { sourceRecordId }, 'projects');
      const fromStores = await raise(requestType, { sourceRecordId }, 'stores');
      expect(fromProjects.statusCode).toBe(201);
      expect(fromStores.statusCode).toBe(201);
      expect(data<Row>(fromStores).id).not.toBe(data<Row>(fromProjects).id);
      const plainA = await raise(requestType);
      const plainB = await raise(requestType);
      expect(data<Row>(plainA).id).not.toBe(data<Row>(plainB).id);
    });
  });
});
