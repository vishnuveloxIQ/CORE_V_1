import { z } from 'zod'
import { todayISO } from '@/shared/lib/format'

/** Every policy / matrix change carries an effective date and a reason, and never applies to the past. */
export const versionFields = {
  effectiveFrom: z.string().min(1, 'Pick the date this version applies from.').refine((v) => v >= todayISO(), 'Must be today or later. Past payroll and attendance never change.'),
  // required only when an existing version is changed: the change screens check the length (see REASON_MIN)
  reason: z.string().trim().max(500).default(''),
}
/** Minimum length of a reason for a change to an existing policy or approval chain version. */
export const REASON_MIN = 10
export const REASON_TOO_SHORT = 'Give a reason of at least 10 characters.'

/** "Company-wide", "Project: NH65-PKG2, MTR-DEP" */
export function scopeText(scopeType: 'Company' | 'Project', ids: string[], projects: { id: string; code: string }[]) {
  if (scopeType === 'Company') return 'Company-wide'
  return `Project: ${ids.map((id) => projects.find((x) => x.id === id)?.code ?? id).join(', ')}`
}
