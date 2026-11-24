import { api } from '@/shared/lib/api'
import type { Grievance, GrievanceStatus } from '../types'

/** /grievances (writes need records.manage). */

export type GrievanceStatusApi = 'open' | 'in_review' | 'resolved' | 'closed'
/** Head Office visit status (visitStatus); separate from the grievance's own status. */
export type VisitStatusApi = 'requested' | 'confirmed' | 'rescheduled' | 'visited' | 'not_visited'
export interface GrievanceRecord {
  id: string; code: string; subject: string; message: string | null; status: GrievanceStatusApi; closedAt: string | null
  sourceModule: string | null; sourceRecordId: string | null; raisedBy: string | null; raisedByName: string | null; raisedAt: string
  employeeId: string | null; employeeCode: string | null; visitDate: string | null; rowVersion: number
  /** Head Office visit status; null when not set (the UI then reads it from `status`) */
  visitStatus?: VisitStatusApi | null
  /** CORE's visit note (max 2000); null when none */
  note?: string | null
}

const VISIT_TO_API: Record<GrievanceStatus, VisitStatusApi> = {
  Requested: 'requested', Confirmed: 'confirmed', Rescheduled: 'rescheduled', Visited: 'visited', 'Not visited': 'not_visited',
}
const VISIT_FROM_API: Record<VisitStatusApi, GrievanceStatus> = {
  requested: 'Requested', confirmed: 'Confirmed', rescheduled: 'Rescheduled', visited: 'Visited', not_visited: 'Not visited',
}
/** The UI's visit status as visitStatus. */
export const toApiVisit = (s: GrievanceStatus): VisitStatusApi => VISIT_TO_API[s]
/** visitStatus as the UI's visit status; null or an unknown value gives undefined. */
export const fromApiVisit = (v: VisitStatusApi | null | undefined): GrievanceStatus | undefined => (v ? VISIT_FROM_API[v] : undefined)

/**
 * The grievance's own status (open, in_review, resolved, closed) that goes with a visit status: Requested is open,
 * Confirmed and Rescheduled are in review, Visited is resolved and Not visited is closed.
 */
export const toApiStatus = (s: GrievanceStatus): GrievanceStatusApi =>
  s === 'Requested' ? 'open' : s === 'Visited' ? 'resolved' : s === 'Not visited' ? 'closed' : 'in_review'
export const fromApiStatus = (s: GrievanceStatusApi): GrievanceStatus =>
  s === 'open' ? 'Requested' : s === 'resolved' ? 'Visited' : s === 'closed' ? 'Not visited' : 'Confirmed'

/** The visit status shown for a record: visitStatus when set, else the one read from the coarse status (older rows). */
export const visitStatusOf = (r: Pick<GrievanceRecord, 'status' | 'visitStatus'>): GrievanceStatus => fromApiVisit(r.visitStatus) ?? fromApiStatus(r.status)

/** The status history is not stored by the API, so the history already in the store is kept (or starts with the current status). */
export function grievanceFrom(r: GrievanceRecord, local?: Grievance): Grievance {
  const status = visitStatusOf(r)
  return {
    id: r.id, code: r.code, raisedBy: r.raisedByName ?? '', raisedById: r.raisedBy ?? '', employeeId: r.employeeId ?? undefined,
    employeeCode: r.employeeCode ?? undefined,
    subject: r.subject, sourceModule: r.sourceModule ?? undefined, sourceRecordId: r.sourceRecordId ?? undefined,
    message: r.message ?? '', visitDate: r.visitDate ?? '', status, raisedAt: r.raisedAt, rowVersion: r.rowVersion, note: r.note ?? '',
    // TODO(backend): field history not in API
    history: local?.history ?? [{ status, at: r.raisedAt, note: '' }],
  }
}

export const listGrievances = () => api<GrievanceRecord[]>('GET', '/grievances')
export const getGrievance = (id: string) => api<GrievanceRecord>('GET', `/grievances/${encodeURIComponent(id)}`)
export const createGrievance = (body: { code: string; subject: string; message?: string; sourceModule?: string; sourceRecordId?: string; raisedBy?: string; raisedByName?: string; employeeId?: string; employeeCode?: string; visitDate?: string; visitStatus?: VisitStatusApi | null }, idempotencyKey?: string) =>
  api<GrievanceRecord>('POST', '/grievances', { body, idempotencyKey })
export const updateGrievance = (id: string, rowVersion: number, body: { status?: GrievanceStatusApi; visitStatus?: VisitStatusApi | null; visitDate?: string; subject?: string; message?: string; employeeCode?: string | null; note?: string | null }, idempotencyKey?: string) =>
  api<GrievanceRecord>('PATCH', `/grievances/${encodeURIComponent(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
export const deleteGrievance = (id: string) => api<unknown>('DELETE', `/grievances/${encodeURIComponent(id)}`)
