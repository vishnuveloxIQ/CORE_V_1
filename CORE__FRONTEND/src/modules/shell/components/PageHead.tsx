import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { APP } from '../config/app'
import { NAV } from '../config/nav'
import { Icon } from '@/shared/ui/icons'

interface Props {
  /** last breadcrumb item — usually the same as the title */
  crumb: string
  title: ReactNode
  desc?: string
  /** buttons on the right; at most one tone="primary" */
  actions?: ReactNode
}

const HOME = '/dashboard'
const MENU = NAV.flatMap((g) => g.items)

/** Every menu page the current path sits under, outermost first, e.g. /projects/P-101 → [Projects]. */
function ancestorsOf(pathname: string) {
  return MENU.filter((i) => pathname !== i.to && pathname.startsWith(`${i.to}/`)).sort((a, b) => a.to.length - b.to.length)
}

/** Every screen starts with this: breadcrumb, big title, one-line description, optional actions. */
export function PageHead({ title, desc, crumb, actions }: Props) {
  const { pathname } = useLocation()
  const ancestors = ancestorsOf(pathname).filter((a) => a.label !== crumb)
  return (
    <div className="ph" data-enter>
      <div>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to={HOME} className="crumb-link"><Icon name="house" /><span>{APP.module}</span></Link>
          {ancestors.map((a) => (
            <span key={a.to} className="crumb-part">
              <Icon name="chevR" />
              <Link to={a.to} className="crumb-link">{a.label}</Link>
            </span>
          ))}
          <Icon name="chevR" />
          <b aria-current="page">{crumb}</b>
        </nav>
        <h1>{title}</h1>
        {desc && <p className="ph-desc">{desc}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  )
}
