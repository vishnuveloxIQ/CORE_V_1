import { api } from '@/shared/lib/api'
import type { ApprovalChain, ApprovalRequest, MatrixLevel, MatrixVersion, ModuleName, CashLimitRow, CashLimitPriority, RequestAction, RequestPayload, RequestStatus, RequestType, TimeoutRule } from '../types'

/**
 * Approval chains, matrix versions and levels, cash limit rows, and approval requests with their actions
 * (/approval-chains, /matrix-versions, /matrix-levels, /cash-limit-rows, /approval-requests).
 */

const enc = encodeURIComponent
const list = <T>(path: string) => api<T[]>('GET', path)

// ---------- records as the API returns them ----------
export interface ChainRecord {
  id: string; scopeType: 'company' | 'project'; projectId: string | null; requestType: string; module: string; name: string
  timeoutHours: number | null; isActive: boolean; rowVersion: number
}
export interface MatrixVersionRecord {
  id: string; chainId: string; versionNo: number; effectiveFrom: string; publishedAt: string | null; reason: string | null; rowVersion: number
  updatedAt?: string
}
export type OnTimeoutApi = 'escalate' | 'auto_reject' | 'hold'
export interface MatrixLevelRecord {
  id: string; matrixVersionId: string; levelNo: number; amountFrom: number | null; amountTo: number | null
  approverRoleId: string | null; approverUserId: string | null; escalateToUserId: string | null
  timeoutHours: number | null; onTimeout: OnTimeoutApi | null; cashLimitInr: number | null; rowVersion: number
}
export interface CashLimitRecord {
  id: string; tier: number; priority: 'low' | 'normal' | 'high' | 'urgent'; amountInr: number; days: number; hours: number; minutes: number; isFinal: boolean; rowVersion: number
}
export type RequestStatusApi = 'pending' | 'approved' | 'rejected' | 'returned' | 'cancelled' | 'clarification_requested'
export interface RequestRecord {
  id: string; code: string; requestType: string; module: string; title: string; amount: number | null; status: RequestStatusApi; emergency: boolean; neededBy?: string | null
  locationId: string | null; chainageMarkerId: string | null; raisedById: string | null; raisedByName: string | null; raisedAt: string
  chainId: string | null; matrixVersionId: string | null; matrixVersion: number | null; currentLevel: number | null
  payloadJson: RequestPayload | Record<string, unknown> | null; assignedActorId: string | null; decidedAt: string | null; rowVersion: number
  publishedLocationId?: string | null; publishedAt?: string | null
  /** the matching levels as they were when the request was raised */
  levelsSnapshot?: MatrixLevelRecord[] | null
}
export interface ActionRecord {
  id: string; levelNo: number; actorId: string | null; action: 'approve' | 'reject' | 'return' | 'cancel' | 'clarify' | 'respond'; comment: string | null; actedAt: string; amountApproved: number | null
  /** the approver's choice (max 100 characters), when one was sent */
  decision?: string | null
}

// ---------- chains, versions, levels, cash limits ----------
export const listChains = () => list<ChainRecord>('/approval-chains')
export const listMatrixVersions = (chainId?: string) => list<MatrixVersionRecord>(`/matrix-versions${chainId ? `?chainId=${enc(chainId)}` : ''}`)
export const listMatrixLevels = (matrixVersionId?: string) => list<MatrixLevelRecord>(`/matrix-levels${matrixVersionId ? `?matrixVersionId=${enc(matrixVersionId)}` : ''}`)

export interface ChainBody {
  scopeType: 'company' | 'project'; projectId?: string; requestType: string; module: string; name: string; timeoutHours?: number | null; isActive?: boolean
}
export const createChain = (body: ChainBody, idempotencyKey?: string) => api<ChainRecord>('POST', '/approval-chains', { body, idempotencyKey })
export const updateChain = (id: string, rowVersion: number, body: Partial<ChainBody>, idempotencyKey?: string) =>
  api<ChainRecord>('PATCH', `/approval-chains/${enc(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
export const deleteChain = (id: string) => api<unknown>('DELETE', `/approval-chains/${enc(id)}`)

export const createMatrixVersion = (body: { chainId: string; effectiveFrom: string; reason?: string; versionNo?: number }, idempotencyKey?: string) =>
  api<MatrixVersionRecord>('POST', '/matrix-versions', { body, idempotencyKey })
export const updateMatrixVersion = (id: string, rowVersion: number, body: { effectiveFrom?: string; reason?: string }, idempotencyKey?: string) =>
  api<MatrixVersionRecord>('PATCH', `/matrix-versions/${enc(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
export const deleteMatrixVersion = (id: string) => api<unknown>('DELETE', `/matrix-versions/${enc(id)}`)
/** Publishing makes the version immutable; the row version guards against publishing a stale read. */
export const publishMatrixVersion = (id: string, rowVersion: number, idempotencyKey?: string) =>
  api<MatrixVersionRecord>('POST', `/matrix-versions/${enc(id)}/publish`, { body: { rowVersion }, idempotencyKey })

export interface LevelBody {
  matrixVersionId: string; levelNo: number; amountFrom?: number; amountTo?: number | null; approverRoleId?: string; approverUserId?: string
  escalateToUserId?: string; timeoutHours?: number | null; onTimeout?: OnTimeoutApi | null; cashLimitInr?: number | null
}
export const createMatrixLevel = (body: LevelBody, idempotencyKey?: string) => api<MatrixLevelRecord>('POST', '/matrix-levels', { body, idempotencyKey })
export const updateMatrixLevel = (id: string, rowVersion: number, body: Partial<Omit<LevelBody, 'matrixVersionId'>>, idempotencyKey?: string) =>
  api<MatrixLevelRecord>('PATCH', `/matrix-levels/${enc(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
export const deleteMatrixLevel = (id: string) => api<unknown>('DELETE', `/matrix-levels/${enc(id)}`)

export interface CashLimitBody { tier: number; priority: CashLimitRecord['priority']; amountInr: number; days: number; hours: number; minutes: number; isFinal?: boolean }
export const listCashLimitRows = () => list<CashLimitRecord>('/cash-limit-rows')
export const createCashLimitRow = (body: CashLimitBody, idempotencyKey?: string) => api<CashLimitRecord>('POST', '/cash-limit-rows', { body, idempotencyKey })
export const updateCashLimitRow = (id: string, rowVersion: number, body: Partial<CashLimitBody>, idempotencyKey?: string) =>
  api<CashLimitRecord>('PATCH', `/cash-limit-rows/${enc(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
export const deleteCashLimitRow = (id: string) => api<unknown>('DELETE', `/cash-limit-rows/${enc(id)}`)

// The screen shows two priorities (Emergency, Normal); the API has four. TODO(backend): confirm how low, normal, high and urgent map to the two.
const cashPriorityFrom = (p: CashLimitRecord['priority']): CashLimitPriority => (p === 'urgent' || p === 'high' ? 'Emergency' : 'Normal')
const cashPriorityTo = (p: CashLimitPriority): CashLimitRecord['priority'] => (p === 'Emergency' ? 'urgent' : 'normal')
export const cashLimitFrom = (r: CashLimitRecord): CashLimitRow =>
  ({ id: r.id, rowVersion: r.rowVersion, tier: r.tier, priority: cashPriorityFrom(r.priority), amount: r.amountInr, days: r.days, hours: r.hours, minutes: r.minutes, final: r.isFinal })
/** The API needs an amount on every row; a final row has none on screen, so it is sent as 0. */
export const cashLimitBody = (r: CashLimitRow): CashLimitBody =>
  ({ tier: r.tier, priority: cashPriorityTo(r.priority), amountInr: r.amount ?? 0, days: r.days, hours: r.hours, minutes: r.minutes, isFinal: !!r.final })

// ---------- requests ----------
export const listRequests = (status?: RequestStatusApi) => list<RequestRecord>(`/approval-requests${status ? `?status=${status}` : ''}`)
export const getRequest = (id: string) => api<RequestRecord>('GET', `/approval-requests/${enc(id)}`)
export interface RaiseBody {
  requestType: string; module: string; amount: number; projectId?: string; locationId?: string; chainageMarkerId?: string
  title: string; payload?: Record<string, unknown>; emergency?: boolean; neededBy?: string
}
export const raiseRequest = (body: RaiseBody, idempotencyKey?: string) => api<RequestRecord>('POST', '/approval-requests', { body, idempotencyKey })
export const listRequestActions = (id: string) => api<ActionRecord[]>('GET', `/approval-requests/${enc(id)}/actions`)
/**
 * Approve, reject, return, cancel, clarify (approver asks the raiser; comment required) or respond (raiser answers;
 * comment required). Approve, reject and return answer 409 while a clarification is open.
 */
export const actOnRequest = (id: string, rowVersion: number, body: { action: ActionRecord['action']; comment?: string; amountApproved?: number; decision?: string }, idempotencyKey?: string) =>
  api<RequestRecord>('POST', `/approval-requests/${enc(id)}/actions`, { body: { ...body, rowVersion }, idempotencyKey })
/** POST /approval-requests/{id}/publish (approvals.manage): an approved job opening, published to one location. */
export const publishJobOpening = (id: string, rowVersion: number, locationId: string, idempotencyKey?: string) =>
  api<RequestRecord>('POST', `/approval-requests/${enc(id)}/publish`, { body: { locationId, rowVersion }, idempotencyKey })

// ---------- record to UI mappers ----------
export const asUuid = (v: string | null | undefined) =>
  v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined

// TODO(backend): TimeoutRule 'Escalate to Tenant Admin' has no API mode (the API has escalate, auto_reject, hold); it is sent as escalate.
const TIMEOUT_FROM: Record<OnTimeoutApi, TimeoutRule> = { escalate: 'Escalate to next level', auto_reject: 'Escalate to next level', hold: 'Remind approver only' }
const TIMEOUT_TO: Record<TimeoutRule, OnTimeoutApi> = { 'Escalate to next level': 'escalate', 'Escalate to Tenant Admin': 'escalate', 'Remind approver only': 'hold' }

export const levelFrom = (r: MatrixLevelRecord): MatrixLevel => ({
  approverId: r.approverUserId ?? '',
  timeoutHours: r.timeoutHours ?? 0,
  onTimeout: r.onTimeout ? TIMEOUT_FROM[r.onTimeout] : 'Remind approver only',
  ...(r.cashLimitInr != null ? { cashLimit: r.cashLimitInr } : {}),
  ...(r.escalateToUserId ? { escalateToId: r.escalateToUserId } : {}),
  ...(r.approverRoleId ? { approverRoleId: r.approverRoleId } : {}),
})

/** One level as the create body, numbered by its position. */
export const levelBody = (matrixVersionId: string, l: MatrixLevel, levelNo: number): LevelBody => ({
  matrixVersionId, levelNo,
  approverUserId: asUuid(l.approverId),
  escalateToUserId: asUuid(l.escalateToId),
  timeoutHours: l.timeoutHours,
  onTimeout: TIMEOUT_TO[l.onTimeout],
  cashLimitInr: l.cashLimit ?? null,
})

/**
 * Builds the UI chains from the three lists. The API holds one project per chain, so a Project chain here has one scope id.
 * TODO(backend): field raisedBy not in API (kept from the local copy when there is one).
 */
export function chainsFrom(chains: ChainRecord[], versions: MatrixVersionRecord[], levels: MatrixLevelRecord[], known: ApprovalChain[] = []): ApprovalChain[] {
  return chains.map((c) => {
    const prev = known.find((k) => k.id === c.id)
    const mine = versions.filter((v) => v.chainId === c.id).sort((a, b) => a.versionNo - b.versionNo)
    return {
      id: c.id, name: c.name, requestType: c.requestType as RequestType, module: c.module as ModuleName, raisedBy: prev?.raisedBy ?? '',
      isActive: c.isActive, timeoutHours: c.timeoutHours ?? 48, scopeType: c.scopeType === 'project' ? 'Project' : 'Company',
      scopeIds: c.projectId ? [c.projectId] : [], rowVersion: c.rowVersion,
      versions: mine.map((v): MatrixVersion => ({
        version: v.versionNo, effectiveFrom: v.effectiveFrom, reason: v.reason ?? '',
        // TODO(backend): fields updatedBy and updatedAt are not on the version record (publishedAt stands in)
        updatedBy: '', updatedAt: v.updatedAt ?? v.publishedAt ?? '',
        levels: levels.filter((l) => l.matrixVersionId === v.id).sort((a, b) => a.levelNo - b.levelNo).map(levelFrom),
      })),
    }
  })
}

const statusFrom = (r: RequestRecord): RequestStatus =>
  r.status === 'approved' ? 'Approved'
    : r.status === 'clarification_requested' ? 'Clarification requested'
    : r.status === 'rejected' || r.status === 'cancelled' ? 'Rejected'
      : r.status === 'returned' || (r.currentLevel ?? 1) > 1 ? 'In review' : 'Pending'

/**
 * The payload is the frontend's own request payload, which the API keeps as payloadJson.
 * History comes from GET /approval-requests/{id}/actions (loadRequestActions); until then the existing copy is kept.
 */
export function requestFrom(r: RequestRecord, local?: ApprovalRequest): ApprovalRequest {
  return {
    history: [], ...local,
    id: r.id, code: r.code, type: r.requestType as RequestType, module: r.module as ModuleName, title: r.title,
    raisedBy: r.raisedByName ?? '', raisedById: r.raisedById, raisedAt: r.raisedAt, chainageId: r.chainageMarkerId ?? '',
    emergency: r.emergency, neededBy: r.neededBy ?? null, status: statusFrom(r), currentLevel: r.currentLevel ?? 1, chainId: r.chainId ?? undefined,
    matrixVersion: r.matrixVersion ?? 1, payload: (r.payloadJson ?? local?.payload ?? {}) as RequestPayload, rowVersion: r.rowVersion,
    assignedActorId: r.assignedActorId, publishedLocationId: r.publishedLocationId ?? null, publishedAt: r.publishedAt ?? null,
    levelsSnapshot: (r.levelsSnapshot ?? []).map((l) => ({ levelNo: l.levelNo, ...levelFrom(l) })),
    locationId: r.locationId ?? null,
  }
}

export function actionFrom(a: ActionRecord, nameOf: (id: string | null) => string): RequestAction {
  return {
    level: a.levelNo, by: nameOf(a.actorId), at: a.actedAt, comment: a.comment ?? '',
    action: a.action === 'approve' ? 'Approved' : a.action === 'reject' || a.action === 'cancel' ? 'Rejected'
      : a.action === 'clarify' ? 'Clarification requested' : a.action === 'respond' ? 'Responded' : 'Commented',
    ...(a.amountApproved != null ? { amountApproved: a.amountApproved } : {}),
    ...(a.decision ? { decision: a.decision } : {}),
  }
}

export const toApiAction = (a: 'Approved' | 'Rejected'): 'approve' | 'reject' => (a === 'Approved' ? 'approve' : 'reject')
