import { api } from '@/shared/lib/api'
import type { Project, ProjectStatus } from '../types'

/** core_project as the API returns it (GET/POST/PATCH /projects). */
export interface ProjectRecord {
  id: string
  code: string
  name: string
  status: 'active' | 'inactive'
  client: string | null
  startDate: string | null
  endDate: string | null
  valueAmount: number | null
  description: string | null
  /** chainage range in km; both set together (start <= end), or both null */
  chainageStartKm?: number | null
  chainageEndKm?: number | null
  rowVersion: number
}

/** The fields the project form edits. */
export interface ProjectDetails {
  code: string
  name: string
  client: string
  startDate: string
  endDate: string
  status: ProjectStatus
  value: number
  description: string
}

/**
 * The backend keeps only active or inactive. Completed is stored as inactive; Planning, Active and On hold are
 * stored as active and read back as Active.
 */
export const toApiStatus = (s: ProjectStatus): ProjectRecord['status'] => (s === 'Completed' ? 'inactive' : 'active')
export const fromApiStatus = (s: ProjectRecord['status']): ProjectStatus => (s === 'inactive' ? 'Completed' : 'Active')

const emptyParts = (): Omit<Project, keyof ProjectDetails | 'id' | 'rowVersion'> => ({
  milestones: [],
  wbs: [],
  plan: { startDate: '', endDate: '', peakWorkforce: 0, workingDays: 'Mon–Sat', notes: '' },
  zones: [],
  chainage: { startKm: 0, endKm: 0, markers: [] },
  locationIds: [],
})

/**
 * Maps an API record onto the frontend Project. Milestones, WBS, zones, markers and locations are read separately,
 * so they are kept from the copy already in the store (or start empty). The chainage range comes from the record.
 */
export function fromRecord(r: ProjectRecord, local?: Project): Project {
  const base = local ?? emptyParts()
  const saved = typeof r.chainageStartKm === 'number' && typeof r.chainageEndKm === 'number'
  return {
    ...base,
    chainage: saved
      ? { ...base.chainage, startKm: r.chainageStartKm as number, endKm: r.chainageEndKm as number, rangeSaved: true }
      : { ...base.chainage, rangeSaved: false },
    id: r.id,
    code: r.code,
    name: r.name,
    client: r.client ?? '',
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
    status: fromApiStatus(r.status),
    value: r.valueAmount ?? 0,
    description: r.description ?? '',
    rowVersion: r.rowVersion,
  }
}

const toBody = (v: ProjectDetails) => ({
  code: v.code,
  name: v.name,
  status: toApiStatus(v.status),
  client: v.client || null,
  startDate: v.startDate || null,
  endDate: v.endDate || null,
  valueAmount: v.value,
  description: v.description.trim() || null,
})

export const listProjects = () => api<ProjectRecord[]>('GET', '/projects')

export const createProject = (v: ProjectDetails, idempotencyKey?: string) =>
  api<ProjectRecord>('POST', '/projects', { body: toBody(v), idempotencyKey })

export const updateProject = (id: string, rowVersion: number, v: ProjectDetails, idempotencyKey?: string) =>
  api<ProjectRecord>('PATCH', `/projects/${encodeURIComponent(id)}`, { body: { ...toBody(v), rowVersion }, idempotencyKey })

/** PATCH /projects/{id} with the chainage range (km, both >= 0, start <= end) and the row version last read. */
export const updateChainageRange = (id: string, rowVersion: number, startKm: number, endKm: number, idempotencyKey?: string) =>
  api<ProjectRecord>('PATCH', `/projects/${encodeURIComponent(id)}`, { body: { chainageStartKm: startKm, chainageEndKm: endKm, rowVersion }, idempotencyKey })
