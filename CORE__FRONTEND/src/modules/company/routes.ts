import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.1 company setup
export const companyRoutes: AppRoute[] = [
  { path: '/company', Component: page(() => import('./pages/CompanyProfile')) },
  { path: '/subscription', Component: page(() => import('./pages/Subscription')) },
  { path: '/policies', Component: page(() => import('./pages/Policies')) },
  { path: '/policies/custom/:id', sample: '/policies/custom/CP-001', Component: page(() => import('./pages/CustomPolicy')) },
  { path: '/policies/:key', sample: '/policies/leave', Component: page(() => import('./pages/PolicyEditor')) },
]
