import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { grant, JWT_SECRET, seedUser, signIn, uniqueLogin } from './helpers.js';

// Decision 1: every module POST and PATCH needs an Idempotency-Key. Auth routes and offline operations do not.
// Example data is fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';
const SLOW_TEST_MS = 60_000;

interface ErrorBody {
  error: { code: string; message: string };
}

interface OpenApiDocument {
  paths: Record<string, Record<string, { parameters?: Array<Record<string, unknown>> }>>;
}

/** The Idempotency-Key header is listed among an operation's parameters. */
function hasIdempotencyHeader(parameters: Array<Record<string, unknown>> | undefined): boolean {
  return (parameters ?? []).some(
    (p) => p['name'] === 'Idempotency-Key' && p['in'] === 'header' && p['required'] === true,
  );
}

describe.skipIf(!TEST_DATABASE_URL)(
  'Idempotency-Key on module writes (decision 1)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp | undefined;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await db?.drop();
    });

    // A fresh app per test gives each test its own rate-limit counters.
    beforeEach(() => {
      app = buildApp({ env, pool: db.pool });
    });

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    async function managerToken(): Promise<string> {
      const loginId = uniqueLogin('idem-manager');
      await seedUser(db.pool, SCHEMA, loginId);
      await grant(db.pool, TENANT, loginId, PROJECTS_MANAGE);
      return signIn(app!, TENANT, loginId);
    }

    /** A project create. The key is sent only when given, so tests can omit it. */
    function createProject(token: string, key: string | null, payload: object) {
      return app!.inject({
        method: 'POST',
        url: '/projects',
        headers: {
          authorization: `Bearer ${token}`,
          ...(key === null ? {} : { 'idempotency-key': key }),
        },
        payload,
      });
    }

    async function countProjects(code: string): Promise<number> {
      const { rows } = await db.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${SCHEMA}.core_project WHERE code = $1`,
        [code],
      );
      return rows[0]!.n;
    }

    it('refuses a module POST with no Idempotency-Key header with 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const token = await managerToken();
      const code = `IDK-${randomUUID().slice(0, 8).toUpperCase()}`;

      const res = await createProject(token, null, { code, name: 'Fictional Keyless Project' });

      expect(res.statusCode).toBe(400);
      expect((res.json() as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await countProjects(code)).toBe(0);
    });

    it('refuses a blank Idempotency-Key with 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const token = await managerToken();
      const code = `IDK-${randomUUID().slice(0, 8).toUpperCase()}`;

      const res = await createProject(token, '   ', { code, name: 'Fictional Blank Key Project' });

      expect(res.statusCode).toBe(400);
      expect((res.json() as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await countProjects(code)).toBe(0);
    });

    it('replays the first response for a repeat with the same key and body, and creates the row once', async () => {
      const token = await managerToken();
      const code = `RPL-${randomUUID().slice(0, 8).toUpperCase()}`;
      const key = randomUUID();
      const payload = { code, name: 'Fictional Replay Project' };

      const first = await createProject(token, key, payload);
      const second = await createProject(token, key, payload);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const firstId = (first.json() as { data: { id: string } }).data.id;
      const secondId = (second.json() as { data: { id: string } }).data.id;
      expect(secondId).toBe(firstId);
      expect(await countProjects(code)).toBe(1);
    });

    it('refuses the same key with a different body with 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const token = await managerToken();
      const code = `USE-${randomUUID().slice(0, 8).toUpperCase()}`;
      const key = randomUUID();

      const first = await createProject(token, key, { code, name: 'Fictional Original Name' });
      expect(first.statusCode).toBe(201);

      const reused = await createProject(token, key, { code, name: 'Fictional Changed Name' });

      expect(reused.statusCode).toBe(409);
      expect((reused.json() as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await countProjects(code)).toBe(1);
    });

    it('leaves the auth routes unaffected: login needs no Idempotency-Key', async () => {
      const loginId = uniqueLogin('idem-auth');
      await seedUser(db.pool, SCHEMA, loginId);

      const token = await signIn(app!, TENANT, loginId);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('documents the header on module writes and not on auth or offline operations in OpenAPI', async () => {
      const res = await app!.inject({ method: 'GET', url: '/openapi.json' });
      expect(res.statusCode).toBe(200);
      const doc = res.json() as OpenApiDocument;

      expect(hasIdempotencyHeader(doc.paths['/projects']?.['post']?.parameters)).toBe(true);
      expect(hasIdempotencyHeader(doc.paths['/projects/{id}']?.['patch']?.parameters)).toBe(true);
      expect(hasIdempotencyHeader(doc.paths['/auth/login']?.['post']?.parameters)).toBe(false);
      expect(hasIdempotencyHeader(doc.paths['/offline-operations']?.['post']?.parameters)).toBe(
        false,
      );
    });
  },
);
