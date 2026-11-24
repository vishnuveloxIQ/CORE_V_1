import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.2 projects
export const projectRoutes: AppRoute[] = [
  { path: '/projects', Component: page(() => import('./pages/Projects')) },
  { path: '/projects/new', Component: page(() => import('./pages/ProjectNew')) },
  { path: '/projects/:id', sample: '/projects/P-101', Component: page(() => import('./pages/ProjectDetail')) },
  { path: '/people-planning', Component: page(() => import('./pages/PeoplePlanning')) },
  { path: '/material-planning', Component: page(() => import('./pages/MaterialPlanning')) },
]

// 3.3 sites
export const siteRoutes: AppRoute[] = [
  { path: '/sites', Component: page(() => import('./pages/Sites')) },
  { path: '/geofences', Component: page(() => import('./pages/Geofences')) },
  { path: '/sites/new', Component: page(() => import('./pages/SiteNew')) },
  { path: '/sites/:id', sample: '/sites/S-201', Component: page(() => import('./pages/SiteDetail')) },
]
