import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { AppError } from '../../src/core/errors.js';
import { ok } from '../../src/core/response.js';
import { parseInput } from '../../src/core/validation.js';

const app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });

app.get('/ok', async () => ok({ hello: 'world' }, { count: 1 }));
app.get('/conflict', async () => {
  throw new AppError('CONFLICT', 409, 'Code already exists', { field: 'code' });
});
app.get('/boom', async () => {
  throw new Error('SELECT * FROM core_user WHERE password_hash = hunter2');
});
app.post('/create', async (request) => {
  const body = parseInput(z.object({ name: z.string().min(1) }), request.body);
  return ok(body);
});

afterAll(async () => {
  await app.close();
});

describe('response envelope', () => {
  it('wraps success data in { data }, with meta when given', async () => {
    const res = await app.inject({ method: 'GET', url: '/ok' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { hello: 'world' }, meta: { count: 1 } });
  });
});

describe('error handler', () => {
  it('maps AppError to its status and { error: { code, message, details } }', async () => {
    const res = await app.inject({ method: 'GET', url: '/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Code already exists', details: { field: 'code' } },
    });
  });

  it('returns a generic 500 for unexpected errors, without the message, SQL or a stack trace', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('core_user');
    expect(res.body).not.toContain('stack');
  });

  it('returns 404 NOT_FOUND for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('returns 400 REQUEST_ERROR for a malformed JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/create',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'REQUEST_ERROR' } });
  });
});

describe('input validation', () => {
  it('rejects an invalid body with a 400 VALIDATION_ERROR that lists the field path and not the value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/create',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; details: { issues: { path: string }[] } } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.issues.map((issue) => issue.path)).toEqual(['name']);
  });

  it('accepts a valid body', async () => {
    const res = await app.inject({ method: 'POST', url: '/create', payload: { name: 'Site A' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { name: 'Site A' } });
  });
});
