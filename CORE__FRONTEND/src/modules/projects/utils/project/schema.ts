import { z } from 'zod'
import { code, num, req } from '@/shared/lib/core'
import { OTHER_DEPARTMENT } from './departments'

/** Project fields, shared by the form and the bulk upload. The optional fields may be left out (the bulk upload does not ask for them). */
export const projectSchema = z.object({
  code: code('Project code'),
  name: req('Project name'),
  client: req('Client'),
  consultantName: z.string().trim().max(200, 'Keep it under 200 characters.').optional(),
  state: z.string().trim().max(100).optional(),
  executionMode: z.enum(['', 'self', 'hybrid', 'back_to_back_subcontracting']).optional(),
  projectType: z.enum(['', 'direct', 'nominated_sub_contractor', 'sub_contractor', 'risk_and_cost_basis']).optional(),
  /** the department dropdown: a listed name, Other, or blank; Other needs the typed name below */
  departmentChoice: z.string().optional(),
  departmentOther: z.string().trim().max(100, 'Keep it under 100 characters.').optional(),
  startDate: z.string().min(1, 'Pick a start date.'),
  endDate: z.string().min(1, 'Pick an end date.'),
  status: z.enum(['Planning', 'Active', 'On hold', 'Completed']),
  value: num('Contract value', 0),
  description: z.string().trim().max(500, 'Keep it under 500 characters.'),
})
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, { path: ['endDate'], message: 'End date must be after the start date.' })
  .refine((v) => v.departmentChoice !== OTHER_DEPARTMENT || (v.departmentOther ?? '') !== '', { path: ['departmentOther'], message: 'Type the department name.' })
export type ProjectValues = z.infer<typeof projectSchema>
