import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'
import { approvalRoutes, jobOpeningRoutes, matrixRoutes } from '@/modules/approvals/routes'
import { auditRoutes } from '@/modules/audit/routes'
import { integrationRoutes } from '@/modules/integrations/routes'
import { companyRoutes } from '@/modules/company/routes'
import { dashboardRoutes } from '@/modules/dashboard/routes'
import { grievanceRoutes } from '@/modules/grievances/routes'
import { orgRoutes, userRoutes } from '@/modules/organisation/routes'
import { projectRoutes, siteRoutes } from '@/modules/projects/routes'
import { equipmentRoutes, storeRoutes } from '@/modules/resources/routes'
import { helpRoutes, styleGuideRoutes } from '@/modules/support/routes'

export type { AppRoute }

/** ② Screen registry. Every menu path in modules/shell/config/nav.ts must appear here.
 *  Each module owns its routes; the order below is the original registry order. */
export const ROUTES: AppRoute[] = [
  ...dashboardRoutes,
  ...approvalRoutes,
  ...grievanceRoutes,
  ...jobOpeningRoutes,
  ...companyRoutes,
  ...orgRoutes,
  ...projectRoutes,
  ...siteRoutes,
  ...storeRoutes,
  ...equipmentRoutes,
  // 3.6 users, 3.7 matrix, §4 audit
  ...matrixRoutes,
  ...userRoutes,
  ...auditRoutes,
  ...integrationRoutes,
  ...helpRoutes,
  ...styleGuideRoutes,
  // the signed-in user's own passkeys (opened from the account menu, not the sidebar)
  { path: '/account/passkeys', Component: page(() => import('@/modules/auth/pages/Passkeys')) },
]
