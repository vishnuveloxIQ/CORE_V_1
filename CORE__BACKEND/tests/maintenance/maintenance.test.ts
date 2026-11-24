import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Maintenance schedules (migration 0037). The shared behaviour (auth, privilege, versioning, 404s) is in
// tests/regression/masters-contract.test.ts. Example data is fictional.

const code = (prefix: string) => `${prefix}-${randomUUID().slice(0, 6).toUpperCase()}`;
const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;
const errorOf = (reply: Reply) => (reply.json() as { error?: { code?: string; details?: { issues?: Array<{ path: string }> } } }).error;

describe.skipIf(!TEST_DATABASE_URL)('maintenance schedules', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let unitId: string;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET }), pool: db.pool });
    const login = uniqueLogin('mnt');
    await seedUser(db.pool, 'tenant_acme', login);
    await grant(db.pool, 'acme', login, MASTERS_MANAGE);
    manager = await signIn(app, 'acme', login);
    const type = dataOf<{ id: string }>(await call(app, 'POST', '/equipment-types', manager, { code: `EXC${randomUUID().slice(0, 4).toUpperCase()}`, name: 'Excavator' }));
    unitId = dataOf<{ id: string }>(await call(app, 'POST', '/equipment-units', manager, { assetCode: code('EXC'), equipmentTypeId: type.id })).id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  const create = (body: object) => call(app, 'POST', '/maintenance-schedules', manager, { equipmentUnitId: unitId, task: code('Service'), ...body });

  it('keeps a schedule of every 3 months or 500 hours, with the last service', async () => {
    const res = await create({ task: 'General service', intervalMonths: 3, intervalHours: 500, lastServiceDate: '2026-09-01', lastServiceHours: 1250.5 });
    expect(res.statusCode, res.body).toBe(201);
    expect(dataOf(res)).toMatchObject({ task: 'General service', intervalMonths: 3, intervalHours: 500, lastServiceDate: '2026-09-01', lastServiceHours: 1250.5 });
    const listed = dataOf<Array<{ id: string }>>(await call(app, 'GET', `/maintenance-schedules?equipmentUnitId=${unitId}`, manager));
    expect(listed.map((s) => s.id)).toContain(dataOf<{ id: string }>(res).id);
  });

  it('needs an interval in months or hours, on create and when a change would remove both', async () => {
    const none = await create({});
    expect(none.statusCode).toBe(400);
    expect(errorOf(none)?.details?.issues?.[0]?.path).toBe('intervalMonths');
    const hoursOnly = dataOf<{ id: string }>(await create({ intervalHours: 250 }));
    const cleared = await call(app, 'PATCH', `/maintenance-schedules/${hoursOnly.id}`, manager, { intervalHours: null, rowVersion: 1 });
    expect(cleared.statusCode).toBe(400);
  });

  it('refuses a second schedule with the same task on one unit (ignoring case), an unknown unit, and bad intervals', async () => {
    expect((await create({ task: 'Oil change', intervalHours: 250 })).statusCode).toBe(201);
    const again = await create({ task: 'OIL CHANGE', intervalHours: 250 });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again)?.code).toBe('MAINTENANCE_DUPLICATE');
    expect(errorOf(await create({ equipmentUnitId: randomUUID(), intervalMonths: 1 }))?.code).toBe('MAINTENANCE_REFERENCE_NOT_FOUND');
    expect((await create({ intervalMonths: 0 })).statusCode).toBe(400);
    expect((await create({ intervalHours: 1.5 })).statusCode).toBe(400);
  });

  it('deletes a schedule', async () => {
    const s = dataOf<{ id: string }>(await create({ intervalMonths: 6 }));
    expect((await call(app, 'DELETE', `/maintenance-schedules/${s.id}`, manager)).statusCode).toBe(200);
    expect((await call(app, 'GET', `/maintenance-schedules/${s.id}`, manager)).statusCode).toBe(404);
  });
});
