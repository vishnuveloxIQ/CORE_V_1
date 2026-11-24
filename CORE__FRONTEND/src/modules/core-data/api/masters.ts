import { api } from '@/shared/lib/api'
import type { ChainageMarker, Site, Store } from '../types'
import type { LocationRecord, MarkerRecord } from './projectParts'

/**
 * Locations and stores (GET/POST/PATCH /locations and /stores), and the full chainage marker list the store
 * form picks from. The API never deletes either: they are deactivated through status.
 */

/** The location fields the form edits. projectId is fixed once the location exists. */
export type SiteDetails = Omit<Site, 'id' | 'projectId' | 'rowVersion'>

const siteBody = (v: SiteDetails) => ({
  code: v.code,
  name: v.name,
  status: v.status === 'Inactive' ? 'inactive' : 'active',
  addressLine: v.addressLine || null,
  city: v.city || null,
  state: v.state || null,
  pin: v.pin || null,
  inCharge: v.inCharge || null,
  phone: v.phone || null,
  email: v.email || null,
  latitude: v.latitude ?? null,
  longitude: v.longitude ?? null,
})

export const listAllLocations = () => api<LocationRecord[]>('GET', '/locations')
export const createLocation = (projectId: string, v: SiteDetails, idempotencyKey?: string) =>
  api<LocationRecord>('POST', '/locations', { body: { projectId, ...siteBody(v) }, idempotencyKey })
export const updateLocation = (id: string, rowVersion: number, v: SiteDetails, idempotencyKey?: string) =>
  api<LocationRecord>('PATCH', `/locations/${encodeURIComponent(id)}`, { body: { ...siteBody(v), rowVersion }, idempotencyKey })

// ---------- stores ----------
export interface StoreRecord {
  id: string; code: string; name: string; locationId: string; status: 'active' | 'inactive'
  locationText: string | null; keeper: string | null; phone: string | null; chainageMarkerId: string | null; rowVersion: number
}

/** `location` is the store's address text (core_store.location_text); `chainageId` is the marker id. */
export const storeFrom = (r: StoreRecord): Store => ({
  id: r.id, code: r.code, name: r.name, chainageId: r.chainageMarkerId ?? '', locationId: r.locationId,
  location: r.locationText ?? '', keeper: r.keeper ?? '', phone: r.phone ?? '', status: r.status === 'inactive' ? 'Inactive' : 'Active',
  rowVersion: r.rowVersion,
})

export type StoreDetails = Omit<Store, 'id' | 'rowVersion'>

const storeBody = (v: StoreDetails) => ({
  code: v.code,
  name: v.name,
  locationId: v.locationId,
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

/** Keeps the WBS code of a marker already read with its project (this list has no WBS nodes to resolve it). */
export const mergeMarker = (r: MarkerRecord, known?: ChainageMarker): ChainageMarker =>
  ({ id: r.id, code: r.code, km: r.chainageKm, label: r.label ?? '', wbsCode: known?.wbsCode ?? '', rowVersion: r.rowVersion })
