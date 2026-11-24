import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.4 inventory: stores, materials, live stock
export const storeRoutes: AppRoute[] = [
  { path: '/stores', Component: page(() => import('./pages/Stores')) },
  { path: '/materials', Component: page(() => import('./pages/Materials')) },
  { path: '/vendors', Component: page(() => import('./pages/Vendors')) },
  { path: '/stock', Component: page(() => import('./pages/LiveStock')) },
  { path: '/available-materials', Component: page(() => import('./pages/AvailableMaterials')) },
]

// 3.5 equipment
export const equipmentRoutes: AppRoute[] = [
  { path: '/equipment/planning', Component: page(() => import('./pages/EquipmentPlanning')) },
  { path: '/equipment/register', Component: page(() => import('./pages/EquipmentRegister')) },
  { path: '/equipment/maintenance', Component: page(() => import('./pages/Maintenance')) },
  { path: '/equipment/available', Component: page(() => import('./pages/AvailableEquipment')) },
]
