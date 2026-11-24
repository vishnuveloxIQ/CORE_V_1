import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedValue } from '@/shared/hooks/useMotion'
import { cn } from '@/shared/lib/cn'
import { titleCase } from '@/shared/lib/format'
import { Icon, type IconName } from '@/shared/ui/icons'

export type TileTone = 'blue' | 'green' | 'gold' | 'rose' | 'purple'
const TONE: Record<TileTone, string> = { blue: '', green: 't-green', gold: 't-gold', rose: 't-rose', purple: 't-purple' }

export interface StatTileProps {
  label: string
  /** number or formatted string — digits count up on load */
  value: string | number
  icon: IconName
  tone?: TileTone
  /** e.g. "8.2%" — shown as a green trend chip */
  trend?: string
  /** Makes the card a link to the page that lists these items. Use only where that list is worth opening. */
  to?: string
  /** Makes the card a button that filters the list on this page (for example the Pending view). */
  onClick?: () => void
  /** what opening the card does, for screen readers, e.g. "Show pending requests" */
  actionLabel?: string
}

/**
 * KPI card: solid icon block on the left, bold title-case label and big number on the right. Display-only unless
 * `to` (a link to the matching list) or `onClick` (a filter on this page) is given; only cards that lead somewhere
 * useful should be clickable.
 */
export function StatTile({ label, value, icon, tone = 'blue', trend, to, onClick, actionLabel }: StatTileProps) {
  // a link or button may hold only phrasing content, so a clickable card uses spans where a plain card has a heading
  const clickable = !!(to || onClick)
  const Box = clickable ? 'span' : 'div'
  const Label = clickable ? 'span' : 'h2'
  const body: ReactNode = (
    <>
      <Box className="tile-ico"><Icon name={icon} /></Box>
      <Box className="tile-body">
        <Label className="tile-label">{titleCase(label)}</Label>
        <Box className="tile-val" style={{ '--len': String(value).length } as CSSProperties}><AnimatedValue value={value} /></Box>
      </Box>
      {trend && <span className="delta tile-corner"><Icon name="trend" />{trend}</span>}
    </>
  )
  const className = cn('tile', 'tile-row', TONE[tone], clickable && 'tile-link')
  const name = `${titleCase(label)}: ${value}${actionLabel ? `. ${actionLabel}` : ''}`
  if (to) return <Link to={to} className={className} data-enter aria-label={name}>{body}</Link>
  if (onClick) return <button type="button" className={className} data-enter aria-label={name} onClick={onClick}>{body}</button>
  return (
    <article className={className} data-enter>
      {body}
    </article>
  )
}
