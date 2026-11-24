import type { CoreApp } from '../../src/http/app.js';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

const JWT_SECRET = 'api-docs-test-secret-with-at-least-32-characters';

function envFor(nodeEnv: 'development' | 'production') {
  return loadEnv({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: 'silent',
    JWT_SECRET,
    // Production config also requires the WebAuthn relying party settings.
    WEBAUTHN_RP_ID: 'app.example.test',
    WEBAUTHN_ORIGINS: 'https://app.example.test',
  });
}

describe('GET /docs (browser API page)', () => {
  let app: CoreApp | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves the Swagger UI page in development, with a CSP that allows only its own script', async () => {
    app = buildApp({ env: envFor('development') });

    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/html');
    expect(res.body).toContain('/openapi.json');
    expect(res.body).toContain('swagger-ui-bundle.js');
    expect(String(res.headers['content-security-policy'])).toContain(
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@',
    );
  });

  it('keeps the strict CSP on every other route', async () => {
    app = buildApp({ env: envFor('development') });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it('does not list /docs in the OpenAPI document', async () => {
    app = buildApp({ env: envFor('development') });

    const res = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(res.json().paths['/docs']).toBeUndefined();
  });

  it('does not exist in production', async () => {
    app = buildApp({ env: envFor('production') });

    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(404);
  });
});
