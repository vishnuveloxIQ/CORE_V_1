import { api } from '@/shared/lib/api'
import type { ChainageMarker, GeoShape, GeoZone, LatLng, Milestone, Site } from '../types'

/**
 * The parts of a project the API keeps in their own tables: milestones, chainage markers, geo zones
 * and locations. Each read is filtered by ?projectId=. Writes send an Idempotency-Key (POST, PATCH) and the
 * row version (PATCH).
 */

const q = (projectId: string) => `?projectId=${encodeURIComponent(projectId)}`
const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`

// ---------- milestones ----------
export interface MilestoneRecord { id: string; projectId: string; name: string; dueDate: string | null; weight: number | null; status: 'pending' | 'achieved' | 'cancelled'; rowVersion: number }

const MS_TO_API: Record<Milestone['status'], MilestoneRecord['status']> = { 'Not started': 'pending', 'In progress': 'pending', Done: 'achieved', Cancelled: 'cancelled' }
const MS_FROM_API: Record<MilestoneRecord['status'], Milestone['status']> = { pending: 'Not started', achieved: 'Done', cancelled: 'Cancelled' }

export const milestoneFrom = (r: MilestoneRecord): Milestone =>
  ({ id: r.id, name: r.name, due: r.dueDate ?? '', weight: r.weight ?? 0, status: MS_FROM_API[r.status], rowVersion: r.rowVersion })
const milestoneBody = (m: Omit<Milestone, 'id' | 'rowVersion'>) =>
  ({ name: m.name, dueDate: m.due || null, weight: m.weight, status: MS_TO_API[m.status] })

export const listMilestones = (projectId: string) => api<MilestoneRecord[]>('GET', `/milestones${q(projectId)}`)
export const createMilestone = (projectId: string, m: Omit<Milestone, 'id' | 'rowVersion'>) =>
  api<MilestoneRecord>('POST', '/milestones', { body: { projectId, ...milestoneBody(m) } })
export const updateMilestone = (id: string, rowVersion: number, m: Omit<Milestone, 'id' | 'rowVersion'>) =>
  api<MilestoneRecord>('PATCH', path('/milestones', id), { body: { ...milestoneBody(m), rowVersion } })
export const deleteMilestone = (id: string) => api<{ deleted: true }>('DELETE', path('/milestones', id))

// ---------- chainage markers ----------
export interface MarkerRecord { id: string; code: string; label: string | null; projectId: string; chainageKm: number; rowVersion: number }

export const markerFrom = (r: MarkerRecord): ChainageMarker =>
  ({ id: r.id, code: r.code, km: r.chainageKm, label: r.label ?? '', rowVersion: r.rowVersion })
/** The marker code the API needs: CH- and the km, e.g. CH-12.5 (unique because a km holds one marker). */
export const markerCode = (km: number) => `CH-${Number(km.toFixed(3))}`
export const listMarkers = (projectId: string) => api<MarkerRecord[]>('GET', `/chainage-markers${q(projectId)}`)
export const createMarker = (projectId: string, m: { km: number; label: string }) =>
  api<MarkerRecord>('POST', '/chainage-markers', {
    body: { projectId, code: markerCode(m.km), label: m.label || null, chainageKm: m.km },
  })
export const updateMarker = (id: string, rowVersion: number, m: { km: number; label: string }, idempotencyKey?: string) =>
  api<MarkerRecord>('PATCH', path('/chainage-markers', id), {
    body: { code: markerCode(m.km), label: m.label || null, chainageKm: m.km, rowVersion },
    idempotencyKey,
  })
export const deleteMarker = (id: string) => api<{ deleted: true }>('DELETE', path('/chainage-markers', id))

// ---------- geo zones ----------
export interface GeoZoneRecord {
  id: string; projectId: string; label: string; zoneType: 'attendance' | 'equipment'; shape: 'circle' | 'polygon' | 'corridor'
  centerLat: number | null; centerLng: number | null; radiusM: number | null; points: LatLng[] | null; bufferM: number | null
  version: number; rowVersion: number; updatedAt: string
}

const SHAPE_TO_API: Record<GeoShape, GeoZoneRecord['shape']> = { Radius: 'circle', Polygon: 'polygon', Linear: 'corridor' }
const SHAPE_FROM_API: Record<GeoZoneRecord['shape'], GeoShape> = { circle: 'Radius', polygon: 'Polygon', corridor: 'Linear' }

export const zoneFrom = (r: GeoZoneRecord): GeoZone => ({
  id: r.id,
  label: r.label,
  type: 'Other',
  purpose: r.zoneType === 'equipment' ? 'Equipment' : 'Attendance',
  shape: SHAPE_FROM_API[r.shape],
  centerLat: r.centerLat ?? 0,
  centerLng: r.centerLng ?? 0,
  radiusM: r.radiusM ?? 0,
  points: r.points ?? [],
  bufferM: r.bufferM ?? 0,
  version: r.version,
  rowVersion: r.rowVersion,
  updatedAt: r.updatedAt,
  updatedBy: '',
})

/** The zone fields the editor produces. */
export type ZoneDraft = Pick<GeoZone, 'label' | 'shape' | 'centerLat' | 'centerLng' | 'radiusM' | 'points' | 'bufferM'> & { purpose: 'Attendance' | 'Equipment' }

/** Each shape sends only its own fields: a circle has no points; only a corridor has a buffer. */
const zoneBody = (z: ZoneDraft) => ({
  label: z.label,
  zoneType: z.purpose === 'Equipment' ? 'equipment' : 'attendance',
  shape: SHAPE_TO_API[z.shape],
  centerLat: z.centerLat,
  centerLng: z.centerLng,
  radiusM: z.shape === 'Radius' ? z.radiusM : null,
  points: z.shape === 'Radius' ? null : z.points,
  bufferM: z.shape === 'Linear' ? z.bufferM : null,
})

/** The zones of one project, or of the whole company when no project is given. */
export const listZones = (projectId?: string) => api<GeoZoneRecord[]>('GET', `/geo-zones${projectId ? q(projectId) : ''}`)
export const createZone = (projectId: string, z: ZoneDraft, idempotencyKey?: string) =>
  api<GeoZoneRecord>('POST', '/geo-zones', { body: { projectId, ...zoneBody(z) }, idempotencyKey })
export const updateZone = (id: string, rowVersion: number, z: ZoneDraft, idempotencyKey?: string) =>
  api<GeoZoneRecord>('PATCH', path('/geo-zones', id), { body: { ...zoneBody(z), rowVersion }, idempotencyKey })
export const deleteZone = (id: string) => api<{ deleted: true }>('DELETE', path('/geo-zones', id))

// ---------- locations (read here; created and edited from the Locations module) ----------
export interface LocationRecord {
  id: string; code: string; name: string; projectId: string; status: 'active' | 'inactive'
  addressLine: string | null; city: string | null; state: string | null; pin: string | null
  inCharge: string | null; phone: string | null; email: string | null; rowVersion: number
  latitude?: number | null; longitude?: number | null
}

export const siteFrom = (r: LocationRecord): Site => ({
  id: r.id, code: r.code, name: r.name, addressLine: r.addressLine ?? '', city: r.city ?? '', state: r.state ?? '', pin: r.pin ?? '',
  inCharge: r.inCharge ?? '', phone: r.phone ?? '', email: r.email ?? '', status: r.status === 'inactive' ? 'Inactive' : 'Active',
  projectId: r.projectId, latitude: r.latitude ?? null, longitude: r.longitude ?? null, rowVersion: r.rowVersion,
})
export const listLocations = (projectId: string) => api<LocationRecord[]>('GET', `/locations${q(projectId)}`)
