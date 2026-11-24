import { api } from '@/shared/lib/api'
import type { LeavePolicy, LeaveType } from '../types'

/**
 * Leave as flat rows: /leave-types (one per leave type) and /leave-policies. The UI keeps leave as a versioned
 * policy (see policies.ts); this module mirrors the version in force into the leave types and the one
 * LEAVE-DEFAULT policy row. /leave-policy-rules (per type, effective-dated rule JSON) is typed here but has no UI yet.
 */
export interface LeaveTypeRecord {
  id: string; code: string; name: string; isPaid: boolean; status: 'active' | 'inactive' | null; annualDays: number | null
  accrual: 'monthly' | 'yearly' | 'none' | null; carryForward: boolean | null; maxCarryDays: number | null
  expiryMonths: number | null; encashable: boolean | null; rowVersion: number
}
export interface LeavePolicyRecord { id: string; code: string; name: string; effectiveFrom: string; effectiveTo: string | null; status: 'active' | 'inactive' | null; rowVersion: number }
export interface LeavePolicyRuleRecord { id: string; leavePolicyId: string; leaveTypeId: string; ruleJson: Record<string, unknown>; effectiveFrom: string; effectiveTo: string | null; rowVersion: number }

export const LEAVE_DEFAULT_CODE = 'LEAVE-DEFAULT'

// TODO(backend): field legalNote (leave policy) not in API, it stays in the policy version body
const typeBody = (t: LeaveType) => ({
  code: t.code, name: t.name, isPaid: t.paid, annualDays: t.annualDays, accrual: t.accrual === 'Monthly' ? 'monthly' : 'yearly',
  carryForward: t.carryForward, maxCarryDays: t.maxCarryDays, expiryMonths: t.expiryMonths, encashable: t.encashable,
})

export const listLeaveTypes = () => api<LeaveTypeRecord[]>('GET', '/leave-types')
export const createLeaveType = (t: LeaveType, idempotencyKey?: string) => api<LeaveTypeRecord>('POST', '/leave-types', { body: typeBody(t), idempotencyKey })
export const updateLeaveType = (id: string, rowVersion: number, t: LeaveType, idempotencyKey?: string) =>
  api<LeaveTypeRecord>('PATCH', `/leave-types/${encodeURIComponent(id)}`, { body: { ...typeBody(t), rowVersion }, idempotencyKey })
export const listLeavePolicies = () => api<LeavePolicyRecord[]>('GET', '/leave-policies')
export const createLeavePolicy = (effectiveFrom: string, idempotencyKey?: string) =>
  api<LeavePolicyRecord>('POST', '/leave-policies', { body: { code: LEAVE_DEFAULT_CODE, name: 'Default leave policy', effectiveFrom, status: 'active' }, idempotencyKey })
export const updateLeavePolicy = (id: string, rowVersion: number, effectiveFrom: string, idempotencyKey?: string) =>
  api<LeavePolicyRecord>('PATCH', `/leave-policies/${encodeURIComponent(id)}`, { body: { effectiveFrom, rowVersion }, idempotencyKey })
export const listLeavePolicyRules = (leavePolicyId: string) => api<LeavePolicyRuleRecord[]>('GET', `/leave-policy-rules?leavePolicyId=${encodeURIComponent(leavePolicyId)}`)

/** Writes each leave type (matched by code) and the default policy row. The API is not asked to delete types the UI removed, so those stay. */
export async function mirrorLeave(p: LeavePolicy, effectiveFrom: string): Promise<void> {
  const existing = await listLeaveTypes()
  for (const t of p.leaveTypes) {
    const row = existing.find((r) => r.code === t.code)
    if (row) await updateLeaveType(row.id, row.rowVersion, t)
    else await createLeaveType(t)
  }
  const policy = (await listLeavePolicies()).find((r) => r.code === LEAVE_DEFAULT_CODE)
  if (policy) await updateLeavePolicy(policy.id, policy.rowVersion, effectiveFrom)
  else await createLeavePolicy(effectiveFrom)
}
