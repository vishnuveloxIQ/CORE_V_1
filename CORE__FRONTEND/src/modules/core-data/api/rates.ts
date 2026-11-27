import { api } from '@/shared/lib/api'
import type { EquipmentRate, MaterialRate, RateBasis } from '../types'

/**
 * Rate rows per project (GET/POST/PATCH /equipment-rates and /material-rates). A row is one line of an uploaded
 * rate sheet; the sheet is recorded as a policy version (policyVersionId).
 */

export interface EquipmentRateRecord {
  id: string; projectId: string; policyVersionId: string | null; equipmentType: string; rateBasis: RateBasis; unit: string
  rate: string | number; amount: string | number | null; remarks: string | null; rowVersion: number
}
export interface MaterialRateRecord {
  id: string; projectId: string; policyVersionId: string | null; materialName: string; materialCode: string | null; uom: string
  rate: string | number; amount: string | number | null; remarks: string | null; rowVersion: number
}

const num = (v: string | number | null) => (v === null || v === '' ? null : Number(v))

export const equipmentRateFrom = (r: EquipmentRateRecord): EquipmentRate => ({
  id: r.id, projectId: r.projectId, policyVersionId: r.policyVersionId ?? null, equipmentType: r.equipmentType,
  rateBasis: r.rateBasis, unit: r.unit, rate: Number(r.rate), amount: num(r.amount), remarks: r.remarks ?? '',
})
export const materialRateFrom = (r: MaterialRateRecord): MaterialRate => ({
  id: r.id, projectId: r.projectId, policyVersionId: r.policyVersionId ?? null, materialName: r.materialName,
  materialCode: r.materialCode ?? '', uom: r.uom, rate: Number(r.rate), amount: num(r.amount), remarks: r.remarks ?? '',
})

export const listEquipmentRates = (projectId?: string) =>
  api<EquipmentRateRecord[]>('GET', `/equipment-rates${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)
export const listMaterialRates = (projectId?: string) =>
  api<MaterialRateRecord[]>('GET', `/material-rates${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)

export interface EquipmentRateDraft {
  projectId: string; policyVersionId: string | null; equipmentType: string; rateBasis: RateBasis; unit: string
  rate: number; amount: number | null; remarks: string
}
export interface MaterialRateDraft {
  projectId: string; policyVersionId: string | null; materialName: string; materialCode: string; uom: string
  rate: number; amount: number | null; remarks: string
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

export const createEquipmentRate = (d: EquipmentRateDraft, idempotencyKey?: string) =>
  api<EquipmentRateRecord>('POST', '/equipment-rates', {
    body: { ...d, remarks: orNull(d.remarks), policyVersionId: d.policyVersionId ?? undefined }, idempotencyKey,
  })
export const createMaterialRate = (d: MaterialRateDraft, idempotencyKey?: string) =>
  api<MaterialRateRecord>('POST', '/material-rates', {
    body: { ...d, materialCode: orNull(d.materialCode), remarks: orNull(d.remarks), policyVersionId: d.policyVersionId ?? undefined }, idempotencyKey,
  })
