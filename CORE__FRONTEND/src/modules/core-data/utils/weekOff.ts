import type { WeekOff, WeekOffType } from '../types'

export const WEEK_OFF_TYPES: WeekOffType[] = ['Every Sunday', 'Alternate Saturdays', 'Rotating', 'Custom days']
export const SATURDAY_SETS = ['1st & 3rd', '2nd & 4th'] as const

/** Plain-English description of a week-off pattern. */
export function weekOffText(w?: WeekOff): string {
  if (!w) return '—'
  if (w.type === 'Alternate Saturdays') return `Sundays and alternate Saturdays (${w.saturdays ?? '1st & 3rd'})`
  if (w.type === 'Custom days') return w.days?.trim() ? `Custom: ${w.days.trim()}` : 'Custom days'
  if (w.type === 'Rotating') return 'Rotating weekly off (as rostered)'
  return 'Every Sunday'
}

/** Flat key for a single Select (site override): '' = follow the company policy. */
export const weekOffKey = (w?: WeekOff): string => (!w ? '' : w.type === 'Alternate Saturdays' ? `Alt ${w.saturdays ?? '1st & 3rd'}` : w.type)
export const weekOffFromKey = (k: string): WeekOff | undefined =>
  !k ? undefined : k.startsWith('Alt ') ? { type: 'Alternate Saturdays', saturdays: k.slice(4) as WeekOff['saturdays'] } : { type: k as WeekOffType }
export const WEEK_OFF_KEYS: { key: string; label: string }[] = [
  { key: '', label: 'Follow company policy' },
  { key: 'Every Sunday', label: 'Every Sunday' },
  { key: 'Alt 1st & 3rd', label: 'Alternate Saturdays (1st & 3rd)' },
  { key: 'Alt 2nd & 4th', label: 'Alternate Saturdays (2nd & 4th)' },
  { key: 'Rotating', label: 'Rotating' },
]
