import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv, sampleOtpCodeFrom } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Owner decision D10 (2026-11-21): until an email provider is chosen, password reset uses a fixed sample code and
// sends nothing. It must never work in production. Example data is fictional.

const JWT_SECRET = 'sample-otp-secret-with-at-least-32-characters';
const PASSWORD = 'Correct-Horse-Battery-9';
const NEW_PASSWORD = 'Brand-New-Passphrase-7';
const PROD = { NODE_ENV: 'production', JWT_SECRET, WEBAUTHN_RP_ID: 'core.example.test', WEBAUTHN_ORIGINS: 'https://core.example.test' };

describe('sample one-time code settings', () => {
  it('is 123456 in development when unset, the configured code when set, and never in production or by default in test', () => {
    expect(sampleOtpCodeFrom(loadEnv({ NODE_ENV: 'development' }))).toBe('123456');
    expect(sampleOtpCodeFrom(loadEnv({ NODE_ENV: 'development', SAMPLE_OTP_CODE: '424242' }))).toBe('424242');
    expect(sampleOtpCodeFrom(loadEnv({ NODE_ENV: 'test' }))).toBeUndefined();
    expect(sampleOtpCodeFrom(loadEnv({ NODE_ENV: 'test', SAMPLE_OTP_CODE: '111111' }))).toBe('111111');
    expect(sampleOtpCodeFrom(loadEnv(PROD))).toBeUndefined();
  });

  it('refuses to start production with a sample code, and refuses a code that is not six digits', () => {
    expect(() => loadEnv({ ...PROD, SAMPLE_OTP_CODE: '123456' })).toThrow(/SAMPLE_OTP_CODE/);
    expect(() => loadEnv({ NODE_ENV: 'development', SAMPLE_OTP_CODE: '12345' })).toThrow(/SAMPLE_OTP_CODE/);
    expect(() => loadEnv({ NODE_ENV: 'development', SAMPLE_OTP_CODE: 'abcdef' })).toThrow(/SAMPLE_OTP_CODE/);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('password reset with the sample code', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  let logLines: string[] = [];

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  }, 60_000);
  afterAll(async () => {
    await db?.drop();
  });
  beforeEach(async () => {
    logLines = [];
    await db.pool.query('TRUNCATE public.core_rate_limit_window');
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const start = (vars: Record<string, string>) => {
    app = buildApp({ env: loadEnv({ LOG_LEVEL: 'info', ...vars }), pool: db.pool, logStream: { write: (line) => void logLines.push(line) } });
    return app;
  };
  async function seedUser(email: string | null): Promise<string> {
    const loginId = `sample-${randomUUID().slice(0, 8)}`;
    await db.pool.query(
      `INSERT INTO tenant_acme.core_user (login_id, email, name, status, password_hash, failed_count) VALUES ($1, $2, 'Sample User', 'active', $3, 0)`,
      [loginId, email, await hashSecret(PASSWORD)],
    );
    return loginId;
  }
  const post = (url: string, payload: object) => app!.inject({ method: 'POST', url, headers: { 'x-tenant-id': 'acme' }, payload });

  it('resets a password with the sample code, even for an account with no email, and the new password signs in', async () => {
    start({ NODE_ENV: 'development', JWT_SECRET });
    const loginId = await seedUser(null);
    expect((await post('/auth/password-reset/request', { loginId })).statusCode).toBe(202);
    const confirm = await post('/auth/password-reset/confirm', { loginId, code: '123456', newPassword: NEW_PASSWORD });
    expect(confirm.statusCode, confirm.body).toBe(200);
    expect((await post('/auth/login', { loginId, password: NEW_PASSWORD })).statusCode).toBe(200);
    expect((await post('/auth/login', { loginId, password: PASSWORD })).statusCode).toBe(401);
    // the log says a sample code was issued, and never contains the code
    expect(logLines.some((l) => l.includes('sample one-time code issued'))).toBe(true);
    expect(logLines.some((l) => l.includes('123456'))).toBe(false);
  });

  it('refuses any other code, and the sample code works only after a reset was requested', async () => {
    start({ NODE_ENV: 'development', JWT_SECRET });
    const loginId = await seedUser('sample@example.com');
    const early = await post('/auth/password-reset/confirm', { loginId, code: '123456', newPassword: NEW_PASSWORD });
    expect(early.statusCode).toBe(400);
    await post('/auth/password-reset/request', { loginId });
    const wrong = await post('/auth/password-reset/confirm', { loginId, code: '654321', newPassword: NEW_PASSWORD });
    expect(wrong.statusCode).toBe(400);
    expect((await post('/auth/password-reset/confirm', { loginId, code: '123456', newPassword: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('answers 503 in production without an email provider: the sample code never applies there', async () => {
    start(PROD);
    const loginId = await seedUser('sample@example.com');
    const res = await post('/auth/password-reset/request', { loginId });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: { code: string } }).error.code).toBe('OTP_DELIVERY_UNAVAILABLE');
  });
});
