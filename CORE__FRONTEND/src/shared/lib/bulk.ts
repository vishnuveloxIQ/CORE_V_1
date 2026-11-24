import type { ZodType } from 'zod'
import { isISODate } from './core'
import { errorText } from './api'
import { notify } from './toast'

/** Small helpers for checking bulk-upload rows. */
export const bulk = {
  /** "a; b; c" → ["a","b","c"] */
  split: (v: string) => v.split(/[;|]/).map((x) => x.trim()).filter(Boolean),
  /** case-insensitive match against allowed values; returns the canonical spelling */
  pick: <V extends string>(v: string, allowed: readonly V[]) => allowed.find((a) => a.toLowerCase() === v.trim().toLowerCase()),
  /** "1,250" → 1250; blank → NaN */
  num: (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(/[,\s₹]/g, ''))),
  date: (v: string) => isISODate(v.trim()),
  /** run a form schema on a row; returns its messages (empty = valid) */
  check: (schema: ZodType, value: unknown) => {
    const r = schema.safeParse(value)
    return r.success ? [] : [...new Set(r.error.issues.map((i) => i.message))]
  },
  /** codes that appear more than once in the file */
  dupes: (values: string[]) => {
    const seen = new Set<string>(); const twice = new Set<string>()
    values.forEach((v) => { const k = v.toUpperCase(); if (k) { if (seen.has(k)) twice.add(k); seen.add(k) } })
    return twice
  },
}

/**
 * Saves bulk-upload rows through the API one after the other (each call makes its own Idempotency-Key), then tells
 * the user how many were saved and which rows the server refused, with its reason. Returns the refused rows' labels.
 */
export async function saveEach<T>(list: T[], save: (row: T) => Promise<unknown>, label: (row: T) => string, noun: { one: string; many: string }) {
  const failed: string[] = []
  for (const row of list) {
    try {
      await save(row)
    } catch (err) {
      failed.push(`${label(row)}: ${errorText(err)}`)
    }
  }
  const saved = list.length - failed.length
  notify(
    failed.length
      ? `${saved} of ${list.length} ${noun.many} saved. Not saved: ${failed.join('; ')}`
      : `${saved} ${saved === 1 ? noun.one : noun.many} saved`,
    failed.length ? 10000 : 2800,
  )
  return failed
}
