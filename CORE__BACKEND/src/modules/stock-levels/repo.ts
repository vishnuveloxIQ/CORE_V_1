import type { PoolClient } from 'pg';
import { insertRow, many, one, updateRow } from '../../core/rows.js';

/** One core_stock_level row in API shape. SQL aliases map the columns to camelCase here, in the repo layer. */
export interface StockLevelRecord {
  id: string;
  storeId: string;
  materialId: string;
  qty: number;
  reserved: number;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, store_id AS "storeId", material_id AS "materialId",
  CAST(qty AS double precision) AS qty, CAST(reserved AS double precision) AS reserved,
  row_version AS "rowVersion", created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface StockFilter {
  storeId: string | null;
  materialId: string | null;
}

export async function listStockRows(
  client: PoolClient,
  filter: StockFilter,
): Promise<StockLevelRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.storeId !== null) {
    params.push(filter.storeId);
    where.push(`store_id = $${params.length}`);
  }
  if (filter.materialId !== null) {
    params.push(filter.materialId);
    where.push(`material_id = $${params.length}`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return many<StockLevelRecord>(
    client,
    `SELECT ${COLUMNS} FROM core_stock_level${clause} ORDER BY store_id, material_id, id`,
    params,
  );
}

/** One row by id, locked until the transaction ends when lock is true. */
export async function findStockRow(
  client: PoolClient,
  id: string,
  lock: boolean,
): Promise<StockLevelRecord | null> {
  return one<StockLevelRecord>(
    client,
    `SELECT ${COLUMNS} FROM core_stock_level WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
}

/** The row for one store and material, locked until the transaction ends. */
export async function findStockRowByPair(
  client: PoolClient,
  storeId: string,
  materialId: string,
): Promise<StockLevelRecord | null> {
  return one<StockLevelRecord>(
    client,
    `SELECT ${COLUMNS} FROM core_stock_level WHERE store_id = $1 AND material_id = $2 FOR UPDATE`,
    [storeId, materialId],
  );
}

/** True when a store row with this id exists in the tenant. */
export async function storeExists(client: PoolClient, storeId: string): Promise<boolean> {
  const row = await one<{ id: string }>(client, 'SELECT id FROM core_store WHERE id = $1', [
    storeId,
  ]);
  return row !== null;
}

/** True when a material row with this id exists in the tenant. */
export async function materialExists(client: PoolClient, materialId: string): Promise<boolean> {
  const row = await one<{ id: string }>(client, 'SELECT id FROM core_material WHERE id = $1', [
    materialId,
  ]);
  return row !== null;
}

export async function insertStockRow(
  client: PoolClient,
  input: { storeId: string; materialId: string; qty: number; reserved: number },
  actorId: string | null,
): Promise<string> {
  return insertRow(
    client,
    'core_stock_level',
    [{ name: 'store_id' }, { name: 'material_id' }, { name: 'qty' }, { name: 'reserved' }],
    [input.storeId, input.materialId, input.qty, input.reserved],
    actorId,
  );
}

/** Writes qty and reserved under the row_version guard. Returns false when the version no longer matches. */
export async function updateStockRow(
  client: PoolClient,
  id: string,
  rowVersion: number,
  values: { qty: number; reserved: number },
  actorId: string | null,
): Promise<boolean> {
  return updateRow(
    client,
    'core_stock_level',
    [{ name: 'qty' }, { name: 'reserved' }],
    id,
    rowVersion,
    [values.qty, values.reserved],
    actorId,
  );
}
