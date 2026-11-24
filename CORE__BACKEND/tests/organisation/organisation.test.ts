import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { withTenant } from '../../src/db/tenant.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { allocateNumber } from '../../src/modules/organisation/numbering.js';
import { ORGANISATION_MANAGE } from '../../src/modules/organisation/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5a. The tests share one database and run in order, so the first test
// checks the state before the company profile exists.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'organisation-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;
const NO_ACTOR = { actorId: null, correlationId: null };

// Fictional company. The tax IDs are format-valid and are not checked against any register.
const COMPANY = {
  code: 'DEMO-CO',
  legalName: 'Demo Works Private Limited',
  status: 'active',
  tradeName: 'Demo Works',
  cin: 'L12345KA2000PLC123456',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  tan: 'ABCD12345E',
  addressLine1: '12 Example Road',
  addressLine2: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  pin: '560001',
  country: 'India',
  contactName: 'Demo Contact',
  contactEmail: 'contact@example.com',
  contactPhone: null,
  website: null,
  logoFileId: null,
  settings: null,
};

/** A code that no other test uses. */
function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface AuditRow {
  op: string;
  actor_id: string | null;
  module_name: string | null;
  new_row: Record<string, unknown> | null;
}

describe.skipIf(!TEST_DATABASE_URL)('organisation (phase 5a)', { timeout: SLOW_TEST_MS }, () => {
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
       VALUES ($1, 'Org User', 'active', $2, 0)
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

  /** A user who holds organisation.manage, granted with the bootstrap function that the CLI uses. */
  async function managerUser(): Promise<{ id: string; token: string }> {
    const loginId = uniqueLogin('org-manager');
    const id = await seedUser(loginId);
    await grantPrivilegeByLogin(db.pool, {
      tenantId: TENANT,
      loginId,
      privilege: ORGANISATION_MANAGE,
    });
    return { id, token: await signIn(loginId) };
  }

  async function plainUser(): Promise<{ id: string; token: string }> {
    const loginId = uniqueLogin('org-user');
    const id = await seedUser(loginId);
    return { id, token: await signIn(loginId) };
  }

  function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

  /** Creates the company profile when it does not exist yet, and returns it. */
  async function ensureCompany(token: string): Promise<{ id: string; rowVersion: number }> {
    const got = await call('GET', '/organisation/company-profile', token);
    if (got.statusCode === 200) return got.json().data;
    const put = await call('PUT', '/organisation/company-profile', token, COMPANY);
    expect(put.statusCode).toBe(201);
    return put.json().data;
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

  it('answers 404 for the profile, and 409 for a holiday, before the profile is set up', async () => {
    const manager = await managerUser();
    const profile = await call('GET', '/organisation/company-profile', manager.token);
    expect(profile.statusCode).toBe(404);
    expect(profile.json().error.code).toBe('COMPANY_PROFILE_NOT_FOUND');

    const holiday = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-01-26',
      name: 'Republic Day',
    });
    expect(holiday.statusCode).toBe(409);
    expect(holiday.json().error.code).toBe('COMPANY_PROFILE_MISSING');
  });

  it('creates the profile once, changes it only with the current version, and audits both', async () => {
    const manager = await managerUser();

    const created = await call('PUT', '/organisation/company-profile', manager.token, COMPANY);
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({ code: 'DEMO-CO', rowVersion: 1 });
    const id = created.json().data.id as string;

    const noVersion = await call('PUT', '/organisation/company-profile', manager.token, {
      ...COMPANY,
      legalName: 'Changed Name Private Limited',
    });
    expect(noVersion.statusCode).toBe(400);
    expect(noVersion.json().error.code).toBe('VERSION_REQUIRED');

    const stale = await call('PUT', '/organisation/company-profile', manager.token, {
      ...COMPANY,
      rowVersion: 99,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');

    const updated = await call('PUT', '/organisation/company-profile', manager.token, {
      ...COMPANY,
      legalName: 'Demo Works Renamed Private Limited',
      rowVersion: 1,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ rowVersion: 2 });

    const rows = await auditRows('core_company_profile', id);
    expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
    expect(rows.every((r) => r.actor_id === manager.id && r.module_name === 'core')).toBe(true);
    // gstin and pan are redacted from audit snapshots (design point m).
    expect(JSON.stringify(rows)).not.toContain('29ABCDE1234F1Z5');
  });

  it('accepts only the approved fuel settings keys', async () => {
    const manager = await managerUser();
    const current = await ensureCompany(manager.token);

    const refused = await call('PUT', '/organisation/company-profile', manager.token, {
      ...COMPANY,
      settings: { 'fuel.bogus': 1 },
      rowVersion: current.rowVersion,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.code).toBe('VALIDATION_ERROR');

    const accepted = await call('PUT', '/organisation/company-profile', manager.token, {
      ...COMPANY,
      settings: { 'fuel.tolerance.excavator': 5 },
      rowVersion: current.rowVersion,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data.settings).toEqual({ 'fuel.tolerance.excavator': 5 });
  });

  it('holidays: date range, duplicates, versioned edits, delete, and audit', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);

    const created = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-08-15',
      name: 'Independence Day',
      holidayType: 'national',
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const duplicate = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-08-15',
      name: 'Again',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('ORGANISATION_DUPLICATE');

    const reversed = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-10-10',
      endDate: '2026-10-01',
      name: 'Reversed range',
    });
    expect(reversed.statusCode).toBe(400);

    const badType = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-10-11',
      name: 'Festival',
      holidayType: 'festival',
    });
    expect(badType.statusCode).toBe(400);

    const patched = await call('PATCH', `/organisation/holidays/${id}`, manager.token, {
      name: 'Independence Day (observed)',
      rowVersion: 1,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data).toMatchObject({
      name: 'Independence Day (observed)',
      rowVersion: 2,
    });

    const stale = await call('PATCH', `/organisation/holidays/${id}`, manager.token, {
      name: 'Stale',
      rowVersion: 1,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');

    const deleted = await call('DELETE', `/organisation/holidays/${id}`, manager.token);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data).toEqual({ deleted: true });

    const rows = await auditRows('core_holiday', id);
    expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  it('shifts: timing, time zone, week-off days, effective dates; deactivate instead of delete', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);
    const shift = {
      code: uniq('SH'),
      name: 'Night',
      timezone: 'Asia/Kolkata',
      inTime: '22:00',
      outTime: '06:00',
      weekOffDays: [7, 6, 7],
      effectiveFrom: '2026-01-01',
    };

    const created = await call('POST', '/organisation/shifts', manager.token, shift);
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      inTime: '22:00',
      outTime: '06:00',
      weekOffDays: [6, 7],
    });
    const id = created.json().data.id as string;

    const equalTimes = await call('POST', '/organisation/shifts', manager.token, {
      ...shift,
      code: uniq('SH'),
      outTime: '22:00',
    });
    expect(equalTimes.statusCode).toBe(400);

    const badZone = await call('POST', '/organisation/shifts', manager.token, {
      ...shift,
      code: uniq('SH'),
      timezone: 'Mars/Olympus',
    });
    expect(badZone.statusCode).toBe(400);

    const badEffective = await call('POST', '/organisation/shifts', manager.token, {
      ...shift,
      code: uniq('SH'),
      effectiveTo: '2025-12-31',
    });
    expect(badEffective.statusCode).toBe(400);

    const badDay = await call('POST', '/organisation/shifts', manager.token, {
      ...shift,
      code: uniq('SH'),
      weekOffDays: [8],
    });
    expect(badDay.statusCode).toBe(400);

    const deactivated = await call('PATCH', `/organisation/shifts/${id}`, manager.token, {
      isActive: false,
      rowVersion: 1,
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().data).toMatchObject({ isActive: false, rowVersion: 2 });

    const noDelete = await call('DELETE', `/organisation/shifts/${id}`, manager.token);
    expect(noDelete.statusCode).toBe(404);
  });

  it('number series: the code is unique per year scope, and the counter only rises', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);
    const seriesCode = uniq('NS');

    const created = await call('POST', '/organisation/number-series', manager.token, {
      seriesCode,
      prefix: 'NS',
      yearScope: 0,
      nextValue: 5,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const duplicate = await call('POST', '/organisation/number-series', manager.token, {
      seriesCode,
      prefix: 'NS',
      yearScope: 0,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('ORGANISATION_DUPLICATE');

    const lowered = await call('PATCH', `/organisation/number-series/${id}`, manager.token, {
      nextValue: 3,
      rowVersion: 1,
    });
    expect(lowered.statusCode).toBe(400);

    const raised = await call('PATCH', `/organisation/number-series/${id}`, manager.token, {
      nextValue: 10,
      rowVersion: 1,
    });
    expect(raised.statusCode).toBe(200);
    expect(raised.json().data).toMatchObject({ nextValue: 10, rowVersion: 2 });
  });

  it('allocates numbers in order, leaves no gap after a rollback, and opens a year from the latest', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);

    const plain = uniq('INV');
    await call('POST', '/organisation/number-series', manager.token, {
      seriesCode: plain,
      prefix: 'INV',
      yearScope: 0,
      nextValue: 1,
    });
    const next = () =>
      withTenant(db.pool, TENANT, (client) => allocateNumber(client, plain, 2026, NO_ACTOR));
    expect(await next()).toBe('INV-00001');
    expect(await next()).toBe('INV-00002');

    // The number taken inside a rolled-back transaction goes back to the series.
    await expect(
      withTenant(db.pool, TENANT, async (client) => {
        await allocateNumber(client, plain, 2026, NO_ACTOR);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await next()).toBe('INV-00003');

    const yearly = uniq('PO');
    await call('POST', '/organisation/number-series', manager.token, {
      seriesCode: yearly,
      prefix: 'PO',
      yearScope: 2025,
      nextValue: 1,
    });
    const allocate = (year: number) =>
      withTenant(db.pool, TENANT, (client) => allocateNumber(client, yearly, year, NO_ACTOR));
    expect(await allocate(2025)).toBe('PO-2025-00001');
    // No 2026 row exists, so one opens from the 2025 row's prefix.
    expect(await allocate(2026)).toBe('PO-2026-00001');
    expect(await allocate(2026)).toBe('PO-2026-00002');
    expect(await allocate(2025)).toBe('PO-2025-00002');

    await expect(
      withTenant(db.pool, TENANT, (client) => allocateNumber(client, uniq('NONE'), 2026, NO_ACTOR)),
    ).rejects.toMatchObject({ code: 'NUMBER_SERIES_MISSING' });

    await expect(
      withTenant(db.pool, TENANT, (client) => allocateNumber(client, plain, 1800, NO_ACTOR)),
    ).rejects.toThrow(RangeError);
  });

  it('departments: codes, colours, parent cycles, heads and in-use delete', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);
    const code = uniq('OPS');

    const parent = await call('POST', '/organisation/departments', manager.token, {
      code,
      name: 'Operations',
      colorIndex: 3,
      colorHex: '#3366CC',
    });
    expect(parent.statusCode).toBe(201);
    const parentId = parent.json().data.id as string;

    const oneHalfColour = await call('POST', '/organisation/departments', manager.token, {
      code: uniq('COL'),
      name: 'Half colour',
      colorIndex: 3,
    });
    expect(oneHalfColour.statusCode).toBe(400);

    const withHead = await call('POST', '/organisation/departments', manager.token, {
      code: uniq('HD'),
      name: 'Head at creation',
      headPositionId: randomUUID(),
    });
    expect(withHead.statusCode).toBe(400);
    expect(withHead.json().error.code).toBe('ORGANISATION_HEAD_NOT_IN_DEPARTMENT');

    const sameCodeOtherCase = await call('POST', '/organisation/departments', manager.token, {
      code: code.toLowerCase(),
      name: 'Same code',
    });
    expect(sameCodeOtherCase.statusCode).toBe(409);
    expect(sameCodeOtherCase.json().error.code).toBe('ORGANISATION_DUPLICATE');

    const child = await call('POST', '/organisation/departments', manager.token, {
      code: uniq('SUB'),
      name: 'Sub-department',
      parentDepartmentId: parentId,
    });
    expect(child.statusCode).toBe(201);
    const childId = child.json().data.id as string;

    const cycle = await call('PATCH', `/organisation/departments/${parentId}`, manager.token, {
      parentDepartmentId: childId,
      rowVersion: 1,
    });
    expect(cycle.statusCode).toBe(400);
    expect(cycle.json().error.code).toBe('ORGANISATION_CYCLE');

    const inUse = await call('DELETE', `/organisation/departments/${parentId}`, manager.token);
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json().error.code).toBe('ORGANISATION_IN_USE');

    const deletedChild = await call(
      'DELETE',
      `/organisation/departments/${childId}`,
      manager.token,
    );
    expect(deletedChild.statusCode).toBe(200);
    const deletedParent = await call(
      'DELETE',
      `/organisation/departments/${parentId}`,
      manager.token,
    );
    expect(deletedParent.statusCode).toBe(200);
  });

  it('positions: reporting cycles, department heads and in-use delete', async () => {
    const manager = await managerUser();
    await ensureCompany(manager.token);

    const dept = await call('POST', '/organisation/departments', manager.token, {
      code: uniq('D'),
      name: 'Site works',
    });
    const otherDept = await call('POST', '/organisation/departments', manager.token, {
      code: uniq('D'),
      name: 'Stores',
    });
    const deptId = dept.json().data.id as string;
    const otherId = otherDept.json().data.id as string;

    const supervisor = await call('POST', '/organisation/positions', manager.token, {
      code: uniq('SUP'),
      title: 'Supervisor',
      departmentId: deptId,
    });
    const manage = await call('POST', '/organisation/positions', manager.token, {
      code: uniq('MGR'),
      title: 'Manager',
      departmentId: deptId,
    });
    expect(supervisor.statusCode).toBe(201);
    expect(supervisor.json().data).toMatchObject({ plannedPositions: 1 });
    const supervisorId = supervisor.json().data.id as string;
    const managerId = manage.json().data.id as string;

    const reports = await call('PATCH', `/organisation/positions/${supervisorId}`, manager.token, {
      reportsToPositionId: managerId,
      rowVersion: 1,
    });
    expect(reports.statusCode).toBe(200);

    const cycle = await call('PATCH', `/organisation/positions/${managerId}`, manager.token, {
      reportsToPositionId: supervisorId,
      rowVersion: 1,
    });
    expect(cycle.statusCode).toBe(400);
    expect(cycle.json().error.code).toBe('ORGANISATION_CYCLE');

    const headElsewhere = await call(
      'PATCH',
      `/organisation/departments/${otherId}`,
      manager.token,
      {
        headPositionId: supervisorId,
        rowVersion: 1,
      },
    );
    expect(headElsewhere.statusCode).toBe(400);
    expect(headElsewhere.json().error.code).toBe('ORGANISATION_HEAD_NOT_IN_DEPARTMENT');

    const head = await call('PATCH', `/organisation/departments/${deptId}`, manager.token, {
      headPositionId: supervisorId,
      rowVersion: 1,
    });
    expect(head.statusCode).toBe(200);

    // The supervisor is at version 2 after the reporting-line change above.
    const movingHead = await call(
      'PATCH',
      `/organisation/positions/${supervisorId}`,
      manager.token,
      {
        departmentId: otherId,
        rowVersion: 2,
      },
    );
    expect(movingHead.statusCode).toBe(409);
    expect(movingHead.json().error.code).toBe('ORGANISATION_IN_USE');

    const headInUse = await call(
      'DELETE',
      `/organisation/positions/${supervisorId}`,
      manager.token,
    );
    expect(headInUse.statusCode).toBe(409);
    expect(headInUse.json().error.code).toBe('ORGANISATION_IN_USE');

    const managerInUse = await call(
      'DELETE',
      `/organisation/positions/${managerId}`,
      manager.token,
    );
    expect(managerInUse.statusCode).toBe(409);
  });

  it('the migration keys and CHECKs hold when rows are written directly (0009)', async () => {
    const manager = await managerUser();
    const company = await ensureCompany(manager.token);
    const holiday = await call('POST', '/organisation/holidays', manager.token, {
      holidayDate: '2026-11-01',
      name: 'Direct check',
    });
    const holidayId = holiday.json().data.id as string;

    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_holiday (company_profile_id, holiday_date, end_date, name)
         VALUES ($1, '2026-12-10', '2026-12-09', 'Reversed')`,
        [company.id],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'core_holiday_dates_check' });

    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_shift (company_profile_id, code, name, timezone, in_time, out_time, effective_from)
         VALUES ($1, $2, 'Same times', 'UTC', '09:00', '09:00', '2026-01-01')`,
        [company.id, uniq('DIRECT')],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'core_shift_timing_check' });

    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_department (code, name, color_index)
         VALUES ($1, 'Colour without hex', 2)`,
        [uniq('CP')],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'core_department_color_pair_check' });

    const deptCode = uniq('CASE');
    await db.pool.query(
      `INSERT INTO tenant_acme.core_department (code, name) VALUES ($1, 'First')`,
      [deptCode],
    );
    await expect(
      db.pool.query(`INSERT INTO tenant_acme.core_department (code, name) VALUES ($1, 'Second')`, [
        deptCode.toLowerCase(),
      ]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'core_department_code_key' });

    // A second holiday on the same date with no scope is the same row as the first (NULLS NOT DISTINCT).
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_holiday (company_profile_id, holiday_date, name)
         SELECT company_profile_id, holiday_date, 'Duplicate' FROM tenant_acme.core_holiday WHERE id = $1`,
        [holidayId],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'core_holiday_date_scope_key' });
  });

  it('answers 401 without a token and 403 without organisation.manage on every write; reads need only a sign-in', async () => {
    const plain = await plainUser();
    const target = randomUUID();
    const writes: Array<{ method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string }> = [
      { method: 'PUT', url: '/organisation/company-profile' },
      { method: 'POST', url: '/organisation/holidays' },
      { method: 'PATCH', url: `/organisation/holidays/${target}` },
      { method: 'DELETE', url: `/organisation/holidays/${target}` },
      { method: 'POST', url: '/organisation/shifts' },
      { method: 'PATCH', url: `/organisation/shifts/${target}` },
      { method: 'POST', url: '/organisation/number-series' },
      { method: 'PATCH', url: `/organisation/number-series/${target}` },
      { method: 'POST', url: '/organisation/departments' },
      { method: 'PATCH', url: `/organisation/departments/${target}` },
      { method: 'DELETE', url: `/organisation/departments/${target}` },
      { method: 'POST', url: '/organisation/positions' },
      { method: 'PATCH', url: `/organisation/positions/${target}` },
      { method: 'DELETE', url: `/organisation/positions/${target}` },
    ];
    for (const route of writes) {
      const anonymous = await call(route.method, route.url, null, {});
      expect(anonymous.statusCode, route.url).toBe(401);
      const denied = await call(route.method, route.url, plain.token, {});
      expect(denied.statusCode, route.url).toBe(403);
      expect(denied.json().error.code).toBe('ACCESS_DENIED');
    }

    for (const url of [
      '/organisation/holidays',
      '/organisation/shifts',
      '/organisation/number-series',
      '/organisation/departments',
      '/organisation/positions',
    ]) {
      const res = await call('GET', url, plain.token);
      expect(res.statusCode, url).toBe(200);
      // Earlier tests share this database, so the lists are not empty; only the shape is checked.
      expect(Array.isArray(res.json().data), url).toBe(true);
    }
    const anonymousRead = await call('GET', '/organisation/holidays', null);
    expect(anonymousRead.statusCode).toBe(401);
  });
});
