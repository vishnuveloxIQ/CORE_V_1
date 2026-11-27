import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { ORGANISATION_MANAGE } from '../../src/modules/organisation/routes.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Regression suite, masters: one contract, checked for every master-data resource. A change that breaks the shared
// behaviour of any resource (sign-in, privilege, validation, versioning, detail routes) fails here, whichever module
// it is in. Module-specific rules stay in each module's own tests. Example data is fictional.

const SLOW_TEST_MS = 120_000;

const code = (prefix: string) => `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
let holidayDay = 0;

/** What every master resource is set up from: the rows the create bodies depend on. */
interface Fixtures {
  projectId: string;
  locationId: string;
  uomId: string;
  departmentId: string;
  unitId: string;
}

interface Resource {
  path: string;
  privilege: string;
  create: (f: Fixtures) => Record<string, unknown>;
  /** A valid change, sent with the row version. */
  patch: Record<string, unknown>;
  /** The field that must be unique: a second create with the same value is refused with 409. */
  unique?: string;
}

const RESOURCES: Resource[] = [
  { path: '/projects', privilege: PROJECTS_MANAGE, create: () => ({ code: code('PRJ'), name: 'Regression project' }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/locations', privilege: PROJECTS_MANAGE, create: (f) => ({ code: code('LOC'), name: 'Regression site', projectId: f.projectId }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/stores', privilege: PROJECTS_MANAGE, create: (f) => ({ code: code('ST'), name: 'Regression store', projectId: f.projectId }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/chainage-markers', privilege: PROJECTS_MANAGE, create: (f) => ({ code: code('CH'), projectId: f.projectId, chainageKm: 3 }), patch: { label: 'Culvert' }, unique: 'code' },
  {
    path: '/boq-items',
    privilege: PROJECTS_MANAGE,
    create: (f) => ({ projectId: f.projectId, itemCode: code('BOQ'), description: 'Regression item', uomId: f.uomId, quantity: 10, rate: 25.5 }),
    patch: { description: 'Renamed' },
    unique: 'itemCode',
  },
  {
    path: '/maintenance-schedules',
    privilege: MASTERS_MANAGE,
    create: (f) => ({ equipmentUnitId: f.unitId, task: `Service ${code('')}`, intervalMonths: 3, intervalHours: 500 }),
    patch: { notes: 'Checked' },
    unique: 'task',
  },
  { path: '/milestones', privilege: PROJECTS_MANAGE, create: (f) => ({ projectId: f.projectId, name: `Milestone ${code('')}`, weight: 1 }), patch: { name: 'Renamed' } },
  { path: '/vendors', privilege: MASTERS_MANAGE, create: () => ({ code: code('VEN'), name: 'Regression vendor' }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/materials', privilege: MASTERS_MANAGE, create: (f) => ({ code: code('MAT'), name: 'Regression material', uomId: f.uomId }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/equipment-types', privilege: MASTERS_MANAGE, create: () => ({ code: code('EQ'), name: 'Regression type' }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/organisation/departments', privilege: ORGANISATION_MANAGE, create: () => ({ code: code('DEP'), name: 'Regression department' }), patch: { name: 'Renamed' }, unique: 'code' },
  { path: '/organisation/positions', privilege: ORGANISATION_MANAGE, create: (f) => ({ code: code('POS'), title: 'Regression position', departmentId: f.departmentId }), patch: { title: 'Renamed' }, unique: 'code' },
  {
    path: '/organisation/shifts',
    privilege: ORGANISATION_MANAGE,
    create: () => ({ code: code('SH'), name: 'Regression shift', timezone: 'Asia/Kolkata', inTime: '09:00:00', outTime: '18:00:00', effectiveFrom: '2026-01-01' }),
    patch: { name: 'Renamed' },
    unique: 'code',
  },
  {
    path: '/organisation/holidays',
    privilege: ORGANISATION_MANAGE,
    // a different day for every create, so holidays never collide on their date
    create: () => ({ holidayDate: `2030-01-${String(1 + (holidayDay++ % 28)).padStart(2, '0')}`, name: `Holiday ${code('')}` }),
    patch: { name: 'Renamed' },
  },
  { path: '/organisation/number-series', privilege: ORGANISATION_MANAGE, create: () => ({ seriesCode: code('NS'), prefix: 'REG-' }), patch: { prefix: 'RG-' }, unique: 'seriesCode' },
];

const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;
const codeOf = (reply: Reply) => (reply.json() as { error?: { code?: string } }).error?.code;

describe.skipIf(!TEST_DATABASE_URL)('regression: master-data contract', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let plain: string;
  let fixtures: Fixtures;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    // the sweep sends a few hundred requests from one address; the real per-IP limit has its own tests
    app = buildApp({ env, pool: db.pool, globalRateLimit: { limit: 100_000, windowMs: 60_000 } });

    const managerLogin = uniqueLogin('reg-manager');
    await seedUser(db.pool, 'tenant_acme', managerLogin);
    for (const privilege of [PROJECTS_MANAGE, MASTERS_MANAGE, ORGANISATION_MANAGE]) await grant(db.pool, 'acme', managerLogin, privilege);
    manager = await signIn(app, 'acme', managerLogin);

    const plainLogin = uniqueLogin('reg-plain');
    await seedUser(db.pool, 'tenant_acme', plainLogin);
    plain = await signIn(app, 'acme', plainLogin);

    const uom = await db.owner.query<{ id: string }>(`INSERT INTO shared.uom (uom_code, uom_name) VALUES ('NOS', 'Numbers') RETURNING id`);
    const make = async (path: string, body: object) => {
      const res = await call(app, 'POST', path, manager, body);
      expect(res.statusCode, `${path}: ${res.body}`).toBe(201);
      return dataOf<{ id: string }>(res).id;
    };
    // shifts and holidays need the company profile first (409 COMPANY_PROFILE_MISSING otherwise)
    const profile = await app.inject({
      method: 'PUT',
      url: '/organisation/company-profile',
      headers: { authorization: `Bearer ${manager}`, 'idempotency-key': randomUUID() },
      payload: {
        code: 'REG-CO', legalName: 'Regression Works Private Limited', status: 'active', tradeName: 'Regression Works',
        cin: 'L12345KA2000PLC123456', gstin: '29ABCDE1234F1Z5', pan: 'ABCDE1234F', tan: 'ABCD12345E',
        addressLine1: '12 Example Road', addressLine2: null, city: 'Bengaluru', state: 'Karnataka', pin: '560001',
        country: 'India', contactName: 'Regression Contact', contactEmail: 'contact@example.com', contactPhone: null,
        website: null, logoFileId: null, settings: null,
      },
    });
    expect([200, 201], profile.body).toContain(profile.statusCode);
    const projectId = await make('/projects', { code: code('FIX'), name: 'Fixture project' });
    fixtures = {
      projectId,
      uomId: uom.rows[0]!.id,
      locationId: await make('/locations', { code: code('FIX'), name: 'Fixture site', projectId }),
      departmentId: await make('/organisation/departments', { code: code('FIX'), name: 'Fixture department' }),
      unitId: await make('/equipment-units', {
        assetCode: code('EQ'),
        equipmentTypeId: await make('/equipment-types', { code: code('FIX'), name: 'Fixture type' }),
      }),
    };
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe.each(RESOURCES)('$path', (r) => {
    it('refuses anonymous reads and writes with 401', async () => {
      expect((await call(app, 'GET', r.path, null)).statusCode).toBe(401);
      expect((await call(app, 'GET', `${r.path}/${randomUUID()}`, null)).statusCode).toBe(401);
      expect((await call(app, 'POST', r.path, null, r.create(fixtures))).statusCode).toBe(401);
      expect((await call(app, 'PATCH', `${r.path}/${randomUUID()}`, null, { ...r.patch, rowVersion: 1 })).statusCode).toBe(401);
    });

    it('lets any signed-in user read, and refuses writes without the privilege (403)', async () => {
      expect((await call(app, 'GET', r.path, plain)).statusCode).toBe(200);
      const create = await call(app, 'POST', r.path, plain, r.create(fixtures));
      expect(create.statusCode).toBe(403);
      expect(codeOf(create)).toBe('ACCESS_DENIED');
      expect((await call(app, 'PATCH', `${r.path}/${randomUUID()}`, plain, { ...r.patch, rowVersion: 1 })).statusCode).toBe(403);
    });

    it('creates, reads the same row by id and in the list, and versions every change', async () => {
      const created = await call(app, 'POST', r.path, manager, r.create(fixtures));
      expect(created.statusCode, created.body).toBe(201);
      const row = dataOf<{ id: string; rowVersion: number }>(created);
      expect(row.rowVersion).toBe(1);

      const detail = await call(app, 'GET', `${r.path}/${row.id}`, manager);
      expect(detail.statusCode).toBe(200);
      const listed = dataOf<Array<{ id: string }>>(await call(app, 'GET', r.path, manager)).find((x) => x.id === row.id);
      expect(listed, 'the new row is in the list').toBeDefined();
      expect(dataOf(detail)).toEqual(listed);

      const missingVersion = await call(app, 'PATCH', `${r.path}/${row.id}`, manager, r.patch);
      expect(missingVersion.statusCode).toBe(400);
      expect(codeOf(missingVersion)).toBe('VALIDATION_ERROR');

      const changed = await call(app, 'PATCH', `${r.path}/${row.id}`, manager, { ...r.patch, rowVersion: 1 });
      expect(changed.statusCode, changed.body).toBe(200);
      expect(dataOf<{ rowVersion: number }>(changed)).toMatchObject({ ...r.patch, rowVersion: 2 });

      const stale = await call(app, 'PATCH', `${r.path}/${row.id}`, manager, { ...r.patch, rowVersion: 1 });
      expect(stale.statusCode).toBe(409);
      expect(codeOf(stale)).toBe('VERSION_CONFLICT');
    });

    it('answers 404 for an unknown id and 400 or 404 (never 500) for a malformed one', async () => {
      const unknown = await call(app, 'GET', `${r.path}/${randomUUID()}`, manager);
      expect(unknown.statusCode).toBe(404);
      expect([400, 404]).toContain((await call(app, 'GET', `${r.path}/not-a-uuid`, manager)).statusCode);
      expect((await call(app, 'PATCH', `${r.path}/${randomUUID()}`, manager, { ...r.patch, rowVersion: 1 })).statusCode).toBe(404);
    });

    it('refuses an empty create with 400 VALIDATION_ERROR', async () => {
      const res = await call(app, 'POST', r.path, manager, {});
      expect(res.statusCode).toBe(400);
      expect(codeOf(res)).toBe('VALIDATION_ERROR');
    });

    it.runIf(r.unique !== undefined)('refuses a second row with the same unique value with 409', async () => {
      const body = r.create(fixtures);
      expect((await call(app, 'POST', r.path, manager, body)).statusCode).toBe(201);
      const again = await call(app, 'POST', r.path, manager, body);
      expect(again.statusCode, again.body).toBe(409);
    });
  });
});
