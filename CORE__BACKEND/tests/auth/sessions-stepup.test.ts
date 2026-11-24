import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { authenticatorFor, STEP_UP_ORIGIN, stepUpToken } from './step-up-helper.js';
import { VirtualAuthenticator } from './virtual-authenticator.js';

// Device sessions (list and revoke your own) and the step-up check that protected routes require.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'sessions-stepup-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

function uniqueLogin(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

describe.skipIf(!TEST_DATABASE_URL)('device sessions and step-up', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  // These tests sign one user in on several devices to test the device list and revoke, so they raise the limit;
  // the default of one session per user is tested in access-history-device-limit.test.ts.
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET, SESSION_DEVICE_LIMIT: '5' });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  // A fresh app per test gives each test its own rate-limit counters.
  beforeEach(() => {
    app = buildApp({ env, pool: db.pool });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function seedUser(loginId: string, privilege?: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Session Tester', 'active', $2, 0)
       RETURNING id`,
      [loginId, hash],
    );
    if (privilege) {
      await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege });
    }
    return rows[0]!.id;
  }

  /** Signs in and returns the access and refresh tokens. Each call is a new device session. */
  async function login(loginId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data;
  }

  function get(url: string, token: string | null) {
    return app!.inject({
      method: 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function del(url: string, token: string | null, stepUp?: string) {
    return app!.inject({
      method: 'DELETE',
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(stepUp ? { 'x-step-up-token': stepUp } : {}),
      },
    });
  }

  function refresh(refreshToken: string) {
    return app!.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'x-tenant-id': TENANT },
      payload: { refreshToken },
    });
  }

  describe('device sessions', () => {
    it('lists the live sessions newest first, and marks the one the request is using as current', async () => {
      const loginId = uniqueLogin('sess');
      await seedUser(loginId);
      const first = await login(loginId);
      const second = await login(loginId);

      const list = await get('/auth/sessions', second.accessToken);
      expect(list.statusCode).toBe(200);
      const sessions = list.json().data.sessions as Array<{ id: string; current: boolean; deviceLabel: string | null }>;
      expect(sessions).toHaveLength(2);
      const current = sessions.filter((s) => s.current);
      expect(current).toHaveLength(1);
      // the signed-in device is the second login, which is also the newest
      expect(sessions[0]!.current).toBe(true);
      expect(sessions[0]!.id).not.toBe(sessions[1]!.id);
      expect(first.accessToken).not.toBe(second.accessToken);
    });

    it('revoking another device signs that device out at once, and leaves this one signed in', async () => {
      const loginId = uniqueLogin('sess');
      await seedUser(loginId);
      const here = await login(loginId);
      const there = await login(loginId);

      const list = await get('/auth/sessions', here.accessToken);
      const other = (list.json().data.sessions as Array<{ id: string; current: boolean }>).find((s) => !s.current)!;

      const revoked = await del(`/auth/sessions/${other.id}`, here.accessToken);
      expect(revoked.statusCode, revoked.body).toBe(200);
      expect(revoked.json().data).toEqual({ revoked: true });

      // the other device's access token and refresh token no longer work
      expect((await get('/auth/me', there.accessToken)).statusCode).toBe(401);
      expect((await refresh(there.refreshToken)).statusCode).toBe(401);
      // this device is unaffected
      expect((await get('/auth/me', here.accessToken)).statusCode).toBe(200);

      const after = await get('/auth/sessions', here.accessToken);
      expect((after.json().data.sessions as unknown[]).length).toBe(1);
    });

    it('answers 404 for a session that is not this user\'s, so one user cannot see another user\'s sessions', async () => {
      const mine = uniqueLogin('sess');
      const theirs = uniqueLogin('sess');
      await seedUser(mine);
      await seedUser(theirs);
      const myLogin = await login(mine);
      const theirLogin = await login(theirs);
      const theirList = await get('/auth/sessions', theirLogin.accessToken);
      const theirSession = (theirList.json().data.sessions as Array<{ id: string }>)[0]!.id;

      const res = await del(`/auth/sessions/${theirSession}`, myLogin.accessToken);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('SESSION_NOT_FOUND');
      // their session is still live
      expect((await get('/auth/me', theirLogin.accessToken)).statusCode).toBe(200);
    });

    it('refuses the session list and revoke without a token', async () => {
      const list = await get('/auth/sessions', null);
      expect(list.statusCode).toBe(401);
      expect(list.json().error.code).toBe('AUTH_REQUIRED');
      const revoke = await del(`/auth/sessions/${randomUUID()}`, null);
      expect(revoke.statusCode).toBe(401);
    });
  });

  describe('step-up', () => {
    it('a protected route refuses a request without a step-up token, with 401 STEP_UP_REQUIRED', async () => {
      const loginId = uniqueLogin('admin');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);

      const res = await del(`/access/grants/${randomUUID()}`, admin.accessToken);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('a valid step-up token lets the request through to its own answer', async () => {
      const loginId = uniqueLogin('admin');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);
      const token = await stepUpToken(app!, admin.accessToken);

      // The grant does not exist, so the route answers 404 (its own check). A 401 here would mean the step-up failed.
      const res = await del(`/access/grants/${randomUUID()}`, admin.accessToken, token);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ACCESS_GRANT_NOT_FOUND');
    });

    it('an access token cannot be used as a step-up token', async () => {
      const loginId = uniqueLogin('admin');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);

      const res = await del(`/access/grants/${randomUUID()}`, admin.accessToken, admin.accessToken);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('a step-up token is bound to its user: another admin cannot borrow it', async () => {
      const first = uniqueLogin('admin');
      const second = uniqueLogin('admin');
      await seedUser(first, ACCESS_MANAGE);
      await seedUser(second, ACCESS_MANAGE);
      const firstLogin = await login(first);
      const secondLogin = await login(second);
      const firstToken = await stepUpToken(app!, firstLogin.accessToken);

      const res = await del(`/access/grants/${randomUUID()}`, secondLogin.accessToken, firstToken);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('a step-up token is bound to its session: the same user on another device cannot use it', async () => {
      const loginId = uniqueLogin('admin');
      await seedUser(loginId, ACCESS_MANAGE);
      const here = await login(loginId);
      const token = await stepUpToken(app!, here.accessToken);
      const there = await login(loginId);

      const res = await del(`/access/grants/${randomUUID()}`, there.accessToken, token);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('refuses step-up for a user with no passkey, with 409 STEP_UP_NO_PASSKEY', async () => {
      const loginId = uniqueLogin('nokey');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);

      const res = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/options',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('STEP_UP_NO_PASSKEY');
    });

    it('refuses a passkey answer from the wrong origin, with 401 STEP_UP_FAILED, and records the failure', async () => {
      const loginId = uniqueLogin('admin');
      const userId = await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);
      // enrol a passkey through the same helper the other tests use, then answer from another origin
      await stepUpToken(app!, admin.accessToken);
      const { rows } = await db.pool.query<{ credential_key: string }>(
        `SELECT credential_key FROM tenant_acme.core_user_passkey WHERE user_id = $1`,
        [userId],
      );
      expect(rows.length).toBeGreaterThan(0);

      const options = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/options',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(options.statusCode).toBe(200);
      const authenticator = enrolledAuthenticatorFor(admin.accessToken);
      const response = authenticator.assert({
        challenge: options.json().data.challenge as string,
        origin: 'http://evil.example',
      });
      const verified = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/verify',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { response },
      });
      expect(verified.statusCode).toBe(401);
      expect(verified.json().error.code).toBe('STEP_UP_FAILED');

      const { rows: events } = await db.pool.query<{ event_type: string }>(
        `SELECT event_type FROM tenant_acme.core_auth_activity WHERE user_id = $1 AND event_type = 'step_up_failure'`,
        [userId],
      );
      expect(events.length).toBeGreaterThan(0);
    });

    it('a passkey answer works once: replaying the same answer for a second step-up is refused', async () => {
      const loginId = uniqueLogin('admin');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);
      await stepUpToken(app!, admin.accessToken);
      const authenticator = enrolledAuthenticatorFor(admin.accessToken);

      const options = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/options',
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      const response = authenticator.assert({
        challenge: options.json().data.challenge as string,
        origin: STEP_UP_ORIGIN,
      });
      const first = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/verify',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { response },
      });
      expect(first.statusCode).toBe(200);

      const replay = await app!.inject({
        method: 'POST',
        url: '/auth/step-up/verify',
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { response },
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error.code).toBe('STEP_UP_FAILED');
    });
  });

  describe('step-up by password', () => {
    function stepUpWithPassword(accessToken: string | null, password: string) {
      return app!.inject({
        method: 'POST',
        url: '/auth/step-up/password',
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
        payload: { password },
      });
    }

    /** A geo-fence zone write with an empty body: a passed step-up reaches validation (400), a failed one answers 401. */
    function zoneWrite(accessToken: string, stepUp?: string) {
      return app!.inject({
        method: 'POST',
        url: '/geo-zones',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': randomUUID(),
          ...(stepUp ? { 'x-step-up-token': stepUp } : {}),
        },
        payload: {},
      });
    }

    it('the right password gives a token that opens geo-fence zone writes, with no passkey enrolled', async () => {
      const loginId = uniqueLogin('zone');
      await seedUser(loginId, PROJECTS_MANAGE);
      const admin = await login(loginId);

      expect((await zoneWrite(admin.accessToken)).json().error.code).toBe('STEP_UP_REQUIRED');

      const checked = await stepUpWithPassword(admin.accessToken, PASSWORD);
      expect(checked.statusCode, checked.body).toBe(200);
      const { stepUpToken: token, expiresAt } = checked.json().data as { stepUpToken: string; expiresAt: string };
      expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

      const res = await zoneWrite(admin.accessToken, token);
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('a password token does not open privilege grants: those still need a passkey', async () => {
      const loginId = uniqueLogin('grant');
      await seedUser(loginId, ACCESS_MANAGE);
      const admin = await login(loginId);
      const checked = await stepUpWithPassword(admin.accessToken, PASSWORD);
      expect(checked.statusCode, checked.body).toBe(200);

      const res = await del(`/access/grants/${randomUUID()}`, admin.accessToken, checked.json().data.stepUpToken as string);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('a wrong password answers 401 STEP_UP_FAILED, gives no token and is recorded', async () => {
      const loginId = uniqueLogin('wrong');
      const userId = await seedUser(loginId, PROJECTS_MANAGE);
      const admin = await login(loginId);

      const res = await stepUpWithPassword(admin.accessToken, 'Not-The-Password-1');
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_FAILED');
      expect(res.body).not.toContain('stepUpToken');

      const { rows } = await db.pool.query<{ purpose: string | null }>(
        `SELECT purpose FROM tenant_acme.core_auth_activity WHERE user_id = $1 AND event_type = 'step_up_failure'`,
        [userId],
      );
      expect(rows.map((r) => r.purpose)).toContain('password');
    });

    it('records a success, and needs a signed-in user', async () => {
      const loginId = uniqueLogin('ok');
      const userId = await seedUser(loginId, PROJECTS_MANAGE);
      const admin = await login(loginId);
      expect((await stepUpWithPassword(null, PASSWORD)).statusCode).toBe(401);

      expect((await stepUpWithPassword(admin.accessToken, PASSWORD)).statusCode).toBe(200);
      const { rows } = await db.pool.query<{ purpose: string | null }>(
        `SELECT purpose FROM tenant_acme.core_auth_activity WHERE user_id = $1 AND event_type = 'step_up_success'`,
        [userId],
      );
      expect(rows.map((r) => r.purpose)).toContain('password');
    });

    it('a password token belongs to its session: the same user on another device cannot use it', async () => {
      const loginId = uniqueLogin('zone');
      await seedUser(loginId, PROJECTS_MANAGE);
      const here = await login(loginId);
      const token = (await stepUpWithPassword(here.accessToken, PASSWORD)).json().data.stepUpToken as string;
      const there = await login(loginId);

      const res = await zoneWrite(there.accessToken, token);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('STEP_UP_REQUIRED');
    });

    it('limits password attempts per user, so a stolen access token cannot guess the password', async () => {
      const loginId = uniqueLogin('guess');
      await seedUser(loginId, PROJECTS_MANAGE);
      const admin = await login(loginId);

      for (let i = 0; i < 10; i += 1) {
        expect((await stepUpWithPassword(admin.accessToken, `Wrong-Guess-${i}`)).statusCode).toBe(401);
      }
      const blocked = await stepUpWithPassword(admin.accessToken, PASSWORD);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('RATE_LIMITED');
    });
  });
});

/** The authenticator the helper enrolled for this access token's user. */
function enrolledAuthenticatorFor(accessToken: string): VirtualAuthenticator {
  const authenticator = authenticatorFor(accessToken);
  if (!authenticator) throw new Error('no enrolled passkey for this user');
  return authenticator;
}
