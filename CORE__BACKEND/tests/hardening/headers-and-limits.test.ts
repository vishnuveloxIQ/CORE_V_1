import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

// Phase N (a) and (b): security headers and the global per-IP limit. No database is needed. Example data is fictional.

const JWT_SECRET = 'hardening-secret-with-at-least-32-characters';

describe('security headers (hardening)', () => {
  let app: CoreApp;
  beforeAll(() => {
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });
  });
  afterAll(() => app.close());

  it('sends the fixed headers on a success response and on an error response', async () => {
    const ok = await app.inject({ method: 'GET', url: '/health' });
    const missing = await app.inject({ method: 'GET', url: '/no-such-route' });
    for (const res of [ok, missing]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(missing.statusCode).toBe(404);
  });

  it('never sends X-Powered-By', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not send Strict-Transport-Security outside production', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends Strict-Transport-Security in production', async () => {
    const prod = buildApp({
      env: loadEnv({
        NODE_ENV: 'production',
        LOG_LEVEL: 'silent',
        JWT_SECRET,
        WEBAUTHN_RP_ID: 'core.example.test',
        WEBAUTHN_ORIGINS: 'https://core.example.test',
      }),
    });
    try {
      const res = await prod.inject({ method: 'GET', url: '/health' });
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    } finally {
      await prod.close();
    }
  });
});

describe('global per-IP rate limit (hardening)', () => {
  let app: CoreApp;
  beforeAll(() => {
    app = buildApp({
      env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      globalRateLimit: { limit: 2, windowMs: 60_000 },
    });
  });
  afterAll(() => app.close());

  it('refuses requests over the limit with 429 RATE_LIMITED and Retry-After', async () => {
    const first = await app.inject({ method: 'GET', url: '/openapi.json' });
    const second = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const third = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(third.statusCode).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    const body = third.json() as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('never throttles the health probes', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
  });
});
