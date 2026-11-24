import type { CoreApp } from '../../src/http/app.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

// Browser access for the front end. Example origins are fictional.

const ALLOWED = 'https://app.example.test';
const OTHER = 'https://intruder.example.test';
const JWT_SECRET = 'cors-test-secret-with-at-least-32-characters';

function envWith(corsOrigins: string | undefined) {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET,
    ...(corsOrigins === undefined ? {} : { CORS_ORIGINS: corsOrigins }),
  });
}

describe('CORS_ORIGINS parsing', () => {
  it('accepts a comma-separated list of origins', () => {
    const env = envWith(`${ALLOWED}, http://localhost:5173`);
    expect(env.CORS_ORIGINS).toEqual([ALLOWED, 'http://localhost:5173']);
  });

  it('leaves the setting undefined when unset', () => {
    expect(envWith(undefined).CORS_ORIGINS).toBeUndefined();
  });

  it('refuses a wildcard', () => {
    expect(() => envWith('*')).toThrow(/CORS_ORIGINS/);
  });

  it('refuses an entry with a path or a trailing slash', () => {
    expect(() => envWith(`${ALLOWED}/`)).toThrow(/CORS_ORIGINS/);
    expect(() => envWith(`${ALLOWED}/app`)).toThrow(/CORS_ORIGINS/);
  });
});

describe('CORS headers', () => {
  let app: CoreApp | undefined;

  beforeEach(() => {
    app = buildApp({ env: envWith(ALLOWED) });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('answers an allowed origin with its Allow-Origin header and Vary: Origin', async () => {
    const res = await app!.inject({ method: 'GET', url: '/health', headers: { origin: ALLOWED } });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(String(res.headers['vary'])).toContain('Origin');
  });

  it('lets the browser send the request ID and step-up token, and read the request ID and Retry-After', async () => {
    const preflight = await app!.inject({
      method: 'OPTIONS',
      url: '/access/grants/x',
      headers: { origin: ALLOWED, 'access-control-request-method': 'DELETE' },
    });
    const allowed = String(preflight.headers['access-control-allow-headers']).toLowerCase();
    expect(allowed).toContain('x-request-id');
    expect(allowed).toContain('x-step-up-token');
    const res = await app!.inject({ method: 'GET', url: '/health', headers: { origin: ALLOWED } });
    expect(String(res.headers['access-control-expose-headers'])).toBe('Retry-After, X-Request-Id');
  });

  it('gives no CORS headers to an origin that is not listed', async () => {
    const res = await app!.inject({ method: 'GET', url: '/health', headers: { origin: OTHER } });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('gives no CORS headers to a request without an Origin header', async () => {
    const res = await app!.inject({ method: 'GET', url: '/health' });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight from an allowed origin with 204 and the allowed methods and headers', async () => {
    const res = await app!.inject({
      method: 'OPTIONS',
      url: '/projects',
      headers: {
        origin: ALLOWED,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,idempotency-key,content-type',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PATCH, DELETE, OPTIONS');
    expect(String(res.headers['access-control-allow-headers'])).toContain('Idempotency-Key');
    expect(String(res.headers['access-control-allow-headers'])).toContain('Authorization');
  });

  it('gives an unlisted origin no Allow-Origin on a preflight', async () => {
    const res = await app!.inject({
      method: 'OPTIONS',
      url: '/projects',
      headers: { origin: OTHER, 'access-control-request-method': 'POST' },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds no CORS headers at all when CORS_ORIGINS is unset', async () => {
    await app!.close();
    app = buildApp({ env: envWith(undefined) });

    const res = await app!.inject({ method: 'GET', url: '/health', headers: { origin: ALLOWED } });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
