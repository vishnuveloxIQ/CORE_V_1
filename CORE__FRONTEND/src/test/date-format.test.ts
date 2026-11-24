import { describe, expect, it } from 'vitest'
import { ago, fmtDate, fmtDateTime, fmtShort, relDay } from '@/shared/lib/format'

// A grievance with no visit date reached the screens as an empty string, and the screen crashed with "Invalid time value".
describe('date formatting never crashes on a missing or unreadable date', () => {
  it('shows a dash for empty or invalid input', () => {
    for (const v of ['', null, undefined, 'not a date']) {
      expect(fmtDate(v as string)).toBe('—')
      expect(fmtDateTime(v as string)).toBe('—')
      expect(fmtShort(v as string)).toBe('—')
      expect(ago(v as string)).toBe('—')
      expect(relDay(v as string)).toBe('')
    }
  })

  it('still formats a real date', () => {
    expect(fmtDate('2026-11-23')).toBe('23 Nov 2026')
    expect(relDay('2026-11-24', '2026-11-23')).toBe('Tomorrow')
  })
})
