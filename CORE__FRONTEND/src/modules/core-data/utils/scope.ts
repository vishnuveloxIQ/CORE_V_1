import { z } from 'zod'
import { todayISO } from '@/shared/lib/format'

/** Every policy / matrix change carries an effective date and a reason, and never applies to the past. */
export const versionFields = {
  effectiveFrom: z.string().min(1, 'Pick the date this version applies from.').refine((v) => v >= todayISO(), 'Must be today or later. Past payroll and attendance never change.'),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.'),
}

/** "Company-wide", "Project: NH65-PKG2, MTR-DEP" */
export function scopeText(scopeType: 'Company' | 'Project', ids: string[], projects: { id: string; code: string }[]) {
  if (scopeType === 'Company') return 'Company-wide'
  return `Project: ${ids.map((id) => projects.find((x) => x.id === id)?.code ?? id).join(', ')}`
}
