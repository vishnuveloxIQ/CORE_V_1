import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { signAccessToken, signingKeyFrom } from '../../src/modules/auth/tokens.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, claimsOf, JWT_SECRET, seedUser, signIn, uniqueLogin } from './helpers.js';

// Phase N-1 (a): tenant isolation over HTTP. The tenant comes from the verified token. Example data is fictional.

const SLOW_TEST_MS = 60_000;

describe.skipIf(!TEST_DATABASE_URL)(
  'tenant isolation over HTTP (testing pass)',
  { timeout: SLOW_TEST_MS },
  () => {
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

    async function ticketInAcme(): Promise<{ id: string; code: string; token: string }> {
      const login = uniqueLogin('iso-acme');
      await seedUser(db.pool, 'tenant_acme', login);
      const token = await signIn(app, 'acme', login);
      const code = `TKT-${randomUUID().slice(0, 8).toUpperCase()}`;
      const res = await call(app, 'POST', '/tickets', token, {
        code,
        subject: 'Isolation check',
        category: 'test',
      });
      expect(res.statusCode, res.body).toBe(201);
      return { id: (res.json() as { data: { id: string } }).data.id, code, token };
    }

    it('a token for tenant beta cannot read a ticket that lives in acme', async () => {
      const acme = await ticketInAcme();
      const betaLogin = uniqueLogin('iso-beta');
      await seedUser(db.pool, 'tenant_beta', betaLogin);
      const betaToken = await signIn(app, 'beta', betaLogin);

      const own = await call(app, 'GET', `/tickets/${acme.id}`, acme.token);
      expect(own.statusCode).toBe(200);

      const byId = await call(app, 'GET', `/tickets/${acme.id}`, betaToken);
      expect(byId.statusCode).toBe(404);
      expect(byId.body).not.toContain(acme.code);

      const list = await call(app, 'GET', '/tickets', betaToken);
      expect(list.statusCode).toBe(200);
      const ids = (list.json() as { data: Array<{ id: string }> }).data.map((row) => row.id);
      expect(ids).not.toContain(acme.id);
    });

    it('the X-Tenant-Id header does not move a protected request to another tenant', async () => {
      const acme = await ticketInAcme();
      const res = await call(app, 'GET', `/tickets/${acme.id}`, acme.token, undefined, {
        'x-tenant-id': 'beta',
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { data: { code: string } }).data.code).toBe(acme.code);
    });

    it('a validly signed token that claims another tenant is refused with 401', async () => {
      const login = uniqueLogin('iso-forge');
      await seedUser(db.pool, 'tenant_acme', login);
      const real = await signIn(app, 'acme', login);
      const claims = claimsOf(real);

      // Same user and session, signed with the server key, but the tid claim names beta.
      const key = signingKeyFrom(JWT_SECRET, () => undefined);
      const forged = await signAccessToken(key, {
        userId: claims.sub,
        sessionId: claims.sid,
        tenantId: 'beta',
      });

      const res = await call(app, 'GET', '/auth/me', forged);
      expect(res.statusCode).toBe(401);
    });
  },
);
