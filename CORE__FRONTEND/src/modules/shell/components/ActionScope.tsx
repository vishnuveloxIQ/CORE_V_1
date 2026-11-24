import { Icon } from '@/shared/ui/icons'

interface Place { name: string; code?: string }

/**
 * CORE-19-03: what an action applies to, shown at the top of an action dialog or decision: the project (or
 * company-wide), then the site (or head office). Pass `site` only where a site is part of the action.
 * The company is not repeated here; it is always shown in the header.
 */
export function ActionScope({ project, site }: { project: Place | null; site?: Place | null }) {
  const label = (p: Place) => (p.code && p.code !== p.name ? `${p.name} (${p.code})` : p.name)
  return (
    <div className="action-scope" role="group" aria-label="Applies to">
      <span className="action-scope-chip"><Icon name="hardhat" /><span><small>Project</small>{project ? label(project) : 'Company-wide'}</span></span>
      {site !== undefined && <span className="action-scope-chip"><Icon name="mapPin" /><span><small>Site</small>{site ? label(site) : 'Head office / whole company'}</span></span>}
    </div>
  )
}
