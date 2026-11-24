import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for GET /users and GET /users/:id. Every user is created by the test with a unique login.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'users-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

/** The only keys a user view may carry. Anything else, such as a hash or login-state column, fails the tests. */
const USER_KEYS = [
  'createdAt',
  'designation',
  'email',
  'id',
  'lastLoginAt',
  'loginId',
  'modules',
  'mustChangePassword',
  'name',
  'phone',
  'role',
  'rowVersion',
  'scopeIds',
  'scopeType',
  'status',
  'suspended',
];
const FORBIDDEN_KEYS = [
  'password_hash',
  'passwordHash',
  'pin_hash',
  'pinHash',
  'failed_count',
  'failedCount',
  'locked_until',
  'lockedUntil',
  'password_set_at',
  'pin_set_at',
];

describe.skipIf(!TEST_DATABASE_URL)(
  'tenant users (access.manage)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp | undefined;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });
    let adminToken = '';
    let plainToken = '';
    let activeId = '';
    const tag = randomUUID().slice(0, 8);

    async function seedUser(loginId: string, name: string, status: string, email: string | null) {
      const hash = await hashSecret(PASSWORD);
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_user
         (login_id, name, email, status, password_hash, pin_hash, failed_count, locked_until)
       VALUES ($1, $2, $3, $4, $5, $6, 0, NULL)
       RETURNING id`,
        [loginId, name, email, status, hash, hash],
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

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
      const admin = `users-admin-${tag}`;
      await seedUser(admin, 'Admin Person', 'active', null);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId: admin,
        privilege: ACCESS_MANAGE,
      });
      const plain = `users-plain-${tag}`;
      await seedUser(plain, 'Plain Person', 'active', null);
      activeId = await seedUser(
        `users-active-${tag}`,
        'Zed Searchable',
        'active',
        `zed-${tag}@example.test`,
      );
      await seedUser(`users-inactive-${tag}`, 'Inactive Person', 'inactive', null);

      app = buildApp({ env, pool: db.pool });
      adminToken = await signIn(admin);
      plainToken = await signIn(plain);
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    function get(url: string, token: string | null) {
      return app!.inject({
        method: 'GET',
        url,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    }

    it('refuses a plain signed-in user with 403 on the list and on one user', async () => {
      const list = await get('/users', plainToken);
      expect(list.statusCode).toBe(403);
      const one = await get(`/users/${activeId}`, plainToken);
      expect(one.statusCode).toBe(403);
    });

    it('refuses an anonymous request with 401', async () => {
      const res = await get('/users', null);
      expect(res.statusCode).toBe(401);
    });

    it('lists users with only the view fields, never a hash or login-state column', async () => {
      const res = await get('/users?limit=200', adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(4);
      expect(body.meta.total).toBeGreaterThanOrEqual(4);
      expect(body.meta).toMatchObject({ limit: 200, offset: 0 });

      for (const user of body.data) {
        expect(Object.keys(user).sort()).toEqual(USER_KEYS);
        for (const key of FORBIDDEN_KEYS) expect(user).not.toHaveProperty(key);
      }
      const raw = res.body;
      expect(raw).not.toMatch(/\$argon2/);
    });

    it('returns one user by id with the same fields, and 404 for an unknown id', async () => {
      const res = await get(`/users/${activeId}`, adminToken);
      expect(res.statusCode).toBe(200);
      const user = res.json().data;
      expect(Object.keys(user).sort()).toEqual(USER_KEYS);
      expect(user).toMatchObject({
        id: activeId,
        loginId: `users-active-${tag}`,
        name: 'Zed Searchable',
        status: 'active',
        rowVersion: 1,
      });
      for (const key of FORBIDDEN_KEYS) expect(user).not.toHaveProperty(key);

      const missing = await get(`/users/${randomUUID()}`, adminToken);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('USER_NOT_FOUND');
    });

    it('filters by status and by a case-insensitive search on login or name', async () => {
      const inactive = await get('/users?status=inactive', adminToken);
      const inactiveLogins = inactive.json().data.map((u: { loginId: string }) => u.loginId);
      expect(inactiveLogins).toContain(`users-inactive-${tag}`);
      expect(inactive.json().data.every((u: { status: string }) => u.status === 'inactive')).toBe(
        true,
      );

      const byName = await get('/users?search=ZED SEARCH', adminToken);
      expect(byName.json().data.map((u: { id: string }) => u.id)).toEqual([activeId]);

      const byLogin = await get(`/users?search=users-active-${tag}`, adminToken);
      expect(byLogin.json().meta.total).toBe(1);

      // A wildcard in the search is literal text, not a pattern.
      const wildcard = await get('/users?search=%25', adminToken);
      expect(wildcard.json().data).toEqual([]);
    });

    it('pages with limit and offset and reports the total', async () => {
      const all = await get('/users?limit=200', adminToken);
      const total = all.json().meta.total as number;

      const page = await get('/users?limit=2&offset=1', adminToken);
      expect(page.json().data).toHaveLength(2);
      expect(page.json().meta).toEqual({ limit: 2, offset: 1, total });
      expect(page.json().data.map((u: { id: string }) => u.id)).toEqual(
        all
          .json()
          .data.slice(1, 3)
          .map((u: { id: string }) => u.id),
      );

      const defaults = await get('/users', adminToken);
      expect(defaults.json().meta).toMatchObject({ limit: 50, offset: 0 });
    });

    it('refuses a limit above 200 or below 1 with 400', async () => {
      expect((await get('/users?limit=201', adminToken)).statusCode).toBe(400);
      expect((await get('/users?limit=0', adminToken)).statusCode).toBe(400);
      expect((await get('/users?offset=-1', adminToken)).statusCode).toBe(400);
    });
  },
);
