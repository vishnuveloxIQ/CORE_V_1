import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/shared/ui/icons'

export interface SearchOption {
  value: string
  label: string
  /** small right-aligned text, e.g. a count */
  hint?: string
  /** shorter text for the closed button, when the list label is long (e.g. "🇮🇳 +91") */
  short?: string
  /** two-letter country code; shows that country's flag image before the text */
  flag?: string
}

/** Flag image (Windows can't draw flag emoji). Decorative: the text beside it names the country. */
function Flag({ iso }: { iso: string }) {
  return <img className="flag" src={`https://flagcdn.com/w20/${iso.toLowerCase()}.png`} alt="" width={20} height={15} loading="lazy" />
}

interface Props {
  options: SearchOption[]
  /** called with the chosen value */
  onSelect: (value: string) => void
  /** text on the button; when `value` is set, its label is shown instead */
  placeholder: string
  value?: string
  ariaLabel?: string
  /** id for the button, so a <label htmlFor> can point at it */
  id?: string
  className?: string
  searchPlaceholder?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  onBlur?: () => void
  /** handle on the trigger button, so a form can focus it */
  triggerRef?: Ref<HTMLButtonElement>
  /** 'top' opens above the trigger whenever there is room; 'auto' (default) opens above only when there is no room below */
  placement?: 'auto' | 'top'
}

/** Dropdown with a search box, for lists too long to scan. The button always shows a chevron. */
export function SearchSelect({ options, onSelect, placeholder, value, ariaLabel, id: triggerId, className, searchPlaceholder = 'Search…', disabled, invalid, describedBy, onBlur, triggerRef, placement = 'auto' }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const [portal, setPortal] = useState<HTMLElement | null>(null)

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options
  }, [options, q])

  // The list is position:fixed (not absolute) so a modal's overflow:auto cannot clip it,
  // and it stays in the DOM so a Radix dialog's focus trap keeps the search box focusable.
  const place = useCallback(() => {
    const r = root.current?.getBoundingClientRect()
    if (!r) return
    const h = pop.current?.offsetHeight ?? 320
    const fitsAbove = r.top > h + 12
    const up = placement === 'top' ? fitsAbove : r.bottom + h + 12 > window.innerHeight && fitsAbove
    const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 : r.bottom + 6, width, up })
  }, [placement])

  useLayoutEffect(() => { if (open) place() }, [open, shown.length, place])

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', away)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  const close = () => { setOpen(false); setQ(''); setActive(0) }
  const pick = (o: SearchOption) => { onSelect(o.value); close() }
  const cur = value ? options.find((o) => o.value === value) : undefined
  const current = cur ? (cur.short ?? cur.label) : undefined

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  // Resolved in the click handler, not during render: createPortal needs a real DOM element,
  // and reading a ref while rendering is not allowed.
  const openList = () => {
    const dialog = root.current?.closest('[role="dialog"]')
    setPortal(dialog instanceof HTMLElement ? dialog : document.body)
    setOpen(true)
  }

  return (
    <div className={cn('ss', className)} ref={root}>
      <button type="button" ref={triggerRef} id={triggerId} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={onBlur} className="ss-trigger" title={current ?? placeholder} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-l`} aria-label={ariaLabel} onClick={() => (open ? close() : openList())}>
        <span className="ss-val">{cur?.flag && <Flag iso={cur.flag} />}{current ?? placeholder}</span>
        <Icon name="chevD" />
      </button>
      {/* portalled: an ancestor with a transform (e.g. the .content fade animation) would otherwise become the containing block for position:fixed.
          Inside a Radix dialog, portal into that dialog so its focus trap still lets the search box take focus. */}
      {open && portal && createPortal(
        <div
          ref={pop}
          className="ss-pop"
          onKeyDown={onKey}
          style={{
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            width: pos?.width,
            transform: pos?.up ? 'translateY(-100%)' : undefined,
            visibility: pos ? undefined : 'hidden',
          }}
        >
          <div className="ss-search">
            <Icon name="search" />
            <input ref={input} role="combobox" aria-expanded="true" aria-controls={`${id}-l`} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined} aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={q} autoComplete="off" onChange={(e) => { setQ(e.target.value); setActive(0) }} />
          </div>
          <ul className="ss-list" id={`${id}-l`} role="listbox" aria-label={ariaLabel ?? placeholder}>
            {shown.map((o, i) => (
              <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={i === active} className={cn('ss-opt', o.value === value && 'cur')} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
                <span className="ss-val">{o.flag && <Flag iso={o.flag} />}{o.label}</span>
                {o.hint && <em>{o.hint}</em>}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <div className="ss-empty">No matches</div>}
        </div>,
        portal,
      )}
    </div>
  )
}
