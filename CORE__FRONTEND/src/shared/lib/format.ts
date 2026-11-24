import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const money = (n: number) => inr.format(n)
const inrShort = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
/** Short rupee amount for tight spots like stat tiles: ₹1,067 Cr, ₹12.5 L, ₹95,540. Decimals only when needed. */
export function moneyShort(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${inrShort.format(n / 1e7)} Cr`
  if (abs >= 1e5) return `₹${inrShort.format(n / 1e5)} L`
  return money(n)
}
export const lakh = (n: number) => `₹${n.toFixed(1)}L`
/** True for a date or date-time string that parses. An empty or unreadable value must never crash a screen. */
const readable = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(parseISO(iso).getTime())
export const fmtDate = (iso: string | null | undefined) => (readable(iso) ? format(parseISO(iso), 'd MMM yyyy') : '—')
export const fmtDateTime = (iso: string | null | undefined) => (readable(iso) ? format(parseISO(iso), 'd MMM yyyy · HH:mm') : '—')
export const fmtShort = (iso: string | null | undefined) => (readable(iso) ? format(parseISO(iso), 'd MMM') : '—')
export const ago = (iso: string | null | undefined) => (readable(iso) ? formatDistanceToNowStrict(parseISO(iso), { addSuffix: true }) : '—')
export const todayISO = () => format(new Date(), 'yyyy-MM-dd')
/** "Today", "In 3 days", "2 days ago" for a yyyy-MM-dd date. */
export function relDay(date: string | null | undefined, today = todayISO()) {
  if (!readable(date)) return ''
  const n = differenceInCalendarDays(parseISO(date), parseISO(today))
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 ? `In ${n} days` : n === -1 ? 'Yesterday' : `${-n} days ago`
}

export const initials = (name: string) =>
  name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()

/** deterministic accent index for avatars (0-3) */
export const avatarTone = (name: string) => [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 4

export const sum = (list: { amount: number }[]) => list.reduce((s, x) => s + Number(x.amount || 0), 0)

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs', 'with'])
const capFirst = (w: string) => w.replace(/[a-z]/i, (c) => c.toUpperCase())
/**
 * Heading case for table headings and card titles: "Title / raised by" → "Title / Raised by".
 * Every word starts with a capital except small words (and, of, by…), which stay lowercase unless
 * they open the heading or a "/" segment. Existing capitals (ID, CTC, GPS) are left alone.
 */
export function titleCase(text: string) {
  return text.split(/(\s*\/\s*)/).map((seg, i) => {
    if (i % 2) return seg
    return seg.split(/(\s+)/).map((word, j) => {
      if (/^\s+$/.test(word) || !word) return word
      if (j > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase()
      return word.split('-').map(capFirst).join('-')
    }).join('')
  }).join('')
}
/** titleCase for headings that may be JSX — only plain strings are changed. */
export const headingCase = <T,>(node: T): T | string => (typeof node === 'string' ? titleCase(node) : node)
