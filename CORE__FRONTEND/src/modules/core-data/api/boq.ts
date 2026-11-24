import { api } from '@/shared/lib/api'

/**
 * Bill of Quantities (API 1.3.0, /boq-items). Reads need a signed-in user; writes need projects.manage. The item code
 * is unique within its project. `amount` is computed by the server (quantity x rate, two decimals) and never sent.
 * Writes send an Idempotency-Key (POST, PATCH) and the row version (PATCH).
 */

export type BoqStatus = 'draft' | 'approved'

export interface BoqItem {
  id: string
  projectId: string
  itemCode: string
  description: string
  wbsNodeId: string | null
  uomId: string
  quantity: number
  rate: number
  amount: number
  status: BoqStatus
  rowVersion: number
}

/** What the form edits. The project is fixed when the item is created. */
export interface BoqDraft {
  itemCode: string
  description: string
  wbsNodeId: string | null
  uomId: string
  quantity: number
  rate: number
  status: BoqStatus
}

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`

export const listBoqItems = (projectId: string) => api<BoqItem[]>('GET', `/boq-items?projectId=${encodeURIComponent(projectId)}`)
export const createBoqItem = (projectId: string, d: BoqDraft) => api<BoqItem>('POST', '/boq-items', { body: { projectId, ...d } })
export const updateBoqItem = (id: string, rowVersion: number, d: BoqDraft) =>
  api<BoqItem>('PATCH', path('/boq-items', id), { body: { ...d, rowVersion } })
export const deleteBoqItem = (id: string) => api<{ deleted: true }>('DELETE', path('/boq-items', id))

/** The BOQ total: the sum of the server's amounts, rounded to the paisa. */
export const boqTotal = (items: readonly BoqItem[]) => Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100
