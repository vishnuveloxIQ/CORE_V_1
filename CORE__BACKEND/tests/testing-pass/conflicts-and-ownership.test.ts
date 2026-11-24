import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin } from './helpers.js';

// Three checks the testing pass did not cover yet. Example data is fictional.
//  1. Tenant writes: a token for one tenant cannot change or revoke another tenant's rows (the reads are covered in
//     tenant-isolation.test.ts). Rows are reached only through the tenant the token names.
//  2. 409 under real concurrency: two writes that race on one row version, or two creates with one code, give one
//     success and one 409, never a 500 and never two rows.
//  3. Ownership: one user cannot remove another user's passkey.

const SLOW_TEST_MS = 60_000;

function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

describe.skipIf(!TEST_DATABASE_URL)('tenant writes, 409 conflicts and ownership', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme', 'beta']);
    app = buildApp({ env, pool: db.pool });
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  /** A signed-in user of one tenant who may manage vendors (a masters privilege). */
  async function vendorManager(tenant: 'acme' | 'beta'): Promise<string> {
    const login = uniqueLogin(`mgr-${tenant}`);
    await seedUser(db.pool, `tenant_${tenant}`, login);
    await grant(db.pool, tenant, login, MASTERS_MANAGE);
    return signIn(app, tenant, login);
  }

  async function newVendor(token: string, name = 'Fictional Supplies'): Promise<{ id: string; rowVersion: number }> {
    const res = await call(app, 'POST', '/vendors', token, { code: uniqueCode('VEN'), name });
    expect(res.statusCode, res.body).toBe(201);
    const data = (res.json() as { data: { id: string; rowVersion: number } }).data;
    return { id: data.id, rowVersion: data.rowVersion };
  }

  describe('tenant writes', () => {
    it('a token for beta cannot change an acme vendor: 404, and the acme row is unchanged', async () => {
      const acme = await vendorManager('acme');
      const beta = await vendorManager('beta');
      const vendor = await newVendor(acme, 'Acme Only Supplies');

      const res = await call(app, 'PATCH', `/vendors/${vendor.id}`, beta, { rowVersion: 1, name: 'Hijacked' });
      expect(res.statusCode).toBe(404);

      const own = await call(app, 'GET', `/vendors/${vendor.id}`, acme);
      expect(own.statusCode).toBe(200);
      expect((own.json() as { data: { name: string; rowVersion: number } }).data).toMatchObject({
        name: 'Acme Only Supplies',
        rowVersion: 1,
      });
    });

    it('a token for beta cannot delete an acme vendor, and the acme vendor stays', async () => {
      const acme = await vendorManager('acme');
      const beta = await vendorManager('beta');
      const vendor = await newVendor(acme);

      const res = await call(app, 'DELETE', `/vendors/${vendor.id}`, beta);
      expect(res.statusCode).toBe(404);

      const own = await call(app, 'GET', `/vendors/${vendor.id}`, acme);
      expect(own.statusCode).toBe(200);
    });

    it('a beta session id sent with an acme token is not a session of acme: 401 and nothing is revoked', async () => {
      const betaLogin = uniqueLogin('sess-beta');
      await seedUser(db.pool, 'tenant_beta', betaLogin);
      const betaToken = await signIn(app, 'beta', betaLogin);
      const betaSession = JSON.parse(Buffer.from(betaToken.split('.')[1]!, 'base64url').toString('utf8')).sid as string;

      const acmeLogin = uniqueLogin('sess-acme');
      await seedUser(db.pool, 'tenant_acme', acmeLogin);
      const acmeToken = await signIn(app, 'acme', acmeLogin);

      // The acme token names acme, so the beta session id is looked up in acme's schema and is not there.
      const res = await call(app, 'DELETE', `/auth/sessions/${betaSession}`, acmeToken);
      expect(res.statusCode).toBe(404);

      const stillSignedIn = await call(app, 'GET', '/auth/me', betaToken);
      expect(stillSignedIn.statusCode).toBe(200);
    });
  });

  describe('409 under concurrency', () => {
    it('two saves with the same row version race: one succeeds, the other is 409, and the row moves once', async () => {
      const token = await vendorManager('acme');
      const vendor = await newVendor(token);

      const [first, second] = await Promise.all([
        call(app, 'PATCH', `/vendors/${vendor.id}`, token, { rowVersion: 1, name: 'Writer One' }),
        call(app, 'PATCH', `/vendors/${vendor.id}`, token, { rowVersion: 1, name: 'Writer Two' }),
      ]);

      const codes = [first.statusCode, second.statusCode].sort();
      expect(codes).toEqual([200, 409]);
      const loser = first.statusCode === 409 ? first : second;
      expect((loser.json() as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');

      const winnerName = first.statusCode === 200 ? 'Writer One' : 'Writer Two';
      const after = await call(app, 'GET', `/vendors/${vendor.id}`, token);
      expect((after.json() as { data: { name: string; rowVersion: number } }).data).toMatchObject({
        name: winnerName,
        rowVersion: 2,
      });
    });

    it('two creates with one code race: one is 201, the other is 409, and only one row exists', async () => {
      const token = await vendorManager('acme');
      const code = uniqueCode('DUP');

      const [a, b] = await Promise.all([
        call(app, 'POST', '/vendors', token, { code, name: 'First' }),
        call(app, 'POST', '/vendors', token, { code, name: 'Second' }),
      ]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      const rows = await db.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM tenant_acme.core_vendor WHERE upper(code) = upper($1)`,
        [code],
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
    });
  });

  describe('ownership', () => {
    it('one user cannot remove another user\'s passkey: 404, and the passkey stays', async () => {
      const ownerLogin = uniqueLogin('pk-owner');
      const ownerId = await seedUser(db.pool, 'tenant_acme', ownerLogin);
      const passkey = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_user_passkey (user_id, credential_key) VALUES ($1, $2) RETURNING id`,
        [ownerId, `cred-${randomUUID()}`],
      );
      const passkeyId = passkey.rows[0]!.id;

      const otherLogin = uniqueLogin('pk-other');
      await seedUser(db.pool, 'tenant_acme', otherLogin);
      const otherToken = await signIn(app, 'acme', otherLogin);

      const res = await call(app, 'DELETE', `/auth/passkeys/${passkeyId}`, otherToken);
      expect(res.statusCode).toBe(404);

      const { rows } = await db.pool.query(`SELECT 1 FROM tenant_acme.core_user_passkey WHERE id = $1`, [passkeyId]);
      expect(rows).toHaveLength(1);
    });
  });
});
