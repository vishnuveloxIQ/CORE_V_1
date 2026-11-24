import { api } from '@/shared/lib/api'

/** /access: a user's grants, role and privilege grants, suspensions and restores (admin only; access.manage). */

const enc = encodeURIComponent

export type AccessScope = { locationId: string | null; projectId: string | null; storeId: string | null }
export interface GrantView {
  id: string; accessType: 'role' | 'privilege' | 'module_head'; roleId: string | null; privilege: string | null; module: string | null
  scope: AccessScope; reason: string | null; createdAt: string
}
export interface SuspensionView { id: string; reason: string | null; createdAt: string; restoredAt: string | null }
export interface AccessView {
  userId: string; suspended: boolean; grants: GrantView[]; suspensions: SuspensionView[]
  privileges: { privilege: string; source: 'role' | 'privilege'; grantId: string; scope: AccessScope }[]
}

export const ACCESS_MODULES = ['core', 'hrms', 'pm', 'pms', 'stores'] as const
export type AccessModule = (typeof ACCESS_MODULES)[number]

type Scope = Partial<{ locationId: string; projectId: string; storeId: string }>
export type GrantBody =
  | { accessType: 'role'; roleId: string; scope?: Scope; reason?: string }
  | { accessType: 'privilege'; privilege: string; scope?: Scope; reason?: string }
  | { accessType: 'module_head'; module: AccessModule; scope?: Scope; reason?: string }

export const getUserAccess = (userId: string) => api<AccessView>('GET', `/access/users/${enc(userId)}`)
export const grantAccess = (userId: string, body: GrantBody, idempotencyKey?: string) =>
  api<GrantView>('POST', `/access/users/${enc(userId)}/grants`, { body, idempotencyKey })
/** Revokes one grant (DELETE /access/grants/{id}). */
export const revokeGrant = (grantId: string) => api<{ revoked: boolean }>('DELETE', `/access/grants/${enc(grantId)}`)
export const suspendUser = (userId: string, reason: string, idempotencyKey?: string) =>
  api<SuspensionView>('POST', `/access/users/${enc(userId)}/suspensions`, { body: { reason }, idempotencyKey })
export const restoreSuspension = (suspensionId: string, idempotencyKey?: string) =>
  api<SuspensionView>('POST', `/access/suspensions/${enc(suspensionId)}/restore`, { idempotencyKey })

/**
 * Deactivate (suspend) or reactivate (restore the active suspension) a user. Deactivating ends the user's sessions on the
 * server; restoring needs the id of the open suspension, which is read from the user's access first.
 */
export async function setUserSuspended(userId: string, suspend: boolean, reason: string) {
  if (suspend) return suspendUser(userId, reason)
  const open = (await getUserAccess(userId)).suspensions.find((s) => !s.restoredAt)
  return open ? restoreSuspension(open.id) : null
}
