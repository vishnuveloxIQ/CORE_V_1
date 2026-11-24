import { NavLink } from 'react-router-dom'
import { NAV } from '../config/nav'
import { useCore } from '@/modules/core-data'
import { cn } from '@/shared/lib/cn'
import { Icon } from '@/shared/ui/icons'

/** Phone-only bottom tab bar: the first four menu items in config/app.ts + "All pages" (opens the menu). Hidden ≥ 900 px.
 *  Put the most-used screens first in NAV and they appear here automatically. */
export function Dock({ onMore }: { onMore: () => void }) {
  // re-render when the lists behind the nav badges change (they load from the API)
  useCore((s) => s.requests)
  useCore((s) => s.grievances)
  const items = NAV.flatMap((g) => g.items).slice(0, 4)
  return (
    <nav className="dock" aria-label="Quick navigation">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => cn(isActive && 'on')} aria-label={i.label} title={i.label}>
          <Icon name={i.icon} />{!!i.badge && <i className="cnt" />}
        </NavLink>
      ))}
      <button type="button" aria-label="All pages" title="All pages" onClick={onMore}><Icon name="grid" /></button>
    </nav>
  )
}
