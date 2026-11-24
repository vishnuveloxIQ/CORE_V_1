import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/app.js';

// The HTTP layer over Express (src/http/app.ts): route matching, the request order and body handling.

const newApp = (bodyLimit?: number) =>
  createApp({ trustProxy: false, logger: { level: 'silent', redact: { paths: [], censor: '[REDACTED]' } }, ...(bodyLimit ? { bodyLimit } : {}) });

describe('HTTP layer (Express)', () => {
  it('matches a static path before a parameter, whatever order they were declared in', async () => {
    const app = newApp();
    app.get('/things/:id', async (request) => ({ route: 'by id', params: request.params }));
    app.get('/things/latest', async () => ({ route: 'latest' }));
    expect((await app.inject({ method: 'GET', url: '/things/latest' })).json()).toEqual({ route: 'latest' });
    expect((await app.inject({ method: 'GET', url: '/things/42' })).json()).toEqual({ route: 'by id', params: { id: '42' } });
  });

  it('runs global hooks, the route hook, then reads the body, then pre-handlers, then the handler', async () => {
    const app = newApp();
    const order: string[] = [];
    app.addHook('onRequest', async () => void order.push('global'));
    app.post(
      '/ordered',
      {
        onRequest: async (request) => void order.push(`route hook (body read: ${request.body !== undefined})`),
        preHandler: [async (request) => void order.push(`pre-handler (body: ${JSON.stringify(request.body)})`)],
      },
      async () => {
        order.push('handler');
        return { ok: true };
      },
    );
    const res = await app.inject({ method: 'POST', url: '/ordered', payload: { a: 1 } });
    expect(res.statusCode).toBe(200);
    expect(order).toEqual(['global', 'route hook (body read: false)', 'pre-handler (body: {"a":1})', 'handler']);
  });

  it('a hook that replies stops the request there', async () => {
    const app = newApp();
    let reached = false;
    app.get('/stopped', { preHandler: async (_request, reply) => void reply.code(403).send({ error: 'no' }) }, async () => {
      reached = true;
      return {};
    });
    const res = await app.inject({ method: 'GET', url: '/stopped' });
    expect(res.statusCode).toBe(403);
    expect(reached).toBe(false);
  });

  it('refuses a body over the limit with 413 and an unsupported type with 415', async () => {
    const app = newApp(16);
    const statuses: number[] = [];
    app.setErrorHandler((error, _request, reply) => void reply.code(error.statusCode ?? 500).send({ status: error.statusCode }));
    app.post('/body', async (request) => ({ body: request.body }));
    statuses.push((await app.inject({ method: 'POST', url: '/body', payload: { text: 'x'.repeat(100) } })).statusCode);
    statuses.push((await app.inject({ method: 'POST', url: '/body', payload: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).statusCode);
    statuses.push((await app.inject({ method: 'POST', url: '/body', payload: '{bad', headers: { 'content-type': 'application/json' } })).statusCode);
    expect(statuses).toEqual([413, 415, 400]);
  });

  it('a registered raw type arrives as bytes, with its own size limit', async () => {
    const app = newApp();
    app.addContentTypeParser(['application/pdf'], { parseAs: 'buffer', bodyLimit: 1024 }, (_request, body, done) => done(null, body));
    app.put('/file', async (request) => ({ bytes: Buffer.isBuffer(request.body) ? request.body.length : -1 }));
    const res = await app.inject({ method: 'PUT', url: '/file', payload: Buffer.from('%PDF-1.7'), headers: { 'content-type': 'application/pdf' } });
    expect(res.json()).toEqual({ bytes: 8 });
  });

  it('sends no X-Powered-By or ETag, and answers unknown routes with the not-found handler', async () => {
    const app = newApp();
    app.get('/plain', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/plain' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers.etag).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/missing' })).statusCode).toBe(404);
  });

  it('echoes a safe client request ID, and replaces an unsafe one with its own', async () => {
    const app = newApp();
    app.get('/id', async (request) => ({ id: request.id }));
    const named = await app.inject({ method: 'GET', url: '/id', headers: { 'x-request-id': 'b3f1c2d4-0000-4000-8000-1234567890ab' } });
    expect(named.headers['x-request-id']).toBe('b3f1c2d4-0000-4000-8000-1234567890ab');
    expect(named.json()).toEqual({ id: 'b3f1c2d4-0000-4000-8000-1234567890ab' });
    for (const unsafe of ['short', 'line\nbreak-injected-text', 'x'.repeat(65), 'spaces are not allowed']) {
      const res = await app.inject({ method: 'GET', url: '/id', headers: { 'x-request-id': unsafe } });
      expect(res.headers['x-request-id']).toMatch(/^req-[0-9a-z]+$/);
    }
    expect((await app.inject({ method: 'GET', url: '/id' })).headers['x-request-id']).toMatch(/^req-/);
  });

  it('refuses a route added after the app started', async () => {
    const app = newApp();
    await app.ready();
    expect(() => app.get('/late', async () => ({}))).toThrow(/after the app started/);
  });
});
