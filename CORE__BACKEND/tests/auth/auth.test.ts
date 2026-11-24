import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { signAccessToken, signingKeyFrom } from '../../src/modules/auth/tokens.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

const UNIQUE_VIOLATION = '23505';
const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'auth-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;

/** Each test uses its own login id, so tests do not depend on each other's rows. */
function uniqueLogin(): string {
  return `user-${randomUUID().slice(0, 8)}`;
}

// Integration tests for Phase 4a: login, sessions, refresh rotation, logout and the access guard.
describe.skipIf(!TEST_DATABASE_URL)('auth (phase 4a)', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  const logLines: string[] = [];
  const signingKey = signingKeyFrom(JWT_SECRET, () => {});

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    // The reuse test needs two live sessions for one user, so the limit is raised here; the default of one session
    // per user is tested in access-history-device-limit.test.ts.
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info', JWT_SECRET, SESSION_DEVICE_LIMIT: '5' });
    app = buildApp({
      env,
      pool: db.pool,
      logStream: {
        write: (line) => {
          logLines.push(line);
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  async function seedUser(
    loginId: string,
    options: { status?: string; email?: string; name?: string } = {},
  ): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, email, name, status, password_hash, failed_count)
       VALUES ($1, $2, $3, $4, $5, 0)
       RETURNING id`,
      [
        loginId,
        options.email ?? null,
        options.name ?? 'Test User',
        options.status ?? 'active',
        hash,
      ],
    );
    return rows[0]!.id;
  }

  function login(loginId: string, password = PASSWORD, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password, ...extra },
    });
  }

  function refresh(refreshToken: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'x-tenant-id': TENANT },
      payload: { refreshToken },
    });
  }

  function logout(accessToken: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  function me(accessToken: string) {
    return app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  async function eventsFor(userId: string): Promise<string[]> {
    const { rows } = await db.pool.query<{ event_type: string }>(
      `SELECT event_type FROM tenant_acme.core_auth_activity
       WHERE user_id = $1 ORDER BY occurred_at, created_at`,
      [userId],
    );
    return rows.map((r) => r.event_type);
  }

  it('logs in and returns tokens and the user, with no password or token hashes', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId, { email: `${loginId}@example.test`, name: 'Asha' });

    const res = await login(loginId, PASSWORD, { deviceLabel: 'Test laptop' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.accessToken).toEqual(expect.any(String));
    expect(data.refreshToken).toEqual(expect.any(String));
    expect(data.accessTokenExpiresIn).toBe(900);
    expect(data.user).toEqual({
      id: expect.any(String),
      loginId,
      name: 'Asha',
      email: `${loginId}@example.test`,
    });
    expect(res.body).not.toMatch(/argon2|password_hash|pin_hash|refresh_hash/);
  });

  it('gives the same 401 for a wrong password and for an unknown login id', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);

    const wrongPassword = await login(loginId, 'not-the-password-1');
    const unknownLogin = await login(uniqueLogin(), PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownLogin.statusCode).toBe(401);
    expect(wrongPassword.json().error).toEqual(unknownLogin.json().error);
    expect(wrongPassword.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('a correct password clears the failure count before the lock', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);

    for (let i = 0; i < 4; i += 1) {
      expect((await login(loginId, 'wrong-password-x')).statusCode).toBe(401);
    }
    expect((await login(loginId)).statusCode).toBe(200);

    const { rows } = await db.pool.query<{ failed_count: number }>(
      `SELECT failed_count FROM tenant_acme.core_user WHERE login_id = $1`,
      [loginId],
    );
    expect(rows[0]!.failed_count).toBe(0);
  });

  it('locks the account after five wrong passwords, and the right password is refused until the lock ends', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);

    for (let i = 0; i < 5; i += 1) {
      expect((await login(loginId, 'wrong-password-x')).statusCode).toBe(401);
    }
    const locked = await login(loginId);
    expect(locked.statusCode).toBe(401);
    expect(locked.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const { rows } = await db.pool.query<{ locked_until: Date }>(
      `SELECT locked_until FROM tenant_acme.core_user WHERE id = $1`,
      [userId],
    );
    expect(rows[0]!.locked_until.getTime()).toBeGreaterThan(Date.now());
    expect(await eventsFor(userId)).toContain('login_locked');
  });

  it('rejects an inactive user with the generic 401 even when the password is right', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId, { status: 'disabled' });

    const res = await login(loginId);

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await eventsFor(userId)).toEqual(['login_failure']);
  });

  it('rejects a missing or malformed X-Tenant-Id with 400', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);

    const missing = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { loginId, password: PASSWORD },
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': 'Bad Tenant!' },
      payload: { loginId, password: PASSWORD },
    });

    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rotates the refresh token, keeps the original expiry, and treats a reused token as theft', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);

    const first = (await login(loginId)).json().data;
    const second = (await login(loginId)).json().data;

    const rotated = await refresh(first.refreshToken);
    expect(rotated.statusCode).toBe(200);
    const next = rotated.json().data;
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.refreshTokenExpiresAt).toBe(first.refreshTokenExpiresAt);

    // Presenting the old token again is reuse: every session of this user is revoked.
    const reused = await refresh(first.refreshToken);
    expect(reused.statusCode).toBe(401);
    expect(reused.json().error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');

    expect((await refresh(next.refreshToken)).statusCode).toBe(401);
    expect((await me(second.accessToken)).statusCode).toBe(401);
    expect((await me(next.accessToken)).statusCode).toBe(401);
    expect(await eventsFor(userId)).toContain('refresh_reuse');
  });

  it('refuses an unknown refresh token with 401', async () => {
    const res = await refresh(randomUUID());
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');
  });

  it('logout revokes the session at once, even though the access token has not expired', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    const { accessToken } = (await login(loginId)).json().data;

    const out = await logout(accessToken);
    expect(out.statusCode).toBe(200);
    expect(out.json().data).toEqual({ loggedOut: true });

    const after = await me(accessToken);
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('AUTH_INVALID_TOKEN');
    expect(await eventsFor(userId)).toContain('logout');
  });

  it('/auth/me returns the caller and refuses a missing or malformed bearer token', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId, { name: 'Ravi' });
    const { accessToken } = (await login(loginId)).json().data;

    const ok = await me(accessToken);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.user).toMatchObject({ loginId, name: 'Ravi' });

    const noHeader = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(noHeader.statusCode).toBe(401);
    expect(noHeader.json().error.code).toBe('AUTH_REQUIRED');

    const malformed = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Token abc' },
    });
    expect(malformed.statusCode).toBe(401);
    expect(malformed.json().error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects an expired token, and a token signed with another key', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    await login(loginId);
    const { rows } = await db.pool.query<{ id: string }>(
      `SELECT id FROM tenant_acme.core_user_session WHERE user_id = $1`,
      [userId],
    );
    const claims = { userId, sessionId: rows[0]!.id, tenantId: TENANT };

    const expired = await signAccessToken(signingKey, claims, -10);
    const forged = await signAccessToken(
      signingKeyFrom('a-different-secret-of-some-length', () => {}),
      claims,
    );

    for (const token of [expired, forged]) {
      const res = await me(token);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTH_INVALID_TOKEN');
    }
  });

  it('writes one auth activity row per attempt, with no IP address stored', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);

    await login(loginId, 'wrong-password-x');
    await login(loginId);

    expect(await eventsFor(userId)).toEqual(['login_failure', 'login_success']);
    const { rows } = await db.pool.query<{ ip_address: string | null }>(
      `SELECT ip_address FROM tenant_acme.core_auth_activity WHERE user_id = $1`,
      [userId],
    );
    expect(rows.every((r) => r.ip_address === null)).toBe(true);
  });

  it('keeps passwords and tokens out of the log', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);
    const before = logLines.length;

    const { accessToken, refreshToken } = (await login(loginId)).json().data;
    await me(accessToken);

    const fresh = logLines.slice(before).join('\n');
    expect(fresh).not.toContain(PASSWORD);
    expect(fresh).not.toContain(accessToken);
    expect(fresh).not.toContain(refreshToken);
  });

  it('refuses a second user with the same login id (23505)', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);

    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_user (login_id, name, status) VALUES ($1, 'Copy', 'active')`,
        [loginId],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});
