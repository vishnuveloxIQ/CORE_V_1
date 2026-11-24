import { api } from '@/shared/lib/api'
import type { MaterialPlanLine, MaterialPlanStatus, PeoplePlanLine, PeoplePlanStatus, PlanLine } from '../types'
import { typeIdByName, type EquipmentTypeRecord } from './equipment'
import { uomCodeOf, type UomRecord } from './uoms'

/**
 * Plan lines (GET/POST/PATCH /plan-lines) back three screens: equipment, people (manpower) and material planning.
 * resourceKind picks the screen. The API has no DELETE: a line is cancelled with a PATCH to status cancelled.
 */

const path = (id: string) => `/plan-lines/${encodeURIComponent(id)}`

export type PlanKind = 'equipment' | 'people' | 'material'
/** Approval state of a line (cancel sets cancelled); separate from its stage. */
export type PlanStatus = 'draft' | 'approved' | 'cancelled'
/** Progress of a line: people planned/confirmed/fulfilled, material planned/requested/ordered/received, equipment planned. */
export type PlanStage = 'planned' | 'confirmed' | 'fulfilled' | 'requested' | 'ordered' | 'received'
export interface PlanLineRecord {
  id: string; projectId: string; resourceKind: PlanKind; equipmentTypeId: string | null; positionId: string | null; role: string | null
  materialId: string | null; uomId: string | null; storeId: string | null; quantity: number | null; withdrawn: boolean
  fromDate: string | null; toDate: string | null; requiredBy: string | null; status: PlanStatus; reason: string | null; rowVersion: number
  /** null reads as Planned */
  stage?: PlanStage | null
}

export const listPlanLines = (projectId?: string, kind?: PlanKind) => {
  const qs = [projectId && `projectId=${encodeURIComponent(projectId)}`, kind && `resourceKind=${kind}`].filter(Boolean).join('&')
  return api<PlanLineRecord[]>('GET', `/plan-lines${qs ? `?${qs}` : ''}`)
}

// The UI's line statuses are the API's stage; `status` stays the approval state and is not derived from them.
const PEOPLE_TO_STAGE: Record<PeoplePlanStatus, PlanStage> = { Planned: 'planned', Confirmed: 'confirmed', Fulfilled: 'fulfilled' }
const MATERIAL_TO_STAGE: Record<MaterialPlanStatus, PlanStage> = { Planned: 'planned', Requested: 'requested', Ordered: 'ordered', Received: 'received' }
const PEOPLE_FROM_STAGE: Partial<Record<PlanStage, PeoplePlanStatus>> = { planned: 'Planned', confirmed: 'Confirmed', fulfilled: 'Fulfilled' }
const MATERIAL_FROM_STAGE: Partial<Record<PlanStage, MaterialPlanStatus>> = { planned: 'Planned', requested: 'Requested', ordered: 'Ordered', received: 'Received' }
/** stage as the people status; null (or a stage of another kind) shows Planned. */
export const peopleStatusOf = (stage: PlanStage | null | undefined): PeoplePlanStatus => (stage && PEOPLE_FROM_STAGE[stage]) || 'Planned'
/** stage as the material status; null (or a stage of another kind) shows Planned. */
export const materialStatusOf = (stage: PlanStage | null | undefined): MaterialPlanStatus => (stage && MATERIAL_FROM_STAGE[stage]) || 'Planned'

// ---------- equipment ----------
export const planLineFrom = (r: PlanLineRecord, types: EquipmentTypeRecord[]): PlanLine => ({
  id: r.id, equipmentType: types.find((t) => t.id === r.equipmentTypeId)?.name ?? r.equipmentTypeId ?? '', projectId: r.projectId,
  plannedQty: r.quantity ?? 0, from: r.fromDate ?? '', to: r.toDate ?? '', reason: r.reason ?? '', rowVersion: r.rowVersion,
})
/** Returns null when the type is not on the server, so the caller keeps the line local. */
export const planLineBody = (l: Omit<PlanLine, 'id' | 'rowVersion'>, types: EquipmentTypeRecord[]) => {
  const equipmentTypeId = typeIdByName(types, l.equipmentType)
  return equipmentTypeId ? { equipmentTypeId, quantity: l.plannedQty, fromDate: l.from || null, toDate: l.to || null, reason: l.reason || null } : null
}

// ---------- people ----------
export const peopleFrom = (r: PlanLineRecord): PeoplePlanLine => ({
  id: r.id, projectId: r.projectId, role: r.role ?? '', headcount: r.quantity ?? 0, from: r.fromDate ?? '', to: r.toDate ?? '',
  status: peopleStatusOf(r.stage), rowVersion: r.rowVersion, positionId: r.positionId ?? undefined,
})
export const peopleBody = (l: Omit<PeoplePlanLine, 'id' | 'rowVersion'>) =>
  ({ positionId: l.positionId ?? null, role: l.role, quantity: l.headcount, fromDate: l.from || null, toDate: l.to || null, stage: PEOPLE_TO_STAGE[l.status] })

// ---------- material ----------
export const materialPlanFrom = (r: PlanLineRecord, uoms: UomRecord[]): MaterialPlanLine => ({
  id: r.id, projectId: r.projectId, materialId: r.materialId ?? '', qty: r.quantity ?? 0, uom: uomCodeOf(uoms, r.uomId),
  requiredBy: r.requiredBy ?? '', storeId: r.storeId ?? '',
  status: materialStatusOf(r.stage), rowVersion: r.rowVersion,
})
export const materialPlanBody = (l: Omit<MaterialPlanLine, 'id' | 'rowVersion'>, uomId: string | undefined) =>
  ({ materialId: l.materialId, uomId: uomId ?? null, storeId: l.storeId || null, quantity: l.qty, requiredBy: l.requiredBy || null, stage: MATERIAL_TO_STAGE[l.status] })

// ---------- calls ----------
export const createPlanLine = (projectId: string, resourceKind: PlanKind, body: object, idempotencyKey?: string) =>
  api<PlanLineRecord>('POST', '/plan-lines', { body: { projectId, resourceKind, ...body }, idempotencyKey })
export const updatePlanLine = (id: string, rowVersion: number, body: object, idempotencyKey?: string) =>
  api<PlanLineRecord>('PATCH', path(id), { body: { ...body, rowVersion }, idempotencyKey })
/** There is no DELETE for plan lines: this cancels the line. */
export const cancelPlanLine = (id: string, rowVersion: number, idempotencyKey?: string) =>
  api<PlanLineRecord>('PATCH', path(id), { body: { status: 'cancelled', rowVersion }, idempotencyKey })
