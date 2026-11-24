import { z } from 'zod'
import { code, email, phone, pin, req } from '@/shared/lib/core'

/** Site fields, shared by the form and the bulk upload. */
export const siteSchema = z.object({
  code: code('Location code'),
  name: req('Location name'),
  addressLine: req('Address'),
  city: req('City'),
  state: req('State'),
  pin,
  inCharge: req('Location in-charge'),
  phone,
  email,
  status: z.enum(['Active', 'Inactive']),
  // GPS position in decimal degrees; blank means not set. Both are given, or neither.
  latitude: z.number({ error: 'Enter a number, e.g. 17.385044.' }).min(-90, 'Latitude is between -90 and 90.').max(90, 'Latitude is between -90 and 90.').nullable().optional(),
  longitude: z.number({ error: 'Enter a number, e.g. 78.486671.' }).min(-180, 'Longitude is between -180 and 180.').max(180, 'Longitude is between -180 and 180.').nullable().optional(),
}).superRefine((v, ctx) => {
  const has = (n: number | null | undefined) => n !== null && n !== undefined
  if (has(v.latitude) && !has(v.longitude)) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Enter the longitude too.' })
  if (has(v.longitude) && !has(v.latitude)) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enter the latitude too.' })
})
