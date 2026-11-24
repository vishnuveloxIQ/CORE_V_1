import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// CORE-23-02, 23-03, 24-01, 24-02: integration diagnostics for the Core administrator (access.manage)
export const integrationRoutes: AppRoute[] = [
  { path: '/integrations/events', Component: page(() => import('./pages/EventMonitor')) },
  { path: '/integrations/read-models', Component: page(() => import('./pages/ReadModels')) },
]
