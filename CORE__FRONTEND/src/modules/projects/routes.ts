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

// 3.3 geofences
export const siteRoutes: AppRoute[] = [
  { path: '/geofences', Component: page(() => import('./pages/Geofences')) },
  { path: '/sub-contractors', Component: page(() => import('./pages/SubContractors')) },
  { path: '/workforce-adverts', Component: page(() => import('./pages/WorkforceAdverts')) },
  { path: '/workforce-adverts/:id', sample: '/workforce-adverts/WA-2026-0001', Component: page(() => import('./pages/WorkforceAdvertDetail')) },
]
