import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.10 help
export const helpRoutes: AppRoute[] = [
  { path: '/help', Component: page(() => import('./pages/Help')) },
]

// design reference from the layout kit (not in the menu)
export const styleGuideRoutes: AppRoute[] = [
  { path: '/style-guide', Component: page(() => import('./pages/StyleGuide')) },
]
