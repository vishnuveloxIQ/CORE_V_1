import { api, apiPage } from '@/shared/lib/api'
import type { CoreUser, ModuleName, ScopeType, UserRole } from '../types'

/**
 * Users (GET/POST /users, GET/PATCH /users/:id, POST /users/:id/password-reset). All need access.manage.
 * Privileges are not part of the user record: they are granted on the user's page (access grants).
 * A temporary password is returned once by create and reset; it is handed straight to the caller and never kept.
 */

export type UserRoleApi = 'module_head' | 'approver'
export type ScopeTypeApi = 'company' | 'project'

export interface UserRecord {
  id: string; loginId: string; email: string | null; name: string; status: string; createdAt: string; rowVersion: number
  phone: string | null; designation: string | null; role: UserRoleApi; roles?: UserRoleApi[]; modules: string[]; scopeType: ScopeTypeApi; scopeIds: string[]
  suspended: boolean; mustChangePassword: boolean; lastLoginAt: string | null
}

export interface UserPage { rows: UserRecord[]; limit: number; offset: number; total: number }

export interface UserQuery { limit?: number; offset?: number; status?: string; search?: string }

/** The fields create and edit send. loginId is set at create only. */
export interface UserDraft {
  name: string; email: string; phone: string; designation: string; roles: UserRole[]; modules: ModuleName[]; scopeType: ScopeType; scopeIds: string[]
}

/** GET /users with paging and filters. Returns the rows with the page meta. */
export async function listUsers(q: UserQuery = {}): Promise<UserPage> {
  const params = new URLSearchParams()
  params.set('limit', String(q.limit ?? 50))
  params.set('offset', String(q.offset ?? 0))
  if (q.status) params.set('status', q.status)
  if (q.search) params.set('search', q.search)
  const { rows, meta } = await apiPage<UserRecord>(`/users?${params.toString()}`)
  const limit = Number(meta.limit ?? q.limit ?? 50)
  const offset = Number(meta.offset ?? q.offset ?? 0)
  return { rows, limit, offset, total: Number(meta.total ?? rows.length) }
}

/** GET /users/:id */
export const getUser = (id: string) => api<UserRecord>('GET', `/users/${encodeURIComponent(id)}`)

/** The screens name the modules as in MODULES; the API takes its own lower-case codes (access.schema USER_MODULES). */
const MODULE_TO_API: Record<ModuleName, string> = { HRMS: 'hrms', PMS: 'pms', Stores: 'stores', 'P&M': 'pm' }
const MODULE_FROM_API: Record<string, ModuleName> = { hrms: 'HRMS', pms: 'PMS', stores: 'Stores', pm: 'P&M' }

const ROLE_TO_API: Record<UserRole, UserRoleApi> = { 'Module head': 'module_head', Approver: 'approver' }
const ROLE_FROM_API: Record<UserRoleApi, UserRole> = { module_head: 'Module head', approver: 'Approver' }

const toBody = (d: UserDraft) => {
  const head = d.roles.includes('Module head')
  const project = d.scopeType === 'Project'
  return {
    name: d.name.trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
    designation: d.designation.trim(),
    // roles lists every role (a module head may also be an approver); role is the primary one for older readers
    roles: d.roles.map((r) => ROLE_TO_API[r]),
    role: (head ? 'module_head' : 'approver') as UserRoleApi,
    // only a module head heads modules; company scope has no project ids
    modules: head ? d.modules.map((m) => MODULE_TO_API[m]) : [],
    scopeType: (project ? 'project' : 'company') as ScopeTypeApi,
    scopeIds: project ? d.scopeIds : [],
  }
}

/** POST /users. The answer carries the temporary password once; show it, never store it. */
export const createUser = (loginId: string, d: UserDraft, idempotencyKey?: string) =>
  api<UserRecord & { temporaryPassword: string }>('POST', '/users', { body: { loginId: loginId.trim().toUpperCase(), ...toBody(d) }, idempotencyKey })

/** PATCH /users/:id with the row version last read (loginId cannot change). */
export const updateUser = (id: string, rowVersion: number, d: UserDraft, idempotencyKey?: string) =>
  api<UserRecord>('PATCH', `/users/${encodeURIComponent(id)}`, { body: { ...toBody(d), rowVersion }, idempotencyKey })

/** POST /users/:id/password-reset: a new temporary password (returned once), a forced change, and the user's sessions ended. */
export const resetUserPassword = (id: string, idempotencyKey?: string) =>
  api<{ temporaryPassword: string }>('POST', `/users/${encodeURIComponent(id)}/password-reset`, { body: {}, idempotencyKey })


/**
 * Maps an API row to the UI user. Privileges, employee number and org position are not on the user record, so
 * they come from `known`, the local row for the same person (matched by id, else by login id).
 */
export const userFrom = (r: UserRecord, known?: CoreUser): CoreUser => ({
  id: r.id,
  loginId: r.loginId,
  name: r.name,
  email: r.email ?? '',
  phone: r.phone ?? '',
  designation: r.designation ?? '',
  role: r.role === 'module_head' ? 'Module head' : 'Approver',
  roles: (r.roles && r.roles.length ? r.roles : [r.role]).map((x) => ROLE_FROM_API[x]),
  modules: (r.modules ?? []).map((m) => MODULE_FROM_API[m]).filter((m): m is ModuleName => !!m),
  scopeType: r.scopeType === 'project' ? 'Project' : 'Company',
  scopeIds: r.scopeIds ?? [],
  privileges: known?.privileges ?? [],
  // a suspended user reads back as inactive, so a deactivation survives a reload
  status: r.suspended || r.status !== 'active' ? 'Inactive' : 'Active',
  mustChangePassword: r.mustChangePassword,
  lastLogin: r.lastLoginAt ?? null,
  createdAt: r.createdAt,
  rowVersion: r.rowVersion,
  employeeId: known?.employeeId,
  positionId: known?.positionId,
})
