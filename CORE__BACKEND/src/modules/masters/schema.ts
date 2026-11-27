import { z } from 'zod';
import { TAX_ID_PATTERNS } from '../organisation/rules.js';
import { EQUIPMENT_CODE_PATTERN, HSN_PATTERN, PLAN_LINE_STAGES } from './rules.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const statusValue = z.enum(['active', 'inactive']);
/** Optimistic lock: the row version the client read. Every PATCH and verify call carries it. */
const versionField = z.number().int().min(1);
/** numeric(14,3): above zero, and at most 11 digits before the point. */
const quantity = z.number().positive().max(99999999999.999);
/** numeric(14,3): zero or more. */
const nonNegativeQuantity = z.number().min(0).max(99999999999.999);

export const idParamsSchema = z.object({ id: z.uuid() });

// Filters on the list routes. Each is optional; a missing filter lists every row.

export const statusFilterQuery = z.object({ status: statusValue.optional() });
export const projectFilterQuery = z.object({ projectId: z.uuid().optional() });
export const planLineFilterQuery = z.object({
  projectId: z.uuid().optional(),
  resourceKind: z.enum(['equipment', 'people', 'material']).optional(),
});

// Vendors (design points b and c). Deactivated, not deleted. verified_at is the verification field.

const vendorFields = z.object({
  code: text(40),
  name: text(200),
  status: statusValue.optional(),
  gstin: z.string().regex(TAX_ID_PATTERNS.gstin).nullable().optional(),
  pan: z.string().regex(TAX_ID_PATTERNS.pan).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: text(30).nullable().optional(),
  address: text(500).nullable().optional(),
});
export const vendorCreateBody = vendorFields;
export const vendorPatchBody = vendorFields.partial().extend({ rowVersion: versionField });
export const vendorVerifyBody = z.object({ rowVersion: versionField });

// Materials (design point d). Deactivated, not deleted.

const materialFields = z.object({
  code: text(40),
  name: text(200),
  uomId: z.uuid(),
  status: statusValue.optional(),
  hsn: z.string().regex(HSN_PATTERN).nullable().optional(),
  reorderLevel: nonNegativeQuantity.nullable().optional(),
  category: text(100).nullable().optional(),
  subCategory: text(100).nullable().optional(),
  // the stores this material is available in; replaces the whole list when sent
  storeIds: z.array(z.uuid()).max(500).optional(),
});
export const materialCreateBody = materialFields;
export const materialPatchBody = materialFields.partial().extend({ rowVersion: versionField });

// Equipment types (design point e). The code is fixed after create: a PATCH that sends it is refused.

const equipmentTypeFields = z.object({
  code: z.string().trim().regex(EQUIPMENT_CODE_PATTERN),
  name: text(200),
  meterKind: z.enum(['hours', 'km', 'none']).nullable().optional(),
  meterPrecision: z.number().int().min(0).max(4).nullable().optional(),
  fuelNormUnit: z.enum(['litre_per_hour', 'litre_per_km']).nullable().optional(),
  active: z.boolean().optional(),
});
export const equipmentTypeCreateBody = equipmentTypeFields;
export const equipmentTypePatchBody = equipmentTypeFields
  .omit({ code: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Major material allocations (design point f). The project is fixed after create.

const allocationFields = z.object({
  projectId: z.uuid(),
  materialId: z.uuid(),
  uomId: z.uuid(),
  quantity,
  requiredBy: z.iso.date().nullable().optional(),
});
export const allocationCreateBody = allocationFields;
export const allocationPatchBody = allocationFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

// Equipment assignments (design point g). The project and type are fixed after create; a PATCH changes qty only.

const assignmentFields = z.object({
  projectId: z.uuid(),
  equipmentTypeId: z.uuid(),
  qty: z.number().int().min(1).max(1000000),
});
export const assignmentCreateBody = assignmentFields;
export const assignmentPatchBody = z
  .object({
    qty: assignmentFields.shape.qty,
    rowVersion: versionField,
  })
  .strict();

// Plan lines (design points h and i). The project is fixed after create. Cancelling is a PATCH to status cancelled.

const planLineFields = z.object({
  projectId: z.uuid(),
  resourceKind: z.enum(['equipment', 'people', 'material']),
  equipmentTypeId: z.uuid().nullable().optional(),
  positionId: z.uuid().nullable().optional(),
  role: text(200).nullable().optional(),
  department: text(100).nullable().optional(),
  materialId: z.uuid().nullable().optional(),
  uomId: z.uuid().nullable().optional(),
  storeId: z.uuid().nullable().optional(),
  quantity: quantity.nullable().optional(),
  withdrawn: z.boolean().optional(),
  fromDate: z.iso.date().nullable().optional(),
  toDate: z.iso.date().nullable().optional(),
  requiredBy: z.iso.date().nullable().optional(),
  status: z.enum(['draft', 'approved', 'cancelled']).optional(),
  // Working stage (0030), checked against the resource kind by planLineStageIssue. null clears it.
  stage: z.enum(PLAN_LINE_STAGES).nullable().optional(),
  reason: text(500).nullable().optional(),
  // equipment lines: the capacity (a description such as "30-ton (300)") and model needed (migrations 0041, 0042); optional
  capacity: text(100).nullable().optional(),
  model: text(100).nullable().optional(),
});
export const planLineCreateBody = planLineFields;
export const planLinePatchBody = planLineFields
  .omit({ projectId: true })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

export type VendorInput = z.infer<typeof vendorCreateBody>;
export type VendorPatch = z.infer<typeof vendorPatchBody>;
export type VendorVerify = z.infer<typeof vendorVerifyBody>;
export type MaterialInput = z.infer<typeof materialCreateBody>;
export type MaterialPatch = z.infer<typeof materialPatchBody>;
export type EquipmentTypeInput = z.infer<typeof equipmentTypeCreateBody>;
export type EquipmentTypePatch = z.infer<typeof equipmentTypePatchBody>;
export type AllocationInput = z.infer<typeof allocationCreateBody>;
export type AllocationPatch = z.infer<typeof allocationPatchBody>;
export type AssignmentInput = z.infer<typeof assignmentCreateBody>;
export type AssignmentPatch = z.infer<typeof assignmentPatchBody>;
export type PlanLineInput = z.infer<typeof planLineCreateBody>;
export type PlanLinePatch = z.infer<typeof planLinePatchBody>;
