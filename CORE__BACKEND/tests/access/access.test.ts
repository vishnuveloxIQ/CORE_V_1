import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { needsStepUp, stepUpToken } from '../auth/step-up-helper.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { type AccessScope, scopeFrom, scopeMatches } from '../../src/modules/access/policy.js';
import { ACCESS_MANAGE, privilegesOfRole } from '../../src/modules/access/roles.js';
import { createRequireAuth, requireAccess } from '../../src/plugins/auth.js';
import { signingKeyFrom } from '../../src/modules/auth/tokens.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'access-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;

const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';

function scopeAt(projectId: string | null, storeId: string | null = null): AccessScope {
  return { projectId, storeId };
}

// Pure rules: no database needed.
describe('scope matching (phase 4d)', () => {
  const company = scopeFrom({});

  it('a company-wide grant covers every requested scope', () => {
    expect(scopeMatches(company, company)).toBe(true);
    expect(scopeMatches(company, scopeAt(L1))).toBe(true);
  });

  it('a project grant covers only that project, and not a company-wide request', () => {
    const grant = scopeAt(P1);
    expect(scopeMatches(grant, scopeAt(P1))).toBe(true);
    expect(scopeMatches(grant, scopeAt(L2))).toBe(false);
    expect(scopeMatches(grant, company)).toBe(false);
  });

  it('a grant that sets two dimensions needs both of them to match', () => {
    const grant = scopeAt(P1, L1);
    expect(scopeMatches(grant, scopeAt(P1, L1))).toBe(true);
    expect(scopeMatches(grant, scopeAt(P1))).toBe(false);
    expect(scopeMatches(grant, scopeAt(P1, randomUUID()))).toBe(false);
  });
});

describe('role privileges (phase 4d)', () => {
  it('only system roles carry privileges, and access_admin carries access.manage', () => {
    expect(privilegesOfRole({ code: 'access_admin', isSystem: true })).toEqual([ACCESS_MANAGE]);
    expect(privilegesOfRole({ code: 'access_admin', isSystem: false })).toEqual([]);
    expect(privilegesOfRole({ code: 'unknown_role', isSystem: true })).toEqual([]);
    expect(privilegesOfRole({ code: 'constructor', isSystem: true })).toEqual([]);
  });
});

// Integration tests for Phase 4d: admin routes, scoped and live grants, suspension, audit and bootstrap.
describe.skipIf(!TEST_DATABASE_URL)(
  'access administration (phase 4d)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp | undefined;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    }, 60_000);

    afterAll(async () => {
      await db?.drop();
    });

    // A fresh app per test gives each test its own rate-limit counters.
    beforeEach(() => {
      app = buildApp({ env, pool: db.pool });
      // Registered before any inject(), because the app cannot take routes once it has started.
      const guard = { pool: db.pool, signingKey: signingKeyFrom(JWT_SECRET, () => {}) };
      app.get(
        '/test/stores',
        {
          preHandler: [
            createRequireAuth(guard),
            requireAccess(guard, 'stores.read', (request) => ({
              projectId: (request.query as { project?: string }).project,
            })),
          ],
        },
        async () => ({ ok: true }),
      );
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
         VALUES ($1, 'Access User', 'active', $2, 0)
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

    // A grant is scoped to a project, so the seed creates one first.
    async function seedProject(): Promise<string> {
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_project (code, name) VALUES ($1, 'Site project') RETURNING id`,
        [`P-${randomUUID().slice(0, 8)}`],
      );
      return rows[0]!.id;
    }

    async function seedSystemRole(code: string): Promise<string> {
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_role (code, name, is_system) VALUES ($1, 'System role', true) RETURNING id`,
        [code],
      );
      return rows[0]!.id;
    }

    /** A user who holds access.manage, granted with the bootstrap function that the CLI uses. */
    async function adminUser(): Promise<{ id: string; token: string }> {
      const loginId = uniqueLogin('admin');
      const id = await seedUser(loginId);
      await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege: ACCESS_MANAGE });
      return { id, token: await signIn(loginId) };
    }

    async function plainUser(): Promise<{ id: string; token: string; loginId: string }> {
      const loginId = uniqueLogin('user');
      const id = await seedUser(loginId);
      return { id, token: await signIn(loginId), loginId };
    }

    async function call(
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      token: string | null,
      payload?: object,
    ) {
      // grants need a passkey step-up (auth/step-up.ts); the helper enrols a test passkey the first time
      const stepUp =
        token && needsStepUp(method, url) ? { 'x-step-up-token': await stepUpToken(app!, token) } : {};
      return app!.inject({
        method,
        url,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...stepUp,
          ...idempotencyFor(method, url),
        },
        ...(payload ? { payload } : {}),
      });
    }

    async function auditRowsFor(recordId: string) {
      const { rows } = await db.pool.query<{
        op: string;
        actor_id: string | null;
        module_name: string | null;
        old_row: Record<string, unknown> | null;
        new_row: Record<string, unknown> | null;
      }>(
        `SELECT op, actor_id, module_name, old_row, new_row
       FROM tenant_acme.audit_row_change
       WHERE table_name = 'core_user_access' AND record_id = $1
       ORDER BY changed_at`,
        [recordId],
      );
      return rows;
    }

    describe('who may call the admin routes', () => {
      it('answers 401 without a token and 403 without access.manage, on every admin route', async () => {
        const target = randomUUID();
        const routes: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: object }> =
          [
            { method: 'GET', url: `/access/users/${target}` },
            {
              method: 'POST',
              url: `/access/users/${target}/grants`,
              payload: { accessType: 'privilege', privilege: 'stores.read' },
            },
            { method: 'DELETE', url: `/access/grants/${target}` },
            {
              method: 'POST',
              url: `/access/users/${target}/suspensions`,
              payload: { reason: 'x' },
            },
            { method: 'POST', url: `/access/suspensions/${target}/restore` },
          ];
        const plain = await plainUser();
        for (const route of routes) {
          const anonymous = await call(route.method, route.url, null, route.payload);
          expect(anonymous.statusCode, route.url).toBe(401);
          const denied = await call(route.method, route.url, plain.token, route.payload);
          expect(denied.statusCode, route.url).toBe(403);
          expect(denied.json().error.code).toBe('ACCESS_DENIED');
        }
      });

      it('lets every signed-in user read their own access, which is empty for a new user', async () => {
        const user = await plainUser();
        const res = await call('GET', '/auth/me/access', user.token);
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toMatchObject({
          userId: user.id,
          suspended: false,
          privileges: [],
        });
      });
    });

    describe('grants', () => {
      it('grants a privilege with a project scope, shown to the admin and to the user', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const location = await seedProject();

        const created = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
          scope: { projectId: location },
          reason: 'Store keeper',
        });
        expect(created.statusCode).toBe(201);
        const grant = created.json().data;
        expect(grant).toMatchObject({
          accessType: 'privilege',
          privilege: 'stores.read',
          scope: { projectId: location, storeId: null },
        });

        const adminView = await call('GET', `/access/users/${user.id}`, admin.token);
        expect(adminView.json().data.grants.map((g: { id: string }) => g.id)).toContain(grant.id);

        const ownView = await call('GET', '/auth/me/access', user.token);
        expect(ownView.json().data.privileges).toEqual([
          expect.objectContaining({
            privilege: 'stores.read',
            source: 'privilege',
            scope: { projectId: location, storeId: null },
          }),
        ]);
      });

      it('a role grant carries the system role privileges, and revoking it takes effect at once', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        await seedSystemRole('access_admin');

        const roleId = (
          await db.pool.query<{ id: string }>(
            `SELECT id FROM tenant_acme.core_role WHERE code = 'access_admin'`,
          )
        ).rows[0]!.id;
        const created = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'role',
          roleId,
        });
        expect(created.statusCode).toBe(201);
        const grantId = created.json().data.id as string;

        // The user now holds access.manage through the role, so the admin route answers 200 for them.
        const allowed = await call('GET', `/access/users/${user.id}`, user.token);
        expect(allowed.statusCode).toBe(200);
        expect(allowed.json().data.privileges).toEqual([
          expect.objectContaining({ privilege: ACCESS_MANAGE, source: 'role' }),
        ]);

        const revoked = await call('DELETE', `/access/grants/${grantId}`, admin.token);
        expect(revoked.statusCode).toBe(200);
        const denied = await call('GET', `/access/users/${user.id}`, user.token);
        expect(denied.statusCode).toBe(403);
      });

      it('a module-head grant is stored and holds no privileges in 4d', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const created = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'module_head',
          module: 'stores',
        });
        expect(created.statusCode).toBe(201);
        const own = await call('GET', '/auth/me/access', user.token);
        expect(own.json().data.privileges).toEqual([]);
        expect(own.json().data.grants).toEqual([
          expect.objectContaining({ accessType: 'module_head', module: 'stores' }),
        ]);
      });

      it('enforces scope: a project grant does not pass a company-wide or other-project request', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const location1 = await seedProject();
        const location2 = await seedProject();

        const granted = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
          scope: { projectId: location1 },
        });
        expect(granted.statusCode).toBe(201);

        expect(
          (await call('GET', `/test/stores?project=${location1}`, user.token)).statusCode,
        ).toBe(200);
        expect(
          (await call('GET', `/test/stores?project=${location2}`, user.token)).statusCode,
        ).toBe(403);
        expect((await call('GET', '/test/stores', user.token)).statusCode).toBe(403);

        // A company-wide grant covers every location.
        await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
        });
        expect(
          (await call('GET', `/test/stores?project=${location2}`, user.token)).statusCode,
        ).toBe(200);
        expect((await call('GET', '/test/stores', user.token)).statusCode).toBe(200);
      });

      it('refuses an unknown user, an unknown role or project, and a malformed privilege', async () => {
        const admin = await adminUser();
        const user = await plainUser();

        const noUser = await call('POST', `/access/users/${randomUUID()}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
        });
        expect(noUser.statusCode).toBe(404);
        expect(noUser.json().error.code).toBe('USER_NOT_FOUND');

        const noRole = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'role',
          roleId: randomUUID(),
        });
        expect(noRole.statusCode).toBe(400);
        expect(noRole.json().error.code).toBe('ACCESS_REFERENCE_NOT_FOUND');

        const noLocation = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
          scope: { projectId: randomUUID() },
        });
        expect(noLocation.statusCode).toBe(400);
        expect(noLocation.json().error.code).toBe('ACCESS_REFERENCE_NOT_FOUND');

        for (const privilege of ['Stores Read', 'access', 'stores..read']) {
          const bad = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
            accessType: 'privilege',
            privilege,
          });
          expect(bad.statusCode, privilege).toBe(400);
          expect(bad.json().error.code, privilege).toBe('VALIDATION_ERROR');
        }
      });

      it('revoke answers 404 for an unknown grant, and suspension rows are not grants', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const unknown = await call('DELETE', `/access/grants/${randomUUID()}`, admin.token);
        expect(unknown.statusCode).toBe(404);
        expect(unknown.json().error.code).toBe('ACCESS_GRANT_NOT_FOUND');

        const suspended = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: 'Review',
        });
        const suspensionId = suspended.json().data.id as string;
        const notAGrant = await call('DELETE', `/access/grants/${suspensionId}`, admin.token);
        expect(notAGrant.statusCode).toBe(404);
      });
    });

    describe('suspension', () => {
      it('denies the user at once, and restore brings the same session back', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        expect((await call('GET', '/auth/me', user.token)).statusCode).toBe(200);

        const suspended = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: 'Leave',
        });
        expect(suspended.statusCode).toBe(201);
        const suspensionId = suspended.json().data.id as string;

        const blocked = await call('GET', '/auth/me', user.token);
        expect(blocked.statusCode).toBe(403);
        expect(blocked.json().error.code).toBe('ACCESS_SUSPENDED');
        expect((await call('GET', '/auth/me/access', user.token)).statusCode).toBe(403);

        const restored = await call(
          'POST',
          `/access/suspensions/${suspensionId}/restore`,
          admin.token,
        );
        expect(restored.statusCode).toBe(200);
        expect(restored.json().data.restoredAt).not.toBeNull();

        // The session was never revoked, so the same token works again.
        expect((await call('GET', '/auth/me', user.token)).statusCode).toBe(200);
      });

      it('refuses a second active suspension, and restoring twice', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const first = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: 'Leave',
        });
        expect(first.statusCode).toBe(201);

        const second = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: 'Again',
        });
        expect(second.statusCode).toBe(409);
        expect(second.json().error.code).toBe('ACCESS_ALREADY_SUSPENDED');

        const suspensionId = first.json().data.id as string;
        expect(
          (await call('POST', `/access/suspensions/${suspensionId}/restore`, admin.token))
            .statusCode,
        ).toBe(200);
        const again = await call(
          'POST',
          `/access/suspensions/${suspensionId}/restore`,
          admin.token,
        );
        expect(again.statusCode).toBe(404);
        expect(again.json().error.code).toBe('ACCESS_SUSPENSION_NOT_FOUND');
      });

      it('requires a reason to suspend', async () => {
        const admin = await adminUser();
        const user = await plainUser();
        const res = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: '   ',
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('audit trail', () => {
      it('writes an audit row with the actor for each grant, revoke, suspension and restore', async () => {
        const admin = await adminUser();
        const user = await plainUser();

        const granted = await call('POST', `/access/users/${user.id}/grants`, admin.token, {
          accessType: 'privilege',
          privilege: 'stores.read',
        });
        const grantId = granted.json().data.id as string;
        await call('DELETE', `/access/grants/${grantId}`, admin.token);

        const suspended = await call('POST', `/access/users/${user.id}/suspensions`, admin.token, {
          reason: 'Leave',
        });
        const suspensionId = suspended.json().data.id as string;
        await call('POST', `/access/suspensions/${suspensionId}/restore`, admin.token);

        const grantRows = await auditRowsFor(grantId);
        expect(grantRows.map((row) => row.op)).toEqual(['INSERT', 'DELETE']);
        expect(grantRows[0]).toMatchObject({ actor_id: admin.id, module_name: 'core' });
        expect(grantRows[1]!.old_row).toMatchObject({
          privilege: 'stores.read',
          access_type: 'privilege',
        });

        const suspensionRows = await auditRowsFor(suspensionId);
        expect(suspensionRows.map((row) => row.op)).toEqual(['INSERT', 'UPDATE']);
        expect(suspensionRows[1]!.old_row).toMatchObject({ restored_at: null });
        expect(suspensionRows[1]!.new_row!.restored_at).not.toBeNull();
      });
    });

    describe('bootstrap grant (access:grant)', () => {
      it('grants access.manage with no actor, and the user can then administer', async () => {
        const loginId = uniqueLogin('first');
        const userId = await seedUser(loginId);
        const result = await grantPrivilegeByLogin(db.pool, {
          tenantId: TENANT,
          loginId,
          privilege: ACCESS_MANAGE,
        });
        expect(result.userId).toBe(userId);

        const rows = await auditRowsFor(result.grantId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ op: 'INSERT', actor_id: null, module_name: 'core' });

        const token = await signIn(loginId);
        expect((await call('GET', `/access/users/${userId}`, token)).statusCode).toBe(200);
      });

      it('refuses an unknown login and an invalid tenant id', async () => {
        await expect(
          grantPrivilegeByLogin(db.pool, {
            tenantId: TENANT,
            loginId: uniqueLogin('nobody'),
            privilege: ACCESS_MANAGE,
          }),
        ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
        await expect(
          grantPrivilegeByLogin(db.pool, {
            tenantId: 'Not Valid',
            loginId: 'x',
            privilege: ACCESS_MANAGE,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      });
    });

    describe('database constraints (migration 0008)', () => {
      it('refuses an unknown access type and a second active suspension', async () => {
        const userId = await seedUser(uniqueLogin('constraint'));
        await expect(
          db.pool.query(
            `INSERT INTO tenant_acme.core_user_access (user_id, access_type, privilege) VALUES ($1, 'bogus', 'x.y')`,
            [userId],
          ),
        ).rejects.toThrow(/core_user_access_access_type_check/);

        await db.pool.query(
          `INSERT INTO tenant_acme.core_user_access (user_id, access_type, reason) VALUES ($1, 'suspension', 'one')`,
          [userId],
        );
        await expect(
          db.pool.query(
            `INSERT INTO tenant_acme.core_user_access (user_id, access_type, reason) VALUES ($1, 'suspension', 'two')`,
            [userId],
          ),
        ).rejects.toThrow(/core_user_access_active_suspension_key/);
      });
    });
  },
);
