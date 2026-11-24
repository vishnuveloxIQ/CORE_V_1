import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
const app = buildApp({ env });
const failingApp = buildApp({
  env,
  readinessChecks: [
    {
      name: 'db',
      run: async () => {
        throw new Error('connection refused');
      },
    },
  ],
});

afterAll(async () => {
  await app.close();
  await failingApp.close();
});

describe('health endpoints', () => {
  it('GET /health reports liveness', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: 'ok' } });
  });

  it('GET /health/ready is 200 when there are no checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: 'ok', checks: [] } });
  });

  it('GET /health/ready is 503, names the failing check and hides the error text', async () => {
    const res = await failingApp.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      data: { status: 'fail', checks: [{ name: 'db', status: 'fail' }] },
    });
    expect(res.body).not.toContain('connection refused');
  });
});
