import { api } from '@/shared/lib/api'

/**
 * Approved people (API 1.23.0, /approved-people). Reads need a signed-in user; writes need organisation.manage. A
 * person starts Approved and moves forward with PATCH status: Approved, With HRMS, Onboarded.
 */
export type ApprovedPersonStatus = 'Approved' | 'With HRMS' | 'Onboarded'

export interface ApprovedPersonRecord {
  id: string
  projectId: string
  department: string
  name: string
  designation: string
  joiningDate: string
  status: ApprovedPersonStatus
  reason: string | null
  reasonRequestedAt: string | null
  rowVersion: number
}

/** The fields a person is added or edited with. */
export interface ApprovedPersonDraft { projectId: string; department: string; name: string; designation: string; joiningDate: string }

const path = (id: string) => `/approved-people/${encodeURIComponent(id)}`

export const listApprovedPeople = (projectId?: string) =>
  api<ApprovedPersonRecord[]>('GET', projectId ? `/approved-people?projectId=${encodeURIComponent(projectId)}` : '/approved-people')
export const createApprovedPerson = (d: ApprovedPersonDraft, idempotencyKey?: string) =>
  api<ApprovedPersonRecord>('POST', '/approved-people', { body: d, idempotencyKey })
export const updateApprovedPerson = (
  id: string,
  rowVersion: number,
  patch: Partial<ApprovedPersonDraft> & { status?: ApprovedPersonStatus; reason?: string | null; reasonRequestedAt?: string | null },
  idempotencyKey?: string,
) => api<ApprovedPersonRecord>('PATCH', path(id), { body: { ...patch, rowVersion }, idempotencyKey })
export const deleteApprovedPerson = (id: string) => api<void>('DELETE', path(id))
