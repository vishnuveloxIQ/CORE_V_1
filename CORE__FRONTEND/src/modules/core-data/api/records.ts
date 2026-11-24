import { api } from '@/shared/lib/api'

/**
 * Record tables: the append-only timeline (GET/POST /record-timeline), usage counters (GET /usage-counters and
 * POST /usage-counters/increment), and import batches (/import-batches, with submit and rows) with their rows
 * (GET /import-rows). The server parses no file; rows are posted as raw values.
 */

const id = (v: string) => encodeURIComponent(v)
const query = (p: Record<string, string | undefined>) => {
  const qs = Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')
  return qs ? `?${qs}` : ''
}

// ---------- record timeline ----------
export interface TimelineRecord {
  id: string; entityType: string; entityId: string; action: string; actorId: string | null; statusDimension: string | null
  oldStatus: string | null; newStatus: string | null; remarks: string | null; correlationId: string | null
  occurredAt: string; details: Record<string, unknown> | null; isInternal: boolean
}
export interface TimelineDraft {
  entityType: string; entityId: string; action: string; statusDimension?: string; oldStatus?: string; newStatus?: string
  remarks?: string; correlationId?: string; occurredAt?: string; details?: Record<string, unknown>; isInternal?: boolean
}
export const listTimeline = (entityType?: string, entityId?: string) => api<TimelineRecord[]>('GET', `/record-timeline${query({ entityType, entityId })}`)
export const addTimelineEntry = (e: TimelineDraft, idempotencyKey?: string) => api<TimelineRecord>('POST', '/record-timeline', { body: e, idempotencyKey })

// ---------- usage counters ----------
export interface UsageCounterRecord { id: string; metric: string; scopeKey: string; weekStart: string; counterValue: number }
export const listUsageCounters = (metric?: string, scopeKey?: string) => api<UsageCounterRecord[]>('GET', `/usage-counters${query({ metric, scopeKey })}`)
/** weekStart is a YYYY-MM-DD date. Creates the counter or adds `by` to it. */
export const incrementUsage = (c: { metric: string; scopeKey: string; weekStart: string; by: number }, idempotencyKey?: string) =>
  api<UsageCounterRecord>('POST', '/usage-counters/increment', { body: c, idempotencyKey })

// ---------- import batches and rows ----------
export interface ImportBatchRecord {
  id: string; batchCode: string; importType: string; uploadFileId: string | null; templateVersion: string; uploadedBy: string | null
  totalRows: number; validRows: number; errorRows: number; status: string; submittedAt: string | null; requesterMode: string | null
  expiresAt: string | null; rowVersion: number
}
export interface ImportBatchDraft { batchCode: string; importType: string; templateVersion: string; uploadFileId?: string | null; requesterMode?: string | null; expiresAt?: string | null }
export interface ImportRowRecord {
  id: string; batchId: string; rowNumber: number; rawValues: Record<string, unknown>; validatedValues: Record<string, unknown> | null
  errorMessages: unknown; linkedRecordType: string | null; linkedRecordId: string | null; status: string; createdIds: unknown; rowVersion: number
}
export const listImportBatches = (status?: string, importType?: string) => api<ImportBatchRecord[]>('GET', `/import-batches${query({ status, importType })}`)
export const getImportBatch = (batchId: string) => api<ImportBatchRecord>('GET', `/import-batches/${id(batchId)}`)
export const createImportBatch = (b: ImportBatchDraft, idempotencyKey?: string) => api<ImportBatchRecord>('POST', '/import-batches', { body: b, idempotencyKey })
export const addImportRow = (batchId: string, row: { rowNumber: number; rawValues: Record<string, unknown> }, idempotencyKey?: string) =>
  api<ImportRowRecord>('POST', `/import-batches/${id(batchId)}/rows`, { body: row, idempotencyKey })
export const submitImportBatch = (batchId: string, rowVersion: number, idempotencyKey?: string) =>
  api<ImportBatchRecord>('POST', `/import-batches/${id(batchId)}/submit`, { body: { rowVersion }, idempotencyKey })
export const listImportRows = (batchId?: string, status?: string) => api<ImportRowRecord[]>('GET', `/import-rows${query({ batchId, status })}`)
export const getImportRow = (rowId: string) => api<ImportRowRecord>('GET', `/import-rows/${id(rowId)}`)
