import { api } from '@/shared/lib/api'
import type { OvertimePolicy } from '../types'

/**
 * Overtime as flat rows (GET/POST/PATCH /ot-policies). The UI keeps overtime as a versioned policy (see
 * policies.ts); this module mirrors the version in force into the one OT-DEFAULT row so other modules can read
 * the numbers from the API. /ot-policy-rules (effective-dated rule JSON) is typed here but has no UI yet.
 */
export interface OtPolicyRecord {
  id: string; code: string; name: string; isActive: boolean | null; settlementMode: 'comp_off' | 'payout' | 'both'
  rateWorkingDay: number | null; rateWeekOff: number | null; rateHoliday: number | null
  maxHoursPerDay: number | null; maxHoursPerMonth: number | null; minMinutes: number | null; requiresApproval: boolean | null; rowVersion: number
}
export interface OtPolicyRuleRecord { id: string; policyId: string; ruleCode: string; ruleJson: Record<string, unknown>; effectiveFrom: string; effectiveTo: string | null; rowVersion: number }

export const OT_DEFAULT_CODE = 'OT-DEFAULT'

// TODO(backend): field mode (Automatic/Manual) not in API, it stays in the policy version body
// TODO(backend): settlementMode is not in the UI (sent as 'payout'); rateWeekOff is not in the UI (follows the holiday rate)
const otBody = (p: OvertimePolicy) => ({
  code: OT_DEFAULT_CODE, name: 'Default overtime policy', isActive: p.enabled !== false, settlementMode: 'payout',
  rateWorkingDay: p.weekdayRate, rateWeekOff: p.holidayRate, rateHoliday: p.holidayRate,
  maxHoursPerDay: p.dailyCapHours, maxHoursPerMonth: p.monthlyCapHours, minMinutes: p.minMinutes, requiresApproval: p.requiresApproval,
})

export const listOtPolicies = () => api<OtPolicyRecord[]>('GET', '/ot-policies')
export const createOtPolicy = (p: OvertimePolicy, idempotencyKey?: string) => api<OtPolicyRecord>('POST', '/ot-policies', { body: otBody(p), idempotencyKey })
export const updateOtPolicy = (id: string, rowVersion: number, p: OvertimePolicy, idempotencyKey?: string) =>
  api<OtPolicyRecord>('PATCH', `/ot-policies/${encodeURIComponent(id)}`, { body: { ...otBody(p), rowVersion }, idempotencyKey })
export const listOtPolicyRules = (policyId: string) => api<OtPolicyRuleRecord[]>('GET', `/ot-policy-rules?policyId=${encodeURIComponent(policyId)}`)

/** Writes the overtime numbers to the OT-DEFAULT row, creating it the first time. */
export async function mirrorOvertime(p: OvertimePolicy): Promise<void> {
  const row = (await listOtPolicies()).find((r) => r.code === OT_DEFAULT_CODE)
  if (row) await updateOtPolicy(row.id, row.rowVersion, p)
  else await createOtPolicy(p)
}
