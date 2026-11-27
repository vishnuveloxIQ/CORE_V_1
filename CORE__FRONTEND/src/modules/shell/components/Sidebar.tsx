import * as Tooltip from '@radix-ui/react-tooltip'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { navFor, type NavItem as Item } from '../config/nav'
import { useAuth } from '@/modules/auth'
import { useIsMobile } from '@/shared/hooks/useMedia'
import { cn } from '@/shared/lib/cn'
import { useShell } from '../store/useShell'
import { useCore } from '@/modules/core-data'
import { Icon } from '@/shared/ui/icons'

/** The signed-in user at the foot of the sidebar; nothing is shown when no one is signed in. */
function SidebarProfile() {
  const profile = useAuth((s) => s.profile)
  const isAdmin = useAuth((s) => s.isAdmin)
  const who = profile?.name || profile?.loginId || ''
  const initials = who.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="mini-prof"><div className="avatar">{initials || '?'}</div><div><b>{who || 'Not signed in'}</b><small>{profile ? (isAdmin ? 'Tenant Admin' : 'User') : ''}</small></div></div>
  )
}

interface Props { drawerOpen: boolean; onCloseDrawer: () => void }

/** Collapsible sidebar. Expanded 268 px → icon rail 78 px. Click the rail to expand; the X collapses. Menu comes from config/app.ts. */
export function Sidebar({ drawerOpen, onCloseDrawer }: Props) {
  const mobile = useIsMobile()
  const collapsed = useShell((s) => s.sidebarCollapsed)
  const setCollapsed = useShell((s) => s.setSidebarCollapsed)
  const rail = collapsed && !mobile
  // re-render when the lists behind the nav badges change (they load from the API)
  useCore((s) => s.requests)
  useCore((s) => s.grievances)
  const { pathname, search } = useLocation()
  // pages the user's privileges cannot open are left out of the menu
  const privileges = useAuth((s) => s.privileges)
  const NAV = navFor(privileges)
  // only the most specific entry is highlighted, so /approvals does not stay lit on /approvals/petty-cash
  const activeTo = bestNavMatch(NAV.flatMap((g) => g.items), pathname, search)
  // the group of the highlighted entry opens by itself (so the petty cash page opens its own group, not Projects)
  const activeGroup = NAV.find((g) => g.items.some((i) => i.to === activeTo))?.label ?? null
  // Groups start closed; the group of the current page opens by itself, and a click opens or closes one.
  const [picked, setPicked] = useState<{ path: string; label: string | null }>({ path: pathname, label: activeGroup })
  const openLabel = picked.path === pathname ? picked.label : activeGroup
  const toggle = (label: string) => setPicked({ path: pathname, label: openLabel === label ? null : label })
  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <aside className="sidebar" id="sidebar" aria-label="Main navigation" onClick={() => { if (rail) setCollapsed(false) }}>
        <div className="sb-scroll">
          <div className="sb-head">
            <button className="sb-x" type="button" aria-label={mobile ? 'Close menu' : 'Collapse sidebar'} title={mobile ? 'Close menu' : 'Collapse sidebar'}
              onClick={(e) => { e.stopPropagation(); if (mobile) onCloseDrawer(); else setCollapsed(true) }}>
              <Icon name="close" />
            </button>
          </div>
          <nav aria-label="Pages">
            {NAV.map((g) => {
              const open = rail || openLabel === g.label
              return (
              <div key={g.label}>
                <div className="nav-label">
                  <button type="button" className="nav-toggle" aria-expanded={open} onClick={(e) => { if (rail) return; e.stopPropagation(); toggle(g.label) }}>
                    <span>{g.label}</span><Icon name={open ? 'chevD' : 'chevR'} />
                  </button>
                </div>
                {open && g.items.map((item) => <NavLinkItem key={item.to} item={item} active={item.to === activeTo} rail={rail} onNavigate={() => { if (mobile) onCloseDrawer() }} />)}
              </div>
              )
            })}
          </nav>
          <div className="sb-foot">
            <SidebarProfile />
          </div>
        </div>
      </aside>
      <div className="overlay" onClick={onCloseDrawer} aria-hidden data-open={drawerOpen} />
    </Tooltip.Provider>
  )
}

function NavLinkItem({ item, active, rail, onNavigate }: { item: Item; active: boolean; rail: boolean; onNavigate: () => void }) {
  const link = (
    <Link to={item.to} className={cn('nav-item', active && 'active', !!item.badge && 'has-count')} aria-current={active ? 'page' : undefined}
      aria-label={rail ? (item.badge ? `${item.label}, ${item.badge}` : item.label) : undefined} onClick={onNavigate}>
      <Icon name={item.icon} />
      <span className="label">{item.label}</span>
      {!!item.badge && <span className="count">{item.badge}</span>}
    </Link>
  )
  if (!rail) return link
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={14} className="nav-tip show" style={{ position: 'relative' }}>{item.label}{item.badge ? `  ·  ${item.badge}` : ''}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/** The entry that best matches the page: the longest path, and a query (e.g. ?tab=reports) must match too. */
function bestNavMatch(items: Item[], pathname: string, search: string): string | null {
  const wanted = new URLSearchParams(search)
  let best: { to: string; score: number } | null = null
  for (const item of items) {
    const [path, query] = item.to.split('?')
    if (!(pathname === path || pathname.startsWith(`${path}/`))) continue
    let score = path.length
    if (query) {
      const tab = new URLSearchParams(query).get('tab')
      // a missing tab means the first tab, pending
      const current = wanted.get('tab') ?? 'pending'
      if (tab !== current) continue
      score += 1000
    }
    if (!best || score > best.score) best = { to: item.to, score }
  }
  return best?.to ?? null
}
