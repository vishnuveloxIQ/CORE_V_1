import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

export const dashboardRoutes: AppRoute[] = [
  { path: '/dashboard', Component: page(() => import('./pages/Dashboard')) },
]
