import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, PASSWORD, seedUser, signIn, uniqueLogin, JWT_SECRET } from '../testing-pass/helpers.js';

// Pre-login lookups and the audit trail. These endpoints run before anyone is signed in, so they must not tell a
// caller which logins or tenants exist. Example data is fictional.

const SLOW_TEST_MS = 60_000;

interface Reply {
  statusCode: number;
  code?: string | undefined;
}

async function asReply(res: { statusCode: number; body: string }): Promise<Reply> {
  const body = res.body ? (JSON.parse(res.body) as { error?: { code?: string } }) : {};
  return { statusCode: res.statusCode, code: body.error?.code };
}

describe.skipIf(!TEST_DATABASE_URL)('pre-login lookups and audit trail', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let knownLogin: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool });
    knownLogin = uniqueLogin('lookup');
    await seedUser(db.pool, 'tenant_acme', knownLogin);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  /** The same pre-login call, with the tenant header and the login id varied. */
  const login = (tenant: string | null, loginId: string, password = PASSWORD) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: tenant ? { 'x-tenant-id': tenant } : {},
      payload: { loginId, password },
    });

  const passkeyOptions = (tenant: string, loginId: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/passkeys/login/options',
      headers: { 'x-tenant-id': tenant },
      payload: { loginId },
    });

  describe('login does not reveal whether a login or a tenant exists', () => {
    it('a wrong password and an unknown login give the same answer', async () => {
      const wrong = await asReply(await login('acme', knownLogin, 'not-the-password-123'));
      const unknown = await asReply(await login('acme', `nobody-${randomUUID().slice(0, 8)}`));
      expect(wrong).toEqual({ statusCode: 401, code: 'AUTH_INVALID_CREDENTIALS' });
      expect(unknown).toEqual(wrong);
    });

    it('an unknown tenant gives the same answer as an unknown login', async () => {
      const unknown = await asReply(await login('acme', `nobody-${randomUUID().slice(0, 8)}`));
      const noSuchTenant = await asReply(await login('zeta', knownLogin));
      expect(noSuchTenant).toEqual(unknown);
    });

    it('a login with no tenant header is refused with 400, not with a sign-in answer', async () => {
      const res = await asReply(await login(null, knownLogin));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('passkey sign-in options do not reveal a tenant', () => {
    it('an unknown tenant gets the same status as an unknown login in a real tenant', async () => {
      const unknownLogin = await passkeyOptions('acme', `nobody-${randomUUID().slice(0, 8)}`);
      const noSuchTenant = await passkeyOptions('zeta', knownLogin);
      expect(noSuchTenant.statusCode).toBe(unknownLogin.statusCode);
    });
  });

  describe('the audit trail records sign-in attempts', () => {
    it('a failed sign-in for an unknown login is recorded with no user, and a known user\'s failure with the user', async () => {
      const before = await db.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM tenant_acme.core_auth_activity WHERE event_type = 'login_failure' AND user_id IS NULL`,
      );
      await login('acme', `nobody-${randomUUID().slice(0, 8)}`);
      const after = await db.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM tenant_acme.core_auth_activity WHERE event_type = 'login_failure' AND user_id IS NULL`,
      );
      expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);

      await login('acme', knownLogin, 'not-the-password-123');
      const known = await db.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM tenant_acme.core_auth_activity a
         JOIN tenant_acme.core_user u ON u.id = a.user_id
         WHERE a.event_type = 'login_failure' AND u.login_id = $1`,
        [knownLogin],
      );
      expect(Number(known.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    });

    it('a successful sign-in is recorded and carries the device label the client sent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-id': 'acme', 'user-agent': 'lookup-test-agent' },
        payload: { loginId: knownLogin, password: PASSWORD, deviceLabel: 'Lookup test laptop' },
      });
      expect(res.statusCode).toBe(200);
      const { rows } = await db.pool.query<{ event_type: string }>(
        `SELECT a.event_type FROM tenant_acme.core_auth_activity a
         JOIN tenant_acme.core_user u ON u.id = a.user_id
         WHERE u.login_id = $1 AND a.event_type = 'login_success'
         ORDER BY a.occurred_at DESC LIMIT 1`,
        [knownLogin],
      );
      expect(rows).toHaveLength(1);
      await signIn(app, 'acme', knownLogin);
    });

    it('the audit-log endpoint is refused to a user without the access privilege', async () => {
      const module = uniqueLogin('audit-module');
      await seedUser(db.pool, 'tenant_acme', module);
      const token = await signIn(app, 'acme', module);
      const denied = await call(app, 'GET', '/audit-log', token);
      expect(denied.statusCode).toBe(403);
    });
  });
});
