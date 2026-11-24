import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { signingKeyFrom } from '../../src/modules/auth/tokens.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'auth-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;

function uniqueLogin(): string {
  return `token-${randomUUID().slice(0, 8)}`;
}

// Token lifecycle: refresh tokens that expire or belong to a deactivated account, and access tokens that are
// altered, issued for another audience, or point at a session that does not exist. Rotation, reuse, logout and
// expired or forged-key access tokens are covered in auth.test.ts.
describe.skipIf(!TEST_DATABASE_URL)('token lifecycle', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  const signingKey = signingKeyFrom(JWT_SECRET, () => {});

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info', JWT_SECRET });
    app = buildApp({
      env,
      pool: db.pool,
      logStream: { write: () => {} },
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  async function seedUser(loginId: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Token Test', 'active', $2, 0)
       RETURNING id`,
      [loginId, hash],
    );
    return rows[0]!.id;
  }

  function login(loginId: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
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

  function me(accessToken: string) {
    return app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  it('refuses a refresh token whose session has expired, with 401', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    const { refreshToken } = (await login(loginId)).json().data;

    await db.pool.query(
      `UPDATE tenant_acme.core_user_session SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
      [userId],
    );

    const res = await refresh(refreshToken);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');
  });

  it('refuses a refresh token once the account is deactivated, with 401', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    const { refreshToken } = (await login(loginId)).json().data;

    await db.pool.query(`UPDATE tenant_acme.core_user SET status = 'inactive' WHERE id = $1`, [userId]);

    const res = await refresh(refreshToken);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');
  });

  it('refuses an access token whose payload was altered, even with the signature kept', async () => {
    const loginId = uniqueLogin();
    await seedUser(loginId);
    const { accessToken } = (await login(loginId)).json().data;

    const [header, payload, signature] = accessToken.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    claims['sub'] = randomUUID();
    const altered = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const res = await me(`${header}.${altered}.${signature}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('refuses an access token signed with the right key but another issuer or audience', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    await login(loginId);
    const { rows } = await db.pool.query<{ id: string }>(
      `SELECT id FROM tenant_acme.core_user_session WHERE user_id = $1`,
      [userId],
    );
    const sid = rows[0]!.id;

    const wrongIssuer = await new SignJWT({ sid, tid: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('someone-else')
      .setAudience('velox-core')
      .setExpirationTime('5m')
      .sign(signingKey);
    const wrongAudience = await new SignJWT({ sid, tid: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('velox-core')
      .setAudience('some-other-api')
      .setExpirationTime('5m')
      .sign(signingKey);

    for (const token of [wrongIssuer, wrongAudience]) {
      const res = await me(token);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('AUTH_INVALID_TOKEN');
    }
  });

  it('refuses an access token that names a session which does not exist, even with a valid signature', async () => {
    const loginId = uniqueLogin();
    const userId = await seedUser(loginId);
    await login(loginId);

    const orphan = await new SignJWT({ sid: randomUUID(), tid: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('velox-core')
      .setAudience('velox-core')
      .setExpirationTime('5m')
      .sign(signingKey);

    const res = await me(orphan);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('AUTH_INVALID_TOKEN');
  });
});
