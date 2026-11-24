import { api } from '@/shared/lib/api'
import type { EquipmentAssignment } from '../types'

/** Equipment types (GET/POST/PATCH /equipment-types) and equipment assignments (/equipment-assignments, with DELETE). */

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`

// ---------- equipment types ----------
export type MeterKind = 'hours' | 'km' | 'none'
export type FuelNormUnit = 'litre_per_hour' | 'litre_per_km'
export interface EquipmentTypeRecord {
  id: string; code: string; name: string; meterKind: MeterKind | null; meterPrecision: number | null
  fuelNormUnit: FuelNormUnit | null; toleranceSettingKey: string; active: boolean; rowVersion: number
}
export interface EquipmentTypeDraft { code: string; name: string; meterKind?: MeterKind | null; meterPrecision?: number | null; fuelNormUnit?: FuelNormUnit | null; active?: boolean }

export const listEquipmentTypes = () => api<EquipmentTypeRecord[]>('GET', '/equipment-types')
export const createEquipmentType = (t: EquipmentTypeDraft, idempotencyKey?: string) =>
  api<EquipmentTypeRecord>('POST', '/equipment-types', { body: t, idempotencyKey })
/** The code is fixed after create: a PATCH that sends it is refused, so it is not part of the draft here. */
export const updateEquipmentType = (id: string, rowVersion: number, t: Omit<EquipmentTypeDraft, 'code'>, idempotencyKey?: string) =>
  api<EquipmentTypeRecord>('PATCH', path('/equipment-types', id), { body: { ...t, rowVersion }, idempotencyKey })

/** The type id for a type name used by the planning screens, or undefined when the type is not on the server. */
export const typeIdByName = (types: EquipmentTypeRecord[], name: string) =>
  types.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())?.id

// ---------- equipment assignments ----------
export interface AssignmentRecord {
  id: string; projectId: string; equipmentTypeId: string; qty: number; assignedAt: string; assignedByUserId: string | null; rowVersion: number
}

/** An API assignment is per project and type; it has no chainage marker, so chainageId stays empty. */
export const assignmentFrom = (r: AssignmentRecord, types: EquipmentTypeRecord[]): EquipmentAssignment => ({
  id: r.id, equipmentType: types.find((t) => t.id === r.equipmentTypeId)?.name ?? r.equipmentTypeId, projectId: r.projectId,
  chainageId: '', // TODO(backend): field chainageId not in API
  qty: r.qty, assignedAt: r.assignedAt, assignedBy: r.assignedByUserId ?? '',
})
export const listAssignments = (projectId?: string) =>
  api<AssignmentRecord[]>('GET', `/equipment-assignments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)
export const createAssignment = (a: { projectId: string; equipmentTypeId: string; qty: number }, idempotencyKey?: string) =>
  api<AssignmentRecord>('POST', '/equipment-assignments', { body: a, idempotencyKey })
/** Only the quantity can change. */
export const updateAssignment = (id: string, rowVersion: number, qty: number, idempotencyKey?: string) =>
  api<AssignmentRecord>('PATCH', path('/equipment-assignments', id), { body: { qty, rowVersion }, idempotencyKey })
export const deleteAssignment = (id: string) => api<{ deleted: true }>('DELETE', path('/equipment-assignments', id))
