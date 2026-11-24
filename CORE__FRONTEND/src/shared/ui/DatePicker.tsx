import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/cn'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (s?: string | number | readonly string[]): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''))
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.getMonth() === +m[2] - 1 ? d : null
}
const show = (iso: string) => {
  const d = parseIso(iso)
  return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : ''
}

/** rough height of the calendar card, used before it has been measured */
const CARD_H = 420

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** 'top' opens above the trigger whenever there is room; 'auto' (default) opens above only when there is no room below */
  placement?: 'auto' | 'top'
}

/**
 * Calendar-style date picker. Drop-in for `<input type="date">`: value is a `yyyy-MM-dd`
 * string, and it works with react-hook-form `register` (ref/onChange/onBlur) and controlled use.
 * A hidden input carries the value so forms and refs behave exactly like a native date input.
 */
export const DatePicker = forwardRef<HTMLInputElement, Props>(function DatePicker(
  { className, value, defaultValue, min, max, name, disabled, onChange, onBlur, onFocus, id, placeholder, placement = 'auto', ...aria },
  ref,
) {
  const [iso, setIso] = useState<string>(String(value ?? defaultValue ?? ''))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseIso(String(value ?? defaultValue ?? '')) ?? new Date())
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; maxH?: number } | null>(null)
  const hidden = useRef<HTMLInputElement | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  // which grid replaces the day grid: month or year picker (null = days)
  const [pick, setPick] = useState<'month' | 'year' | null>(null)
  const yearList = useRef<HTMLDivElement>(null)

  // Controlled usage.
  useEffect(() => { if (value !== undefined) setIso(String(value)) }, [value])

  // react-hook-form writes `ref.value = x` directly; mirror that into state, and make
  // `ref.focus()` (used to focus the first invalid field) focus the visible button.
  const setRef = useCallback((el: HTMLInputElement | null) => {
    hidden.current = el
    if (el && !(el as unknown as { __dp?: boolean }).__dp) {
      // Install the override BEFORE handing the element to RHF, so its initial
      // `el.value = default` write reaches state.
      ;(el as unknown as { __dp?: boolean }).__dp = true
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return desc.get!.call(el) },
        set(v: string) { desc.set!.call(el, v); setIso(String(v ?? '')) },
      })
      el.focus = () => btn.current?.focus()
    }
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
    if (el && el.value) setIso(el.value)
  }, [ref])

  useLayoutEffect(() => {
    const el = hidden.current
    // Never clobber a value RHF already wrote with an empty initial state.
    if (el && el.value !== iso && !(iso === '' && el.value !== '' && value === undefined)) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, iso)
    }
  }, [iso, value])

  const minD = parseIso(min), maxD = parseIso(max)
  const selected = parseIso(iso)
  const todayIso = toIso(new Date())

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    // clamp to the card's measured width (falls back to the 300px CSS width before first paint)
    const cw = card.current?.offsetWidth || 300
    const left = Math.max(8, Math.min(r.left, window.innerWidth - cw - 8))
    // natural height of the card: the body's full content height plus the (pinned) footer and card chrome
    const body = card.current?.querySelector<HTMLElement>('.dp-body')
    const h = card.current && body ? card.current.offsetHeight - body.offsetHeight + body.scrollHeight : CARD_H
    const roomDown = window.innerHeight - r.bottom - 12
    const roomUp = r.top - 12 - 6
    // 'top' always opens upward; 'auto' opens upward only when the card does not fit below and there is more room above
    const up = placement === 'top' || (h > roomDown && roomUp > roomDown)
    const room = up ? roomUp : roomDown
    // if the card still does not fit, cap its height: the month grid scrolls, the footer stays pinned
    const maxH = h > room ? Math.max(160, room) : undefined
    // upward: anchor the card's bottom edge above the trigger, using the height it will actually take
    const height = maxH ?? h
    setPos({ left, top: up ? Math.max(8, r.top - 6 - height) : r.bottom + 6, up, maxH })
  }, [placement])

  const openPicker = () => {
    if (disabled) return
    setView(selected ?? new Date())
    setPick(null)
    // 'top' needs room above the trigger: scroll the trigger into the middle of its scroll container first
    if (placement === 'top' && (btn.current?.getBoundingClientRect().top ?? Infinity) < CARD_H + 12) {
      btn.current?.scrollIntoView({ block: 'center' })
    }
    place()
    setOpen(true)
  }
  const close = useCallback((refocus = true) => {
    setOpen(false)
    setPick(null)
    if (refocus) btn.current?.focus()
    onBlur?.({ target: { name, value: hidden.current?.value ?? '' }, type: 'blur' } as never)
  }, [onBlur, name])

  useLayoutEffect(() => { if (open) place() }, [open, view, pick, place])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!card.current?.contains(t) && !btn.current?.contains(t)) close(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const move = (e: Event) => { if (!card.current?.contains(e.target as Node)) place() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', move, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', move, true)
    }
  }, [open, close, place])

  const commit = (v: string) => {
    setIso(v)
    if (hidden.current) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hidden.current, v)
    onChange?.({ target: { name, value: v }, currentTarget: { name, value: v }, type: 'change' } as never)
  }

  const y = view.getFullYear(), m = view.getMonth()
  const cells = useMemo(() => {
    const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [y, m])

  const step = (delta: number) => setView(new Date(y, m + delta, 1))
  const off = (d: Date) => (minD && d < minD) || (maxD && d > maxD)

  // years offered by the year picker: the min/max range when given, otherwise 50 years either side
  const years = Array.from({ length: (maxD?.getFullYear() ?? y + 50) - (minD?.getFullYear() ?? y - 50) + 1 }, (_, i) => (minD?.getFullYear() ?? y - 50) + i)
  // when the year grid opens, scroll so the current year sits in the middle
  useEffect(() => {
    const list = yearList.current
    if (pick !== 'year' || !list) return
    const cur = list.querySelector<HTMLElement>('[aria-selected="true"]')
    if (cur) list.scrollTop = cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2
  }, [pick])

  return (
    <>
      <input ref={setRef} type="hidden" name={name} defaultValue={iso} />
      <button
        ref={btn}
        type="button"
        id={id}
        disabled={disabled}
        className={cn('field dp-trigger', !iso && 'dp-empty', className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
        onFocus={() => onFocus?.({ target: { name, value: iso }, type: 'focus' } as never)}
        {...(aria as Record<string, unknown>)}
      >
        <span>{iso ? show(iso) : placeholder ?? 'Select date'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 10h18" />
        </svg>
      </button>
      {/* portalled to <body>: an ancestor with a transform (e.g. the .content fade animation) would otherwise become the containing block for position:fixed */}
      {open && createPortal(
        <div
          ref={card}
          className="dp-card"
          role="dialog"
          aria-label="Choose date"
          style={{
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            maxHeight: pos?.maxH,
            visibility: pos ? undefined : 'hidden',
          }}
        >
          <div className="dp-body">
            <div className="dp-selects">
              <button type="button" className="dp-toggle" aria-expanded={pick === 'month'} aria-label="Choose month" onClick={() => setPick(pick === 'month' ? null : 'month')}>
                {MONTHS[m]}
              </button>
              <button type="button" className="dp-toggle" aria-expanded={pick === 'year'} aria-label="Choose year" onClick={() => setPick(pick === 'year' ? null : 'year')}>
                {y}
              </button>
            </div>
            {pick === 'month' && (
              <div className="dp-pick" role="listbox" aria-label="Month">
                {MONTHS.map((n, i) => (
                  <button key={n} type="button" role="option" aria-selected={i === m} className={cn('dp-opt', i === m && 'dp-cur')} onClick={() => { setView(new Date(y, i, 1)); setPick(null) }}>
                    {n.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
            {pick === 'year' && (
              <div className="dp-pick dp-years" role="listbox" aria-label="Year" ref={yearList}>
                {years.map((yr) => (
                  <button key={yr} type="button" role="option" aria-selected={yr === y} className={cn('dp-opt', yr === y && 'dp-cur')} onClick={() => { setView(new Date(yr, m, 1)); setPick(null) }}>
                    {yr}
                  </button>
                ))}
              </div>
            )}
            {pick === null && (
              <>
                <div className="dp-nav">
                  <button type="button" aria-label="Previous month" onClick={() => step(-1)}>&#8249;</button>
                  <strong aria-live="polite">{MONTHS[m]} {y}</strong>
                  <button type="button" aria-label="Next month" onClick={() => step(1)}>&#8250;</button>
                </div>
                <div className="dp-grid" role="grid">
                  {WEEKDAYS.map((w) => <span key={w} className="dp-wd">{w}</span>)}
                  {cells.map((d) => {
                    const v = toIso(d)
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={!!off(d)}
                        aria-label={show(v)}
                        aria-pressed={v === iso}
                        className={cn('dp-day', d.getMonth() !== m && 'dp-out', v === todayIso && 'dp-today', v === iso && 'dp-sel')}
                        onClick={() => { commit(v); close() }}
                      >
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <div className="dp-foot">
            <button type="button" onClick={() => { commit(''); close() }}>Clear</button>
            <button type="button" onClick={() => close()}>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
})
