import type { PoolClient } from 'pg';
import { type Column, insertRow, many, one, updateRow } from '../../core/rows.js';
import { field, type FieldSpec, selectOf } from '../../core/resource.js';
import type { UnitFilter } from './schema.js';

export const UNIT_TABLE = 'core_equipment_unit';

/**
 * Every writable unit field, by its API name. The column is the snake_case of the key unless one is given.
 * Dates are read back as YYYY-MM-DD and numerics as plain numbers (see selectOf).
 */
export const UNIT_FIELDS: readonly FieldSpec[] = [
  field('assetCode', 'text'),
  field('name', 'text'),
  field('equipmentTypeId', 'uuid'),
  field('makeModel', 'text'),
  field('regNo', 'text'),
  field('availability', 'text'),
  field('locationId', 'uuid'),
  field('currentLocation', 'text'),
  field('lat', 'num'),
  field('lng', 'num'),
  field('lastPingAt', 'ts'),
  field('photoFileId', 'uuid'),
  field('documents', 'json'),
  field('ownershipType', 'text'),
  field('manufacturer', 'text'),
  field('model', 'text'),
  field('mfgYear', 'text'),
  field('engineNo', 'text'),
  field('chasisNo', 'text', 'chassis_no'),
  field('capacity', 'text'),
  field('capacityUnit', 'text'),
  field('meterType', 'text'),
  field('meterReading', 'text'),
  field('fuelType', 'text'),
  field('fuelNorm', 'text'),
  field('tankCapacity', 'text'),
  field('owner', 'text'),
  field('vendorId', 'uuid'),
  field('hireRef', 'text'),
  field('agreementStart', 'date'),
  field('agreementEnd', 'date'),
  field('warrantyEnd', 'date'),
  field('warrantyReading', 'text'),
  field('invoiceNo', 'text'),
  field('invoiceDate', 'date'),
  field('regExpiry', 'date'),
  field('insuranceNo', 'text'),
  field('insuranceExpiry', 'date'),
  field('pucNo', 'text'),
  field('pollutionExpiry', 'date'),
  field('fitnessCert', 'text'),
  field('fitnessExpiry', 'date'),
];

/** One unit in API shape. The type is the equipment type's name, as the frontend shows it. */
export interface UnitRecord {
  id: string;
  assetCode: string;
  type: string | null;
  equipmentTypeId: string;
  availability: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

const SELECT = [
  selectOf({ fields: UNIT_FIELDS }),
  `(SELECT t.name FROM core_equipment_type t WHERE t.id = ${UNIT_TABLE}.equipment_type_id) AS "type"`,
].join(', ');

/** Escapes LIKE wildcards so a search for "EXC_1" matches that text, not any character. */
function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listUnits(client: PoolClient, filter: UnitFilter): Promise<UnitRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.equipmentTypeId !== undefined) {
    params.push(filter.equipmentTypeId);
    where.push(`equipment_type_id = $${params.length}`);
  }
  if (filter.status !== undefined) {
    params.push(filter.status);
    where.push(`availability = $${params.length}`);
  }
  if (filter.search !== undefined) {
    params.push(containsPattern(filter.search));
    where.push(`asset_code ILIKE $${params.length}`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return many<UnitRecord>(
    client,
    `SELECT ${SELECT} FROM ${UNIT_TABLE}${clause} ORDER BY asset_code`,
    params,
  );
}

export function findUnit(client: PoolClient, id: string, lock = false): Promise<UnitRecord | null> {
  return one<UnitRecord>(
    client,
    `SELECT ${SELECT} FROM ${UNIT_TABLE} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
}

/** The columns and values for the fields present in `values` (undefined means not sent). */
function columnsFor(values: Record<string, unknown>): { columns: Column[]; params: unknown[] } {
  const present = UNIT_FIELDS.filter((f) => values[f.key] !== undefined);
  return {
    columns: present.map((f) =>
      f.kind === 'json' ? { name: f.column, cast: 'jsonb' } : { name: f.column },
    ),
    params: present.map((f) => {
      const value = values[f.key];
      return f.kind === 'json' && value !== null ? JSON.stringify(value) : value;
    }),
  };
}

/** The ids from `ids` that are not in core_file. */
export async function missingFileIds(
  client: PoolClient,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await many<{ id: string }>(
    client,
    'SELECT id FROM core_file WHERE id = ANY($1::uuid[])',
    [ids],
  );
  const known = new Set(found.map((r) => r.id));
  return ids.filter((id) => !known.has(id));
}

export function insertUnit(
  client: PoolClient,
  values: Record<string, unknown>,
  actorId: string | null,
): Promise<string> {
  const { columns, params } = columnsFor(values);
  return insertRow(client, UNIT_TABLE, columns, params, actorId);
}

/** Writes the sent fields under the version guard. False when the row version no longer matches. */
export function updateUnitRow(
  client: PoolClient,
  id: string,
  rowVersion: number,
  changes: Record<string, unknown>,
  actorId: string | null,
): Promise<boolean> {
  const { columns, params } = columnsFor(changes);
  return updateRow(client, UNIT_TABLE, columns, id, rowVersion, params, actorId);
}
