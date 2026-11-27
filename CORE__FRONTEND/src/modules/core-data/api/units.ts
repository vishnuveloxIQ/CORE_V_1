import { api } from '@/shared/lib/api'
import type { Availability, EquipmentUnit, UnitDocKey, UnitDocuments } from '../types'

/**
 * Equipment units (GET /equipment-units, POST /equipment-units, PATCH /equipment-units/{id}). There is no DELETE:
 * a unit is retired by setting its availability. Writes need an Idempotency-Key, and PATCH needs the rowVersion read.
 */

/** A unit as the API returns it. `type` is the equipment type's name. Dates are YYYY-MM-DD. */
export interface UnitRecord {
  id: string
  assetCode: string
  equipmentTypeId: string
  type: string | null
  availability: Availability
  /** core_project id, or null when the unit has no project */
  projectId: string | null
  /** core_approval_request id, or null (owned units) */
  approvalRequestId: string | null
  vendorId: string | null
  name: string | null
  makeModel: string | null
  regNo: string | null
  currentLocation: string | null
  lat: number | null
  lng: number | null
  ownershipType: string | null
  manufacturer: string | null
  model: string | null
  mfgYear: string | null
  engineNo: string | null
  chasisNo: string | null
  capacity: string | null
  capacityUnit: string | null
  meterType: string | null
  meterReading: string | null
  fuelType: string | null
  fuelNorm: string | null
  tankCapacity: string | null
  owner: string | null
  hireRef: string | null
  hiredFrom: string | null
  hireStatus: 'Active' | 'Inactive' | null
  overPlanReason: string | null
  agreementStart: string | null
  agreementEnd: string | null
  warrantyEnd: string | null
  warrantyReading: string | null
  invoiceNo: string | null
  invoiceDate: string | null
  regExpiry: string | null
  insuranceNo: string | null
  insuranceExpiry: string | null
  pucNo: string | null
  pollutionExpiry: string | null
  fitnessCert: string | null
  fitnessExpiry: string | null
  /** last telematics ping (ISO UTC), or null */
  lastPingAt: string | null
  /** file id of the machine photo, or null */
  photoFileId: string | null
  /** file ids of the stored photos and papers, by key; null when none */
  documents: UnitDocuments | null
  rowVersion: number
  createdAt: string
  updatedAt: string
}

type UnitText =
  | 'name' | 'makeModel' | 'regNo' | 'currentLocation' | 'ownershipType' | 'manufacturer' | 'model' | 'mfgYear' | 'engineNo'
  | 'chasisNo' | 'capacity' | 'capacityUnit' | 'meterType' | 'meterReading' | 'fuelType' | 'fuelNorm' | 'tankCapacity' | 'owner'
  | 'hireRef' | 'hiredFrom' | 'overPlanReason' | 'warrantyReading' | 'invoiceNo' | 'insuranceNo' | 'pucNo' | 'fitnessCert'
type UnitDate = 'agreementStart' | 'agreementEnd' | 'warrantyEnd' | 'invoiceDate' | 'regExpiry' | 'insuranceExpiry' | 'pollutionExpiry' | 'fitnessExpiry'

/** Writable unit fields in API names. Empty text and unset values are sent as null. */
export type UnitDraft = {
  assetCode: string
  equipmentTypeId: string
  availability: Availability
  projectId: string | null
  approvalRequestId: string | null
  hireStatus: 'Active' | 'Inactive' | null
  vendorId: string | null
  lat: number | null
  lng: number | null
  photoFileId: string | null
  /** a write replaces the whole map; null clears it */
  documents: UnitDocuments | null
} & Record<UnitText | UnitDate, string | null>

export interface UnitFilter {
  equipmentTypeId?: string
  status?: Availability
  /** matches the asset code, case-insensitively */
  search?: string
}

const text = (v?: string | null) => (v?.trim() ? v.trim() : null)
/** An optional text field from the API, as the frontend type holds it (undefined when empty). */
const opt = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? undefined : v)

/** The six photo and document keys a unit can store (the only keys the API accepts in `documents`). */
export const UNIT_DOC_KEYS: UnitDocKey[] = ['chasisPhoto', 'enginePhoto', 'meterPhoto', 'invoiceDoc', 'insuranceDoc', 'regDoc', 'pucDoc', 'fitnessDoc']

/** Labels of the photo and document keys, for messages and the unit details. */
export const UNIT_DOC_LABEL: Record<UnitDocKey, string> = {
  chasisPhoto: 'Chassis number photo', enginePhoto: 'Engine number photo', meterPhoto: 'Meter photo',
  invoiceDoc: 'Invoice document', insuranceDoc: 'Insurance document', pucDoc: 'PUC document',
  regDoc: 'Registration document', fitnessDoc: 'Fitness certificate document',
}

/** A chosen file or camera capture waiting to be uploaded for a unit. */
export interface UnitUpload { blob: Blob; name: string }
/** The machine photo and the photo/document files chosen for a unit. */
export interface UnitUploads { photo?: UnitUpload; docs?: Partial<Record<UnitDocKey, UnitUpload>> }

/** Only the known keys with a file id; null when none is left. */
export const docsOrNull = (d: UnitDocuments | null | undefined): UnitDocuments | null => {
  const out: UnitDocuments = {}
  for (const k of UNIT_DOC_KEYS) if (d?.[k]) out[k] = d[k]
  return Object.keys(out).length ? out : null
}

/** One unit from the API, in the frontend EquipmentUnit shape. */
export const unitFrom = (r: UnitRecord): EquipmentUnit => ({
  id: r.id,
  assetCode: r.assetCode,
  type: r.type ?? '',
  makeModel: r.makeModel ?? '',
  regNo: r.regNo ?? '',
  chainageId: '',
  projectId: r.projectId ?? undefined,
  approvalRequestId: r.approvalRequestId ?? undefined,
  lat: r.lat,
  lng: r.lng,
  lastPing: r.lastPingAt ?? null,
  photoFileId: opt(r.photoFileId),
  documents: docsOrNull(r.documents) ?? undefined,
  availability: r.availability,
  name: opt(r.name),
  ownershipType: opt(r.ownershipType),
  manufacturer: opt(r.manufacturer),
  model: opt(r.model),
  mfgYear: opt(r.mfgYear),
  engineNo: opt(r.engineNo),
  chasisNo: opt(r.chasisNo),
  capacity: opt(r.capacity),
  capacityUnit: opt(r.capacityUnit),
  meterType: opt(r.meterType),
  meterReading: opt(r.meterReading),
  fuelType: opt(r.fuelType),
  fuelNorm: opt(r.fuelNorm),
  tankCapacity: opt(r.tankCapacity),
  owner: opt(r.owner),
  vendorId: opt(r.vendorId),
  hireRef: opt(r.hireRef),
  hiredFrom: opt(r.hiredFrom),
  hireStatus: r.hireStatus ?? undefined,
  overPlanReason: opt(r.overPlanReason),
  agreementStart: opt(r.agreementStart),
  agreementEnd: opt(r.agreementEnd),
  warrantyEnd: opt(r.warrantyEnd),
  warrantyReading: opt(r.warrantyReading),
  currentLocation: opt(r.currentLocation),
  invoiceNo: opt(r.invoiceNo),
  invoiceDate: opt(r.invoiceDate),
  regExpiry: opt(r.regExpiry),
  insuranceNo: opt(r.insuranceNo),
  insuranceExpiry: opt(r.insuranceExpiry),
  pucNo: opt(r.pucNo),
  pollutionExpiry: opt(r.pollutionExpiry),
  fitnessCert: opt(r.fitnessCert),
  fitnessExpiry: opt(r.fitnessExpiry),
  // the row version is what a PATCH must send back
  rowVersion: r.rowVersion,
  equipmentTypeId: r.equipmentTypeId,
})

/** The API body for a unit. The caller resolves the type id. */
export const draftFrom = (u: EquipmentUnit, equipmentTypeId: string): UnitDraft => ({
  assetCode: u.assetCode.trim(),
  equipmentTypeId,
  availability: u.availability,
  projectId: u.projectId ?? null,
  approvalRequestId: u.approvalRequestId ?? null,
  vendorId: text(u.vendorId),
  lat: u.lat,
  lng: u.lng,
  photoFileId: u.photoFileId ?? null,
  documents: docsOrNull(u.documents),
  name: text(u.name),
  makeModel: text(u.makeModel),
  regNo: text(u.regNo),
  currentLocation: text(u.currentLocation),
  ownershipType: text(u.ownershipType),
  manufacturer: text(u.manufacturer),
  model: text(u.model),
  mfgYear: text(u.mfgYear),
  engineNo: text(u.engineNo),
  chasisNo: text(u.chasisNo),
  capacity: text(u.capacity),
  capacityUnit: text(u.capacityUnit),
  meterType: text(u.meterType),
  meterReading: text(u.meterReading),
  fuelType: text(u.fuelType),
  fuelNorm: text(u.fuelNorm),
  tankCapacity: text(u.tankCapacity),
  owner: text(u.owner),
  hireRef: text(u.hireRef),
  hiredFrom: text(u.hiredFrom),
  hireStatus: u.hireStatus ?? null,
  // the reason belongs to the assignment: it goes when the unit has no project
  overPlanReason: u.projectId ? text(u.overPlanReason) : null,
  warrantyReading: text(u.warrantyReading),
  invoiceNo: text(u.invoiceNo),
  insuranceNo: text(u.insuranceNo),
  pucNo: text(u.pucNo),
  fitnessCert: text(u.fitnessCert),
  agreementStart: text(u.agreementStart),
  agreementEnd: text(u.agreementEnd),
  warrantyEnd: text(u.warrantyEnd),
  invoiceDate: text(u.invoiceDate),
  regExpiry: text(u.regExpiry),
  insuranceExpiry: text(u.insuranceExpiry),
  pollutionExpiry: text(u.pollutionExpiry),
  fitnessExpiry: text(u.fitnessExpiry),
})

const query = (f: UnitFilter) => {
  const qs = new URLSearchParams()
  if (f.equipmentTypeId) qs.set('equipmentTypeId', f.equipmentTypeId)
  if (f.status) qs.set('status', f.status)
  if (f.search) qs.set('search', f.search)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const listUnits = (f: UnitFilter = {}) => api<UnitRecord[]>('GET', `/equipment-units${query(f)}`)
export const createUnit = (d: UnitDraft, idempotencyKey?: string) =>
  api<UnitRecord>('POST', '/equipment-units', { body: d, idempotencyKey })
/** Sends the changed fields (any subset of the draft) with the row version the unit was read at. */
export const updateUnit = (id: string, rowVersion: number, patch: Partial<UnitDraft>, idempotencyKey?: string) =>
  api<UnitRecord>('PATCH', `/equipment-units/${encodeURIComponent(id)}`, { body: { ...patch, rowVersion }, idempotencyKey })
