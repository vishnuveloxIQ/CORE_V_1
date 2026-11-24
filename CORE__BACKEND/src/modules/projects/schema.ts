import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const status = z.enum(['active', 'inactive']);
/** Optimistic lock: the row version the client read. Every PATCH carries it. */
const versionField = z.number().int().min(1);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
/** Chainage in kilometres, numeric(12,3): zero or more. */
const chainageKm = z.number().min(0).max(999999999.999);
/** A [latitude, longitude] pair. */
const point = z.tuple([latitude, longitude]);

export const idParamsSchema = z.object({ id: z.uuid() });

/** Optional project filter on the list routes that belong to a project. */
export const projectFilterQuery = z.object({ projectId: z.uuid().optional() });

// Projects (design point b). A project is closed by status, never deleted.

const projectFields = z.object({
  code: text(40),
  name: text(200),
  status: status.optional(),
  client: text(200).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
  /** numeric(14,2): zero or more. */
  valueAmount: z.number().min(0).max(999999999999.99).nullable().optional(),
  description: text(1000).nullable().optional(),
  /** Chainage range in km (0026): set together, start on or before end. Null clears both. */
  chainageStartKm: chainageKm.nullable().optional(),
  chainageEndKm: chainageKm.nullable().optional(),
});
export const projectCreateBody = projectFields;
export const projectPatchBody = projectFields.partial().extend({ rowVersion: versionField });

// Locations (design point c). Deactivated, not deleted.
// Patch bodies below leave out projectId: a row keeps its project after create, and unknown keys are refused.

const locationFields = z.object({
  code: text(40),
  name: text(200),
  projectId: z.uuid(),
  status: status.optional(),
  addressLine: text(300).nullable().optional(),
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
  city: text(100).nullable().optional(),
  state: text(100).nullable().optional(),
  pin: text(20).nullable().optional(),
  inCharge: text(200).nullable().optional(),
  phone: text(30).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  chainageStartKm: chainageKm.nullable().optional(),
  chainageEndKm: chainageKm.nullable().optional(),
  /** Null uses the company default. Otherwise ISO weekdays: 1 is Monday, 7 is Sunday. */
  weekOffDays: z.array(z.number().int().min(1).max(7)).max(7).nullable().optional(),
});
export const locationCreateBody = locationFields;
export const locationPatchBody = locationFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Stores (design point d). Deactivated, not deleted.

const storeFields = z.object({
  code: text(40),
  name: text(200),
  locationId: z.uuid(),
  status: status.optional(),
  locationText: text(300).nullable().optional(),
  keeper: text(200).nullable().optional(),
  phone: text(30).nullable().optional(),
  chainageMarkerId: z.uuid().nullable().optional(),
});
export const storeCreateBody = storeFields;
export const storePatchBody = storeFields.partial().extend({ rowVersion: versionField });

// WBS nodes (design point e). Deleted only when nothing refers to them.

const wbsNodeFields = z.object({
  code: text(40),
  name: text(200),
  projectId: z.uuid(),
  parentWbsNodeId: z.uuid().nullable().optional(),
  status: status.optional(),
});
export const wbsNodeCreateBody = wbsNodeFields;
export const wbsNodePatchBody = wbsNodeFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Chainage markers (design point f). Deleted only when nothing refers to them.

const chainageMarkerFields = z.object({
  code: text(40),
  label: text(200).nullable().optional(),
  projectId: z.uuid(),
  chainageKm,
  wbsNodeId: z.uuid().nullable().optional(),
});
export const chainageMarkerCreateBody = chainageMarkerFields;
export const chainageMarkerPatchBody = chainageMarkerFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Geo zones (design point g). The version rises by the service when the geometry changes.

const geoZoneFields = z.object({
  projectId: z.uuid(),
  label: text(200),
  zoneType: z.enum(['attendance', 'equipment']),
  shape: z.enum(['circle', 'polygon', 'corridor']),
  centerLat: latitude.nullable().optional(),
  centerLng: longitude.nullable().optional(),
  radiusM: z.number().positive().max(9999999.99).nullable().optional(),
  points: z.array(point).max(1000).nullable().optional(),
  bufferM: z.number().positive().max(9999999.99).nullable().optional(),
});
export const geoZoneCreateBody = geoZoneFields;
export const geoZonePatchBody = geoZoneFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Milestones (design point h). Deleted only when nothing refers to them.

const milestoneFields = z.object({
  projectId: z.uuid(),
  name: text(200),
  dueDate: z.iso.date().nullable().optional(),
  /** Weight from 0 to 100. The total per project is checked in the service. */
  weight: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(['pending', 'achieved', 'cancelled']).optional(),
});
export const milestoneCreateBody = milestoneFields;
export const milestonePatchBody = milestoneFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

export type ProjectInput = z.infer<typeof projectCreateBody>;
export type ProjectPatch = z.infer<typeof projectPatchBody>;
export type LocationInput = z.infer<typeof locationCreateBody>;
export type LocationPatch = z.infer<typeof locationPatchBody>;
export type StoreInput = z.infer<typeof storeCreateBody>;
export type StorePatch = z.infer<typeof storePatchBody>;
export type WbsNodeInput = z.infer<typeof wbsNodeCreateBody>;
export type WbsNodePatch = z.infer<typeof wbsNodePatchBody>;
export type ChainageMarkerInput = z.infer<typeof chainageMarkerCreateBody>;
export type ChainageMarkerPatch = z.infer<typeof chainageMarkerPatchBody>;
export type GeoZoneInput = z.infer<typeof geoZoneCreateBody>;
export type GeoZonePatch = z.infer<typeof geoZonePatchBody>;
export type MilestoneInput = z.infer<typeof milestoneCreateBody>;
export type MilestonePatch = z.infer<typeof milestonePatchBody>;
