import { api } from '@/shared/lib/api'
import type { ExecutionMode, Project, ProjectStatus, ProjectType } from '../types'

/** core_project status as the API sends it. */
export type ProjectApiStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'inactive'

/** core_project as the API returns it (GET/POST/PATCH /projects). */
export interface ProjectRecord {
  id: string
  code: string
  name: string
  status: ProjectApiStatus
  client: string | null
  consultantName?: string | null
  state?: string | null
  executionMode?: ExecutionMode | null
  department?: string | null
  projectType?: ProjectType | null
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
  consultantName?: string
  state?: string
  executionMode?: ExecutionMode | ''
  /** the owning department: a listed name, or the name typed for "Other" */
  department?: string
  projectType?: ProjectType | ''
  startDate: string
  endDate: string
  status: ProjectStatus
  value: number
  description: string
}

const API_STATUS: Record<ProjectStatus, ProjectApiStatus> = {
  Planning: 'planning',
  Active: 'active',
  'On hold': 'on_hold',
  Completed: 'completed',
  Inactive: 'inactive',
}
const UI_STATUS = Object.fromEntries(Object.entries(API_STATUS).map(([ui, api]) => [api, ui])) as Record<ProjectApiStatus, ProjectStatus>

export const toApiStatus = (s: ProjectStatus): ProjectApiStatus => API_STATUS[s]
/** A project with no status, or one the page does not know, is shown as Inactive. */
export const fromApiStatus = (s: ProjectApiStatus | null | undefined): ProjectStatus => (s && UI_STATUS[s]) || 'Inactive'

const emptyParts = (): Omit<Project, keyof ProjectDetails | 'id' | 'rowVersion'> => ({
  milestones: [],
  plan: { startDate: '', endDate: '', peakWorkforce: 0, workingDays: 'Mon–Sat', notes: '' },
  zones: [],
  chainage: { startKm: 0, endKm: 0, markers: [] },
})

/**
 * Maps an API record onto the frontend Project. Milestones, zones, markers and locations are read separately,
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
    consultantName: r.consultantName ?? '',
    state: r.state ?? '',
    executionMode: r.executionMode ?? '',
    department: r.department ?? '',
    projectType: r.projectType ?? '',
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
  consultantName: (v.consultantName ?? '').trim() || null,
  state: v.state || null,
  executionMode: v.executionMode || null,
  department: (v.department ?? '').trim() || null,
  projectType: v.projectType || null,
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
