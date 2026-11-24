import type { ReactNode } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { a11y } from '@/shared/lib/core'
import { cn } from '@/shared/lib/cn'
import { Icon, type IconName } from '@/shared/ui/icons'
import { FormGroup, Input, Textarea } from './Field'
import { titleCase } from '@/shared/lib/format'

/** Pill tabs (uses the kit's .seg-tabs). */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: readonly T[] | { value: T; label: string }[]; label: string }) {
  const list = (items as readonly (T | { value: T; label: string })[]).map((i) => (typeof i === 'string' ? { value: i, label: i } : i))
  return (
    <div className="seg-tabs" role="group" aria-label={label} style={{ flexWrap: 'wrap', maxWidth: '100%' }}>
      {list.map((i) => <button key={i.value} type="button" aria-pressed={value === i.value} onClick={() => onChange(i.value)}>{i.label}</button>)}
    </div>
  )
}

/** Highlighted note (uses the kit's .info-box). */
export function Note({ title, children, icon = 'info', className }: { title: string; children?: ReactNode; icon?: IconName; className?: string }) {
  return (
    <div className={cn('info-box', className)} role="note" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Icon name={icon} style={{ flex: '0 0 auto', marginTop: 2 }} />
      <div><strong>{title}</strong>{children}</div>
    </div>
  )
}

/** Label / value pair inside .detail-grid */
export function KV({ k, children, full }: { k: string; children: ReactNode; full?: boolean }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}><div className="k">{k}</div><div>{children}</div></div>
}

/** Small muted text */
export const Muted = ({ children }: { children: ReactNode }) => <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{children}</span>

/** Effective date + reason, shared by every versioned form (policies, approval matrix). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VersionFields({ register, errors }: { register: UseFormRegister<any>; errors: FieldErrors<{ effectiveFrom: string; reason: string }> }) {
  return (
    <>
      <FormGroup label="Effective date" required error={errors.effectiveFrom?.message} helper="New requests follow this version from this date. Earlier requests keep the version they were raised under.">
        {(id, d) => <Input type="date" {...a11y(id, d, errors.effectiveFrom?.message)} {...register('effectiveFrom')} />}
      </FormGroup>
      <FormGroup label="Reason for change" required full error={errors.reason?.message}>
        {(id, d) => <Textarea rows={2} placeholder="Enter the reason for this change. It is kept in the version history." {...a11y(id, d, errors.reason?.message)} {...register('reason')} />}
      </FormGroup>
    </>
  )
}

/**
 * Tiny inline table for nested lists inside cards (not a data table — those use TablePanel). The wrapper scrolls
 * sideways on a narrow screen, so it is a focusable region: a keyboard user can reach it and scroll with the arrows.
 */
export function MiniTable({ head, rows, empty = 'Nothing added yet.', label = 'Table' }: { head: string[]; rows: ReactNode[][]; empty?: string; label?: string }) {
  if (!rows.length) return <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>{empty}</p>
  return (
    <div className="table-wrap mini-table" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label={label}>
      <table style={{ minWidth: 0 }}>
        <thead><tr>{head.map((h, i) => <th key={i}>{titleCase(h)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={titleCase(head[j])}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
