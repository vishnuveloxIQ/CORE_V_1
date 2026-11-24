import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createDevUser } from '../../src/db/dev-user.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'dev-user-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

describe.skipIf(!TEST_DATABASE_URL)(
  'dev user seed (local testing helper)',
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

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    it('creates an active user who can sign in', async () => {
      await createDevUser(db.pool, {
        tenantId: TENANT,
        loginId: 'seed.signin',
        name: 'Seed Signin',
        password: PASSWORD,
      });

      app = buildApp({ env, pool: db.pool });
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-id': TENANT },
        payload: { loginId: 'seed.signin', password: PASSWORD },
      });
      expect(res.statusCode, res.body).toBe(200);
    });

    it('refuses a second user with the same login id', async () => {
      await expect(
        createDevUser(db.pool, {
          tenantId: TENANT,
          loginId: 'seed.signin',
          name: 'Again',
          password: PASSWORD,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    });

    it('applies the password policy and never accepts a password equal to the login id', async () => {
      await expect(
        createDevUser(db.pool, {
          tenantId: TENANT,
          loginId: 'seed.short',
          name: 'Short',
          password: 'short',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });

      await expect(
        createDevUser(db.pool, {
          tenantId: TENANT,
          loginId: 'seed.samepass',
          name: 'Same',
          password: 'seed.samepass',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    });

    it('rejects an invalid tenant id', async () => {
      await expect(
        createDevUser(db.pool, {
          tenantId: 'Bad Tenant!',
          loginId: 'seed.badtenant',
          name: 'Bad',
          password: PASSWORD,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    });

    it('refuses to run when NODE_ENV is production', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          createDevUser(db.pool, {
            tenantId: TENANT,
            loginId: 'seed.prod',
            name: 'Prod',
            password: PASSWORD,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  },
);
