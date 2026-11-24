import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { operationFor, toOpenApiPath } from '../../src/plugins/openapi.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Phase N (c): the OpenAPI document is generated from registered routes. Example data is fictional.

interface Doc {
  openapi: string;
  info: { version: string };
  paths: Record<
    string,
    Record<
      string,
      { operationId: string; security?: unknown[]; responses: Record<string, unknown> }
    >
  >;
}

const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

describe('path and operation helpers (hardening)', () => {
  it('turns Express route parameters into OpenAPI parameters', () => {
    expect(toOpenApiPath('/tickets/:id')).toBe('/tickets/{id}');
    expect(toOpenApiPath('/a/:userId/grants/:grantId')).toBe('/a/{userId}/grants/{grantId}');
  });

  it('marks public operations without a security requirement and protected ones with bearerAuth', () => {
    expect(operationFor('POST', '/auth/login').security).toBeUndefined();
    expect(operationFor('GET', '/tickets/{id}').security).toEqual([{ bearerAuth: [] }]);
  });
});

describe('GET /openapi.json without a database (hardening)', () => {
  let app: CoreApp;
  beforeAll(() => {
    app = buildApp({ env });
  });
  afterAll(() => app.close());

  it('lists the routes the app registers and the version from package.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json() as Doc;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('1.10.0');
    expect(doc.paths['/health']?.['get']?.security).toBeUndefined();
    expect(doc.paths['/health/ready']).toBeDefined();
    expect(doc.paths['/openapi.json']).toBeDefined();
    expect(doc.paths['/offline-operations']?.['post']).toBeDefined();
  });

  it('gives every operation an operationId and the standard responses', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json() as Doc;
    const ids = new Set<string>();
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(op.operationId, `${method} ${path}`).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(ids.has(op.operationId), `duplicate ${op.operationId}`).toBe(false);
        ids.add(op.operationId);
        expect(op.responses['200']).toBeDefined();
        expect(op.responses['429']).toBeDefined();
      }
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'GET /openapi.json with the modules registered (hardening)',
  { timeout: 60_000 },
  () => {
    let db: TestDatabase;
    let app: CoreApp;

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
      app = buildApp({ env, pool: db.pool });
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it('documents the protected module routes with bearerAuth and the auth routes as public', async () => {
      const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json() as Doc;
      expect(doc.paths['/tickets']?.['get']?.security).toEqual([{ bearerAuth: [] }]);
      expect(doc.paths['/tickets']?.['post']?.security).toEqual([{ bearerAuth: [] }]);
      expect(doc.paths['/tickets/{id}']?.['get']).toBeDefined();
      expect(doc.paths['/approval-requests']).toBeDefined();
      expect(doc.paths['/policies']).toBeDefined();
      expect(doc.paths['/auth/login']?.['post']?.security).toBeUndefined();
      expect(doc.paths['/auth/refresh']?.['post']?.security).toBeUndefined();
      expect(Object.keys(doc.paths).length).toBeGreaterThan(50);
    });
  },
);
