import type { PoolClient, QueryResultRow } from 'pg';

/**
 * Organisation tables. Only these names are ever interpolated into SQL; they are constants, never input.
 */
export const ORG_TABLE = {
  company: 'core_company_profile',
  holiday: 'core_holiday',
  shift: 'core_shift',
  series: 'core_number_series',
  department: 'core_department',
  position: 'core_position',
} as const;
export type OrgTable = (typeof ORG_TABLE)[keyof typeof ORG_TABLE];

/** Storage shapes. Dates and times are read with to_char, so they come back as plain text. */
export interface CompanyFields {
  code: string;
  legalName: string;
  status: string;
  tradeName: string | null;
  companyType: 'proprietorship' | 'partnership' | 'pvt_ltd' | null;
  cin: string | null;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  logoFileId: string | null;
  settings: Record<string, number> | null;
}

export interface HolidayFields {
  companyProfileId: string;
  holidayDate: string;
  endDate: string | null;
  name: string;
  holidayType: string | null;
  isOptional: boolean;
  scopeProjectId: string | null;
}

export interface ShiftFields {
  companyProfileId: string;
  code: string;
  name: string;
  timezone: string;
  inTime: string;
  outTime: string;
  isActive: boolean;
  weekOffDays: number[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface SeriesFields {
  seriesCode: string;
  prefix: string;
  yearScope: number;
  nextValue: number;
}

export interface DepartmentFields {
  code: string;
  name: string;
  status: string;
  parentDepartmentId: string | null;
  headPositionId: string | null;
  description: string | null;
  colorIndex: number | null;
  colorHex: string | null;
}

export interface PositionFields {
  code: string;
  title: string;
  departmentId: string;
  grade: string | null;
  reportsToPositionId: string | null;
  plannedPositions: number;
  description: string | null;
  status: string;
}

export interface Versioned {
  id: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CompanyRecord = CompanyFields & Versioned;
export type HolidayRecord = HolidayFields & Versioned;
export type ShiftRecord = ShiftFields & Versioned;
export type SeriesRecord = SeriesFields & Versioned;
export type DepartmentRecord = DepartmentFields & Versioned;
export type PositionRecord = PositionFields & Versioned;

/** Column list for each table. SQL aliases map snake_case to camelCase here, in the repo layer only. */
const COMPANY_SELECT = `id, code, legal_name AS "legalName", status, trade_name AS "tradeName",
  company_type AS "companyType", cin, gstin, pan, tan, address_line1 AS "addressLine1", address_line2 AS "addressLine2",
  city, state, pin, country, contact_name AS "contactName", contact_email AS "contactEmail",
  contact_phone AS "contactPhone", website, logo_file_id AS "logoFileId",
  settings_json AS settings, row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const HOLIDAY_SELECT = `id, company_profile_id AS "companyProfileId",
  to_char(holiday_date, 'YYYY-MM-DD') AS "holidayDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
  name, holiday_type AS "holidayType", is_optional AS "isOptional",
  scope_project_id AS "scopeProjectId", row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const SHIFT_SELECT = `id, company_profile_id AS "companyProfileId", code, name, timezone,
  to_char(in_time, 'HH24:MI') AS "inTime", to_char(out_time, 'HH24:MI') AS "outTime",
  is_active AS "isActive", week_off_days_json AS "weekOffDays",
  to_char(effective_from, 'YYYY-MM-DD') AS "effectiveFrom",
  to_char(effective_to, 'YYYY-MM-DD') AS "effectiveTo", row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const SERIES_SELECT = `id, series_code AS "seriesCode", prefix, year_scope AS "yearScope",
  CAST(next_value AS double precision) AS "nextValue", row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const DEPARTMENT_SELECT = `id, code, name, status, parent_department_id AS "parentDepartmentId",
  head_position_id AS "headPositionId", description, color_index AS "colorIndex",
  color_hex AS "colorHex", row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const POSITION_SELECT = `id, code, title, department_id AS "departmentId", grade,
  reports_to_position_id AS "reportsToPositionId", planned_positions AS "plannedPositions",
  description, status, row_version AS "rowVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

interface Column {
  readonly name: string;
  readonly cast?: 'jsonb';
}

const COMPANY_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'legal_name' },
  { name: 'status' },
  { name: 'trade_name' },
  { name: 'company_type' },
  { name: 'cin' },
  { name: 'gstin' },
  { name: 'pan' },
  { name: 'tan' },
  { name: 'address_line1' },
  { name: 'address_line2' },
  { name: 'city' },
  { name: 'state' },
  { name: 'pin' },
  { name: 'country' },
  { name: 'contact_name' },
  { name: 'contact_email' },
  { name: 'contact_phone' },
  { name: 'website' },
  { name: 'logo_file_id' },
  { name: 'settings_json', cast: 'jsonb' },
];

const HOLIDAY_COLUMNS: readonly Column[] = [
  { name: 'company_profile_id' },
  { name: 'holiday_date' },
  { name: 'end_date' },
  { name: 'name' },
  { name: 'holiday_type' },
  { name: 'is_optional' },
  { name: 'scope_project_id' },
];

const SHIFT_COLUMNS: readonly Column[] = [
  { name: 'company_profile_id' },
  { name: 'code' },
  { name: 'name' },
  { name: 'timezone' },
  { name: 'in_time' },
  { name: 'out_time' },
  { name: 'is_active' },
  { name: 'week_off_days_json', cast: 'jsonb' },
  { name: 'effective_from' },
  { name: 'effective_to' },
];

const SERIES_COLUMNS: readonly Column[] = [
  { name: 'series_code' },
  { name: 'prefix' },
  { name: 'year_scope' },
  { name: 'next_value' },
];

const DEPARTMENT_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'status' },
  { name: 'parent_department_id' },
  { name: 'head_position_id' },
  { name: 'description' },
  { name: 'color_index' },
  { name: 'color_hex' },
];

const POSITION_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'title' },
  { name: 'department_id' },
  { name: 'grade' },
  { name: 'reports_to_position_id' },
  { name: 'planned_positions' },
  { name: 'description' },
  { name: 'status' },
];

async function one<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const { rows } = await client.query<T>(sql, params);
  return rows[0] ?? null;
}

async function many<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await client.query<T>(sql, params);
  return rows;
}

function placeholder(index: number, cast?: Column['cast']): string {
  return cast ? `$${index}::${cast}` : `$${index}`;
}

async function insertRow(
  client: PoolClient,
  table: OrgTable,
  columns: readonly Column[],
  values: readonly unknown[],
  actorId: string | null,
): Promise<string> {
  const n = columns.length;
  const names = [...columns.map((c) => c.name), 'created_by', 'updated_by'];
  const marks = [...columns.map((c, i) => placeholder(i + 1, c.cast)), `$${n + 1}`, `$${n + 1}`];
  const row = await one<{ id: string }>(
    client,
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`,
    [...values, actorId],
  );
  if (!row) throw new Error(`insert into ${table} returned no row`);
  return row.id;
}

/** Writes every column and bumps row_version. The row_version guard makes a stale write match nothing. */
async function updateRow(
  client: PoolClient,
  table: OrgTable,
  columns: readonly Column[],
  id: string,
  rowVersion: number,
  values: readonly unknown[],
  actorId: string | null,
): Promise<boolean> {
  const n = columns.length;
  const sets = columns.map((c, i) => `${c.name} = ${placeholder(i + 1, c.cast)}`);
  sets.push(`updated_by = $${n + 1}`, 'updated_at = now()', 'row_version = row_version + 1');
  const row = await one<{ id: string }>(
    client,
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${n + 2} AND row_version = $${n + 3} RETURNING id`,
    [...values, actorId, id, rowVersion],
  );
  return row !== null;
}

async function findRow<T extends QueryResultRow>(
  client: PoolClient,
  table: OrgTable,
  select: string,
  id: string,
  lock: boolean,
): Promise<T | null> {
  return one<T>(
    client,
    `SELECT ${select} FROM ${table} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
}

/** Deletes one row. Returns false when no row matched. Foreign key violations surface as 23503. */
export async function deleteRow(client: PoolClient, table: OrgTable, id: string): Promise<boolean> {
  const row = await one<{ id: string }>(client, `DELETE FROM ${table} WHERE id = $1 RETURNING id`, [
    id,
  ]);
  return row !== null;
}

/** The row as the database stores it, in snake_case, for the audit snapshot. Audit redaction runs on it. */
export async function snapshotOf(
  client: PoolClient,
  table: OrgTable,
  id: string,
): Promise<Record<string, unknown> | null> {
  const row = await one<{ row: Record<string, unknown> }>(
    client,
    `SELECT to_jsonb(t) AS row FROM ${table} AS t WHERE t.id = $1`,
    [id],
  );
  return row?.row ?? null;
}

// Company profile (one row per tenant).

export function findCompany(client: PoolClient, lock = false): Promise<CompanyRecord | null> {
  return one<CompanyRecord>(
    client,
    `SELECT ${COMPANY_SELECT} FROM core_company_profile LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
  );
}

function companyValues(f: CompanyFields): unknown[] {
  return [
    f.code,
    f.legalName,
    f.status,
    f.tradeName,
    f.companyType,
    f.cin,
    f.gstin,
    f.pan,
    f.tan,
    f.addressLine1,
    f.addressLine2,
    f.city,
    f.state,
    f.pin,
    f.country,
    f.contactName,
    f.contactEmail,
    f.contactPhone,
    f.website,
    f.logoFileId,
    f.settings === null ? null : JSON.stringify(f.settings),
  ];
}

export function insertCompany(client: PoolClient, f: CompanyFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.company, COMPANY_COLUMNS, companyValues(f), actorId);
}

export function updateCompany(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: CompanyFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    ORG_TABLE.company,
    COMPANY_COLUMNS,
    id,
    rowVersion,
    companyValues(f),
    actorId,
  );
}

// Holidays.

export function listHolidays(client: PoolClient): Promise<HolidayRecord[]> {
  return many<HolidayRecord>(
    client,
    `SELECT ${HOLIDAY_SELECT} FROM core_holiday ORDER BY holiday_date, scope_project_id NULLS FIRST, id`,
  );
}

export function findHoliday(client: PoolClient, id: string, lock = false) {
  return findRow<HolidayRecord>(client, ORG_TABLE.holiday, HOLIDAY_SELECT, id, lock);
}

function holidayValues(f: HolidayFields): unknown[] {
  return [
    f.companyProfileId,
    f.holidayDate,
    f.endDate,
    f.name,
    f.holidayType,
    f.isOptional,
    f.scopeProjectId,
  ];
}

export function insertHoliday(client: PoolClient, f: HolidayFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.holiday, HOLIDAY_COLUMNS, holidayValues(f), actorId);
}

export function updateHoliday(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: HolidayFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    ORG_TABLE.holiday,
    HOLIDAY_COLUMNS,
    id,
    rowVersion,
    holidayValues(f),
    actorId,
  );
}

// Shifts.

export function listShifts(client: PoolClient): Promise<ShiftRecord[]> {
  return many<ShiftRecord>(client, `SELECT ${SHIFT_SELECT} FROM core_shift ORDER BY code`);
}

export function findShift(client: PoolClient, id: string, lock = false) {
  return findRow<ShiftRecord>(client, ORG_TABLE.shift, SHIFT_SELECT, id, lock);
}

function shiftValues(f: ShiftFields): unknown[] {
  return [
    f.companyProfileId,
    f.code,
    f.name,
    f.timezone,
    f.inTime,
    f.outTime,
    f.isActive,
    JSON.stringify(f.weekOffDays),
    f.effectiveFrom,
    f.effectiveTo,
  ];
}

export function insertShift(client: PoolClient, f: ShiftFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.shift, SHIFT_COLUMNS, shiftValues(f), actorId);
}

export function updateShift(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: ShiftFields,
  actorId: string | null,
) {
  return updateRow(client, ORG_TABLE.shift, SHIFT_COLUMNS, id, rowVersion, shiftValues(f), actorId);
}

// Number series.

export function listSeries(client: PoolClient): Promise<SeriesRecord[]> {
  return many<SeriesRecord>(
    client,
    `SELECT ${SERIES_SELECT} FROM core_number_series ORDER BY series_code, year_scope`,
  );
}

export function findSeries(client: PoolClient, id: string, lock = false) {
  return findRow<SeriesRecord>(client, ORG_TABLE.series, SERIES_SELECT, id, lock);
}

function seriesValues(f: SeriesFields): unknown[] {
  return [f.seriesCode, f.prefix, f.yearScope, f.nextValue];
}

export function insertSeries(client: PoolClient, f: SeriesFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.series, SERIES_COLUMNS, seriesValues(f), actorId);
}

export function updateSeries(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: SeriesFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    ORG_TABLE.series,
    SERIES_COLUMNS,
    id,
    rowVersion,
    seriesValues(f),
    actorId,
  );
}

/** The row for one series and year scope, locked until the transaction ends. */
export function lockSeriesRow(
  client: PoolClient,
  seriesCode: string,
  yearScope: number,
): Promise<SeriesRecord | null> {
  return one<SeriesRecord>(
    client,
    `SELECT ${SERIES_SELECT} FROM core_number_series
     WHERE series_code = $1 AND year_scope = $2 FOR UPDATE`,
    [seriesCode, yearScope],
  );
}

/** The most recent year row of a series, used as the template when a new year opens. */
export function latestYearSeries(
  client: PoolClient,
  seriesCode: string,
): Promise<SeriesRecord | null> {
  return one<SeriesRecord>(
    client,
    `SELECT ${SERIES_SELECT} FROM core_number_series
     WHERE series_code = $1 AND year_scope > 0 ORDER BY year_scope DESC LIMIT 1`,
    [seriesCode],
  );
}

/**
 * Opens a year row. Returns its id when this call created it, or null when the row already existed
 * (a concurrent opener that won the race).
 */
export async function openYearSeries(
  client: PoolClient,
  f: SeriesFields,
  actorId: string | null,
): Promise<string | null> {
  const names = [...SERIES_COLUMNS.map((c) => c.name), 'created_by', 'updated_by'];
  const result = await client.query<{ id: string }>(
    `INSERT INTO core_number_series (${names.join(', ')})
     VALUES ($1, $2, $3, $4, $5, $5) ON CONFLICT DO NOTHING RETURNING id`,
    [f.seriesCode, f.prefix, f.yearScope, f.nextValue, actorId],
  );
  return result.rows[0]?.id ?? null;
}

export async function bumpSeriesCounter(
  client: PoolClient,
  id: string,
  actorId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE core_number_series
     SET next_value = next_value + 1, updated_by = $2, updated_at = now(), row_version = row_version + 1
     WHERE id = $1`,
    [id, actorId],
  );
}

// Departments.

export function listDepartments(client: PoolClient): Promise<DepartmentRecord[]> {
  return many<DepartmentRecord>(
    client,
    `SELECT ${DEPARTMENT_SELECT} FROM core_department ORDER BY lower(code)`,
  );
}

export function findDepartment(client: PoolClient, id: string, lock = false) {
  return findRow<DepartmentRecord>(client, ORG_TABLE.department, DEPARTMENT_SELECT, id, lock);
}

function departmentValues(f: DepartmentFields): unknown[] {
  return [
    f.code,
    f.name,
    f.status,
    f.parentDepartmentId,
    f.headPositionId,
    f.description,
    f.colorIndex,
    f.colorHex,
  ];
}

export function insertDepartment(client: PoolClient, f: DepartmentFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.department, DEPARTMENT_COLUMNS, departmentValues(f), actorId);
}

export function updateDepartment(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: DepartmentFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    ORG_TABLE.department,
    DEPARTMENT_COLUMNS,
    id,
    rowVersion,
    departmentValues(f),
    actorId,
  );
}

/** Department ids from the given one upwards through its parents. Used to refuse a cycle. */
export async function ancestorDepartments(client: PoolClient, startId: string): Promise<string[]> {
  const rows = await many<{ id: string }>(
    client,
    `WITH RECURSIVE chain AS (
       SELECT id, parent_department_id FROM core_department WHERE id = $1
       UNION
       SELECT d.id, d.parent_department_id FROM core_department d
       JOIN chain c ON d.id = c.parent_department_id
     )
     SELECT id FROM chain`,
    [startId],
  );
  return rows.map((r) => r.id);
}

// Positions.

export function listPositions(client: PoolClient): Promise<PositionRecord[]> {
  return many<PositionRecord>(client, `SELECT ${POSITION_SELECT} FROM core_position ORDER BY code`);
}

export function findPosition(client: PoolClient, id: string, lock = false) {
  return findRow<PositionRecord>(client, ORG_TABLE.position, POSITION_SELECT, id, lock);
}

function positionValues(f: PositionFields): unknown[] {
  return [
    f.code,
    f.title,
    f.departmentId,
    f.grade,
    f.reportsToPositionId,
    f.plannedPositions,
    f.description,
    f.status,
  ];
}

export function insertPosition(client: PoolClient, f: PositionFields, actorId: string | null) {
  return insertRow(client, ORG_TABLE.position, POSITION_COLUMNS, positionValues(f), actorId);
}

export function updatePosition(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: PositionFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    ORG_TABLE.position,
    POSITION_COLUMNS,
    id,
    rowVersion,
    positionValues(f),
    actorId,
  );
}

/** Position ids from the given one upwards through the reporting line. Used to refuse a cycle. */
export async function ancestorPositions(client: PoolClient, startId: string): Promise<string[]> {
  const rows = await many<{ id: string }>(
    client,
    `WITH RECURSIVE chain AS (
       SELECT id, reports_to_position_id FROM core_position WHERE id = $1
       UNION
       SELECT p.id, p.reports_to_position_id FROM core_position p
       JOIN chain c ON p.id = c.reports_to_position_id
     )
     SELECT id FROM chain`,
    [startId],
  );
  return rows.map((r) => r.id);
}

/** True when the position is the head of at least one department. */
export async function isHeadOfDepartment(client: PoolClient, positionId: string): Promise<boolean> {
  const row = await one<{ found: number }>(
    client,
    'SELECT 1 AS found FROM core_department WHERE head_position_id = $1 LIMIT 1',
    [positionId],
  );
  return row !== null;
}
