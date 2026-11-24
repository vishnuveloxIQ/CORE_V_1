import { Link, NavLink, useLocation } from 'react-router-dom'
import logo from '@/shared/assets/veloxiq-logo.svg'
import { Icon } from '@/shared/ui/icons'
import { ThemeSwitch } from '@/modules/shell'
import { cn } from '@/shared/lib/cn'

/** Public pages reuse the internal header bar; the tabs sit horizontally at the top, styled like the internal nav items. */
export function PublicNav() {
  const { pathname } = useLocation()
  const items = [
    { to: '/', label: 'Home', icon: 'house', active: pathname === '/' },
    { to: '/register', label: 'Register', icon: 'userPlus', active: pathname === '/register' },
    { to: '/login', label: 'Login', icon: 'key', active: pathname === '/login' || pathname === '/forgot' },
  ] as const
  return (
    <header className="header" role="banner">
      <Link className="logo" to="/" aria-label="VeloxIQ Technologies, home">
        <img src={logo} alt="VeloxIQ Technologies Pvt Ltd" width={162} height={60} />
      </Link>
      <nav className="pub-tabs" aria-label="Pages">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={cn('nav-item', i.active && 'active')} aria-current={i.active ? 'page' : undefined}>
            <Icon name={i.icon} /><span className="label">{i.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="hright"><ThemeSwitch /></div>
    </header>
  )
}
