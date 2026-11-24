import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// §4 audit
export const auditRoutes: AppRoute[] = [
  { path: '/audit', Component: page(() => import('./pages/AuditTrail')) },
  // the sign-in history is a tab of the audit trail now; the old address still opens it
  { path: '/audit/access', Component: page(() => import('./pages/SignInRedirect')) },
]
