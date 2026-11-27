import { z } from 'zod';

/** The availability vocabulary of the register (frontend Availability). */
export const AVAILABILITY_VALUES = [
  'Available',
  'In use',
  'Under maintenance',
  'Breakdown',
] as const;

/**
 * The document and photo keys of the registration wizard (frontend FILE_STEPS). Each maps to a core_file id; the
 * machine photo is photoFileId. Migration 0028 holds the same list in a CHECK.
 */
export const DOCUMENT_KEYS = [
  'chasisPhoto',
  'enginePhoto',
  'meterPhoto',
  'invoiceDoc',
  'insuranceDoc',
  'pucDoc',
  'regDoc',
  'fitnessDoc',
] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const optionalDate = z.iso.date().nullable().optional();
const optionalUuid = z.uuid().nullable().optional();
const versionField = z.number().int().min(1);

/** Text fields of a unit, by their API (camelCase) name. Every one is optional and may be cleared with null. */
const textFields = {
  name: 200,
  makeModel: 200,
  regNo: 40,
  currentLocation: 200,
  ownershipType: 40,
  manufacturer: 100,
  model: 100,
  mfgYear: 10,
  engineNo: 60,
  chasisNo: 60,
  capacity: 20,
  capacityUnit: 20,
  meterType: 40,
  meterReading: 40,
  fuelType: 40,
  fuelNorm: 40,
  tankCapacity: 20,
  owner: 100,
  hireRef: 60,
  hiredFrom: 20,
  overPlanReason: 500,
  warrantyReading: 40,
  invoiceNo: 60,
  insuranceNo: 60,
  pucNo: 60,
  fitnessCert: 60,
} as const;

/** Date fields of a unit: calendar dates, YYYY-MM-DD. */
const dateFields = [
  'agreementStart',
  'agreementEnd',
  'warrantyEnd',
  'invoiceDate',
  'regExpiry',
  'insuranceExpiry',
  'pollutionExpiry',
  'fitnessExpiry',
] as const;

const optionalTextShape = Object.fromEntries(
  Object.entries(textFields).map(([key, max]) => [key, optionalText(max)]),
) as { [K in keyof typeof textFields]: z.ZodOptional<z.ZodNullable<z.ZodString>> };

const optionalDateShape = Object.fromEntries(dateFields.map((key) => [key, optionalDate])) as {
  [K in (typeof dateFields)[number]]: typeof optionalDate;
};

const documentsShape = z
  .object(
    Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, z.uuid().optional()])) as {
      [K in (typeof DOCUMENT_KEYS)[number]]: z.ZodOptional<z.ZodUUID>;
    },
  )
  .strict();

const unitFields = {
  assetCode: text(40),
  equipmentTypeId: z.uuid(),
  availability: z.enum(AVAILABILITY_VALUES).optional(),
  // The project the unit belongs to (core_project id), or null when none is chosen.
  projectId: optionalUuid,
  // The approved equipment request a hired unit is registered against (core_approval_request id).
  approvalRequestId: optionalUuid,
  vendorId: optionalUuid,
  // Hired units: whether the unit is still on hire. Active when registered; changed afterwards.
  hireStatus: z.enum(['Active', 'Inactive']).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  // Last telematics ping, an ISO 8601 instant in UTC.
  lastPingAt: z.iso.datetime().nullable().optional(),
  // The machine photo (core_file id).
  photoFileId: optionalUuid,
  // Document key -> core_file id. Unknown keys are refused; a write replaces the whole map, null clears it.
  documents: documentsShape.nullable().optional(),
  ...optionalTextShape,
  ...optionalDateShape,
};

// POST body. assetCode and equipmentTypeId are required; availability defaults to Available.
export const unitCreateBody = z.object(unitFields).strict();

// PATCH body: any subset of the fields, plus the row version the client read (optimistic lock).
export const unitPatchBody = z
  .object(unitFields)
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

export const unitIdParams = z.object({ id: z.uuid() });

/** Optional list filters. search matches the asset code, case-insensitively, as a substring. */
export const unitFilterQuery = z.object({
  equipmentTypeId: z.uuid().optional(),
  status: z.enum(AVAILABILITY_VALUES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type UnitCreateInput = z.infer<typeof unitCreateBody>;
export type UnitPatchInput = z.infer<typeof unitPatchBody>;
export type UnitFilter = z.infer<typeof unitFilterQuery>;
