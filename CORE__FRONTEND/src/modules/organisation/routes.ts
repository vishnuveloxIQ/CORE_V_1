import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// organisation: departments, roles and the organogram drawn from them
export const orgRoutes: AppRoute[] = [
  { path: '/organogram', Component: page(() => import('./pages/Organogram')) },
  { path: '/departments', Component: page(() => import('./pages/Departments')) },
]

// 3.6 users
export const userRoutes: AppRoute[] = [
  { path: '/users', Component: page(() => import('./pages/Users')) },
  { path: '/users/new', Component: page(() => import('./pages/UserDetail')) },
  { path: '/users/:id', sample: '/users/U-602', Component: page(() => import('./pages/UserDetail')) },
]
