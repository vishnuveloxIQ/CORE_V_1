import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.8 grievances
export const grievanceRoutes: AppRoute[] = [
  { path: '/grievances', Component: page(() => import('./pages/GrievancesList')) },
  { path: '/grievances/:id', sample: '/grievances/GRV-0118', Component: page(() => import('./pages/GrievanceDetail')) },
]
