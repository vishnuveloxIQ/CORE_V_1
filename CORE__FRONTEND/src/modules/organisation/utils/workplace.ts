import type { CoreUser, Project, Site } from '@/modules/core-data'

/** Where a person works: the projects in their scope and the locations of those projects. */
export interface Workplace {
  /** true for a company-wide person: every project and location */
  companyWide: boolean
  projects: Array<Pick<Project, 'id' | 'code' | 'name'>>
  locations: Array<Pick<Site, 'id' | 'code' | 'name'>>
}

/**
 * A person's projects come from their scope (core_user project scope ids). A location belongs to one project, so
 * their locations are the locations of those projects. A company-wide person works across all of them.
 */
export function workplaceOf(u: Pick<CoreUser, 'scopeType' | 'scopeIds'>, projects: readonly Project[], sites: readonly Site[]): Workplace {
  if (u.scopeType === 'Company') return { companyWide: true, projects: [], locations: [] }
  const mine = u.scopeIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p)
  const ids = new Set(mine.map((p) => p.id))
  const locations = sites.filter((s) => !!s.projectId && ids.has(s.projectId))
  return { companyWide: false, projects: mine, locations }
}

/** The projects as text, by project ID (code): "NH-44, NH-65", or "All projects". */
export const projectsText = (w: Workplace) => (w.companyWide ? 'All projects' : w.projects.map((p) => p.code).join(', ') || '—')

/** The locations as text, by name: "Camp A, Camp B", or "All locations". */
export const locationsText = (w: Workplace) => (w.companyWide ? 'All locations' : w.locations.map((s) => s.name).join(', ') || '—')

/** The modules a person is used for: their modules as a module head, or "Approvals" for a high-level approver. */
export const modulesText = (u: Pick<CoreUser, 'role' | 'modules'>) => (u.role === 'Module head' ? u.modules.join(', ') || '—' : 'Approvals (all modules)')
