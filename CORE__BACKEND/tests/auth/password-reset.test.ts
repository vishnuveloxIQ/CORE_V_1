import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import type { OtpDelivery, OtpMessage } from '../../src/modules/auth/password-reset.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const NEW_PASSWORD = 'Brand-New-Passphrase-7';
const JWT_SECRET = 'auth-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;

/** Each test uses its own login id, so tests do not depend on each other's rows. */
function uniqueLogin(): string {
  return `reset-${randomUUID().slice(0, 8)}`;
}

// Integration tests for Phase 4b: password reset by one-time code, and the rate limits on login and reset.
describe.skipIf(!TEST_DATABASE_URL)(
  'password reset and rate limits (phase 4b)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp | undefined;
    let logLines: string[] = [];
    let sent: OtpMessage[] = [];
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info', JWT_SECRET });
    const recordingDelivery: OtpDelivery = {
      send: async (message) => {
        sent.push(message);
      },
    };

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    }, 60_000);

    afterAll(async () => {
      await db?.drop();
    });

    // A fresh app per test and a cleared shared window table give each test its own rate-limit counters.
    beforeEach(async () => {
      logLines = [];
      sent = [];
      await db.pool.query('TRUNCATE public.core_rate_limit_window');
      app = buildApp({
        env,
        pool: db.pool,
        otpDelivery: recordingDelivery,
        logStream: {
          write: (line) => {
            logLines.push(line);
          },
        },
      });
    });

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    async function seedUser(
      loginId: string,
      options: { status?: string; email?: string | null; name?: string } = {},
    ): Promise<string> {
      const hash = await hashSecret(PASSWORD);
      const email = options.email === undefined ? null : options.email;
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_user (login_id, email, name, status, password_hash, failed_count)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING id`,
        [loginId, email, options.name ?? 'Test User', options.status ?? 'active', hash],
      );
      return rows[0]!.id;
    }

    function login(loginId: string, password: string) {
      return app!.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-id': TENANT },
        payload: { loginId, password },
      });
    }

    function refresh(refreshToken: string) {
      return app!.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-tenant-id': TENANT },
        payload: { refreshToken },
      });
    }

    function me(accessToken: string) {
      return app!.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
    }

    function requestReset(loginId: string) {
      return app!.inject({
        method: 'POST',
        url: '/auth/password-reset/request',
        headers: { 'x-tenant-id': TENANT },
        payload: { loginId },
      });
    }

    function confirmReset(payload: Record<string, unknown>) {
      return app!.inject({
        method: 'POST',
        url: '/auth/password-reset/confirm',
        headers: { 'x-tenant-id': TENANT },
        payload,
      });
    }

    /** The code most recently sent to this login id. Only the test reads it; the app never returns it. */
    function latestCode(loginId: string): string {
      const message = sent.filter((m) => m.loginId === loginId).at(-1);
      if (!message) {
        throw new Error('no code was sent');
      }
      return message.code;
    }

    async function eventsFor(userId: string): Promise<string[]> {
      const { rows } = await db.pool.query<{ event_type: string }>(
        `SELECT event_type FROM tenant_acme.core_auth_activity
         WHERE user_id = $1 ORDER BY occurred_at, created_at`,
        [userId],
      );
      return rows.map((r) => r.event_type);
    }

    it('sends a six-digit code by email and answers 202 without the code', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });

      const res = await requestReset(loginId);

      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ data: { accepted: true } });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.code).toMatch(/^\d{6}$/);
      expect(sent[0]!.email).toBe(`${loginId}@example.test`);
      expect(sent[0]!.purpose).toBe('password_reset');
      expect(res.body).not.toContain(sent[0]!.code);
    });

    it('answers the same 202 for an unknown login id and sends nothing', async () => {
      const res = await requestReset(uniqueLogin());

      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ data: { accepted: true } });
      expect(sent).toHaveLength(0);
    });

    it('answers 202 and sends nothing to an inactive user', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { status: 'inactive', email: `${loginId}@example.test` });

      const res = await requestReset(loginId);

      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it('answers 202 and sends nothing when the user has no email or phone', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: null });

      const res = await requestReset(loginId);

      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it('sets the new password, revokes every session and returns no tokens', async () => {
      const loginId = uniqueLogin();
      const userId = await seedUser(loginId, { email: `${loginId}@example.test` });
      const before = (await login(loginId, PASSWORD)).json().data;

      await requestReset(loginId);
      const res = await confirmReset({
        loginId,
        code: latestCode(loginId),
        newPassword: NEW_PASSWORD,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { passwordReset: true } });
      expect(res.body).not.toMatch(/accessToken|refreshToken/);
      expect((await login(loginId, PASSWORD)).statusCode).toBe(401);
      expect((await login(loginId, NEW_PASSWORD)).statusCode).toBe(200);
      expect((await me(before.accessToken)).statusCode).toBe(401);
      expect(await eventsFor(userId)).toEqual(
        expect.arrayContaining(['otp_issued', 'otp_verified', 'password_reset']),
      );
      // Last: refreshing a revoked session counts as reuse and revokes every session of the user.
      expect((await refresh(before.refreshToken)).statusCode).toBe(401);
    });

    it('clears a lock, so the user can log in with the new password', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      for (let i = 0; i < 5; i += 1) {
        await login(loginId, 'wrong-password-value');
      }
      expect((await login(loginId, PASSWORD)).statusCode).toBe(401);

      await requestReset(loginId);
      const res = await confirmReset({
        loginId,
        code: latestCode(loginId),
        newPassword: NEW_PASSWORD,
      });

      expect(res.statusCode).toBe(200);
      expect((await login(loginId, NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('refuses a wrong code with AUTH_INVALID_OTP, records it, and still accepts the right code after one miss', async () => {
      const loginId = uniqueLogin();
      const userId = await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const real = latestCode(loginId);
      const wrong = real === '000000' ? '000001' : '000000';

      const miss = await confirmReset({ loginId, code: wrong, newPassword: NEW_PASSWORD });
      expect(miss.statusCode).toBe(400);
      expect(miss.json().error.code).toBe('AUTH_INVALID_OTP');
      expect(await eventsFor(userId)).toContain('otp_failed');

      const hit = await confirmReset({ loginId, code: real, newPassword: NEW_PASSWORD });
      expect(hit.statusCode).toBe(200);
    });

    it('burns the code after five wrong tries, even when the right code comes next', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const real = latestCode(loginId);
      const wrong = real === '000000' ? '000001' : '000000';

      for (let i = 0; i < 5; i += 1) {
        const res = await confirmReset({ loginId, code: wrong, newPassword: NEW_PASSWORD });
        expect(res.statusCode).toBe(400);
      }
      const res = await confirmReset({ loginId, code: real, newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('AUTH_INVALID_OTP');
    });

    it('accepts a code once only', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const code = latestCode(loginId);

      expect((await confirmReset({ loginId, code, newPassword: NEW_PASSWORD })).statusCode).toBe(
        200,
      );
      const again = await confirmReset({ loginId, code, newPassword: 'Another-Passphrase-8' });
      expect(again.statusCode).toBe(400);
      expect(again.json().error.code).toBe('AUTH_INVALID_OTP');
    });

    it('closes the earlier code when a new one is requested', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const first = latestCode(loginId);
      await requestReset(loginId);
      const second = latestCode(loginId);

      const old = await confirmReset({ loginId, code: first, newPassword: NEW_PASSWORD });
      expect(old.statusCode).toBe(400);
      if (first !== second) {
        expect(old.json().error.code).toBe('AUTH_INVALID_OTP');
      }
      const current = await confirmReset({ loginId, code: second, newPassword: NEW_PASSWORD });
      expect(current.statusCode).toBe(200);
    });

    it('refuses an expired code', async () => {
      const loginId = uniqueLogin();
      const userId = await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const code = latestCode(loginId);
      await db.pool.query(
        `UPDATE tenant_acme.core_auth_activity
         SET expires_at = now() - interval '1 second'
         WHERE user_id = $1 AND event_type = 'otp_issued' AND used_at IS NULL`,
        [userId],
      );

      const res = await confirmReset({ loginId, code, newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('AUTH_INVALID_OTP');
    });

    it('checks the new password before the code is used, so a weak password does not burn a try', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);

      const weak = await confirmReset({ loginId, code: latestCode(loginId), newPassword: 'short' });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error.code).toBe('VALIDATION_ERROR');

      const res = await confirmReset({
        loginId,
        code: latestCode(loginId),
        newPassword: NEW_PASSWORD,
      });
      expect(res.statusCode).toBe(200);
    });

    it('rejects a code that is not six digits at the request boundary', async () => {
      const res = await confirmReset({
        loginId: uniqueLogin(),
        code: '12345',
        newPassword: NEW_PASSWORD,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('stores only an argon2id hash of the code', async () => {
      const loginId = uniqueLogin();
      const userId = await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const code = latestCode(loginId);

      const { rows } = await db.pool.query<{ secret_hash: string }>(
        `SELECT secret_hash FROM tenant_acme.core_auth_activity
         WHERE user_id = $1 AND event_type = 'otp_issued'`,
        [userId],
      );
      expect(rows[0]!.secret_hash.startsWith('$argon2id$')).toBe(true);
      expect(rows[0]!.secret_hash).not.toContain(code);
    });

    it('never writes the code or the new password to the log', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const code = latestCode(loginId);
      await confirmReset({ loginId, code: '000000', newPassword: NEW_PASSWORD });
      await confirmReset({ loginId, code, newPassword: NEW_PASSWORD });

      const logged = logLines.join('\n');
      expect(logged).not.toContain(code);
      expect(logged).not.toContain(NEW_PASSWORD);
    });

    it('answers 503 when no delivery is configured', async () => {
      await app!.close();
      app = buildApp({ env, pool: db.pool });

      const res = await requestReset(uniqueLogin());

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('OTP_DELIVERY_UNAVAILABLE');
    });

    it('answers 503 without leaking the code when delivery fails', async () => {
      let attempted = '';
      const failing: OtpDelivery = {
        send: async (message) => {
          attempted = message.code;
          throw new Error('provider unavailable');
        },
      };
      await app!.close();
      app = buildApp({
        env,
        pool: db.pool,
        otpDelivery: failing,
        logStream: {
          write: (line) => {
            logLines.push(line);
          },
        },
      });
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });

      const res = await requestReset(loginId);

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('OTP_DELIVERY_UNAVAILABLE');
      expect(attempted).toMatch(/^\d{6}$/);
      expect(res.body).not.toContain(attempted);
      expect(logLines.join('\n')).not.toContain(attempted);
    });

    it('limits login attempts per login id to ten per window, even for an unknown login id', async () => {
      const unknown = uniqueLogin();
      for (let i = 0; i < 10; i += 1) {
        expect((await login(unknown, 'wrong-password-value')).statusCode).toBe(401);
      }

      const limited = await login(unknown, 'wrong-password-value');

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
      const retryAfter = Number(limited.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(limited.json().error.details.retryAfterSeconds).toBe(retryAfter);
    });

    it('gives a real login id the same 429 as an unknown one', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      for (let i = 0; i < 10; i += 1) {
        await login(loginId, 'wrong-password-value');
      }

      const limited = await login(loginId, PASSWORD);

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    });

    it('limits reset requests to three per login id', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      for (let i = 0; i < 3; i += 1) {
        expect((await requestReset(loginId)).statusCode).toBe(202);
      }

      const limited = await requestReset(loginId);

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(sent).toHaveLength(3);
    });

    it('limits reset requests to twenty per client address across login ids', async () => {
      for (let i = 0; i < 20; i += 1) {
        expect((await requestReset(uniqueLogin())).statusCode).toBe(202);
      }

      const limited = await requestReset(uniqueLogin());

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    });

    it('limits reset confirm attempts to ten per login id, even with the right code', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId, { email: `${loginId}@example.test` });
      await requestReset(loginId);
      const code = latestCode(loginId);
      const wrong = code === '000000' ? '000001' : '000000';
      for (let i = 0; i < 10; i += 1) {
        expect(
          (await confirmReset({ loginId, code: wrong, newPassword: NEW_PASSWORD })).statusCode,
        ).toBe(400);
      }

      const limited = await confirmReset({ loginId, code, newPassword: NEW_PASSWORD });

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    });
  },
);
