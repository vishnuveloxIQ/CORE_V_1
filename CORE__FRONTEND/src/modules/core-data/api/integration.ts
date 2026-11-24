import { api, apiPage } from '@/shared/lib/api'

/**
 * Integration events and read models (API 1.6.0; access.manage). The monitor never receives payload values, only the
 * payload's field names. The production event transport is an open owner decision (D13), so outbound events may stay
 * queued until a transport is configured.
 */

export type EventDirection = 'outbound' | 'inbound'
export type EventStatusApi = 'pending' | 'published' | 'received' | 'processed' | 'dead_lettered'

export interface IntegrationEvent {
  id: string
  direction: EventDirection
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  aggregateSeq: number | null
  sourceModule: string | null
  status: EventStatusApi
  attempts: number
  lastError: string | null
  nextAttemptAt: string | null
  occurredAt: string | null
  createdAt: string
  publishedAt: string | null
  processedAt: string | null
  deadLetteredAt: string | null
  replayStatus: 'requested' | 'replayed' | null
  correlationId: string | null
  payloadKeys: string[]
}

/** The state a person reads: queued, retrying, sent, received, processed or dead-letter. */
export type EventState = 'Queued' | 'Retrying' | 'Sent' | 'Received' | 'Processed' | 'Dead-letter'

export function eventState(e: Pick<IntegrationEvent, 'status' | 'attempts'>): EventState {
  switch (e.status) {
    case 'pending': return e.attempts > 0 ? 'Retrying' : 'Queued'
    case 'published': return 'Sent'
    case 'received': return 'Received'
    case 'processed': return 'Processed'
    case 'dead_lettered': return 'Dead-letter'
  }
}

export interface EventFilter {
  direction?: EventDirection
  status?: EventStatusApi
  eventType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

const qs = (f: object) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function listEvents(f: EventFilter = {}) {
  const { rows, meta } = await apiPage<IntegrationEvent>(`/integration-events${qs(f)}`)
  return { events: rows, total: Number(meta.total ?? rows.length) }
}
export const eventSummary = () =>
  api<{ counts: Array<{ direction: EventDirection; status: EventStatusApi; count: number }>; oldestPendingAt: string | null; deadLettered: number }>('GET', '/integration-events/summary')
export const replayEvent = (id: string) => api<IntegrationEvent>('POST', `/integration-events/${encodeURIComponent(id)}/replay`, { body: {} })

export interface RefRecord {
  id: string
  sourceModule: 'hrms' | 'pm' | 'pms' | 'stores'
  entityType: string
  sourceId: string
  sourceSeq: number
  deleted: boolean
  syncedAt: string
  data: Record<string, unknown>
}

export interface SyncStatus { sourceModule: string; entityType: string; records: number; lastSeq: number; lastSyncedAt: string }

export async function listRefRecords(f: { sourceModule?: string; entityType?: string; q?: string; limit?: number; offset?: number } = {}) {
  const { rows, meta } = await apiPage<RefRecord>(`/ref-records${qs(f)}`)
  return { records: rows, total: Number(meta.total ?? rows.length) }
}
export const syncStatus = () => api<SyncStatus[]>('GET', '/ref-records/sync-status')

export const MODULE_LABEL: Record<string, string> = { hrms: 'HRMS', pm: 'P&M', pms: 'PMS', stores: 'Stores', core: 'Core' }
