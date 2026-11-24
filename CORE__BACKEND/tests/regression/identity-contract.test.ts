import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { PUBLIC_OPERATIONS, type OpenApiPaths } from '../../src/plugins/openapi.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, claimsOf, grant, JWT_SECRET, PASSWORD, seedUser, signIn, uniqueLogin } from '../testing-pass/helpers.js';

// Regression suite, identity: sign-in, tokens and access, checked across the whole API. The route sweep reads the
// OpenAPI document, which is built from the registered routes, so a new route is covered the day it is added: if it
// is not listed as public, it must refuse a request without a valid token. Example data is fictional.

const SLOW_TEST_MS = 120_000;

/** The identity-admin routes: all need access.manage. */
const ACCESS_ADMIN_ROUTES: Array<[method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: object]> = [
  ['GET', '/users'],
  ['GET', '/users/{id}'],
  ['POST', '/users', { loginId: 'NOPE0001', name: 'Nope' }],
  ['PATCH', '/users/{id}', { rowVersion: 1, name: 'Nope' }],
  ['POST', '/users/{id}/password-reset', {}],
  ['GET', '/access/users/{id}'],
  ['POST', '/access/users/{id}/grants', { privilege: 'projects.manage' }],
  ['DELETE', '/access/grants/{id}'],
  ['POST', '/access/users/{id}/suspensions', { reason: 'Regression' }],
  ['POST', '/access/suspensions/{id}/restore', {}],
  ['GET', '/audit-log'],
  ['GET', '/audit-log/{id}'],
  ['GET', '/audit-log/auth-events'],
];

/** Routes every signed-in user may call for their own account. */
const SELF_SERVICE: string[] = ['/auth/me', '/auth/me/access', '/auth/sessions', '/auth/passkeys'];

const withIds = (path: string) => path.replace(/\{[^}]+\}/g, () => randomUUID());

describe.skipIf(!TEST_DATABASE_URL)('regression: identity contract', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let operations: Array<{ method: string; path: string }>;
  let plain: string;
  let admin: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool, globalRateLimit: { limit: 100_000, windowMs: 60_000 } });
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json() as { paths: OpenApiPaths };
    operations = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => ({ method: method.toUpperCase(), path })),
    );

    const plainLogin = uniqueLogin('id-plain');
    await seedUser(db.pool, 'tenant_acme', plainLogin);
    plain = await signIn(app, 'acme', plainLogin);

    const adminLogin = uniqueLogin('id-admin');
    await seedUser(db.pool, 'tenant_acme', adminLogin);
    await grant(db.pool, 'acme', adminLogin, ACCESS_MANAGE);
    admin = await signIn(app, 'acme', adminLogin);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  /** Sends one operation with a random id in every path parameter and an empty body. */
  function send(method: string, path: string, headers: Record<string, string>) {
    const url = withIds(path.replace(/\{([^}]+)\}/g, '{$1}'));
    const raw = method === 'PUT' && path.endsWith('/content');
    return app.inject({
      method: method as 'GET',
      url,
      headers: {
        ...headers,
        'idempotency-key': randomUUID(),
        // an allowed file type: the upload route refuses other types before it checks the token, by design
        ...(raw ? { 'content-type': 'application/pdf' } : {}),
      },
      ...(method === 'GET' || method === 'DELETE' ? {} : { payload: raw ? Buffer.from('x') : {} }),
    });
  }

  describe('route sweep (every operation in the OpenAPI document)', () => {
    it('the document lists the whole API', () => {
      expect(operations.length).toBeGreaterThan(100);
    });

    it('every protected operation refuses a request with no token: 401 AUTH_REQUIRED', async () => {
      const wrong: string[] = [];
      for (const op of operations) {
        if (PUBLIC_OPERATIONS.has(`${op.method} ${op.path.replace(/\{([^}]+)\}/g, ':$1')}`)) continue;
        const res = await send(op.method, op.path, {});
        const code = (res.json() as { error?: { code?: string } }).error?.code;
        if (res.statusCode !== 401 || code !== 'AUTH_REQUIRED') wrong.push(`${op.method} ${op.path} -> ${res.statusCode} ${code}`);
      }
      expect(wrong).toEqual([]);
    });

    it('every protected operation refuses a garbage token and a forged one: 401', async () => {
      const forged = `${plain.split('.').slice(0, 2).join('.')}.${'A'.repeat(43)}`;
      const wrong: string[] = [];
      for (const op of operations) {
        if (PUBLIC_OPERATIONS.has(`${op.method} ${op.path.replace(/\{([^}]+)\}/g, ':$1')}`)) continue;
        for (const token of ['not-a-token', forged]) {
          const res = await send(op.method, op.path, { authorization: `Bearer ${token}` });
          if (res.statusCode !== 401) wrong.push(`${op.method} ${op.path} -> ${res.statusCode}`);
        }
      }
      expect(wrong).toEqual([]);
    });

    it('every public operation is reachable without a token (never 401), and each one is in the document', async () => {
      const documented = new Set(operations.map((op) => `${op.method} ${op.path.replace(/\{([^}]+)\}/g, ':$1')}`));
      const wrong: string[] = [];
      for (const name of PUBLIC_OPERATIONS) {
        if (!documented.has(name)) {
          wrong.push(`${name} is listed as public but no such route exists`);
          continue;
        }
        const [method, path] = name.split(' ') as [string, string];
        const res = await send(method, path, { 'x-tenant-id': 'acme' });
        if (res.statusCode === 401 && (res.json() as { error?: { code?: string } }).error?.code === 'AUTH_REQUIRED') {
          wrong.push(`${name} asked for a token`);
        }
      }
      expect(wrong).toEqual([]);
    });
  });

  describe('access administration needs access.manage', () => {
    it.each(ACCESS_ADMIN_ROUTES)('%s %s refuses a signed-in user without it: 403 ACCESS_DENIED', async (method, path, body) => {
      const res = await call(app, method, withIds(path), plain, body);
      expect(res.statusCode, res.body).toBe(403);
      expect((res.json() as { error: { code: string } }).error.code).toBe('ACCESS_DENIED');
    });

    it('lets the access administrator read users and the audit log', async () => {
      expect((await call(app, 'GET', '/users', admin)).statusCode).toBe(200);
      expect((await call(app, 'GET', '/audit-log', admin)).statusCode).toBe(200);
    });
  });

  describe('self-service routes work for any signed-in user', () => {
    it.each(SELF_SERVICE)('%s answers 200 for a user with no privileges', async (path) => {
      expect((await call(app, 'GET', path, plain)).statusCode).toBe(200);
    });
  });

  describe('tokens', () => {
    it('the access token names the user, the session and the tenant, and lasts 15 minutes', () => {
      const claims = claimsOf(plain);
      expect(claims.tid).toBe('acme');
      expect(claims.sub).toMatch(/^[0-9a-f-]{36}$/);
      expect(claims.sid).toMatch(/^[0-9a-f-]{36}$/);
      const payload = JSON.parse(Buffer.from(plain.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, number>;
      expect(payload['exp']! - payload['iat']!).toBe(15 * 60);
    });

    it('the refresh token is an opaque random value, not a readable token, and the response holds no secrets', async () => {
      const login = uniqueLogin('id-token');
      await seedUser(db.pool, 'tenant_acme', login);
      const res = await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-tenant-id': 'acme' }, payload: { loginId: login, password: PASSWORD } });
      const data = (res.json() as { data: { refreshToken: string; accessTokenExpiresIn: number } }).data;
      expect(data.refreshToken).not.toContain('.');
      expect(data.refreshToken.length).toBeGreaterThanOrEqual(32);
      expect(data.accessTokenExpiresIn).toBe(15 * 60);
      expect(res.body).not.toMatch(/password_hash|argon2|pin_hash|refresh_hash|secret_hash/);
    });
  });

  describe('temporary passwords', () => {
    it('a user on a temporary password is held to the change-password routes', async () => {
      const loginId = `TMP${randomUUID().slice(0, 6).toUpperCase()}`;
      const created = await call(app, 'POST', '/users', admin, { loginId, name: 'Temporary Password' });
      expect(created.statusCode, created.body).toBe(201);
      const temporary = (created.json() as { data: { temporaryPassword: string } }).data.temporaryPassword;

      const signed = await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-tenant-id': 'acme' }, payload: { loginId, password: temporary } });
      expect(signed.statusCode).toBe(200);
      const body = (signed.json() as { data: { accessToken: string; mustChangePassword: boolean } }).data;
      expect(body.mustChangePassword).toBe(true);

      const blocked = await call(app, 'GET', '/projects', body.accessToken);
      expect(blocked.statusCode).toBe(403);
      expect((blocked.json() as { error: { code: string } }).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect((await call(app, 'GET', '/auth/me', body.accessToken)).statusCode).toBe(200);
      expect((await call(app, 'GET', '/auth/me/access', body.accessToken)).statusCode).toBe(200);
    });
  });
});
