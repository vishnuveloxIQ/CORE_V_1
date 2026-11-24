import { z } from 'zod';
import { TAX_ID_PATTERNS } from './rules.js';

const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

const text = (max: number) => z.string().trim().min(1).max(max);
const status = z.enum(['active', 'inactive']);
const taxId = (pattern: RegExp) => z.string().regex(pattern).nullable();
/** Optimistic lock: the row version the client read. Every PATCH and the company profile update carry it. */
const versionField = z.number().int().min(1);

export const idParamsSchema = z.object({ id: z.uuid() });

const companyFields = {
  code: text(40),
  legalName: text(200),
  status,
  tradeName: text(200).nullable(),
  cin: taxId(TAX_ID_PATTERNS.cin),
  gstin: taxId(TAX_ID_PATTERNS.gstin),
  pan: taxId(TAX_ID_PATTERNS.pan),
  tan: taxId(TAX_ID_PATTERNS.tan),
  addressLine1: text(200).nullable(),
  addressLine2: text(200).nullable(),
  city: text(100).nullable(),
  state: text(100).nullable(),
  pin: text(20).nullable(),
  country: text(100).nullable(),
  contactName: text(200).nullable(),
  contactEmail: z.email().max(254).nullable(),
  contactPhone: text(30).nullable(),
  website: text(200).nullable(),
  logoFileId: z.uuid().nullable(),
  /** Only the approved fuel setting keys are accepted; the service checks the names. */
  settings: z.record(z.string().min(1).max(100), z.number().min(0)).nullable(),
};

/** PUT /organisation/company-profile replaces the whole profile. rowVersion is needed once it exists. */
export const companyProfileBody = z.object({
  ...companyFields,
  rowVersion: versionField.optional(),
});

const holidayFields = z.object({
  holidayDate: z.iso.date(),
  endDate: z.iso.date().nullable().optional(),
  name: text(200),
  holidayType: z.enum(['national', 'regional', 'company']).nullable().optional(),
  isOptional: z.boolean().optional(),
  scopeProjectId: z.uuid().nullable().optional(),
});
export const holidayCreateBody = holidayFields;
export const holidayPatchBody = holidayFields.partial().extend({ rowVersion: versionField });

const shiftFields = z.object({
  code: text(40),
  name: text(200),
  timezone: text(64),
  inTime: z.iso.time(),
  outTime: z.iso.time(),
  isActive: z.boolean().optional(),
  /** ISO weekdays: 1 is Monday, 7 is Sunday. */
  weekOffDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().nullable().optional(),
});
export const shiftCreateBody = shiftFields;
export const shiftPatchBody = shiftFields.partial().extend({ rowVersion: versionField });

const seriesFields = z.object({
  seriesCode: text(40),
  prefix: text(20),
  /** 0 never resets. Otherwise the calendar year the row counts for. */
  yearScope: z.union([z.literal(0), z.number().int().min(1900).max(9999)]).optional(),
  nextValue: z.number().int().min(1).max(MAX_COUNTER).optional(),
});
export const seriesCreateBody = seriesFields;
/** The series code and year scope cannot change once the series exists. */
export const seriesPatchBody = z.object({
  prefix: text(20).optional(),
  nextValue: z.number().int().min(1).max(MAX_COUNTER).optional(),
  rowVersion: versionField,
});

const departmentFields = z.object({
  code: text(40),
  name: text(200),
  status: status.optional(),
  parentDepartmentId: z.uuid().nullable().optional(),
  headPositionId: z.uuid().nullable().optional(),
  description: text(1000).nullable().optional(),
  /** Index into the 12-colour palette, 0 to 11. The palette itself is still to be defined. */
  colorIndex: z.number().int().min(0).max(11).nullable().optional(),
  colorHex: z.string().regex(HEX_COLOUR).nullable().optional(),
});
export const departmentCreateBody = departmentFields;
export const departmentPatchBody = departmentFields.partial().extend({ rowVersion: versionField });

const positionFields = z.object({
  code: text(40),
  title: text(200),
  departmentId: z.uuid(),
  grade: text(40).nullable().optional(),
  reportsToPositionId: z.uuid().nullable().optional(),
  plannedPositions: z.number().int().min(0).max(100000).optional(),
  description: text(1000).nullable().optional(),
  status: status.optional(),
});
export const positionCreateBody = positionFields;
export const positionPatchBody = positionFields.partial().extend({ rowVersion: versionField });

export type CompanyProfileInput = z.infer<typeof companyProfileBody>;
export type HolidayInput = z.infer<typeof holidayCreateBody>;
export type HolidayPatch = z.infer<typeof holidayPatchBody>;
export type ShiftInput = z.infer<typeof shiftCreateBody>;
export type ShiftPatch = z.infer<typeof shiftPatchBody>;
export type SeriesInput = z.infer<typeof seriesCreateBody>;
export type SeriesPatch = z.infer<typeof seriesPatchBody>;
export type DepartmentInput = z.infer<typeof departmentCreateBody>;
export type DepartmentPatch = z.infer<typeof departmentPatchBody>;
export type PositionInput = z.infer<typeof positionCreateBody>;
export type PositionPatch = z.infer<typeof positionPatchBody>;
