import type { PoolClient } from 'pg';
import { type AuditOp, appendAuditRow } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import {
  colourIssue,
  effectiveIssue,
  holidayDateIssue,
  isValidTimeZone,
  normaliseWeekOffDays,
  settingsKeyIssues,
  shiftTimingIssue,
} from './rules.js';
import {
  ancestorDepartments,
  ancestorPositions,
  type CompanyFields,
  type CompanyRecord,
  deleteRow,
  type DepartmentFields,
  type DepartmentRecord,
  type HolidayFields,
  type HolidayRecord,
  findCompany,
  findDepartment,
  findHoliday,
  findPosition,
  findSeries,
  findShift,
  insertCompany,
  insertDepartment,
  insertHoliday,
  insertPosition,
  insertSeries,
  insertShift,
  isHeadOfDepartment,
  listDepartments,
  listHolidays,
  listPositions,
  listSeries,
  listShifts,
  ORG_TABLE,
  type OrgTable,
  type PositionFields,
  type PositionRecord,
  type SeriesFields,
  type SeriesRecord,
  type ShiftFields,
  type ShiftRecord,
  snapshotOf,
  updateCompany,
  updateDepartment,
  updateHoliday,
  updatePosition,
  updateSeries,
  updateShift,
} from './repo.js';
import type {
  CompanyProfileInput,
  DepartmentInput,
  DepartmentPatch,
  HolidayInput,
  HolidayPatch,
  PositionInput,
  PositionPatch,
  SeriesInput,
  SeriesPatch,
  ShiftInput,
  ShiftPatch,
} from './schema.js';

const AUDIT_MODULE = 'core';

/** Who acts, and the request id that ties the audit rows of one request together. */
export interface Actor {
  actorId: string | null;
  correlationId: string | null;
}

interface Issue {
  path: string;
  message: string;
}

const DUPLICATE_MESSAGES: Record<string, string> = {
  core_company_profile_code_key: 'A company with this code already exists',
  core_company_profile_singleton_key: 'A company profile already exists',
  core_holiday_date_scope_key: 'A holiday already exists on this date for this scope',
  core_shift_code_key: 'A shift with this code already exists',
  core_number_series_code_scope_key: 'This number series already exists for this year scope',
  core_department_code_key: 'A department with this code already exists',
  core_position_code_key: 'A position with this code already exists',
};

function invalid(issues: Issue[]): AppError {
  return new AppError('VALIDATION_ERROR', 400, 'Request validation failed', { issues });
}

/** Throws a validation error for the first rule that failed, if any. */
function ruleCheck(path: string, message: string | null): void {
  if (message !== null) throw invalid([{ path, message }]);
}

function notFound(code: string, message: string): AppError {
  return new AppError(code, 404, message);
}

/** Optimistic lock. Every change to an existing row names the version it read (design point l). */
function checkVersion(currentVersion: number, supplied: number | undefined): void {
  if (supplied === undefined) {
    throw new AppError('VERSION_REQUIRED', 400, 'row_version is required to change this record');
  }
  if (supplied !== currentVersion) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
}

/** Applies the fields the caller sent. A missing field keeps its value; null clears a nullable one. */
function merge<T extends object>(base: T, changes: object): T {
  const sent = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  return { ...base, ...sent };
}

/** Turns Postgres errors into API errors. Anything unrecognised is rethrown as it was. */
function mapDatabaseError(err: unknown, onForeignKey: 'reference' | 'in_use'): unknown {
  if (err instanceof AppError) return err;
  const pgErr = err as { code?: unknown; constraint?: unknown };
  if (pgErr.code === '23505') {
    const constraint = typeof pgErr.constraint === 'string' ? pgErr.constraint : '';
    return new AppError(
      'ORGANISATION_DUPLICATE',
      409,
      DUPLICATE_MESSAGES[constraint] ?? 'That value already exists',
    );
  }
  if (pgErr.code === '23503') {
    return onForeignKey === 'in_use'
      ? new AppError('ORGANISATION_IN_USE', 409, 'This record is in use and cannot be deleted')
      : new AppError('ORGANISATION_REFERENCE_NOT_FOUND', 400, 'A referenced record does not exist');
  }
  if (pgErr.code === '23514') {
    return new AppError('VALIDATION_ERROR', 400, 'A value breaks a stored rule');
  }
  return err;
}

/** Runs one write, mapping database errors to API errors. The caller's transaction rolls back on throw. */
export async function guardWrite<T>(
  work: () => Promise<T>,
  onForeignKey: 'reference' | 'in_use' = 'reference',
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw mapDatabaseError(err, onForeignKey);
  }
}

/** Appends the audit row for one change, in the same transaction as the change (design point m). */
export async function auditChange(
  client: PoolClient,
  actor: Actor,
  table: OrgTable,
  recordId: string,
  op: AuditOp,
  oldRow: Record<string, unknown> | null,
  newRow: Record<string, unknown> | null,
): Promise<void> {
  await appendAuditRow(client, {
    tableName: table,
    recordId,
    op,
    oldRow,
    newRow,
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
}

/** Lets the owning modules check the company profile exists before they write against it. */
export async function requireCompany(client: PoolClient): Promise<CompanyRecord> {
  const company = await findCompany(client);
  if (!company) {
    throw new AppError(
      'COMPANY_PROFILE_MISSING',
      409,
      'Set up the company profile before adding this record',
    );
  }
  return company;
}

// Company profile.

export async function getCompany(client: PoolClient): Promise<CompanyRecord> {
  const company = await findCompany(client);
  if (!company) {
    throw notFound('COMPANY_PROFILE_NOT_FOUND', 'The company profile has not been set up yet');
  }
  return company;
}

/** Creates the profile when none exists, otherwise replaces it. rowVersion is needed once it exists. */
export async function putCompany(
  client: PoolClient,
  actor: Actor,
  body: CompanyProfileInput,
): Promise<{ profile: CompanyRecord; created: boolean }> {
  const { rowVersion, ...fields } = body;
  const keyIssues = settingsKeyIssues(Object.keys(fields.settings ?? {}));
  if (keyIssues.length > 0) {
    throw invalid(keyIssues.map((message) => ({ path: 'settings', message })));
  }
  const current = await findCompany(client, true);
  if (!current) {
    const id = await guardWrite(() =>
      insertCompany(client, fields as CompanyFields, actor.actorId),
    );
    await auditChange(
      client,
      actor,
      ORG_TABLE.company,
      id,
      'INSERT',
      null,
      await snapshotOf(client, ORG_TABLE.company, id),
    );
    return { profile: await getCompany(client), created: true };
  }
  checkVersion(current.rowVersion, rowVersion);
  const before = await snapshotOf(client, ORG_TABLE.company, current.id);
  const updated = await guardWrite(() =>
    updateCompany(client, current.id, current.rowVersion, fields as CompanyFields, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.company,
    current.id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.company, current.id),
  );
  return { profile: await getCompany(client), created: false };
}

// Holidays (design point e).

export function listHolidayRecords(client: PoolClient): Promise<HolidayRecord[]> {
  return listHolidays(client);
}

export async function createHoliday(
  client: PoolClient,
  actor: Actor,
  input: HolidayInput,
): Promise<HolidayRecord> {
  const company = await requireCompany(client);
  ruleCheck('endDate', holidayDateIssue(input.holidayDate, input.endDate ?? null));
  const fields: HolidayFields = {
    companyProfileId: company.id,
    holidayDate: input.holidayDate,
    endDate: input.endDate ?? null,
    name: input.name,
    holidayType: input.holidayType ?? null,
    isOptional: input.isOptional ?? false,
    scopeProjectId: input.scopeProjectId ?? null,
  };
  const id = await guardWrite(() => insertHoliday(client, fields, actor.actorId));
  await auditChange(
    client,
    actor,
    ORG_TABLE.holiday,
    id,
    'INSERT',
    null,
    await snapshotOf(client, ORG_TABLE.holiday, id),
  );
  return notFoundIfMissing(findHoliday(client, id), 'HOLIDAY_NOT_FOUND', 'Holiday not found');
}

export async function updateHolidayRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: HolidayPatch,
): Promise<HolidayRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findHoliday(client, id, true),
    'HOLIDAY_NOT_FOUND',
    'Holiday not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<HolidayFields>(current, changes);
  ruleCheck('endDate', holidayDateIssue(merged.holidayDate, merged.endDate));
  const before = await snapshotOf(client, ORG_TABLE.holiday, id);
  const updated = await guardWrite(() =>
    updateHoliday(client, id, current.rowVersion, merged, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.holiday,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.holiday, id),
  );
  return notFoundIfMissing(findHoliday(client, id), 'HOLIDAY_NOT_FOUND', 'Holiday not found');
}

export async function deleteHoliday(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(findHoliday(client, id, true), 'HOLIDAY_NOT_FOUND', 'Holiday not found');
  const before = await snapshotOf(client, ORG_TABLE.holiday, id);
  await guardWrite(() => deleteRow(client, ORG_TABLE.holiday, id), 'in_use');
  await auditChange(client, actor, ORG_TABLE.holiday, id, 'DELETE', before, null);
}

// Shifts (design point f).

export function listShiftRecords(client: PoolClient): Promise<ShiftRecord[]> {
  return listShifts(client);
}

function shiftChecks(f: {
  timezone: string;
  inTime: string;
  outTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}): void {
  if (!isValidTimeZone(f.timezone)) {
    throw invalid([{ path: 'timezone', message: 'timezone must be an IANA time zone name' }]);
  }
  ruleCheck('outTime', shiftTimingIssue(f.inTime, f.outTime));
  ruleCheck('effectiveTo', effectiveIssue(f.effectiveFrom, f.effectiveTo));
}

export async function createShift(
  client: PoolClient,
  actor: Actor,
  input: ShiftInput,
): Promise<ShiftRecord> {
  const company = await requireCompany(client);
  shiftChecks({ ...input, effectiveTo: input.effectiveTo ?? null });
  const fields: ShiftFields = {
    companyProfileId: company.id,
    code: input.code,
    name: input.name,
    timezone: input.timezone,
    inTime: input.inTime,
    outTime: input.outTime,
    isActive: input.isActive ?? true,
    weekOffDays: normaliseWeekOffDays(input.weekOffDays ?? []),
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
  };
  const id = await guardWrite(() => insertShift(client, fields, actor.actorId));
  await auditChange(
    client,
    actor,
    ORG_TABLE.shift,
    id,
    'INSERT',
    null,
    await snapshotOf(client, ORG_TABLE.shift, id),
  );
  return notFoundIfMissing(findShift(client, id), 'SHIFT_NOT_FOUND', 'Shift not found');
}

export async function updateShiftRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: ShiftPatch,
): Promise<ShiftRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findShift(client, id, true),
    'SHIFT_NOT_FOUND',
    'Shift not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<ShiftFields>(current, changes);
  shiftChecks(merged);
  const fields: ShiftFields = { ...merged, weekOffDays: normaliseWeekOffDays(merged.weekOffDays) };
  const before = await snapshotOf(client, ORG_TABLE.shift, id);
  const updated = await guardWrite(() =>
    updateShift(client, id, current.rowVersion, fields, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.shift,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.shift, id),
  );
  return notFoundIfMissing(findShift(client, id), 'SHIFT_NOT_FOUND', 'Shift not found');
}

// Number series (design point g). Allocation lives in numbering.ts.

export function listSeriesRecords(client: PoolClient): Promise<SeriesRecord[]> {
  return listSeries(client);
}

export async function createSeries(
  client: PoolClient,
  actor: Actor,
  input: SeriesInput,
): Promise<SeriesRecord> {
  const fields: SeriesFields = {
    seriesCode: input.seriesCode,
    prefix: input.prefix,
    yearScope: input.yearScope ?? 0,
    nextValue: input.nextValue ?? 1,
  };
  const id = await guardWrite(() => insertSeries(client, fields, actor.actorId));
  await auditChange(
    client,
    actor,
    ORG_TABLE.series,
    id,
    'INSERT',
    null,
    await snapshotOf(client, ORG_TABLE.series, id),
  );
  return notFoundIfMissing(
    findSeries(client, id),
    'NUMBER_SERIES_NOT_FOUND',
    'Number series not found',
  );
}

export async function updateSeriesRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: SeriesPatch,
): Promise<SeriesRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findSeries(client, id, true),
    'NUMBER_SERIES_NOT_FOUND',
    'Number series not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  if (changes.nextValue !== undefined && changes.nextValue < current.nextValue) {
    throw invalid([
      { path: 'nextValue', message: 'next_value can only be raised, so no number is reused' },
    ]);
  }
  const merged = merge<SeriesFields>(current, changes);
  const before = await snapshotOf(client, ORG_TABLE.series, id);
  const updated = await guardWrite(() =>
    updateSeries(client, id, current.rowVersion, merged, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.series,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.series, id),
  );
  return notFoundIfMissing(
    findSeries(client, id),
    'NUMBER_SERIES_NOT_FOUND',
    'Number series not found',
  );
}

// Departments (design point h).

export function listDepartmentRecords(client: PoolClient): Promise<DepartmentRecord[]> {
  return listDepartments(client);
}

export async function createDepartment(
  client: PoolClient,
  actor: Actor,
  input: DepartmentInput,
): Promise<DepartmentRecord> {
  ruleCheck('colorHex', colourIssue(input.colorIndex ?? null, input.colorHex ?? null));
  // The department is new, so none of its positions exist yet and no head can belong to it.
  if (input.headPositionId) {
    throw new AppError(
      'ORGANISATION_HEAD_NOT_IN_DEPARTMENT',
      400,
      'The head must be a position in this department. Create the department first, then set its head',
    );
  }
  const fields: DepartmentFields = {
    code: input.code,
    name: input.name,
    status: input.status ?? 'active',
    parentDepartmentId: input.parentDepartmentId ?? null,
    headPositionId: null,
    description: input.description ?? null,
    colorIndex: input.colorIndex ?? null,
    colorHex: input.colorHex ?? null,
  };
  const id = await guardWrite(() => insertDepartment(client, fields, actor.actorId));
  await auditChange(
    client,
    actor,
    ORG_TABLE.department,
    id,
    'INSERT',
    null,
    await snapshotOf(client, ORG_TABLE.department, id),
  );
  return notFoundIfMissing(
    findDepartment(client, id),
    'DEPARTMENT_NOT_FOUND',
    'Department not found',
  );
}

export async function updateDepartmentRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: DepartmentPatch,
): Promise<DepartmentRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findDepartment(client, id, true),
    'DEPARTMENT_NOT_FOUND',
    'Department not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<DepartmentFields>(current, changes);
  ruleCheck('colorHex', colourIssue(merged.colorIndex, merged.colorHex));
  if (merged.parentDepartmentId !== null) {
    const chain = await ancestorDepartments(client, merged.parentDepartmentId);
    if (chain.includes(id)) {
      throw new AppError(
        'ORGANISATION_CYCLE',
        400,
        'A department cannot be placed under its own sub-departments',
      );
    }
  }
  if (merged.headPositionId !== null) {
    const head = await findPosition(client, merged.headPositionId);
    if (!head || head.departmentId !== id) {
      throw new AppError(
        'ORGANISATION_HEAD_NOT_IN_DEPARTMENT',
        400,
        'The head must be a position in this department',
      );
    }
  }
  const before = await snapshotOf(client, ORG_TABLE.department, id);
  const updated = await guardWrite(() =>
    updateDepartment(client, id, current.rowVersion, merged, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.department,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.department, id),
  );
  return notFoundIfMissing(
    findDepartment(client, id),
    'DEPARTMENT_NOT_FOUND',
    'Department not found',
  );
}

export async function deleteDepartment(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await notFoundIfMissing(
    findDepartment(client, id, true),
    'DEPARTMENT_NOT_FOUND',
    'Department not found',
  );
  const before = await snapshotOf(client, ORG_TABLE.department, id);
  await guardWrite(() => deleteRow(client, ORG_TABLE.department, id), 'in_use');
  await auditChange(client, actor, ORG_TABLE.department, id, 'DELETE', before, null);
}

// Positions (design point i).

export function listPositionRecords(client: PoolClient): Promise<PositionRecord[]> {
  return listPositions(client);
}

export async function createPosition(
  client: PoolClient,
  actor: Actor,
  input: PositionInput,
): Promise<PositionRecord> {
  const fields: PositionFields = {
    code: input.code,
    title: input.title,
    departmentId: input.departmentId,
    grade: input.grade ?? null,
    reportsToPositionId: input.reportsToPositionId ?? null,
    plannedPositions: input.plannedPositions ?? 1,
    description: input.description ?? null,
    status: input.status ?? 'active',
  };
  const id = await guardWrite(() => insertPosition(client, fields, actor.actorId));
  await auditChange(
    client,
    actor,
    ORG_TABLE.position,
    id,
    'INSERT',
    null,
    await snapshotOf(client, ORG_TABLE.position, id),
  );
  return notFoundIfMissing(findPosition(client, id), 'POSITION_NOT_FOUND', 'Position not found');
}

export async function updatePositionRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: PositionPatch,
): Promise<PositionRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findPosition(client, id, true),
    'POSITION_NOT_FOUND',
    'Position not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<PositionFields>(current, changes);
  if (merged.reportsToPositionId !== null) {
    const chain = await ancestorPositions(client, merged.reportsToPositionId);
    if (chain.includes(id)) {
      throw new AppError(
        'ORGANISATION_CYCLE',
        400,
        'A position cannot report to one of its own reports',
      );
    }
  }
  if (merged.departmentId !== current.departmentId && (await isHeadOfDepartment(client, id))) {
    throw new AppError(
      'ORGANISATION_IN_USE',
      409,
      'This position heads a department. Change that department’s head first',
    );
  }
  const before = await snapshotOf(client, ORG_TABLE.position, id);
  const updated = await guardWrite(() =>
    updatePosition(client, id, current.rowVersion, merged, actor.actorId),
  );
  if (!updated) {
    throw new AppError(
      'VERSION_CONFLICT',
      409,
      'The record changed since you read it. Reload it and try again',
    );
  }
  await auditChange(
    client,
    actor,
    ORG_TABLE.position,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.position, id),
  );
  return notFoundIfMissing(findPosition(client, id), 'POSITION_NOT_FOUND', 'Position not found');
}

export async function deletePosition(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(
    findPosition(client, id, true),
    'POSITION_NOT_FOUND',
    'Position not found',
  );
  const before = await snapshotOf(client, ORG_TABLE.position, id);
  await guardWrite(() => deleteRow(client, ORG_TABLE.position, id), 'in_use');
  await auditChange(client, actor, ORG_TABLE.position, id, 'DELETE', before, null);
}

async function notFoundIfMissing<T>(
  found: Promise<T | null>,
  code: string,
  message: string,
): Promise<T> {
  const value = await found;
  if (value === null) throw notFound(code, message);
  return value;
}
