import type { CoreApp } from '../../src/http/app.js';
import type { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createPool } from '../../src/db/client.js';
import { TEST_DATABASE_URL } from '../db/helpers.js';

// CORE-16-07 / CORE-16-08: the API with a database that is down, refuses the credentials, or does not answer.
// Readiness reports 503, requests fail fast with a generic 500, and nothing names the server, user or password.

const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info', JWT_SECRET: 'db-failure-test-secret-with-at-least-32-chars' });

function appWith(pool: Pool): { app: CoreApp; logs: string[] } {
  const logs: string[] = [];
  const app = buildApp({
    env,
    pool,
    logStream: { write: (line: string) => void logs.push(line) },
    readinessChecks: [{ name: 'database', run: () => pool.query('SELECT 1').then(() => undefined) }],
  });
  return { app, logs };
}

const opened: Array<{ app: CoreApp; pool: Pool }> = [];
afterAll(async () => {
  for (const { app, pool } of opened) {
    await app.close();
    await pool.end().catch(() => undefined);
  }
});

async function expectSafeFailure(pool: Pool, secret: string) {
  const { app, logs } = appWith(pool);
  opened.push({ app, pool });

  const started = Date.now();
  const ready = await app.inject({ method: 'GET', url: '/health/ready' });
  expect(ready.statusCode).toBe(503);
  expect(ready.json()).toEqual({ data: { status: 'fail', checks: [{ name: 'database', status: 'fail' }] } });
  expect(Date.now() - started).toBeLessThan(6_000);

  const login = await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-tenant-id': 'acme' }, payload: { loginId: 'ACME0001', password: 'Fictional-Password-1' } });
  expect(login.statusCode).toBe(500);
  expect((login.json() as { error: { code: string; message: string } }).error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });

  for (const text of [ready.body, login.body, logs.join('\n')]) {
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
  }
  expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
}

describe('database failures', { timeout: 30_000 }, () => {
  it('database down (nothing listening): 503 ready, 500 on login, no connection details anywhere', async () => {
    await expectSafeFailure(createPool('postgres://down_user:down-secret-77@127.0.0.1:1/velox_down', 2, 1_000), 'down-secret-77');
  });

  it('no answer from the host: the 1-second connect timeout fails the request instead of hanging', async () => {
    // 10.255.255.1 is not routable, so the connection neither succeeds nor is refused
    await expectSafeFailure(createPool('postgres://slow_user:slow-secret-88@10.255.255.1:5432/velox_slow', 2, 1_000), 'slow-secret-88');
  });

  // An unknown user rather than a wrong password: the local development server accepts any password on localhost
  // (trust authentication), so a wrong password would not be refused there. Staging must use password checks.
  it.skipIf(!TEST_DATABASE_URL)('credentials refused (unknown user): 503 ready and 500 on login, and the password is never logged', async () => {
    const url = new URL(TEST_DATABASE_URL!);
    url.username = 'no_such_core_user';
    url.password = 'wrong-secret-99';
    await expectSafeFailure(createPool(url.toString(), 2, 2_000), 'wrong-secret-99');
  });
});
