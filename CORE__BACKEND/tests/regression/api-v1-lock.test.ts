import { readFileSync } from 'node:fs';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { contractOf, diffContracts } from '../../scripts/api-contract.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { JWT_SECRET } from '../testing-pass/helpers.js';

// API v1 is locked (docs/API_V1.md). The generated contract must match docs/api/openapi-v1.json: no operation may be
// removed, changed or added without a deliberate decision. Wording (summaries, descriptions) is not part of the lock.

interface Doc {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
}

const LOCKED = JSON.parse(readFileSync(new URL('../../docs/api/openapi-v1.json', import.meta.url), 'utf8')) as Doc;

describe('API v1 contract is locked', () => {
  it('the locked snapshot is a v1 document with the whole API in it', () => {
    expect(LOCKED.info.version).toMatch(/^1\.\d+\.\d+$/);
    const count = Object.values(LOCKED.paths).reduce((n, methods) => n + Object.keys(methods).length, 0);
    expect(count).toBeGreaterThan(100);
  });

  it('ignores wording but sees a changed parameter (self-check of the comparison)', () => {
    const op = { summary: 'A', parameters: [{ name: 'id', in: 'path', required: true }] };
    const reworded = { ...op, summary: 'B' };
    const changed = { ...op, parameters: [{ name: 'id', in: 'path', required: false }] };
    const doc = (o: object): Doc => ({ info: { version: '1.0.0' }, paths: { '/x': { get: o } } });
    expect(diffContracts(doc(op), doc(reworded))).toEqual({ removed: [], added: [], changed: [] });
    expect(diffContracts(doc(op), doc(changed)).changed).toEqual(['GET /x']);
    expect(contractOf({ description: 'x', a: 1 })).toEqual({ a: 1 });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('API v1 contract matches the code', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let current: Doc;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET }), pool: db.pool });
    current = (await app.inject({ method: 'GET', url: '/openapi.json' })).json() as Doc;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('keeps the major version at 1', () => {
    expect(current.info.version.split('.')[0]).toBe('1');
  });

  it('removes, changes and adds no operation compared with the locked v1 contract', () => {
    const diff = diffContracts(LOCKED, current);
    // A failure here is a contract change. Removed or changed operations break v1 clients: they belong in v2.
    // An addition is allowed only with a minor version bump and `npm run api:snapshot` (docs/API_V1.md).
    expect(diff).toEqual({ removed: [], added: [], changed: [] });
  });
});
