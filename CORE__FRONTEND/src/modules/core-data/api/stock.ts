import { api } from '@/shared/lib/api'
import type { StockRow } from '../types'

/**
 * Stock levels per store and material (GET /stock-levels, POST /stock-levels, PATCH /stock-levels/{id}).
 * Free stock is qty less reserved. A PATCH needs the row version last read (409 VERSION_CONFLICT when stale), and
 * reserved may not exceed qty (422 STOCK_RESERVED_EXCEEDS_QTY).
 */

export interface StockRecord {
  id: string; storeId: string; materialId: string; qty: number; reserved: number; rowVersion: number
}

export interface StockQuery { storeId?: string; materialId?: string }

/** GET /stock-levels, optionally for one store and/or one material. */
export function listStock(q: StockQuery = {}) {
  const params = new URLSearchParams()
  if (q.storeId) params.set('storeId', q.storeId)
  if (q.materialId) params.set('materialId', q.materialId)
  const query = params.toString()
  return api<StockRecord[]>('GET', `/stock-levels${query ? `?${query}` : ''}`)
}

/** The UI row for an API row. `updatedAt` is not in the API. `known` is the row already on screen, if any. */
export const stockFrom = (r: StockRecord, known?: StockRow): StockRow => ({
  id: r.id, storeId: r.storeId, materialId: r.materialId, qty: r.qty, reserved: r.reserved,
  // TODO(backend): field updatedAt not in API; the screen hides "Last update" when it is empty
  updatedAt: known?.updatedAt ?? '',
  rowVersion: r.rowVersion,
})

/** POST /stock-levels: creates the row for the store and material pair, or sets it when one exists. */
export const setStockLevel = (v: { storeId: string; materialId: string; qty: number; reserved?: number }, idempotencyKey?: string) =>
  api<StockRecord>('POST', '/stock-levels', { body: { ...v, reserved: v.reserved ?? 0 }, idempotencyKey })

/** PATCH /stock-levels/{id}: changes qty and/or reserved. Pass the row version last read. */
export const patchStockLevel = (id: string, rowVersion: number, v: { qty?: number; reserved?: number }, idempotencyKey?: string) =>
  api<StockRecord>('PATCH', `/stock-levels/${encodeURIComponent(id)}`, { body: { ...v, rowVersion }, idempotencyKey })
