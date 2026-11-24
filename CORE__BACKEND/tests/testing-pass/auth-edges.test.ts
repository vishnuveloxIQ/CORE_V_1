import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { signAccessToken } from '../../src/modules/auth/tokens.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, claimsOf, JWT_SECRET, seedUser, signIn, uniqueLogin } from './helpers.js';

// Phase N-1 (b): auth edges on protected routes, one sample per module. Example data is fictional.

const SLOW_TEST_MS = 60_000;

const PROTECTED_GETS = [
  '/auth/me',
  '/approval-chains',
  '/approval-requests',
  '/policies',
  '/files',
  '/notifications',
  '/tickets',
];

describe.skipIf(!TEST_DATABASE_URL)(
  'auth edges on protected routes (testing pass)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp;
    let realToken: string;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
      app = buildApp({ env, pool: db.pool });
      const login = uniqueLogin('auth-edge');
      await seedUser(db.pool, 'tenant_acme', login);
      realToken = await signIn(app, 'acme', login);
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it.each(PROTECTED_GETS)('%s answers 401 AUTH_REQUIRED with no token', async (url) => {
      const res = await call(app, 'GET', url, null);
      expect(res.statusCode).toBe(401);
      expect((res.json() as { error: { code: string } }).error.code).toBe('AUTH_REQUIRED');
    });

    it.each(PROTECTED_GETS)('%s answers 401 with a malformed bearer value', async (url) => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer not-a-token' },
      });
      expect(res.statusCode).toBe(401);
    });

    it.each(PROTECTED_GETS)('%s answers 401 for a token signed with another key', async (url) => {
      const claims = claimsOf(realToken);
      const foreign = await signAccessToken(new TextEncoder().encode('x'.repeat(48)), {
        userId: claims.sub,
        sessionId: claims.sid,
        tenantId: 'acme',
      });
      const res = await call(app, 'GET', url, foreign);
      expect(res.statusCode).toBe(401);
    });

    it('the real token opens /auth/me, so the refusals above are not caused by a broken route', async () => {
      const res = await call(app, 'GET', '/auth/me', realToken);
      expect(res.statusCode).toBe(200);
    });
  },
);
