import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, PASSWORD, seedUser, signIn, uniqueLogin } from '../testing-pass/helpers.js';

// CORE-19-06 access history and CORE-18-07 configurable device limit. Example data is fictional.

const SLOW_TEST_MS = 60_000;

interface AuthEvent {
  id: string;
  at: string | null;
  event: string;
  user: string | null;
  loginId: string | null;
  detail: string | null;
}

describe.skipIf(!TEST_DATABASE_URL)('access history and device limit', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let limited: CoreApp;
  let admin: string;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    const base = { NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET } as const;
    app = buildApp({ env: loadEnv(base), pool: db.pool });
    limited = buildApp({ env: loadEnv({ ...base, SESSION_DEVICE_LIMIT: '2' }), pool: db.pool });
    const adminLogin = uniqueLogin('hist-admin');
    await seedUser(db.pool, 'tenant_acme', adminLogin);
    await grant(db.pool, 'acme', adminLogin, ACCESS_MANAGE);
    admin = await signIn(app, 'acme', adminLogin);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await db?.drop();
  });

  const events = async (query: string) => {
    const res = await call(app, 'GET', `/audit-log/auth-events${query}`, admin);
    expect(res.statusCode, res.body).toBe(200);
    return { list: (res.json() as { data: AuthEvent[] }).data, body: res.body };
  };

  describe('access history (GET /audit-log/auth-events)', () => {
    it('records a refused privilege check with the user and the route, never the ids', async () => {
      const login = uniqueLogin('hist-plain');
      await seedUser(db.pool, 'tenant_acme', login);
      const token = await signIn(app, 'acme', login);
      const id = randomUUID();
      expect((await call(app, 'GET', `/users/${id}`, token)).statusCode).toBe(403);

      const { list } = await events(`?eventType=access_denied&actor=${login}`);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ event: 'access_denied', loginId: login, detail: 'GET /users/:id' });
      expect(list[0]!.detail).not.toContain(id);
    });

    it('shows sign-ins and failures, a failure for an unknown login without a user', async () => {
      const login = uniqueLogin('hist-signin');
      await seedUser(db.pool, 'tenant_acme', login);
      await signIn(app, 'acme', login);
      await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-tenant-id': 'acme' }, payload: { loginId: `nobody-${randomUUID().slice(0, 6)}`, password: 'Wrong-Password-1' } });

      const mine = (await events(`?actor=${login}`)).list;
      expect(mine.map((e) => e.event)).toContain('login_success');
      const failures = (await events('?eventType=login_failure&limit=200')).list;
      expect(failures.some((e) => e.user === null && e.loginId === null)).toBe(true);
    });

    it('never returns code hashes, challenges, addresses, or the internal code and challenge rows', async () => {
      const login = uniqueLogin('hist-secret');
      const userId = await seedUser(db.pool, 'tenant_acme', login);
      const marker = `secret-${randomUUID()}`;
      await db.pool.query(
        `INSERT INTO tenant_acme.core_auth_activity (user_id, event_type, purpose, secret_hash, challenge, occurred_at)
         VALUES ($1, 'otp_issued', 'password_reset', $2, $2, now()), ($1, 'passkey_challenge', 'login', $2, $2, now())`,
        [userId, marker],
      );
      const { list, body } = await events(`?actor=${login}&limit=200`);
      expect(list.map((e) => e.event)).not.toContain('otp_issued');
      expect(list.map((e) => e.event)).not.toContain('passkey_challenge');
      expect(body).not.toContain(marker);
      expect(body).not.toMatch(/secret_hash|challenge|ip_address|geo_location/);
    });

    it('is only for access administrators, and refuses an unknown event type', async () => {
      const login = uniqueLogin('hist-denied');
      await seedUser(db.pool, 'tenant_acme', login);
      const token = await signIn(app, 'acme', login);
      expect((await call(app, 'GET', '/audit-log/auth-events', token)).statusCode).toBe(403);
      expect((await call(app, 'GET', '/audit-log/auth-events', null)).statusCode).toBe(401);
      expect((await call(app, 'GET', '/audit-log/auth-events?eventType=otp_issued', admin)).statusCode).toBe(400);
    });
  });

  describe('device limit (SESSION_DEVICE_LIMIT)', () => {
    const signInOn = async (target: CoreApp, loginId: string, label: string) => {
      const res = await target.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-id': 'acme' },
        payload: { loginId, password: PASSWORD, deviceLabel: label },
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { data: { accessToken: string; refreshToken: string } }).data;
    };

    it('with a limit of 2, a third sign-in signs the oldest device out, and only that one', async () => {
      const login = uniqueLogin('limit');
      await seedUser(db.pool, 'tenant_acme', login);
      const first = await signInOn(limited, login, 'Oldest');
      const second = await signInOn(limited, login, 'Middle');
      const third = await signInOn(limited, login, 'Newest');

      expect((await call(limited, 'GET', '/auth/me', first.accessToken)).statusCode).toBe(401);
      const refresh = await limited.inject({ method: 'POST', url: '/auth/refresh', headers: { 'x-tenant-id': 'acme' }, payload: { refreshToken: first.refreshToken } });
      expect(refresh.statusCode).toBe(401);
      expect((await call(limited, 'GET', '/auth/me', second.accessToken)).statusCode).toBe(200);

      const sessions = (await call(limited, 'GET', '/auth/sessions', third.accessToken)).json() as {
        data: { sessions: Array<{ deviceLabel: string }> };
      };
      expect(sessions.data.sessions.map((s) => s.deviceLabel).sort()).toEqual(['Middle', 'Newest']);
      expect((await events(`?eventType=session_limit_revoked&actor=${login}`)).list).toHaveLength(1);
    });

    it('by default a user has one active session: signing in again signs the other device out', async () => {
      const login = uniqueLogin('single');
      await seedUser(db.pool, 'tenant_acme', login);
      const first = await signInOn(app, login, 'Laptop');
      const second = await signInOn(app, login, 'Phone');

      expect((await call(app, 'GET', '/auth/me', first.accessToken)).statusCode).toBe(401);
      const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { 'x-tenant-id': 'acme' }, payload: { refreshToken: first.refreshToken } });
      expect(refresh.statusCode).toBe(401);
      expect((await call(app, 'GET', '/auth/me', second.accessToken)).statusCode).toBe(200);

      const sessions = (await call(app, 'GET', '/auth/sessions', second.accessToken)).json() as {
        data: { sessions: Array<{ deviceLabel: string; current: boolean }> };
      };
      expect(sessions.data.sessions).toEqual([expect.objectContaining({ deviceLabel: 'Phone', current: true })]);
      expect((await events(`?eventType=session_limit_revoked&actor=${login}`)).list).toHaveLength(1);
    });

    it('refreshing the one session does not count as a new device', async () => {
      const login = uniqueLogin('refresh-single');
      await seedUser(db.pool, 'tenant_acme', login);
      const only = await signInOn(app, login, 'Laptop');
      const refreshed = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { 'x-tenant-id': 'acme' }, payload: { refreshToken: only.refreshToken } });
      expect(refreshed.statusCode).toBe(200);
      const next = (refreshed.json() as { data: { accessToken: string } }).data;
      expect((await call(app, 'GET', '/auth/me', next.accessToken)).statusCode).toBe(200);
      expect((await events(`?eventType=session_limit_revoked&actor=${login}`)).list).toHaveLength(0);
    });
  });
});
