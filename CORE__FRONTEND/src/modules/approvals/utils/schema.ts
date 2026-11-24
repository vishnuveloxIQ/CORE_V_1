import { z } from 'zod'
import type { ApprovalChain, RequestType, ScopeType, TimeoutRule } from '@/modules/core-data'
import { versionFields } from '@/modules/core-data'
import { todayISO } from '@/shared/lib/format'

export const RULES: TimeoutRule[] = ['Escalate to next level', 'Escalate to Tenant Admin', 'Remind approver only']

export const REQUEST_TYPES: RequestType[] = [
  'Onboarded employee list', 'Offer letter', 'Job opening', 'Manpower requisition', 'Equipment', 'Material',
  'Advance payment', 'Recruitment', 'Employee transfer', 'Promotion', 'Bonus and incentive', 'Loan and advance', 'Payments',
]

/** Approval chains have 1 to 4 levels (owner decision; the server enforces the same limit). */
export const MAX_LEVELS = 4

const level = z.object({
  approverId: z.string(),
  timeoutHours: z.number({ error: 'Enter hours.' }).int('Whole hours only.').min(1, 'At least 1 hour.').max(720, 'At most 720 hours (30 days).'),
  onTimeout: z.enum(['Escalate to next level', 'Escalate to Tenant Admin', 'Remind approver only']),
  /** Optional cash limit (Payments only): a payment up to this amount stops at this level. */
  cashLimit: z.number({ error: 'Enter the amount in rupees.' }).int('Whole rupees only.').min(1, 'At least ₹1.').optional(),
  /** Optional (levels 1 to 3): who takes the request when this approver is absent. Tenant Admin or another person. */
  escalateToId: z.string().optional(),
})

type Levels = { levels: z.infer<typeof level>[] }
/** L1 required, no gaps, no person twice, the last level cannot escalate to "next", and cash limits rise with each level. */
function levelRules(v: Levels, ctx: z.RefinementCtx) {
  let previousLimit = 0
  v.levels.forEach((l, i) => {
    if (l.cashLimit === undefined) return
    if (!l.approverId) ctx.addIssue({ code: 'custom', path: ['levels', i, 'cashLimit'], message: `Set the L${i + 1} approver before giving it a cash limit.` })
    if (l.cashLimit <= previousLimit) ctx.addIssue({ code: 'custom', path: ['levels', i, 'cashLimit'], message: `Must be more than ₹${previousLimit.toLocaleString('en-IN')} (the limit at the level before).` })
    previousLimit = l.cashLimit
  })
  // an empty list is refused by the list's own minimum; there is no first level to check then
  if (v.levels.length && !v.levels[0]!.approverId) ctx.addIssue({ code: 'custom', path: ['levels', 0, 'approverId'], message: 'L1 must be set before this request type can be used.' })
  v.levels.forEach((l, i) => {
    if (i > 0 && l.approverId && !v.levels[i - 1].approverId) ctx.addIssue({ code: 'custom', path: ['levels', i, 'approverId'], message: `Set L${i} first. Levels cannot have gaps.` })
    if (l.approverId && v.levels.findIndex((x) => x.approverId === l.approverId) !== i) ctx.addIssue({ code: 'custom', path: ['levels', i, 'approverId'], message: 'This person is already an approver at an earlier level.' })
    if (l.escalateToId && !l.approverId) ctx.addIssue({ code: 'custom', path: ['levels', i, 'escalateToId'], message: `Set the L${i + 1} approver before choosing who it escalates to.` })
    if (l.escalateToId && l.escalateToId === l.approverId) ctx.addIssue({ code: 'custom', path: ['levels', i, 'escalateToId'], message: 'Escalate to someone other than the approver.' })
  })
}

/** A new version of an existing chain. */
const levelList = z.array(level).min(1, 'Add at least one level.').max(MAX_LEVELS, `At most ${MAX_LEVELS} levels.`)
export const versionSchema = z.object({ levels: levelList, ...versionFields }).superRefine(levelRules)

/** A new chain: request type + scope + first version. */
export const newChainSchema = z.object({
  requestType: z.enum(REQUEST_TYPES as [RequestType, ...RequestType[]], { error: 'Choose the request type.' }),
  scopeType: z.enum(['Company', 'Project']),
  scopeIds: z.array(z.string()),
  levels: levelList,
  ...versionFields,
}).superRefine((v, ctx) => {
  if (v.scopeType !== 'Company' && v.scopeIds.length === 0) ctx.addIssue({ code: 'custom', path: ['scopeIds'], message: `Choose at least one ${v.scopeType.toLowerCase()}.` })
  levelRules(v, ctx)
})

type LevelValue = { approverId: string; timeoutHours: number; onTimeout: TimeoutRule; cashLimit?: number; escalateToId?: string }

/** One empty level. The first level waits 24 hours, later ones 48. */
export const blankLevel = (index: number): LevelValue => ({ approverId: '', timeoutHours: index === 0 ? 24 : 48, onTimeout: 'Remind approver only' })

/** A new chain starts with one empty level; levels can be added up to MAX_LEVELS or removed down to one. */
export const blankLevels = (count = 1) => withLastLevelRules(Array.from({ length: count }, (_, i) => blankLevel(i)))

/**
 * Owner decision (2026-11-22): requests are never escalated. When a level's time runs out, the same approver is
 * reminded again, and again after each further interval, until they act. So every level reminds, and no level names
 * someone to escalate to. (The name is kept from when only the last level reminded.)
 */
export function withLastLevelRules<T extends LevelValue>(levels: T[]): T[] {
  return levels.map((l) => ({ ...l, onTimeout: 'Remind approver only', escalateToId: undefined }))
}
export const newChainDefaults = (requestType?: RequestType) => ({ requestType: requestType ?? ('' as unknown as RequestType), scopeType: 'Project' as ScopeType, scopeIds: [] as string[], levels: blankLevels(), effectiveFrom: todayISO(), reason: '' })

/** Chains of the same request type whose scope overlaps the one being created. */
export function scopeClashes(chains: ApprovalChain[], type: RequestType, scopeType: ScopeType, scopeIds: string[]) {
  return chains.filter((c) => c.requestType === type && c.scopeType === scopeType && (scopeType === 'Company' || c.scopeIds.some((x) => scopeIds.includes(x))))
}
