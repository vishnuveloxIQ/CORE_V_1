import { api } from '@/shared/lib/api'
import type { ChainageMarker, Store } from '../types'
import type { LocationRecord, MarkerRecord } from './projectParts'

/**
 * Locations (read only here) and stores (GET/POST/PATCH /stores), and the full chainage marker list the store
 * form picks from. The API never deletes either: they are deactivated through status.
 */

export const listAllLocations = () => api<LocationRecord[]>('GET', '/locations')

// ---------- stores ----------
export interface StoreRecord {
  id: string; code: string; name: string; projectId: string; status: 'active' | 'inactive'
  locationText: string | null; keeper: string | null; phone: string | null; chainageMarkerId: string | null; rowVersion: number
}

/** `location` is the store's address text (core_store.location_text); `chainageId` is the marker id. */
export const storeFrom = (r: StoreRecord): Store => ({
  id: r.id, code: r.code, name: r.name, chainageId: r.chainageMarkerId ?? '', projectId: r.projectId,
  location: r.locationText ?? '', keeper: r.keeper ?? '', phone: r.phone ?? '', status: r.status === 'inactive' ? 'Inactive' : 'Active',
  rowVersion: r.rowVersion,
})

export type StoreDetails = Omit<Store, 'id' | 'rowVersion'>

const storeBody = (v: StoreDetails) => ({
  code: v.code,
  name: v.name,
  projectId: v.projectId,
  status: v.status === 'Inactive' ? 'inactive' : 'active',
  locationText: v.location || null,
  keeper: v.keeper || null,
  phone: v.phone || null,
  chainageMarkerId: v.chainageId || null,
})

export const listStores = () => api<StoreRecord[]>('GET', '/stores')
export const createStore = (v: StoreDetails, idempotencyKey?: string) =>
  api<StoreRecord>('POST', '/stores', { body: storeBody(v), idempotencyKey })
export const updateStore = (id: string, rowVersion: number, v: StoreDetails, idempotencyKey?: string) =>
  api<StoreRecord>('PATCH', `/stores/${encodeURIComponent(id)}`, { body: { ...storeBody(v), rowVersion }, idempotencyKey })

// ---------- every chainage marker, for pickers across projects ----------
export const listAllMarkers = () => api<MarkerRecord[]>('GET', '/chainage-markers')

/** A marker from the all-projects list. */
export const mergeMarker = (r: MarkerRecord): ChainageMarker =>
  ({ id: r.id, code: r.code, km: r.chainageKm, label: r.label ?? '', rowVersion: r.rowVersion })
