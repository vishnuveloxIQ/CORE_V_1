import { api } from '@/shared/lib/api'
import type { Material, Vendor } from '../types'
import { uomCodeOf, type UomRecord } from './uoms'

/**
 * Materials, vendors and major material allocations (GET/POST/PATCH /materials and /vendors, /major-material-allocations).
 * Materials and vendors are never deleted: they are deactivated through status.
 */

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`

// ---------- materials ----------
export interface MaterialRecord {
  id: string; code: string; name: string; uomId: string; status: 'active' | 'inactive'; hsn: string | null
  reorderLevel: number | null; category: string | null; subCategory: string | null; rowVersion: number
}

/** `storeIds` is not in the API, so it is kept from the row already on screen. The unit text is the uom's code from GET /uoms. */
export const materialFrom = (r: MaterialRecord, uoms: UomRecord[], known?: Material): Material => ({
  id: r.id, code: r.code, name: r.name, category: r.category ?? '', uom: uomCodeOf(uoms, r.uomId), hsn: r.hsn ?? '',
  reorderLevel: r.reorderLevel ?? 0, storeIds: known?.storeIds ?? [], // TODO(backend): field storeIds not in API
  status: r.status === 'inactive' ? 'Inactive' : 'Active', uomId: r.uomId, rowVersion: r.rowVersion,
})

export type MaterialDetails = Omit<Material, 'id' | 'uomId' | 'rowVersion'>
const materialBody = (v: MaterialDetails, uomId: string) => ({
  code: v.code, name: v.name, uomId, status: v.status === 'Inactive' ? 'inactive' : 'active',
  hsn: v.hsn || null, reorderLevel: v.reorderLevel, category: v.category || null,
})

export const listMaterials = () => api<MaterialRecord[]>('GET', '/materials')
/** uomId is the GET /uoms id of the unit (the caller resolves it from the unit text). */
export const createMaterial = (v: MaterialDetails, uomId: string, idempotencyKey?: string) =>
  api<MaterialRecord>('POST', '/materials', { body: materialBody(v, uomId), idempotencyKey })
export const updateMaterial = (id: string, rowVersion: number, v: MaterialDetails, uomId: string, idempotencyKey?: string) =>
  api<MaterialRecord>('PATCH', path('/materials', id), { body: { ...materialBody(v, uomId), rowVersion }, idempotencyKey })

// ---------- vendors ----------
export interface VendorRecord {
  id: string; code: string; name: string; status: 'active' | 'inactive'; gstin: string | null; pan: string | null
  email: string | null; phone: string | null; address: string | null; registeredBy: string | null; verifiedAt: string | null; rowVersion: number
}

/** The API has no Pending state: a vendor is Active or Inactive, and verifiedAt says whether the bank check is done. */
export const vendorFrom = (r: VendorRecord): Vendor & { rowVersion: number } => ({
  id: r.id, code: r.code, name: r.name, status: r.status === 'inactive' ? 'Inactive' : 'Active', gstin: r.gstin ?? '', pan: r.pan ?? '',
  email: r.email ?? '', phone: r.phone ?? '', address: r.address ?? '', registeredBy: r.registeredBy ?? '', verifiedAt: r.verifiedAt, rowVersion: r.rowVersion,
})
export type VendorDetails = Pick<Vendor, 'code' | 'name' | 'gstin' | 'pan' | 'email' | 'phone' | 'address'> & { status?: 'Active' | 'Inactive' }
const vendorBody = (v: VendorDetails) => ({
  code: v.code, name: v.name, status: v.status === 'Inactive' ? 'inactive' : v.status === 'Active' ? 'active' : undefined,
  gstin: v.gstin || null, pan: v.pan || null, email: v.email || null, phone: v.phone || null, address: v.address || null,
})
export const listVendors = () => api<VendorRecord[]>('GET', '/vendors')
export const createVendor = (v: VendorDetails, idempotencyKey?: string) => api<VendorRecord>('POST', '/vendors', { body: vendorBody(v), idempotencyKey })
export const updateVendor = (id: string, rowVersion: number, v: VendorDetails, idempotencyKey?: string) =>
  api<VendorRecord>('PATCH', path('/vendors', id), { body: { ...vendorBody(v), rowVersion }, idempotencyKey })
export const verifyVendor = (id: string, rowVersion: number, idempotencyKey?: string) =>
  api<VendorRecord>('POST', `${path('/vendors', id)}/verify`, { body: { rowVersion }, idempotencyKey })

// ---------- major material allocations ----------
export interface AllocationRecord {
  id: string; projectId: string; materialId: string; uomId: string; quantity: number; requiredBy: string | null; unit: string | null; rowVersion: number
}
export interface AllocationDraft { projectId: string; materialId: string; uomId: string; quantity: number; requiredBy: string }

export const listAllocations = (projectId?: string) =>
  api<AllocationRecord[]>('GET', `/major-material-allocations${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)
export const createAllocation = (a: AllocationDraft, idempotencyKey?: string) =>
  api<AllocationRecord>('POST', '/major-material-allocations', { body: { ...a, requiredBy: a.requiredBy || null }, idempotencyKey })
/** The project is fixed after create, so it is not sent. */
export const updateAllocation = (id: string, rowVersion: number, a: Omit<AllocationDraft, 'projectId'>, idempotencyKey?: string) =>
  api<AllocationRecord>('PATCH', path('/major-material-allocations', id), { body: { ...a, requiredBy: a.requiredBy || null, rowVersion }, idempotencyKey })
export const deleteAllocation = (id: string) => api<{ deleted: true }>('DELETE', path('/major-material-allocations', id))
