import { Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import { DatePicker } from './DatePicker'
import { SearchSelect, type SearchOption } from './SearchSelect'

interface GroupProps {
  label: ReactNode
  required?: boolean
  error?: string
  helper?: ReactNode
  full?: boolean
  children: (id: string, describedBy?: string) => ReactNode
}

/** Label + control + helper/error, with correct aria wiring. */
export function FormGroup({ label, required, error, helper, full, children }: GroupProps) {
  const id = useId()
  const descId = error || helper ? `${id}-d` : undefined
  return (
    <div className={cn('form-group', full && 'full')}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children(id, descId)}
      {error ? <span id={descId} role="alert" className="helper" style={{ color: 'var(--red)' }}>{error}</span> : helper ? <span id={descId} className="helper">{helper}</span> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { placement?: 'auto' | 'top' }>(function Input({ className, ...p }, ref) {
  if (p.type === 'date') {
    const rest: Omit<typeof p, 'type'> & { type?: string } = { ...p }
    delete rest.type
    return <DatePicker ref={ref} className={className} {...rest} />
  }
  // placement is only meaningful for the date picker; drop it before it reaches the <input> DOM node
  delete (p as { placement?: unknown }).placement
  return <input ref={ref} className={cn('field', className)} {...p} />
})
const textOf = (n: ReactNode): string => (typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : '')

/** Turn <option>/<optgroup> children into dropdown options. */
function parseOptions(children: ReactNode): SearchOption[] {
  const out: SearchOption[] = []
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(c)) return
    if (c.type === 'option') {
      const label = textOf(c.props.children)
      const value = c.props.value !== undefined ? String(c.props.value) : label
      // a value written as __name__ is an action (for example "+ Add a position"), not a choice
      out.push({ value, label, action: /^__.+__$/.test(value) })
    } else if (c.type === 'optgroup' || c.type === Fragment) out.push(...parseOptions(c.props.children))
  })
  return out
}

/**
 * Searchable dropdown with the same API as a native <select> (react-hook-form `register` works).
 * A hidden native select keeps the value and fires the change events.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { placement?: 'auto' | 'top' }>(function Select(
  { className, children, id, value, defaultValue, disabled, onChange, onBlur, 'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-label': ariaLabel, placement, ...rest },
  ref,
) {
  const native = useRef<HTMLSelectElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [current, setCurrent] = useState<string>(value !== undefined ? String(value) : defaultValue !== undefined ? String(defaultValue) : '')
  const options = useMemo(() => parseOptions(children), [children])
  const empty = options.find((o) => o.value === '')
  const real = options.filter((o) => o.value !== '')

  const setRef = useCallback((el: HTMLSelectElement | null) => {
    native.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
    if (!el || (el as HTMLSelectElement & { __ss?: boolean }).__ss) return
    ;(el as HTMLSelectElement & { __ss?: boolean }).__ss = true
    // react-hook-form assigns `ref.value = x` directly: mirror it into state, and send focus to the visible button
    const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => proto.get!.call(el),
      set: (v: string) => { proto.set!.call(el, v); setCurrent(proto.get!.call(el)) },
    })
    el.focus = () => trigger.current?.focus()
  }, [ref])

  // keep in step with the native element after mount / option changes / controlled value
  useEffect(() => {
    const el = native.current
    if (!el) return
    if (value !== undefined) { const v = String(value); if (el.value !== v) el.value = v }
    setCurrent(el.value)
  }, [value, options])

  const pick = (v: string) => {
    const el = native.current
    if (!el) return
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    set.call(el, v)
    setCurrent(v)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return (
    <>
      <SearchSelect
        className={cn('ss-field', className)} options={[...(empty ? [empty] : []), ...real]} value={current} onSelect={pick}
        placeholder={empty?.label || 'Choose…'} id={id} ariaLabel={ariaLabel} disabled={disabled} invalid={invalid === true || invalid === 'true'}
        describedBy={describedBy} onBlur={() => onBlur?.({ target: native.current, type: 'blur' } as unknown as React.FocusEvent<HTMLSelectElement>)} triggerRef={trigger} placement={placement} />
      <select hidden tabIndex={-1} aria-hidden ref={setRef} defaultValue={defaultValue} value={value} disabled={disabled} onChange={onChange} {...rest}>{children}</select>
    </>
  )
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn('field', className)} {...p} />
})

export const CheckRow = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }>(function CheckRow({ label, ...p }, ref) {
  return (
    <label className="check-row">
      <input ref={ref} type="checkbox" {...p} />
      {label}
    </label>
  )
})
