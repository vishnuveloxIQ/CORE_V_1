import { apiPage } from '@/shared/lib/api'
import type { AuditEntry } from '../types'

/** The audit trail (GET /audit-log): read-only, newest first, paged. The server writes every row; the frontend only reads. */

/** One entry as the API returns it. before and after are the stored snapshots as JSON text. */
export interface AuditRecord {
  id: string
  at: string | null
  user: string | null
  action: string
  entity: string
  entityId: string | null
  before: string
  after: string
  module?: string
}

export type AuditAction = 'created' | 'updated' | 'deleted'

export interface AuditFilter {
  /** calendar dates, YYYY-MM-DD, inclusive, UTC */
  from?: string
  to?: string
  /** table name, e.g. core_equipment_unit */
  entityType?: string
  action?: AuditAction
  /** core, hrms, pm, pms or stores */
  module?: string
  /** name or login, a substring */
  actor?: string
  limit?: number
  offset?: number
}

/** The tables the API names in its entity labels, for the Area filter. */
export const AUDIT_AREAS: [table: string, label: string][] = [
  ['core_company_profile', 'Company'], ['core_vendor', 'Vendor'], ['core_role', 'Role'], ['core_equipment_type', 'Equipment type'],
  ['core_equipment_unit', 'Equipment unit'], ['core_location', 'Location'], ['core_project', 'Project'], ['core_store', 'Store'],
  ['core_material', 'Material'], ['core_major_material_allocation', 'Material allocation'], ['core_equipment_assignment', 'Equipment assignment'],
  ['core_plan_line', 'Plan line'], ['core_stock_level', 'Stock level'], ['core_user', 'User'], ['core_user_access', 'User access'],
  ['core_policy', 'Policy'], ['core_policy_version', 'Policy version'], ['core_approval_chain', 'Approval chain'],
  ['core_approval_request', 'Approval request'], ['core_grievance', 'Grievance'], ['core_department', 'Department'],
  ['core_position', 'Position'], ['core_file', 'File'],
]

/** Columns that are bookkeeping, not business data: left out of the readable before/after text. */
/** Links to other records are stored as ids; an id means nothing to a reader, so those fields are left out. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOISE = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'row_version', 'tenant_id', 'correlation_id', 'correlationId'])

export interface AuditRow {
  field: string
  value: string
}

/** A stored snapshot as field rows: snake_case names read as words, empty values as a dash. */
export function snapshotRows(json: string): AuditRow[] {
  if (!json) return []
  let obj: unknown
  try { obj = JSON.parse(json) } catch { return [{ field: 'Value', value: json }] }
  if (!obj || typeof obj !== 'object') return [{ field: 'Value', value: String(obj) }]
  return Object.entries(obj as Record<string, unknown>)
    .filter(([k, v]) => !NOISE.has(k) && !(typeof v === 'string' && UUID.test(v)))
    .map(([k, v]) => ({ field: fieldName(k), value: valueText(v) }))
}

/** Fields that changed between the before and after snapshots (for an update). */
export function changedRows(before: string, after: string): { field: string; from: string; to: string }[] {
  const b = new Map(snapshotRows(before).map((r) => [r.field, r.value]))
  const a = new Map(snapshotRows(after).map((r) => [r.field, r.value]))
  const fields = [...new Set([...b.keys(), ...a.keys()])]
  return fields
    .filter((f) => (b.get(f) ?? '—') !== (a.get(f) ?? '—'))
    .map((f) => ({ field: f, from: b.get(f) ?? '—', to: a.get(f) ?? '—' }))
}

const fieldName = (key: string) => {
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const valueText = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** The sentence another module sent with its entry ("Ravi Kumar signed in"), kept in the entry's values. */
const parseSummary = (json: string): string => {
  try { const o = JSON.parse(json) as { summary?: unknown }; return typeof o.summary === 'string' ? o.summary : '' } catch { return '' }
}

/** The modules whose activity the trail holds, with the names the screen shows. */
export const AUDIT_MODULES: [module: string, label: string][] = [['core', 'CORE'], ['hrms', 'HRMS'], ['pm', 'P&M'], ['pms', 'PMS'], ['stores', 'Stores']]
export const auditModuleLabel = (m: string) => AUDIT_MODULES.find(([k]) => k === m)?.[1] ?? m.toUpperCase()

/** A one-line summary of the change, for the table. */
export function changeSummary(e: AuditEntry): string {
  if ((e.module ?? 'core') !== 'core') return parseSummary(e.after) || e.action
  if (e.action === 'Created') return 'New record added'
  if (e.action === 'Deleted') return 'Record removed'
  const changed = changedRows(e.before, e.after)
  if (!changed.length) return 'Saved, no visible details changed'
  return changed.map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; ')
}

export const auditFrom = (r: AuditRecord): AuditEntry => ({
  id: r.id,
  at: r.at ?? '',
  user: r.user ?? '—',
  action: r.action,
  entity: r.entity,
  entityId: r.entityId ?? '',
  before: r.before,
  after: r.after,
  module: r.module ?? 'core',
})

/** One page of the audit trail. The envelope meta is { limit, offset, total }. */
export async function listAudit(f: AuditFilter = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  const { rows, meta } = await apiPage<AuditRecord>(`/audit-log${s ? `?${s}` : ''}`)
  return {
    entries: rows.map(auditFrom),
    limit: Number(meta.limit ?? f.limit ?? 50),
    offset: Number(meta.offset ?? f.offset ?? 0),
    total: Number(meta.total ?? rows.length),
  }
}

// ---------- sign-in and access history (GET /audit-log/auth-events, access.manage) ----------

/** The event types the server reports, with the wording the screen shows. Same order as the backend list. */
export const AUTH_EVENTS = [
  ['login_success', 'Signed in'],
  ['login_failure', 'Sign-in failed'],
  ['login_locked', 'Account locked'],
  ['refresh', 'Session renewed'],
  ['refresh_reuse', 'Old session token reused'],
  ['logout', 'Signed out'],
  ['otp_verified', 'Code verified'],
  ['otp_failed', 'Code refused'],
  ['password_reset', 'Password reset'],
  ['password_admin_reset', 'Password reset by an administrator'],
  ['password_changed', 'Password changed'],
  ['password_change_failure', 'Password change failed'],
  ['passkey_login_success', 'Signed in with a passkey'],
  ['passkey_login_failure', 'Passkey sign-in failed'],
  ['passkey_registered', 'Passkey added'],
  ['passkey_removed', 'Passkey removed'],
  ['session_revoked', 'Device signed out'],
  ['session_limit_revoked', 'Signed out by a newer sign-in'],
  ['step_up_success', 'Identity confirmed'],
  ['step_up_failure', 'Identity check failed'],
  ['access_denied', 'Access refused'],
] as const

export type AuthEventType = (typeof AUTH_EVENTS)[number][0]

/** Events that may point to misuse: shown with a warning tone. */
export const AUTH_EVENT_WARNINGS: ReadonlySet<string> = new Set([
  'login_failure', 'login_locked', 'refresh_reuse', 'otp_failed', 'password_change_failure', 'passkey_login_failure', 'step_up_failure', 'access_denied',
])

export const authEventLabel = (type: string) => AUTH_EVENTS.find(([t]) => t === type)?.[1] ?? type

export interface AuthEvent {
  id: string
  at: string | null
  event: string
  /** the person's name or login; null for a failed sign-in with an unknown login */
  user: string | null
  loginId: string | null
  detail: string | null
  /** core, or the module whose sign-in this is: hrms, pm, pms or stores */
  module?: string
}

export interface AuthEventFilter {
  from?: string
  to?: string
  eventType?: AuthEventType
  module?: string
  actor?: string
  limit?: number
  offset?: number
}

export async function listAuthEvents(f: AuthEventFilter = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  const { rows, meta } = await apiPage<AuthEvent>(`/audit-log/auth-events${s ? `?${s}` : ''}`)
  return { events: rows, total: Number(meta.total ?? rows.length) }
}
