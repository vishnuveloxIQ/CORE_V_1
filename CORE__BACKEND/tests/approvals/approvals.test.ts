import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5e. Each test builds its own chain with a unique request type, so the tests do not
// depend on each other. All names are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'approvals-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('approvals (phase 5e)', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    // The APR series that numbers approval requests. The year is the one the raise uses.
    await db.pool.query(
      `INSERT INTO tenant_acme.core_number_series (series_code, prefix, year_scope, next_value)
       VALUES ('APR', 'APR', $1, 1)`,
      [new Date().getUTCFullYear()],
    );
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  beforeEach(() => {
    app = buildApp({ env, pool: db.pool });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function uniqueLogin(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  async function seedUser(loginId: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Approvals User', 'active', $2, 0)
       RETURNING id`,
      [loginId, hash],
    );
    return rows[0]!.id;
  }

  async function signIn(loginId: string): Promise<string> {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.accessToken as string;
  }

  /** A user with a login and a token; optionally granted approvals.manage. */
  async function userWith(manage: boolean): Promise<{ id: string; token: string }> {
    const loginId = uniqueLogin(manage ? 'appr-manager' : 'appr-user');
    const id = await seedUser(loginId);
    if (manage) {
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: APPROVALS_MANAGE,
      });
    }
    return { id, token: await signIn(loginId) };
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string | null,
    payload?: object,
  ): Promise<Reply> {
    return app!.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...idempotencyFor(method, url),
      },
      ...(payload !== undefined ? { payload } : {}),
    }) as Promise<Reply>;
  }

  async function createRow(token: string, url: string, payload: object): Promise<Row> {
    const res = await call('POST', url, token, payload);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
    return (res.json() as { data: Row }).data;
  }

  function expectError(res: Reply, status: number, code: string): void {
    expect(res.statusCode, res.body).toBe(status);
    expect((res.json() as { error: { code: string } }).error.code).toBe(code);
  }

  /**
   * A published company chain for one request type. Level 1 covers 0 to 100000 and belongs to approverA; level 2
   * covers everything from 0 up and belongs to approverB. An amount up to 100000 therefore passes both levels.
   */
  async function publishedChain(
    manager: string,
    approverA: string,
    approverB: string,
  ): Promise<{ requestType: string }> {
    const requestType = uniq('REQ');
    const chain = await createRow(manager, '/approval-chains', {
      scopeType: 'company',
      requestType,
      module: 'projects',
      name: `Chain ${requestType}`,
    });
    const version = await createRow(manager, '/matrix-versions', {
      chainId: chain.id,
      effectiveFrom: '2026-01-01',
      reason: 'Test matrix',
    });
    await createRow(manager, '/matrix-levels', {
      matrixVersionId: version.id,
      levelNo: 1,
      amountFrom: 0,
      amountTo: 100000,
      approverUserId: approverA,
    });
    await createRow(manager, '/matrix-levels', {
      matrixVersionId: version.id,
      levelNo: 2,
      amountFrom: 0,
      approverUserId: approverB,
    });
    const published = await call('POST', `/matrix-versions/${version.id}/publish`, manager, {
      rowVersion: version.rowVersion,
    });
    expect(published.statusCode, published.body).toBe(200);
    return { requestType };
  }

  async function raise(token: string, requestType: string, amount = 50000): Promise<Row> {
    return createRow(token, '/approval-requests', {
      requestType,
      module: 'projects',
      amount,
      title: 'Test request',
    });
  }

  it('publishes a matrix version once and refuses changes after it', async () => {
    const manager = await userWith(true);
    const approver = await userWith(false);
    const chain = await createRow(manager.token, '/approval-chains', {
      scopeType: 'company',
      requestType: uniq('REQ'),
      module: 'projects',
      name: 'Immutable chain',
    });
    const version = await createRow(manager.token, '/matrix-versions', {
      chainId: chain.id,
      effectiveFrom: '2026-01-01',
    });
    expect(version.versionNo).toBe(1);
    await createRow(manager.token, '/matrix-levels', {
      matrixVersionId: version.id,
      levelNo: 1,
      approverUserId: approver.id,
    });

    const first = await call('POST', `/matrix-versions/${version.id}/publish`, manager.token, {
      rowVersion: version.rowVersion,
    });
    expect(first.statusCode).toBe(200);
    expectError(
      await call('POST', `/matrix-versions/${version.id}/publish`, manager.token, {
        rowVersion: version.rowVersion + 1,
      }),
      409,
      'APPROVAL_MATRIX_PUBLISHED',
    );
    expectError(
      await call('PATCH', `/matrix-versions/${version.id}`, manager.token, {
        rowVersion: version.rowVersion + 1,
        reason: 'Too late',
      }),
      409,
      'APPROVAL_MATRIX_PUBLISHED',
    );
    expectError(
      await call('POST', '/matrix-levels', manager.token, {
        matrixVersionId: version.id,
        levelNo: 2,
        approverUserId: approver.id,
      }),
      409,
      'APPROVAL_MATRIX_PUBLISHED',
    );
  });

  it('raises a request with an APR code, a snapshot of the matching levels, and the first level as current', async () => {
    const manager = await userWith(true);
    const approverA = await userWith(false);
    const approverB = await userWith(false);
    const raiser = await userWith(false);
    const { requestType } = await publishedChain(manager.token, approverA.id, approverB.id);

    const request = await raise(raiser.token, requestType, 50000);
    expect(request.status).toBe('pending');
    expect(String(request.code)).toMatch(/APR/);
    expect(request.currentLevel).toBe(1);
    expect(request.assignedActorId).toBe(approverA.id);
    expect(request.configVersionLabel).toBe('v1');
    // the raiser's name is stored with the request, so lists show who raised it
    expect(request.raisedById).toBe(raiser.id);
    expect(request.raisedByName).toBe('Approvals User');
    const snapshot = request.levelsSnapshot as Array<{ levelNo: number }>;
    expect(snapshot.map((l) => l.levelNo)).toEqual([1, 2]);
  });

  it('approves through every level to approved, with one action row per step', async () => {
    const manager = await userWith(true);
    const approverA = await userWith(false);
    const approverB = await userWith(false);
    const raiser = await userWith(false);
    const { requestType } = await publishedChain(manager.token, approverA.id, approverB.id);
    const request = await raise(raiser.token, requestType);

    const stepOne = await call(
      'POST',
      `/approval-requests/${request.id}/actions`,
      approverA.token,
      {
        action: 'approve',
        rowVersion: request.rowVersion,
      },
    );
    expect(stepOne.statusCode, stepOne.body).toBe(201);
    const afterOne = (stepOne.json() as { data: Row }).data;
    expect(afterOne.currentLevel).toBe(2);
    expect(afterOne.assignedActorId).toBe(approverB.id);
    expect(afterOne.status).toBe('pending');

    const stepTwo = await call(
      'POST',
      `/approval-requests/${request.id}/actions`,
      approverB.token,
      {
        action: 'approve',
        rowVersion: afterOne.rowVersion,
      },
    );
    expect(stepTwo.statusCode, stepTwo.body).toBe(201);
    const done = (stepTwo.json() as { data: Row }).data;
    expect(done.status).toBe('approved');
    expect(done.decidedAt).not.toBeNull();

    const actions = await call('GET', `/approval-requests/${request.id}/actions`, raiser.token);
    const list = (actions.json() as { data: Array<{ action: string }> }).data;
    expect(list.map((a) => a.action)).toEqual(['approve', 'approve']);
  });

  it('refuses a user who is not the approver of the current level', async () => {
    const manager = await userWith(true);
    const approverA = await userWith(false);
    const approverB = await userWith(false);
    const raiser = await userWith(false);
    const { requestType } = await publishedChain(manager.token, approverA.id, approverB.id);
    const request = await raise(raiser.token, requestType);

    expectError(
      await call('POST', `/approval-requests/${request.id}/actions`, approverB.token, {
        action: 'approve',
        rowVersion: request.rowVersion,
      }),
      403,
      'APPROVAL_NOT_APPROVER',
    );
  });

  it('rejects and returns end the request with that status', async () => {
    const manager = await userWith(true);
    const approverA = await userWith(false);
    const approverB = await userWith(false);
    const raiser = await userWith(false);
    const { requestType } = await publishedChain(manager.token, approverA.id, approverB.id);

    const rejected = await raise(raiser.token, requestType);
    const reject = await call(
      'POST',
      `/approval-requests/${rejected.id}/actions`,
      approverA.token,
      {
        action: 'reject',
        comment: 'Over budget',
        rowVersion: rejected.rowVersion,
      },
    );
    expect((reject.json() as { data: Row }).data.status).toBe('rejected');

    const returned = await raise(raiser.token, requestType);
    const sent = await call('POST', `/approval-requests/${returned.id}/actions`, approverA.token, {
      action: 'return',
      rowVersion: returned.rowVersion,
    });
    expect((sent.json() as { data: Row }).data.status).toBe('returned');

    expectError(
      await call('POST', `/approval-requests/${returned.id}/actions`, approverA.token, {
        action: 'approve',
        rowVersion: returned.rowVersion + 1,
      }),
      409,
      'APPROVAL_NOT_PENDING',
    );
  });

  it('only the raiser can cancel, and a stale row version is a conflict', async () => {
    const manager = await userWith(true);
    const approverA = await userWith(false);
    const approverB = await userWith(false);
    const raiser = await userWith(false);
    const { requestType } = await publishedChain(manager.token, approverA.id, approverB.id);
    const request = await raise(raiser.token, requestType);

    expectError(
      await call('POST', `/approval-requests/${request.id}/actions`, approverA.token, {
        action: 'cancel',
        rowVersion: request.rowVersion,
      }),
      403,
      'APPROVAL_NOT_APPROVER',
    );
    expectError(
      await call('POST', `/approval-requests/${request.id}/actions`, raiser.token, {
        action: 'cancel',
        rowVersion: request.rowVersion + 5,
      }),
      409,
      'VERSION_CONFLICT',
    );
    const cancelled = await call('POST', `/approval-requests/${request.id}/actions`, raiser.token, {
      action: 'cancel',
      rowVersion: request.rowVersion,
    });
    expect((cancelled.json() as { data: Row }).data.status).toBe('cancelled');
  });

  it('answers a missing chain with APPROVAL_CHAIN_MISSING', async () => {
    const raiser = await userWith(false);
    expectError(
      await call('POST', '/approval-requests', raiser.token, {
        requestType: uniq('NONE'),
        module: 'projects',
        amount: 100,
        title: 'No chain',
      }),
      409,
      'APPROVAL_CHAIN_MISSING',
    );
  });

  it('keeps the chain and matrix writes behind approvals.manage', async () => {
    const plain = await userWith(false);
    expectError(
      await call('POST', '/approval-chains', plain.token, {
        scopeType: 'company',
        requestType: uniq('REQ'),
        module: 'projects',
        name: 'Refused',
      }),
      403,
      'ACCESS_DENIED',
    );
    expectError(
      await call('POST', '/pms-limit-rows', null, { tier: 1, priority: 'low', amountInr: 1 }),
      401,
      'AUTH_REQUIRED',
    );
  });

  it('serves cash limit rows at /cash-limit-rows, and the same rows at the old /pms-limit-rows path', async () => {
    const manager = await userWith(true);
    const row = await createRow(manager.token, '/cash-limit-rows', { tier: 7, priority: 'normal', amountInr: 25000, days: 1, hours: 0, minutes: 0 });
    const viaNew = await call('GET', `/cash-limit-rows/${row.id}`, manager.token);
    const viaOld = await call('GET', `/pms-limit-rows/${row.id}`, manager.token);
    expect(viaNew.statusCode, viaNew.body).toBe(200);
    expect(viaOld.json()).toEqual(viaNew.json());
  });

  it('refuses a duplicate chain for one request type and scope', async () => {
    const manager = await userWith(true);
    const requestType = uniq('REQ');
    await createRow(manager.token, '/approval-chains', {
      scopeType: 'company',
      requestType,
      module: 'projects',
      name: 'First',
    });
    expectError(
      await call('POST', '/approval-chains', manager.token, {
        scopeType: 'company',
        requestType,
        module: 'projects',
        name: 'Second',
      }),
      409,
      'APPROVAL_DUPLICATE',
    );
  });
});
