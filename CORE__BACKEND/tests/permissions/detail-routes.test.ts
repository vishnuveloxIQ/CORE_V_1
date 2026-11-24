import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { ORGANISATION_MANAGE } from '../../src/modules/organisation/routes.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Permission checks for the single-record GET routes (GET /{resource}/:id). Each route reads the same rows as its
// list, so a signed-in user can read one record, an anonymous request gets 401, an unknown id gets 404, and a
// record in another company is not found. Offer-letter revisions are the one detail route that needs a privilege.

const TENANT = 'acme';
const OTHER = 'beta';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'permissions-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

/** Detail routes that any signed-in user may read (the same guard as their list). */
const OPEN_DETAIL_PATHS = [
  '/projects',
  '/locations',
  '/stores',
  '/wbs-nodes',
  '/chainage-markers',
  '/geo-zones',
  '/milestones',
  '/vendors',
  '/materials',
  '/equipment-types',
  '/equipment-assignments',
  '/plan-lines',
  '/organisation/holidays',
  '/organisation/shifts',
  '/organisation/number-series',
  '/organisation/departments',
  '/organisation/positions',
  '/equipment-units',
  '/stock-levels',
  '/uoms',
];

function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

function uniqueLogin(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

describe.skipIf(!TEST_DATABASE_URL)('detail routes: permissions', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT, OTHER]);
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

  async function seedUser(tenant: string, loginId: string): Promise<void> {
    const hash = await hashSecret(PASSWORD);
    await db.pool.query(
      `INSERT INTO tenant_${tenant}.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Detail Route User', 'active', $2, 0)`,
      [loginId, hash],
    );
  }

  async function signIn(tenant: string, loginId: string): Promise<string> {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': tenant },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.accessToken as string;
  }

  /** A signed-in user of the company, holding the given privileges (none by default). */
  async function userWith(tenant: string, privileges: string[] = []): Promise<string> {
    const loginId = uniqueLogin('detail');
    await seedUser(tenant, loginId);
    for (const privilege of privileges) {
      await grantPrivilegeByLogin(db.pool, { tenantId: tenant, loginId, privilege });
    }
    return signIn(tenant, loginId);
  }

  function get(url: string, token: string | null, tenant = TENANT) {
    return app!.inject({
      method: 'GET',
      url,
      headers: {
        'x-tenant-id': tenant,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...idempotencyFor('GET', url),
      },
    });
  }

  async function createProject(token: string): Promise<string> {
    const res = await app!.inject({
      method: 'POST',
      url: '/projects',
      headers: {
        'x-tenant-id': TENANT,
        authorization: `Bearer ${token}`,
        'idempotency-key': randomUUID(),
      },
      payload: { code: uniq('PRJ'), name: 'Fictional Permission Project' },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data.id as string;
  }

  it('refuses every detail route without a token, with 401', async () => {
    const paths = [...OPEN_DETAIL_PATHS, '/offer-letter/revisions'];
    for (const path of paths) {
      const res = await get(`${path}/${randomUUID()}`, null);
      expect(res.statusCode, path).toBe(401);
      expect(res.json().error.code, path).toBe('AUTH_REQUIRED');
    }
  });

  it('lets a signed-in user with no privileges read a record, the same as the list shows it', async () => {
    const manager = await userWith(TENANT, [PROJECTS_MANAGE]);
    const projectId = await createProject(manager);

    const plain = await userWith(TENANT);
    const detail = await get(`/projects/${projectId}`, plain);
    expect(detail.statusCode).toBe(200);
    const list = await get('/projects', plain);
    const listed = (list.json().data as Array<{ id: string }>).find((row) => row.id === projectId);
    expect(detail.json().data).toEqual(listed);
  });

  it('answers 404, not 401 or 403, for an unknown id on every open detail route', async () => {
    const plain = await userWith(TENANT);
    for (const path of OPEN_DETAIL_PATHS) {
      const res = await get(`${path}/${randomUUID()}`, plain);
      expect(res.statusCode, path).toBe(404);
      expect(res.json().error.code, path).toBe('NOT_FOUND');
    }
  });

  it('requires organisation.manage for offer-letter revisions: 403 without it, and the unknown-id 404 with it', async () => {
    const plain = await userWith(TENANT);
    const denied = await get(`/offer-letter/revisions/${randomUUID()}`, plain);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('ACCESS_DENIED');

    const manager = await userWith(TENANT, [ORGANISATION_MANAGE]);
    const allowed = await get(`/offer-letter/revisions/${randomUUID()}`, manager);
    expect(allowed.statusCode).toBe(404);
    expect(allowed.json().error.code).toBe('NOT_FOUND');
  });

  it('does not show a record of another company: a user of beta gets 404 for an acme project id', async () => {
    const manager = await userWith(TENANT, [PROJECTS_MANAGE]);
    const projectId = await createProject(manager);

    const otherCompany = await userWith(OTHER, [PROJECTS_MANAGE]);
    const res = await get(`/projects/${projectId}`, otherCompany, OTHER);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');

    const sameCompany = await get(`/projects/${projectId}`, manager);
    expect(sameCompany.statusCode).toBe(200);
  });
});
