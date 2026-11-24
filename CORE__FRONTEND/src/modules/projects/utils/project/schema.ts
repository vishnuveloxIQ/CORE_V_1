import { z } from 'zod'
import { code, num, req } from '@/shared/lib/core'

/** Project fields, shared by the form and the bulk upload. */
export const projectSchema = z.object({
  code: code('Project code'),
  name: req('Project name'),
  client: req('Client'),
  startDate: z.string().min(1, 'Pick a start date.'),
  endDate: z.string().min(1, 'Pick an end date.'),
  status: z.enum(['Planning', 'Active', 'On hold', 'Completed']),
  value: num('Contract value', 0),
  description: z.string().trim().max(500, 'Keep it under 500 characters.'),
}).refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, { path: ['endDate'], message: 'End date must be after the start date.' })
export type ProjectValues = z.infer<typeof projectSchema>
