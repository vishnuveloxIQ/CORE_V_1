import { z } from 'zod'
import type { MaterialPlanStatus, PeoplePlanStatus, Store } from '@/modules/core-data'
import { num, req } from '@/shared/lib/core'

/** The stores assigned to a project (store.projectId). With no project chosen there are none. */
export function storesForProject(stores: Store[], projectId: string): Store[] {
  if (!projectId) return []
  return stores.filter((s) => s.projectId === projectId)
}

/** Validation and statuses shared by the resource and material planning forms, pages and bulk uploads. */

export const PEOPLE_STATUSES: PeoplePlanStatus[] = ['Planned', 'Confirmed', 'Fulfilled']

export const peopleSchema = z.object({
  projectId: z.string().min(1, 'Choose a project.'),
  positionId: z.string().min(1, 'Choose the position this is for.'),
  /** the department the people in this requirement work in (not the project's department) */
  department: z.string().trim().max(100, 'Keep it under 100 characters.').optional(),
  role: req('Role or trade'),
  headcount: num('Headcount', 1).int('Whole numbers only.'),
  from: z.string().min(1, 'Pick a start date.'),
  to: z.string().min(1, 'Pick an end date.'),
  status: z.enum(['Planned', 'Confirmed', 'Fulfilled']),
}).refine((v) => !v.from || !v.to || v.to > v.from, { path: ['to'], message: 'End date must be after the start date.' })

export const MATERIAL_STATUSES: MaterialPlanStatus[] = ['Planned', 'Requested', 'Ordered', 'Received']

export const materialSchema = z.object({
  projectId: z.string().min(1, 'Choose a project.'),
  materialId: req('Material'),
  qty: num('Quantity', 1),
  uom: req('Unit'),
  requiredBy: z.string().min(1, 'Pick the required-by date.'),
  storeId: z.string().min(1, 'Choose a target store.'),
  status: z.enum(['Planned', 'Requested', 'Ordered', 'Received']),
})
