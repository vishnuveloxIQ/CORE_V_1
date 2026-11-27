import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import {
  call,
  grant,
  JWT_SECRET,
  type Reply,
  seedUser,
  signIn,
  uniqueLogin,
} from '../testing-pass/helpers.js';

// Clarify and respond actions, the action decision, and job opening publication. Data is fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

function data<T>(res: Reply): T {
  return (res.json() as { data: T }).data;
}

function expectError(res: Reply, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect((res.json() as { error: { code: string } }).error.code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)(
  'approval clarify, decision and publish',
  { timeout: 60_000 },
  () => {
    let db: TestDatabase;
    let app: CoreApp;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });
    const users: Record<
      'manager' | 'approver' | 'raiser' | 'other',
      { id: string; token: string }
    > = {} as never;

    async function user(manage: boolean) {
      const loginId = uniqueLogin('cp');
      const id = await seedUser(db.pool, SCHEMA, loginId);
      if (manage) await grant(db.pool, TENANT, loginId, APPROVALS_MANAGE);
      return { id, token: await signIn(app, TENANT, loginId) };
    }

    async function created(res: Reply): Promise<Row> {
      expect(res.statusCode, res.body).toBe(201);
      return data<Row>(res);
    }

    /** A published company chain with one level owned by the approver. */
    async function chainFor(requestType: string): Promise<void> {
      const m = users.manager.token;
      const chain = await created(
        await call(app, 'POST', '/approval-chains', m, {
          scopeType: 'company',
          requestType,
          module: 'hrms',
          name: `Chain ${requestType}`,
        }),
      );
      const version = await created(
        await call(app, 'POST', '/matrix-versions', m, {
          chainId: chain.id,
          effectiveFrom: '2026-01-01',
        }),
      );
      await created(
        await call(app, 'POST', '/matrix-levels', m, {
          matrixVersionId: version.id,
          levelNo: 1,
          amountFrom: 0,
          approverUserId: users.approver.id,
        }),
      );
      const pub = await call(app, 'POST', `/matrix-versions/${version.id}/publish`, m, {
        rowVersion: version.rowVersion,
      });
      expect(pub.statusCode, pub.body).toBe(200);
    }

    function raise(requestType: string, payload: object = {}): Promise<Row> {
      return call(app, 'POST', '/approval-requests', users.raiser.token, {
        requestType,
        module: 'hrms',
        amount: 0,
        title: 'Test request',
        payload,
      }).then(created);
    }

    function act(token: string, request: Row, body: object): Promise<Reply> {
      return call(app, 'POST', `/approval-requests/${request.id}/actions`, token, {
        rowVersion: request.rowVersion,
        ...body,
      });
    }

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
      await db.pool.query(
        `INSERT INTO tenant_acme.core_number_series (series_code, prefix, year_scope, next_value)
       VALUES ('APR', 'APR', $1, 1)`,
        [new Date().getUTCFullYear()],
      );
      app = buildApp({ env, pool: db.pool });
      users.manager = await user(true);
      users.approver = await user(false);
      users.raiser = await user(false);
      users.other = await user(false);
      await db.pool.query(
        `INSERT INTO tenant_acme.core_project (code, name, status) VALUES ('CP-P1', 'Publish project', 'active')`,
      );
      await chainFor('Job opening');
      await chainFor('Clarify test');
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it('clarify keeps the level and waits for the raiser; respond returns it to pending', async () => {
      const request = await raise('Clarify test');
      expect(request.status).toBe('pending');

      // A comment is required, and only the level's approver may ask.
      expectError(
        await act(users.approver.token, request, { action: 'clarify' }),
        400,
        'VALIDATION_ERROR',
      );
      expectError(
        await act(users.other.token, request, { action: 'clarify', comment: 'Why?' }),
        403,
        'APPROVAL_NOT_APPROVER',
      );
      // respond is refused while the request is pending.
      expectError(
        await act(users.raiser.token, request, { action: 'respond', comment: 'Early' }),
        409,
        'APPROVAL_NOT_AWAITING_CLARIFICATION',
      );

      const asked = await act(users.approver.token, request, {
        action: 'clarify',
        comment: 'Which site needs it?',
      });
      expect(asked.statusCode, asked.body).toBe(201);
      const waiting = data<Row>(asked);
      expect(waiting).toMatchObject({
        status: 'clarification_requested',
        currentLevel: 1,
        assignedActorId: users.raiser.id,
        decidedAt: null,
      });

      // Approver actions wait for the answer; only the raiser responds, with a comment and no decision.
      expectError(
        await act(users.approver.token, waiting, { action: 'approve' }),
        409,
        'APPROVAL_NOT_PENDING',
      );
      expectError(
        await act(users.approver.token, waiting, { action: 'respond', comment: 'x' }),
        403,
        'APPROVAL_NOT_APPROVER',
      );
      expectError(
        await act(users.raiser.token, waiting, { action: 'respond' }),
        400,
        'VALIDATION_ERROR',
      );
      expectError(
        await act(users.raiser.token, waiting, {
          action: 'respond',
          comment: 'x',
          decision: 'Mine',
        }),
        400,
        'VALIDATION_ERROR',
      );
      expectError(
        await act(
          users.raiser.token,
          { ...waiting, rowVersion: request.rowVersion },
          {
            action: 'respond',
            comment: 'Stale',
          },
        ),
        409,
        'VERSION_CONFLICT',
      );

      const answered = await act(users.raiser.token, waiting, {
        action: 'respond',
        comment: 'Site North',
      });
      expect(answered.statusCode, answered.body).toBe(201);
      expect(data<Row>(answered)).toMatchObject({
        status: 'pending',
        currentLevel: 1,
        assignedActorId: users.approver.id,
      });

      const actions = data<Row[]>(
        await call(app, 'GET', `/approval-requests/${request.id}/actions`, users.raiser.token),
      );
      expect(actions.map((a) => a['action'])).toEqual(['clarify', 'respond']);
      expect(actions.map((a) => a['levelNo'])).toEqual([1, 1]);
    });

    it('the raiser can cancel while a clarification is open', async () => {
      const request = await raise('Clarify test');
      const asked = data<Row>(
        await act(users.approver.token, request, { action: 'clarify', comment: 'Details?' }),
      );
      const cancelled = await act(users.raiser.token, asked, { action: 'cancel' });
      expect(cancelled.statusCode, cancelled.body).toBe(201);
      expect(data<Row>(cancelled).status).toBe('cancelled');
    });

    it('stores the decision on the action and returns it; refuses more than 100 characters', async () => {
      const request = await raise('Clarify test');
      expectError(
        await act(users.approver.token, request, { action: 'approve', decision: 'x'.repeat(101) }),
        400,
        'VALIDATION_ERROR',
      );
      const approved = await act(users.approver.token, request, {
        action: 'approve',
        decision: 'Head Office',
      });
      expect(approved.statusCode, approved.body).toBe(201);
      const actions = data<Row[]>(
        await call(app, 'GET', `/approval-requests/${request.id}/actions`, users.raiser.token),
      );
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ action: 'approve', decision: 'Head Office' });
    });

    it('publishes only an approved job opening, to an existing location, with rowVersion', async () => {
      const opening = await raise('Job opening', {
        kind: 'job',
        position: 'Surveyor',
        openings: 2,
      });
      const url = `/approval-requests/${opening.id}/publish`;
      const body = { rowVersion: opening.rowVersion };

      expect((await call(app, 'POST', url, null, body)).statusCode).toBe(401);
      expectError(await call(app, 'POST', url, users.raiser.token, body), 403, 'ACCESS_DENIED');
      expectError(
        await call(app, 'POST', url, users.manager.token, body),
        409,
        'APPROVAL_NOT_APPROVED',
      );

      const approved = data<Row>(
        await act(users.approver.token, opening, { action: 'approve', decision: 'Local' }),
      );
      expect(approved.status).toBe('approved');

      expectError(
        await call(app, 'POST', url, users.manager.token, {
          rowVersion: opening.rowVersion,
        }),
        409,
        'VERSION_CONFLICT',
      );
      expectError(
        await call(app, 'POST', url, users.manager.token, { rowVersion: approved.rowVersion }),
        400,
        'VALIDATION_ERROR',
      );

      const published = await call(app, 'POST', url, users.manager.token, {
        rowVersion: approved.rowVersion,
      });
      expect(published.statusCode, published.body).toBe(200);
      const row = data<Row>(published);
      expect(typeof row.publishedAt).toBe('string');
      expect(row.rowVersion).toBe(approved.rowVersion + 1);

    });

    it('refuses to publish an approved request that is not a job opening', async () => {
      const request = await raise('Clarify test');
      const approved = data<Row>(await act(users.approver.token, request, { action: 'approve' }));
      expectError(
        await call(app, 'POST', `/approval-requests/${request.id}/publish`, users.manager.token, {
          rowVersion: approved.rowVersion,
        }),
        409,
        'APPROVAL_NOT_JOB_OPENING',
      );
    });
  },
);
