import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { ORGANISATION_MANAGE } from '../../src/modules/organisation/routes.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5c. Every record is created by its own test with a unique code, so the tests do
// not depend on each other's order. All names, codes and tax IDs are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'masters-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

/** A code that no other test uses. Upper case, so it also fits the equipment type code pattern. */
function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

/** A record as the API returns it. Only the fields the tests read are typed. */
interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

interface AuditRow {
  op: string;
  actor_id: string | null;
  module_name: string | null;
  new_row: Record<string, unknown> | null;
}

interface ErrorBody {
  error: { code: string; message: string };
}

/** The part of an injected response the helpers read. */
interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('master data (phase 5c)', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
  }, 60_000);

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

  function uniqueLogin(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  async function seedUser(loginId: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Masters User', 'active', $2, 0)
       RETURNING id`,
      [loginId, hash],
    );
    return rows[0]!.id;
  }

  async function signIn(loginId: string): Promise<string> {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.accessToken as string;
  }

  /**
   * A user who holds masters.manage. Projects, locations and stores are created as set-up data for each test,
   * so this user also holds projects.manage and organisation.manage. Granted with the bootstrap function the CLI uses.
   */
  async function managerUser(): Promise<{ id: string; token: string }> {
    const loginId = uniqueLogin('mast-manager');
    const id = await seedUser(loginId);
    for (const privilege of [MASTERS_MANAGE, PROJECTS_MANAGE, ORGANISATION_MANAGE]) {
      await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege });
    }
    return { id, token: await signIn(loginId) };
  }

  async function plainUser(): Promise<{ id: string; token: string }> {
    const loginId = uniqueLogin('mast-user');
    const id = await seedUser(loginId);
    return { id, token: await signIn(loginId) };
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string | null,
    payload?: object,
  ) {
    return app!.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...idempotencyFor(method, url),
      },
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  /** Creates one record and returns it. The create must answer 201. */
  async function createRow(token: string, url: string, payload: object): Promise<Row> {
    const res = await call('POST', url, token, payload);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
    return res.json().data as Row;
  }

  /** Asserts an error answer by its status and its stable error code. */
  function expectError(res: Reply, status: number, code: string): void {
    expect(res.statusCode, res.body).toBe(status);
    expect((res.json() as ErrorBody).error.code).toBe(code);
  }

  async function newUom(): Promise<{ id: string; code: string }> {
    const code = uniq('UOM');
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, 'Fictional unit') RETURNING id`,
      [code],
    );
    return { id: rows[0]!.id, code };
  }

  async function newPosition(): Promise<string> {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_position (code, title, status)
       VALUES ($1, 'Fictional site engineer', 'active') RETURNING id`,
      [uniq('POS')],
    );
    return rows[0]!.id;
  }

  async function newProject(token: string): Promise<Row> {
    return createRow(token, '/projects', { code: uniq('PRJ'), name: 'Fictional Metro Phase 2' });
  }

  /** A store sits on a location, which sits on a project. */
  async function newStore(token: string, projectId: string): Promise<Row> {
    const location = await createRow(token, '/locations', {
      code: uniq('LOC'),
      name: 'Fictional Site North',
      projectId,
    });
    return createRow(token, '/stores', {
      code: uniq('STO'),
      name: 'Fictional Main Store',
      locationId: location.id,
    });
  }

  async function newMaterial(token: string, uomId: string): Promise<Row> {
    return createRow(token, '/materials', { code: uniq('MAT'), name: 'Fictional Cement', uomId });
  }

  async function newEquipmentType(token: string): Promise<Row> {
    return createRow(token, '/equipment-types', {
      code: uniq('EQ'),
      name: 'Fictional Excavator',
      meterKind: 'hours',
      meterPrecision: 1,
      fuelNormUnit: 'litre_per_hour',
    });
  }

  async function newVendor(token: string): Promise<Row> {
    return createRow(token, '/vendors', { code: uniq('VEN'), name: 'Fictional Supplies Pvt Ltd' });
  }

  async function auditRows(table: string, recordId: string): Promise<AuditRow[]> {
    const { rows } = await db.pool.query<AuditRow>(
      `SELECT op, actor_id, module_name, new_row
       FROM tenant_acme.audit_row_change
       WHERE table_name = $1 AND record_id = $2
       ORDER BY changed_at`,
      [table, recordId],
    );
    return rows;
  }

  // Vendors (design points b and c).

  it('vendors: create with tax IDs, record the signed-in user, and audit the insert without the GSTIN', async () => {
    const manager = await managerUser();
    const gstin = '29ABCDE1234F1Z5';
    const vendor = await createRow(manager.token, '/vendors', {
      code: uniq('VEN'),
      name: 'Fictional Supplies Pvt Ltd',
      gstin,
      pan: 'ABCDE1234F',
      email: 'accounts@example.test',
      phone: '+91 00000 00000',
      address: 'Fictional Road 1, Sample City',
    });
    expect(vendor).toMatchObject({
      status: 'active',
      rowVersion: 1,
      registeredBy: manager.id,
      verifiedAt: null,
      gstin,
      pan: 'ABCDE1234F',
    });

    const audit = await auditRows('core_vendor', vendor.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ op: 'INSERT', actor_id: manager.id, module_name: 'core' });
    expect(JSON.stringify(audit[0]!.new_row)).not.toContain(gstin);
  });

  it('vendors: a code that differs only in case is a duplicate', async () => {
    const manager = await managerUser();
    const code = uniq('VEN');
    await createRow(manager.token, '/vendors', { code, name: 'First' });
    expectError(
      await call('POST', '/vendors', manager.token, { code: code.toLowerCase(), name: 'Second' }),
      409,
      'MASTERS_DUPLICATE',
    );
  });

  it('vendors: a malformed GSTIN is refused with a validation error', async () => {
    const manager = await managerUser();
    expectError(
      await call('POST', '/vendors', manager.token, {
        code: uniq('VEN'),
        name: 'Fictional',
        gstin: '29ABCDE1234F1Z',
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('vendors: a change needs the current version; a stale version conflicts; a missing one is refused', async () => {
    const manager = await managerUser();
    const vendor = await newVendor(manager.token);

    const renamed = await call('PATCH', `/vendors/${vendor.id}`, manager.token, {
      rowVersion: 1,
      name: 'Fictional Supplies Renamed',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().data).toMatchObject({
      name: 'Fictional Supplies Renamed',
      rowVersion: 2,
    });

    expectError(
      await call('PATCH', `/vendors/${vendor.id}`, manager.token, { rowVersion: 1, name: 'Stale' }),
      409,
      'VERSION_CONFLICT',
    );
    expectError(
      await call('PATCH', `/vendors/${vendor.id}`, manager.token, { name: 'No version' }),
      400,
      'VALIDATION_ERROR',
    );

    const audit = await auditRows('core_vendor', vendor.id);
    expect(audit.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
  });

  it('vendors: verify sets verified_at and bumps the version; a stale verify conflicts', async () => {
    const manager = await managerUser();
    const vendor = await newVendor(manager.token);

    expectError(
      await call('POST', `/vendors/${vendor.id}/verify`, manager.token, { rowVersion: 7 }),
      409,
      'VERSION_CONFLICT',
    );

    const verified = await call('POST', `/vendors/${vendor.id}/verify`, manager.token, {
      rowVersion: 1,
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().data).toMatchObject({ rowVersion: 2 });
    expect(verified.json().data.verifiedAt).toEqual(expect.any(String));
  });

  it('vendors: deactivate instead of delete, and filter the list by status', async () => {
    const manager = await managerUser();
    const vendor = await newVendor(manager.token);

    const deactivated = await call('PATCH', `/vendors/${vendor.id}`, manager.token, {
      rowVersion: 1,
      status: 'inactive',
    });
    expect(deactivated.statusCode).toBe(200);

    const inactive = await call('GET', '/vendors?status=inactive', manager.token);
    const activeList = await call('GET', '/vendors?status=active', manager.token);
    expect(inactive.json().data.map((v: Row) => v.id)).toContain(vendor.id);
    expect(activeList.json().data.map((v: Row) => v.id)).not.toContain(vendor.id);

    expect((await call('DELETE', `/vendors/${vendor.id}`, manager.token)).statusCode).toBe(404);
  });

  // Materials (design point d).

  it('materials: a known unit, a 4/6/8-digit HSN and a non-negative reorder level are accepted', async () => {
    const manager = await managerUser();
    const uom = await newUom();
    const material = await createRow(manager.token, '/materials', {
      code: uniq('MAT'),
      name: 'Fictional Cement OPC 53',
      uomId: uom.id,
      hsn: '252330',
      reorderLevel: 50,
      category: 'Civil',
    });
    expect(material).toMatchObject({
      status: 'active',
      hsn: '252330',
      reorderLevel: 50,
      rowVersion: 1,
    });
  });

  it('materials: an unknown unit, a bad HSN, a negative reorder level and a duplicate code are refused', async () => {
    const manager = await managerUser();
    const uom = await newUom();
    const code = uniq('MAT');
    await createRow(manager.token, '/materials', { code, name: 'First', uomId: uom.id });

    expectError(
      await call('POST', '/materials', manager.token, {
        code: uniq('MAT'),
        name: 'Unknown unit',
        uomId: randomUUID(),
      }),
      400,
      'MASTERS_REFERENCE_NOT_FOUND',
    );
    expectError(
      await call('POST', '/materials', manager.token, {
        code: uniq('MAT'),
        name: 'Bad HSN',
        uomId: uom.id,
        hsn: '12345',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/materials', manager.token, {
        code: uniq('MAT'),
        name: 'Negative',
        uomId: uom.id,
        reorderLevel: -1,
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/materials', manager.token, {
        code: code.toLowerCase(),
        name: 'Second',
        uomId: uom.id,
      }),
      409,
      'MASTERS_DUPLICATE',
    );
  });

  it('materials: a PATCH checks the version and the new unit', async () => {
    const manager = await managerUser();
    const uom = await newUom();
    const material = await newMaterial(manager.token, uom.id);

    expectError(
      await call('PATCH', `/materials/${material.id}`, manager.token, {
        rowVersion: 1,
        uomId: randomUUID(),
      }),
      400,
      'MASTERS_REFERENCE_NOT_FOUND',
    );

    const updated = await call('PATCH', `/materials/${material.id}`, manager.token, {
      rowVersion: 1,
      reorderLevel: 12.5,
      status: 'inactive',
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      reorderLevel: 12.5,
      status: 'inactive',
      rowVersion: 2,
    });
  });

  // Equipment types (design point e).

  it('equipment types: the tolerance key is built from the code on create', async () => {
    const manager = await managerUser();
    const code = uniq('EQ');
    const type = await createRow(manager.token, '/equipment-types', {
      code,
      name: 'Fictional Excavator',
      meterKind: 'hours',
      meterPrecision: 1,
      fuelNormUnit: 'litre_per_hour',
    });
    expect(type).toMatchObject({
      code,
      active: true,
      meterKind: 'hours',
      toleranceSettingKey: `fuel.tolerance.${code.toLowerCase()}`,
      rowVersion: 1,
    });
  });

  it('equipment types: the code is fixed after create; a PATCH that sends it is refused', async () => {
    const manager = await managerUser();
    const type = await newEquipmentType(manager.token);

    expectError(
      await call('PATCH', `/equipment-types/${type.id}`, manager.token, {
        rowVersion: 1,
        code: uniq('NEW'),
      }),
      400,
      'VALIDATION_ERROR',
    );

    const renamed = await call('PATCH', `/equipment-types/${type.id}`, manager.token, {
      rowVersion: 1,
      name: 'Fictional Excavator Renamed',
      active: false,
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().data).toMatchObject({
      code: type.code,
      name: 'Fictional Excavator Renamed',
      active: false,
      toleranceSettingKey: type.toleranceSettingKey,
      rowVersion: 2,
    });

    const inactive = await call('GET', '/equipment-types?status=inactive', manager.token);
    expect(inactive.json().data.map((t: Row) => t.id)).toContain(type.id);
  });

  it('equipment types: a code that does not start with a letter is refused, and a case-insensitive duplicate too', async () => {
    const manager = await managerUser();
    const type = await newEquipmentType(manager.token);

    expectError(
      await call('POST', '/equipment-types', manager.token, { code: '1EXC', name: 'Bad code' }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/equipment-types', manager.token, {
        code: String(type.code).toLowerCase(),
        name: 'Duplicate',
      }),
      409,
      'MASTERS_DUPLICATE',
    );
  });

  // Major material allocations (design point f).

  it('allocations: create with a unit, read the unit code back, and delete', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const uom = await newUom();
    const material = await newMaterial(manager.token, uom.id);

    const allocation = await createRow(manager.token, '/major-material-allocations', {
      projectId: project.id,
      materialId: material.id,
      uomId: uom.id,
      quantity: 120.5,
      requiredBy: '2026-12-01',
    });
    expect(allocation).toMatchObject({
      projectId: project.id,
      quantity: 120.5,
      unit: uom.code,
      requiredBy: '2026-12-01',
      rowVersion: 1,
    });

    const deleted = await call(
      'DELETE',
      `/major-material-allocations/${allocation.id}`,
      manager.token,
    );
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data).toEqual({ deleted: true });

    const list = await call(
      'GET',
      `/major-material-allocations?projectId=${project.id}`,
      manager.token,
    );
    expect(list.json().data.map((a: Row) => a.id)).not.toContain(allocation.id);

    const audit = await auditRows('core_major_material_allocation', allocation.id);
    expect(audit.map((r) => r.op)).toEqual(['INSERT', 'DELETE']);
  });

  it('allocations: a zero quantity, an unknown project, and a changed project are refused', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const uom = await newUom();
    const material = await newMaterial(manager.token, uom.id);
    const base = { projectId: project.id, materialId: material.id, uomId: uom.id };

    expectError(
      await call('POST', '/major-material-allocations', manager.token, { ...base, quantity: 0 }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/major-material-allocations', manager.token, {
        ...base,
        projectId: randomUUID(),
        quantity: 5,
      }),
      400,
      'MASTERS_REFERENCE_NOT_FOUND',
    );

    const allocation = await createRow(manager.token, '/major-material-allocations', {
      ...base,
      quantity: 5,
    });
    expectError(
      await call('PATCH', `/major-material-allocations/${allocation.id}`, manager.token, {
        rowVersion: 1,
        projectId: randomUUID(),
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('PATCH', `/major-material-allocations/${allocation.id}`, manager.token, {
        rowVersion: 9,
        quantity: 6,
      }),
      409,
      'VERSION_CONFLICT',
    );
  });

  // Equipment assignments (design point g).

  it('assignments: create records the time and user; a second row for the same type and project is a duplicate', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const type = await newEquipmentType(manager.token);

    const assignment = await createRow(manager.token, '/equipment-assignments', {
      projectId: project.id,
      equipmentTypeId: type.id,
      qty: 3,
    });
    expect(assignment).toMatchObject({
      projectId: project.id,
      equipmentTypeId: type.id,
      qty: 3,
      assignedByUserId: manager.id,
      rowVersion: 1,
    });
    expect(assignment.assignedAt).toEqual(expect.any(String));

    expectError(
      await call('POST', '/equipment-assignments', manager.token, {
        projectId: project.id,
        equipmentTypeId: type.id,
        qty: 1,
      }),
      409,
      'MASTERS_DUPLICATE',
    );
  });

  it('assignments: a PATCH changes the quantity only; the project and type stay fixed', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const type = await newEquipmentType(manager.token);
    const assignment = await createRow(manager.token, '/equipment-assignments', {
      projectId: project.id,
      equipmentTypeId: type.id,
      qty: 2,
    });

    expectError(
      await call('PATCH', `/equipment-assignments/${assignment.id}`, manager.token, {
        rowVersion: 1,
        equipmentTypeId: randomUUID(),
        qty: 4,
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('PATCH', `/equipment-assignments/${assignment.id}`, manager.token, {
        rowVersion: 1,
        qty: 0,
      }),
      400,
      'VALIDATION_ERROR',
    );

    const updated = await call('PATCH', `/equipment-assignments/${assignment.id}`, manager.token, {
      rowVersion: 1,
      qty: 4,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      qty: 4,
      equipmentTypeId: type.id,
      projectId: project.id,
      rowVersion: 2,
    });

    const deleted = await call('DELETE', `/equipment-assignments/${assignment.id}`, manager.token);
    expect(deleted.json().data).toEqual({ deleted: true });
    const audit = await auditRows('core_equipment_assignment', assignment.id);
    expect(audit.map((r) => r.op)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  // Plan lines (design points h and i).

  it('plan lines: a store must sit on the same project as the line; a store on another project is refused', async () => {
    const manager = await managerUser();
    const projectA = await newProject(manager.token);
    const projectB = await newProject(manager.token);
    const storeOnB = await newStore(manager.token, projectB.id);
    const type = await newEquipmentType(manager.token);

    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: projectA.id,
        resourceKind: 'equipment',
        equipmentTypeId: type.id,
        storeId: storeOnB.id,
      }),
      400,
      'MASTERS_REFERENCE_MISMATCH',
    );

    const storeOnA = await newStore(manager.token, projectA.id);
    const line = await createRow(manager.token, '/plan-lines', {
      projectId: projectA.id,
      resourceKind: 'equipment',
      equipmentTypeId: type.id,
      storeId: storeOnA.id,
      quantity: 2,
      fromDate: '2026-04-01',
      toDate: '2026-06-30',
    });
    expect(line).toMatchObject({
      resourceKind: 'equipment',
      status: 'draft',
      withdrawn: false,
      fromDate: '2026-04-01',
      toDate: '2026-06-30',
      rowVersion: 1,
    });
  });

  it('plan lines: each kind needs its own references, and the end date cannot precede the start', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const type = await newEquipmentType(manager.token);

    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: project.id,
        resourceKind: 'equipment',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: project.id,
        resourceKind: 'people',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: project.id,
        resourceKind: 'material',
        materialId: randomUUID(),
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: project.id,
        resourceKind: 'equipment',
        equipmentTypeId: type.id,
        fromDate: '2026-06-30',
        toDate: '2026-04-01',
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await call('POST', '/plan-lines', manager.token, {
        projectId: project.id,
        resourceKind: 'equipment',
        equipmentTypeId: randomUUID(),
      }),
      400,
      'MASTERS_REFERENCE_NOT_FOUND',
    );
  });

  it('plan lines: a people line needs a real position', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const positionId = await newPosition();

    const line = await createRow(manager.token, '/plan-lines', {
      projectId: project.id,
      resourceKind: 'people',
      positionId,
      role: 'Site engineer',
      quantity: 2,
    });
    expect(line).toMatchObject({ resourceKind: 'people', positionId, role: 'Site engineer' });
  });

  it('plan lines: cancel with a PATCH to status cancelled; there is no delete route', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    const type = await newEquipmentType(manager.token);
    const line = await createRow(manager.token, '/plan-lines', {
      projectId: project.id,
      resourceKind: 'equipment',
      equipmentTypeId: type.id,
    });

    const cancelled = await call('PATCH', `/plan-lines/${line.id}`, manager.token, {
      rowVersion: 1,
      status: 'cancelled',
      withdrawn: true,
      reason: 'Fictional schedule change',
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data).toMatchObject({
      status: 'cancelled',
      withdrawn: true,
      rowVersion: 2,
    });

    expect((await call('DELETE', `/plan-lines/${line.id}`, manager.token)).statusCode).toBe(404);

    const list = await call(
      'GET',
      `/plan-lines?projectId=${project.id}&resourceKind=equipment`,
      manager.token,
    );
    expect(list.json().data.map((l: Row) => l.id)).toContain(line.id);
    const audit = await auditRows('core_plan_line', line.id);
    expect(audit.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
  });

  // Access (401 for no token, 403 without masters.manage).

  it('reads need a signed-in user; every write needs a token (401) and masters.manage (403)', async () => {
    const manager = await managerUser();
    const plain = await plainUser();
    const project = await newProject(manager.token);
    const uom = await newUom();
    const material = await newMaterial(manager.token, uom.id);
    const vendor = await newVendor(manager.token);
    const type = await newEquipmentType(manager.token);
    const allocation = await createRow(manager.token, '/major-material-allocations', {
      projectId: project.id,
      materialId: material.id,
      uomId: uom.id,
      quantity: 1,
    });
    const assignment = await createRow(manager.token, '/equipment-assignments', {
      projectId: project.id,
      equipmentTypeId: type.id,
      qty: 1,
    });
    const line = await createRow(manager.token, '/plan-lines', {
      projectId: project.id,
      resourceKind: 'equipment',
      equipmentTypeId: type.id,
    });

    expectError(await call('GET', '/vendors', null), 401, 'AUTH_REQUIRED');
    expect((await call('GET', '/vendors', plain.token)).statusCode).toBe(200);

    const writes: Array<[string, string, object]> = [
      ['POST', '/vendors', { code: uniq('VEN'), name: 'Denied' }],
      ['PATCH', `/vendors/${vendor.id}`, { rowVersion: 1, name: 'Denied' }],
      ['POST', `/vendors/${vendor.id}/verify`, { rowVersion: 1 }],
      ['POST', '/materials', { code: uniq('MAT'), name: 'Denied', uomId: uom.id }],
      ['PATCH', `/materials/${material.id}`, { rowVersion: 1, name: 'Denied' }],
      ['POST', '/equipment-types', { code: uniq('EQ'), name: 'Denied' }],
      ['PATCH', `/equipment-types/${type.id}`, { rowVersion: 1, name: 'Denied' }],
      [
        'POST',
        '/major-material-allocations',
        { projectId: project.id, materialId: material.id, uomId: uom.id, quantity: 1 },
      ],
      ['PATCH', `/major-material-allocations/${allocation.id}`, { rowVersion: 1, quantity: 2 }],
      ['DELETE', `/major-material-allocations/${allocation.id}`, {}],
      [
        'POST',
        '/equipment-assignments',
        { projectId: project.id, equipmentTypeId: type.id, qty: 1 },
      ],
      ['PATCH', `/equipment-assignments/${assignment.id}`, { rowVersion: 1, qty: 2 }],
      ['DELETE', `/equipment-assignments/${assignment.id}`, {}],
      [
        'POST',
        '/plan-lines',
        { projectId: project.id, resourceKind: 'equipment', equipmentTypeId: type.id },
      ],
      ['PATCH', `/plan-lines/${line.id}`, { rowVersion: 1, status: 'approved' }],
    ];

    for (const [method, url, payload] of writes) {
      const method2 = method as 'POST' | 'PATCH' | 'DELETE';
      expectError(await call(method2, url, null, payload), 401, 'AUTH_REQUIRED');
      expectError(await call(method2, url, plain.token, payload), 403, 'ACCESS_DENIED');
    }
  });

  it('a project manager without masters.manage is refused', async () => {
    const loginId = uniqueLogin('proj-only');
    await seedUser(loginId);
    await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege: PROJECTS_MANAGE });
    const token = await signIn(loginId);
    expectError(
      await call('POST', '/materials', token, {
        code: uniq('MAT'),
        name: 'Denied',
        uomId: randomUUID(),
      }),
      403,
      'ACCESS_DENIED',
    );
  });

  // Database rules: the CHECKs and unique keys hold even without the API.

  it('the database refuses an equipment plan line without an equipment type', async () => {
    const manager = await managerUser();
    const project = await newProject(manager.token);
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_plan_line (project_id, resource_kind) VALUES ($1, 'equipment')`,
        [project.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('the database refuses a malformed HSN and a malformed PAN', async () => {
    const uom = await newUom();
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_material (code, name, uom_id, hsn) VALUES ($1, 'Bad', $2, '12345')`,
        [uniq('MAT'), uom.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_vendor (code, name, status, pan) VALUES ($1, 'Bad', 'active', 'abcde1234f')`,
        [uniq('VEN')],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('the database refuses a vendor code that differs only in case', async () => {
    const code = uniq('VEN');
    await db.pool.query(`INSERT INTO tenant_acme.core_vendor (code, name) VALUES ($1, 'First')`, [
      code,
    ]);
    await expect(
      db.pool.query(`INSERT INTO tenant_acme.core_vendor (code, name) VALUES ($1, 'Second')`, [
        code.toLowerCase(),
      ]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'core_vendor_code_key' });
  });
});
