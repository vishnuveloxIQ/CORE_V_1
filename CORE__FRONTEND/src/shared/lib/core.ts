import { z } from 'zod'
import type { StatusTone } from '@/shared/ui/Status'

/** id → label lookup over any list with `id` */
export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined) => list.find((x) => x.id === id)

export const ACTIVE_TONE = (s: 'Active' | 'Inactive'): StatusTone => (s === 'Active' ? 'approved' : 'draft')

/** aria wiring for a control inside FormGroup */
export const a11y = (id: string, describedBy: string | undefined, error?: string) => ({ id, 'aria-describedby': describedBy, 'aria-invalid': !!error })

// ---------- shared validators ----------
export const req = (label: string) => z.string().trim().min(1, `${label} is required.`)
export const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number.')
export const email = z.string().trim().email('Enter a valid email address.')
export const pin = z.string().trim().regex(/^\d{6}$/, 'PIN code is 6 digits.')
export const code = (label: string) => z.string().trim().min(2, `${label} is required.`).max(16, 'Keep it under 16 characters.').regex(/^[A-Z0-9-]+$/, 'Use capitals, digits and hyphens only.')
export const num = (label: string, min = 0) => z.number({ error: `Enter ${label.toLowerCase()}.` }).min(min, `${label} must be at least ${min}.`)

/** Unique id for nested rows (milestones, WBS items, markers). */
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** yyyy-MM-dd that is a real calendar date */
export const isISODate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
