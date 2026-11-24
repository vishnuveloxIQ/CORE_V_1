import * as Dropdown from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '@/shared/assets/veloxiq-logo.svg'
import { NOTIFICATIONS } from '../config/nav'
import { ago } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { notify } from '@/shared/lib/toast'
import { useAuth } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { tenantId } from '@/shared/lib/api'
import { useShell } from '../store/useShell'
import { Icon } from '@/shared/ui/icons'

export function Brand() {
  return (
    <Link className="logo" to="/" aria-label="VeloxIQ Technologies — home">
      <img src={logo} alt="VeloxIQ Technologies Pvt Ltd" width={162} height={60} />
    </Link>
  )
}

export function ThemeSwitch() {
  const dark = useShell((s) => s.theme === 'dark')
  const toggle = useShell((s) => s.toggleTheme)
  return (
    <button className="switch" type="button" onClick={toggle} aria-pressed={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Icon name="sun" className="sw-sun" /><Icon name="moon" className="sw-moon" />
    </button>
  )
}

/** Bell menu. Clicking a notification marks it read and opens the page where the action is needed. */
export function Notifications() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const read = useShell((s) => s.read)
  const markRead = useShell((s) => s.markRead)
  const markAllRead = useShell((s) => s.markAllRead)
  const remote = useShell((s) => s.remote)
  const load = useShell((s) => s.loadNotifications)
  const user = useAuth((s) => s.user)
  useEffect(() => { if (user) void load() }, [user, load])
  const items = remote ?? NOTIFICATIONS
  const unread = items.filter((n) => !read.includes(n.id)).length
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="hbtn" type="button" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Icon name="bell" />
          {unread > 0 && <span className="badge-dot" aria-hidden>{unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop notif" align="end" sideOffset={10} collisionPadding={12} aria-label="Notifications">
          <div className="pop-head">
            <div><strong>Notifications</strong><span>{unread ? `${unread} unread` : "You're all caught up"}</span></div>
            <button className="link-btn" type="button" onClick={markAllRead} disabled={!unread}>Mark all as read</button>
          </div>
          <div className="n-list">
            {items.map((n) => (
              <button key={n.id} type="button" className={cn('n-item', !read.includes(n.id) && 'unread')} onClick={() => { markRead(n.id); setOpen(false); navigate(n.to) }}>
                <span className="n-ico"><Icon name={n.icon} /></span>
                <span className="n-body"><span className="n-top"><span>{n.title}</span><time dateTime={n.at}>{ago(n.at)}</time></span><p>{n.description}</p><span className="n-go">Open <Icon name="arrowR" /></span></span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * The company (tenant) this tab is signed in to (CORE-19-03). Every list and action on the page belongs to it: the
 * server scopes each request by the signed-in company, whatever the page shows.
 */
export function CompanyScope() {
  const user = useAuth((s) => s.user)
  const company = useCore((s) => s.company)
  const tenant = tenantId()
  if (!user || !tenant) return null
  const name = company.tradeName || company.legalName || tenant.toUpperCase()
  return (
    <span className="scope-chip" title={`Signed in to ${name} (company ID ${tenant}). Everything on these pages belongs to this company.`} aria-label={`Company: ${name}`}>
      <Icon name="company" /><span>{name}</span>
    </span>
  )
}

export function UserMenu() {
  const navigate = useNavigate()
  const logout = useAuth((s) => s.logout)
  const profile = useAuth((s) => s.profile)
  const isAdmin = useAuth((s) => s.isAdmin)
  const name = profile?.name || profile?.loginId || 'Not signed in'
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const role = profile ? (isAdmin ? 'Tenant Admin' : profile.loginId) : ''
  const signOut = () => { void logout(); navigate('/', { replace: true }); notify('Signed out') }
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="role-chip" type="button" aria-label={`Account menu for ${name}`}>
          <span className="avatar">{initials}</span>
          <div><b>{name}</b><small>{role}</small></div>
          <Icon name="chevD" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="pop role-menu" align="end" sideOffset={10} collisionPadding={12}>
          <div className="rm-h">Account</div>
          <Dropdown.Item className="role-opt" onSelect={() => navigate('/company')}><span className="av"><Icon name="company" /></span><span>Company profile</span></Dropdown.Item>
          <Dropdown.Item className="role-opt" onSelect={() => navigate('/account/passkeys')}><span className="av"><Icon name="fingerprint" /></span><span>Passkeys</span></Dropdown.Item>
          <Dropdown.Item className="role-opt" onSelect={signOut}><span className="av"><Icon name="logout" /></span><span>Sign out</span></Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

export function Header({ onMenu, onSearch, drawerOpen }: { onMenu: () => void; onSearch: () => void; drawerOpen: boolean }) {
  return (
    <header className="header" role="banner">
      <button className="hbtn menu" type="button" onClick={onMenu} aria-controls="sidebar" aria-expanded={drawerOpen} aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}>
        <Icon name={drawerOpen ? 'close' : 'menu'} />
      </button>
      <Brand />
      <button className="cmd" type="button" onClick={onSearch} aria-label="Search or jump to a page">
        <Icon name="search" /><span>Search or jump to a page…</span>
        <kbd className="kbd">Ctrl&nbsp;K</kbd>
      </button>
      <div className="hright">
        <CompanyScope />
        <ThemeSwitch />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  )
}
