import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import { snapshotOf } from '../../core/rows.js';
import { type Actor, auditWrite, mapDatabaseError, versionConflict } from '../../core/resource.js';
import {
  findStockRow,
  findStockRowByPair,
  insertStockRow,
  listStockRows,
  materialExists,
  type StockFilter,
  type StockLevelRecord,
  storeExists,
  updateStockRow,
} from './repo.js';
import type { StockLevelCreateInput, StockLevelPatchInput } from './schema.js';

export const STOCK_TABLE = 'core_stock_level';
export const STOCK_PREFIX = 'STOCK_LEVEL';

/** Reserved stock cannot exceed the quantity on hand. Checked before the database CHECK, for a clearer answer. */
function assertReservedWithinQty(qty: number, reserved: number): void {
  if (reserved > qty) {
    throw new AppError(
      'STOCK_RESERVED_EXCEEDS_QTY',
      422,
      'Reserved quantity cannot be more than the quantity on hand',
      { issues: [{ path: 'reserved', message: 'must be less than or equal to qty' }] },
    );
  }
}

function notFound(code: string, message: string): AppError {
  return new AppError(code, 404, message);
}

/** The stock rows in the tenant that match the filter. */
export function listStockLevels(
  client: PoolClient,
  filter: StockFilter,
): Promise<StockLevelRecord[]> {
  return listStockRows(client, filter);
}

/**
 * Creates the row for a store and material, or sets qty and reserved on the row that already exists. Fields left out
 * keep their stored value on an existing row and take 0 on a new one. Returns created=true for an insert.
 */
export async function setStockLevel(
  client: PoolClient,
  actor: Actor,
  input: StockLevelCreateInput,
): Promise<{ row: StockLevelRecord; created: boolean }> {
  if (!(await storeExists(client, input.storeId))) {
    throw notFound('STORE_NOT_FOUND', 'Store not found');
  }
  if (!(await materialExists(client, input.materialId))) {
    throw notFound('MATERIAL_NOT_FOUND', 'Material not found');
  }

  const existing = await findStockRowByPair(client, input.storeId, input.materialId);
  if (existing) {
    const qty = input.qty ?? existing.qty;
    const reserved = input.reserved ?? existing.reserved;
    assertReservedWithinQty(qty, reserved);
    const before = await snapshotOf(client, STOCK_TABLE, existing.id);
    const updated = await updateStockRow(
      client,
      existing.id,
      existing.rowVersion,
      { qty, reserved },
      actor.actorId,
    );
    if (!updated) throw versionConflict();
    await auditWrite(
      client,
      actor,
      STOCK_TABLE,
      existing.id,
      'UPDATE',
      before,
      await snapshotOf(client, STOCK_TABLE, existing.id),
    );
    return { row: await requireStock(client, existing.id), created: false };
  }

  const qty = input.qty ?? 0;
  const reserved = input.reserved ?? 0;
  assertReservedWithinQty(qty, reserved);
  let id: string;
  try {
    id = await insertStockRow(
      client,
      { storeId: input.storeId, materialId: input.materialId, qty, reserved },
      actor.actorId,
    );
  } catch (err) {
    throw mapDatabaseError(STOCK_PREFIX, err, 'reference');
  }
  await auditWrite(
    client,
    actor,
    STOCK_TABLE,
    id,
    'INSERT',
    null,
    await snapshotOf(client, STOCK_TABLE, id),
  );
  return { row: await requireStock(client, id), created: true };
}

/** Changes qty and/or reserved on one row. The rowVersion must match the stored version, or the write is refused with 409. */
export async function patchStockLevel(
  client: PoolClient,
  actor: Actor,
  id: string,
  input: StockLevelPatchInput,
): Promise<StockLevelRecord> {
  const existing = await findStockRow(client, id, true);
  if (!existing) throw notFound('STOCK_LEVEL_NOT_FOUND', 'Stock level not found');
  if (existing.rowVersion !== input.rowVersion) throw versionConflict();

  const qty = input.qty ?? existing.qty;
  const reserved = input.reserved ?? existing.reserved;
  assertReservedWithinQty(qty, reserved);

  const before = await snapshotOf(client, STOCK_TABLE, id);
  const updated = await updateStockRow(
    client,
    id,
    input.rowVersion,
    { qty, reserved },
    actor.actorId,
  );
  if (!updated) throw versionConflict();
  await auditWrite(
    client,
    actor,
    STOCK_TABLE,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, STOCK_TABLE, id),
  );
  return requireStock(client, id);
}

async function requireStock(client: PoolClient, id: string): Promise<StockLevelRecord> {
  const row = await findStockRow(client, id, false);
  if (!row) throw notFound('STOCK_LEVEL_NOT_FOUND', 'Stock level not found');
  return row;
}
