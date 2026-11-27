import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Material availability by store (migration 0074): the stores a material is available in are saved with it and read back.
// Example data is fictional.

const SLOW_TEST_MS = 60_000;
const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;

describe.skipIf(!TEST_DATABASE_URL)('Material availability by store', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let uomId: string;
  let storeA: string;
  let storeB: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool });
    const login = uniqueLogin('materials-manager');
    await seedUser(db.pool, 'tenant_acme', login);
    // every write route currently needs the administrator privilege (userMayAct in access/service.ts)
    await grant(db.pool, 'acme', login, 'access.manage');
    manager = await signIn(app, 'acme', login);
    const uom = await db.owner.query<{ id: string }>(`INSERT INTO shared.uom (uom_code, uom_name) VALUES ('CUM', 'Cubic metre') RETURNING id`);
    uomId = uom.rows[0]!.id;
    const a = await db.owner.query<{ id: string }>(`INSERT INTO tenant_acme.core_store (code, name, status) VALUES ('STR-T1', 'Fictional store one', 'active') RETURNING id`);
    const b = await db.owner.query<{ id: string }>(`INSERT INTO tenant_acme.core_store (code, name, status) VALUES ('STR-T2', 'Fictional store two', 'active') RETURNING id`);
    storeA = a.rows[0]!.id;
    storeB = b.rows[0]!.id;
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('saves the stores a material is available in and reads them back after a fresh read', async () => {
    const created = await call(app, 'POST', '/materials', manager, { code: 'MAT-T1', name: 'Fictional cement', uomId, storeIds: [storeA, storeB] });
    expect(created.statusCode, created.body).toBe(201);
    const material = dataOf<{ id: string; storeIds: string[]; rowVersion: number }>(created);
    expect([...material.storeIds].sort()).toEqual([storeA, storeB].sort());

    const listed = await call(app, 'GET', '/materials', manager);
    const row = dataOf<{ id: string; storeIds: string[] }[]>(listed).find((m) => m.id === material.id);
    expect([...(row?.storeIds ?? [])].sort()).toEqual([storeA, storeB].sort());
  });

  it('replaces the list when it is sent, and refuses a store that does not exist', async () => {
    const created = await call(app, 'POST', '/materials', manager, { code: 'MAT-T2', name: 'Fictional sand', uomId, storeIds: [storeA] });
    const material = dataOf<{ id: string; rowVersion: number }>(created);
    const moved = await call(app, 'PATCH', `/materials/${material.id}`, manager, { storeIds: [storeB], rowVersion: material.rowVersion });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(dataOf<{ storeIds: string[] }>(moved).storeIds).toEqual([storeB]);

    const unknown = await call(app, 'PATCH', `/materials/${material.id}`, manager, { storeIds: ['00000000-0000-4000-8000-000000000000'], rowVersion: 2 });
    expect(unknown.statusCode).toBe(400);
  });
});
