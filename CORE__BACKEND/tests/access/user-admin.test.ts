import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
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

// POST /users, PATCH /users/:id, POST /users/:id/password-reset and the forced password change. Data is fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';
const NEW_PASSWORD = 'Brand-New-Password-42';

interface UserView {
  id: string;
  loginId: string;
  rowVersion: number;
  temporaryPassword?: string;
  [key: string]: unknown;
}

function data<T>(res: Reply): T {
  return (res.json() as { data: T }).data;
}

function expectError(res: Reply, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect((res.json() as { error: { code: string } }).error.code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)('admin user routes', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let admin = '';
  let plain = '';
  let projectId = '';
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    app = buildApp({ env, pool: db.pool });
    const adminLogin = uniqueLogin('ua-admin');
    await seedUser(db.pool, SCHEMA, adminLogin);
    await grant(db.pool, TENANT, adminLogin, ACCESS_MANAGE);
    admin = await signIn(app, TENANT, adminLogin);
    const plainLogin = uniqueLogin('ua-plain');
    await seedUser(db.pool, SCHEMA, plainLogin);
    plain = await signIn(app, TENANT, plainLogin);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_project (code, name, status) VALUES ('UA-P1', 'User admin project', 'active') RETURNING id`,
    );
    projectId = rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  function login(loginId: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password },
    });
  }

  async function createUser(body: object): Promise<UserView> {
    const res = await call(app, 'POST', '/users', admin, body);
    expect(res.statusCode, res.body).toBe(201);
    return data<UserView>(res);
  }

  it('refuses anonymous (401) and users without access.manage (403) on every new route', async () => {
    const id = randomUUID();
    const body = { loginId: 'NOPE0001', name: 'Nope' };
    expect((await call(app, 'POST', '/users', null, body)).statusCode).toBe(401);
    expect((await call(app, 'POST', '/users', plain, body)).statusCode).toBe(403);
    expect((await call(app, 'PATCH', `/users/${id}`, null, { rowVersion: 1 })).statusCode).toBe(
      401,
    );
    expect((await call(app, 'PATCH', `/users/${id}`, plain, { rowVersion: 1 })).statusCode).toBe(
      403,
    );
    expect((await call(app, 'POST', `/users/${id}/password-reset`, null)).statusCode).toBe(401);
    expect((await call(app, 'POST', `/users/${id}/password-reset`, plain)).statusCode).toBe(403);
  });

  it('creates a user with a temporary password returned once, never in GET', async () => {
    const loginId = `UA${randomUUID().slice(0, 6)}`;
    const created = await createUser({
      loginId,
      name: 'Asha Rao',
      email: 'asha@example.test',
      phone: '+91 90000 00001',
      designation: 'Site engineer',
      role: 'module_head',
      modules: ['hrms', 'stores'],
      scopeType: 'project',
      scopeIds: [projectId],
    });
    expect(created).toMatchObject({
      loginId,
      name: 'Asha Rao',
      phone: '+91 90000 00001',
      designation: 'Site engineer',
      role: 'module_head',
      modules: ['hrms', 'stores'],
      scopeType: 'project',
      scopeIds: [projectId],
      status: 'active',
      suspended: false,
      mustChangePassword: true,
    });
    expect(typeof created.temporaryPassword).toBe('string');
    expect(created.temporaryPassword!.length).toBeGreaterThanOrEqual(12);

    const stored = await db.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM tenant_acme.core_user WHERE id = $1',
      [created.id],
    );
    expect(stored.rows[0]!.password_hash).toMatch(/^\$argon2id\$/);

    const one = await call(app, 'GET', `/users/${created.id}`, admin);
    expect(one.body).not.toContain(created.temporaryPassword!);
    expect(data<UserView>(one)).not.toHaveProperty('temporaryPassword');
    const list = await call(app, 'GET', '/users?limit=200', admin);
    expect(list.body).not.toContain(created.temporaryPassword!);

    // The idempotency store keeps the response without the password.
    const idem = await db.pool.query<{ response: unknown }>(
      'SELECT response FROM tenant_acme.integ_idempotency_key',
    );
    expect(JSON.stringify(idem.rows)).not.toContain(created.temporaryPassword!);
  });

  it('a replay with the same Idempotency-Key does not return the password again', async () => {
    const body = { loginId: `UA${randomUUID().slice(0, 6)}`, name: 'Replay Person' };
    const headers = { 'idempotency-key': randomUUID() };
    const first = await call(app, 'POST', '/users', admin, body, headers);
    expect(first.statusCode).toBe(201);
    expect(data<UserView>(first).temporaryPassword).toBeTypeOf('string');
    const again = await call(app, 'POST', '/users', admin, body, headers);
    expect(again.statusCode).toBe(201);
    expect(data<UserView>(again)).not.toHaveProperty('temporaryPassword');
    expect(data<UserView>(again).id).toBe(data<UserView>(first).id);
  });

  it('refuses a duplicate login id with 409, ignoring case', async () => {
    const loginId = `Dup${randomUUID().slice(0, 6)}`;
    await createUser({ loginId, name: 'First' });
    const dup = await call(app, 'POST', '/users', admin, {
      loginId: loginId.toUpperCase(),
      name: 'Second',
    });
    expectError(dup, 409, 'USER_DUPLICATE_LOGIN');
  });

  it('validates the create body', async () => {
    expectError(
      await call(app, 'POST', '/users', admin, { loginId: 'has space', name: 'X' }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call(app, 'POST', '/users', admin, { loginId: 'VALID001', name: 'X', role: 'boss' }),
      400,
      'VALIDATION_ERROR',
    );
    // A module head needs a module; a project scope needs an existing project.
    expectError(
      await call(app, 'POST', '/users', admin, {
        loginId: 'VALID002',
        name: 'X',
        role: 'module_head',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call(app, 'POST', '/users', admin, {
        loginId: 'VALID003',
        name: 'X',
        scopeType: 'project',
        scopeIds: [randomUUID()],
      }),
      400,
      'USER_REFERENCE_NOT_FOUND',
    );
    expectError(
      await call(app, 'POST', '/users', admin, {
        loginId: 'VALID004',
        name: 'X',
        password: 'Chosen-By-Admin-1',
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('patches the profile with rowVersion, refuses loginId and a stale version', async () => {
    const user = await createUser({ loginId: `UP${randomUUID().slice(0, 6)}`, name: 'Before' });
    const res = await call(app, 'PATCH', `/users/${user.id}`, admin, {
      name: 'After',
      designation: 'Store keeper',
      phone: '12345',
      role: 'module_head',
      modules: ['pm'],
      rowVersion: user.rowVersion,
    });
    expect(res.statusCode, res.body).toBe(200);
    const patched = data<UserView>(res);
    expect(patched).toMatchObject({
      name: 'After',
      designation: 'Store keeper',
      role: 'module_head',
      modules: ['pm'],
      rowVersion: user.rowVersion + 1,
    });
    expect(patched).not.toHaveProperty('temporaryPassword');

    const stale = await call(app, 'PATCH', `/users/${user.id}`, admin, {
      name: 'Stale',
      rowVersion: user.rowVersion,
    });
    expectError(stale, 409, 'VERSION_CONFLICT');

    const loginChange = await call(app, 'PATCH', `/users/${user.id}`, admin, {
      loginId: 'OTHER001',
      rowVersion: patched.rowVersion,
    });
    expectError(loginChange, 400, 'VALIDATION_ERROR');

    const missing = await call(app, 'PATCH', `/users/${randomUUID()}`, admin, { rowVersion: 1 });
    expectError(missing, 404, 'USER_NOT_FOUND');
  });

  it('shows suspended true while a suspension is open', async () => {
    const user = await createUser({ loginId: `US${randomUUID().slice(0, 6)}`, name: 'Suspend Me' });
    const sus = await call(app, 'POST', `/access/users/${user.id}/suspensions`, admin, {
      reason: 'Test',
    });
    expect(sus.statusCode).toBe(201);
    const one = data<UserView>(await call(app, 'GET', `/users/${user.id}`, admin));
    expect(one.suspended).toBe(true);
  });

  it('forces a password change: login flag, blocked routes, change-password clears it', async () => {
    const loginId = `UF${randomUUID().slice(0, 6)}`;
    const created = await createUser({ loginId, name: 'Forced Change' });
    const temp = created.temporaryPassword!;

    const first = await login(loginId, temp);
    expect(first.statusCode).toBe(200);
    expect(first.json().data.mustChangePassword).toBe(true);
    const token = first.json().data.accessToken as string;

    // Only the pending-safe routes answer.
    expectError(await call(app, 'GET', '/projects', token), 403, 'PASSWORD_CHANGE_REQUIRED');
    expect((await call(app, 'GET', '/auth/me', token)).statusCode).toBe(200);
    expect((await call(app, 'GET', '/auth/me/access', token)).statusCode).toBe(200);

    // Wrong current password, weak new password, same password.
    expectError(
      await call(app, 'POST', '/auth/change-password', token, {
        currentPassword: 'not-the-password',
        newPassword: NEW_PASSWORD,
      }),
      400,
      'AUTH_INVALID_CURRENT_PASSWORD',
    );
    expectError(
      await call(app, 'POST', '/auth/change-password', token, {
        currentPassword: temp,
        newPassword: 'short',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call(app, 'POST', '/auth/change-password', token, {
        currentPassword: temp,
        newPassword: temp,
      }),
      400,
      'VALIDATION_ERROR',
    );
    expect(
      (
        await call(app, 'POST', '/auth/change-password', null, {
          currentPassword: temp,
          newPassword: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(401);

    const changed = await call(app, 'POST', '/auth/change-password', token, {
      currentPassword: temp,
      newPassword: NEW_PASSWORD,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(data(changed)).toEqual({ passwordChanged: true, mustChangePassword: false });

    // The same session now opens the other routes.
    expect((await call(app, 'GET', '/projects', token)).statusCode).toBe(200);
    expect((await login(loginId, temp)).statusCode).toBe(401);
    const again = await login(loginId, NEW_PASSWORD);
    expect(again.statusCode).toBe(200);
    expect(again.json().data.mustChangePassword).toBe(false);
    const view = data<UserView>(await call(app, 'GET', `/users/${created.id}`, admin));
    expect(view.mustChangePassword).toBe(false);
  });

  it('admin reset returns a new temporary password once, sets the flag and ends sessions', async () => {
    const loginId = `UR${randomUUID().slice(0, 6)}`;
    const created = await createUser({ loginId, name: 'Reset Me' });
    const first = await login(loginId, created.temporaryPassword!);
    const token = first.json().data.accessToken as string;
    await call(app, 'POST', '/auth/change-password', token, {
      currentPassword: created.temporaryPassword!,
      newPassword: NEW_PASSWORD,
    });
    expect((await call(app, 'GET', '/projects', token)).statusCode).toBe(200);

    const reset = await call(app, 'POST', `/users/${created.id}/password-reset`, admin);
    expect(reset.statusCode, reset.body).toBe(200);
    const body = data<{ userId: string; mustChangePassword: boolean; temporaryPassword: string }>(
      reset,
    );
    expect(body.userId).toBe(created.id);
    expect(body.mustChangePassword).toBe(true);
    expect(body.temporaryPassword).not.toBe(created.temporaryPassword);

    // The old session ended; the old password no longer works; the new one signs in with the flag.
    expect((await call(app, 'GET', '/auth/me', token)).statusCode).toBe(401);
    expect((await login(loginId, NEW_PASSWORD)).statusCode).toBe(401);
    const next = await login(loginId, body.temporaryPassword);
    expect(next.statusCode).toBe(200);
    expect(next.json().data.mustChangePassword).toBe(true);

    const view = await call(app, 'GET', `/users/${created.id}`, admin);
    expect(view.body).not.toContain(body.temporaryPassword);
    expect(data<UserView>(view).mustChangePassword).toBe(true);

    expectError(
      await call(app, 'POST', `/users/${randomUUID()}/password-reset`, admin),
      404,
      'USER_NOT_FOUND',
    );
  });
});
