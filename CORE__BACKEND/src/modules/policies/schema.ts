import { z } from 'zod';
import {
  isoDate,
  jsonObject,
  optionalDate,
  optionalText,
  optionalUuid,
  text,
  uuid,
  versionField,
} from '../../core/resource.js';

/** Vocabularies from PROGRESS.md, Phase 5d design point a. All are open for the team to change. */
export const POLICY_KINDS = [
  'general',
  'attendance',
  'leave',
  'overtime',
  'conduct',
  'other',
] as const;
export const OT_SETTLEMENT_MODES = ['comp_off', 'payout', 'both'] as const;
export const LEAVE_ACCRUALS = ['monthly', 'yearly', 'none'] as const;
export const ACTIVE_STATUSES = ['active', 'inactive'] as const;
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const;
export const TEMPLATE_STATUSES = ['draft', 'active', 'retired'] as const;

const intNonNegative = z.number().int().min(0).nullable().optional();
const numNonNegative = z.number().min(0).nullable().optional();
const intMinOne = z.number().int().min(1);

// Policies and their versions

const policyFields = z.object({
  kind: z.enum(POLICY_KINDS),
  code: text(60),
  name: text(200),
  description: optionalText(2000),
});
export const policyCreateBody = policyFields;
export const policyPatchBody = policyFields.partial().extend({ rowVersion: versionField });

const policyVersionFields = z.object({
  policyId: uuid,
  versionNo: intMinOne.optional(),
  body: jsonObject,
  effectiveFrom: isoDate,
  reason: optionalText(500),
});
export const policyVersionCreateBody = policyVersionFields;
export const policyVersionPatchBody = policyVersionFields
  .omit({ policyId: true, versionNo: true })
  .partial()
  .extend({ rowVersion: versionField });

/** The body of a publish request. The row version guards against publishing a stale read. */
export const rowVersionBody = z.object({ rowVersion: versionField });

// Policy rules

const policyRuleFields = z.object({
  policyVersionId: uuid,
  title: text(200),
  category: text(60),
  body: text(20000),
  ackRequired: z.boolean().optional(),
});
export const policyRuleCreateBody = policyRuleFields;
export const policyRulePatchBody = policyRuleFields
  .omit({ policyVersionId: true })
  .partial()
  .extend({ rowVersion: versionField });

// OT policies and rules

const otPolicyFields = z.object({
  code: text(20),
  name: text(200),
  isActive: z.boolean().optional(),
  settlementMode: z.enum(OT_SETTLEMENT_MODES),
  rateWorkingDay: numNonNegative,
  rateWeekOff: numNonNegative,
  rateHoliday: numNonNegative,
  compOffMultiplier: numNonNegative,
  compOffExpiryDays: intNonNegative,
  maxHoursPerDay: numNonNegative,
  maxHoursPerMonth: numNonNegative,
  claimWithinDays: intNonNegative,
  minMinutes: intNonNegative,
  requiresApproval: z.boolean().optional(),
});
export const otPolicyCreateBody = otPolicyFields;
export const otPolicyPatchBody = otPolicyFields.partial().extend({ rowVersion: versionField });

const otPolicyRuleFields = z.object({
  policyId: uuid,
  ruleCode: text(60),
  ruleJson: jsonObject,
  effectiveFrom: isoDate,
  effectiveTo: optionalDate,
});
export const otPolicyRuleCreateBody = otPolicyRuleFields;
export const otPolicyRulePatchBody = otPolicyRuleFields
  .omit({ policyId: true })
  .partial()
  .extend({ rowVersion: versionField });

// Leave types, leave policies and their rules

const leaveTypeFields = z.object({
  code: text(40),
  name: text(200),
  isPaid: z.boolean(),
  status: z.enum(ACTIVE_STATUSES).optional(),
  annualDays: numNonNegative,
  accrual: z.enum(LEAVE_ACCRUALS).optional(),
  carryForward: z.boolean().optional(),
  maxCarryDays: numNonNegative,
  expiryMonths: intNonNegative,
  encashable: z.boolean().optional(),
});
export const leaveTypeCreateBody = leaveTypeFields;
export const leaveTypePatchBody = leaveTypeFields.partial().extend({ rowVersion: versionField });

const leavePolicyFields = z.object({
  code: text(40),
  name: text(200),
  effectiveFrom: isoDate,
  effectiveTo: optionalDate,
  status: z.enum(ACTIVE_STATUSES).optional(),
  yearStart: optionalDate,
  yearEnd: optionalDate,
});
export const leavePolicyCreateBody = leavePolicyFields;
export const leavePolicyPatchBody = leavePolicyFields
  .partial()
  .extend({ rowVersion: versionField });

const leavePolicyRuleFields = z.object({
  leavePolicyId: uuid,
  leaveTypeId: uuid,
  ruleJson: jsonObject,
  effectiveFrom: isoDate,
  effectiveTo: optionalDate,
});
export const leavePolicyRuleCreateBody = leavePolicyRuleFields;
export const leavePolicyRulePatchBody = leavePolicyRuleFields
  .omit({ leavePolicyId: true, leaveTypeId: true })
  .partial()
  .extend({ rowVersion: versionField });

// Custom policies, their fields and versions

const customPolicyFields = z.object({
  name: text(200),
  description: optionalText(2000),
});
export const customPolicyCreateBody = customPolicyFields;
export const customPolicyPatchBody = customPolicyFields
  .partial()
  .extend({ rowVersion: versionField });

const customFieldFields = z.object({
  customPolicyId: uuid,
  label: text(120),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  isRequired: z.boolean().optional(),
  optionsJson: z.array(z.unknown()).nullable().optional(),
  sortOrder: intNonNegative,
});
export const customFieldCreateBody = customFieldFields;
export const customFieldPatchBody = customFieldFields
  .omit({ customPolicyId: true })
  .partial()
  .extend({ rowVersion: versionField });

const customVersionFields = z.object({
  customPolicyId: uuid,
  versionNo: intMinOne.optional(),
  effectiveFrom: isoDate,
  reason: optionalText(500),
  valuesJson: jsonObject,
});
export const customVersionCreateBody = customVersionFields;
export const customVersionPatchBody = customVersionFields
  .omit({ customPolicyId: true, versionNo: true })
  .partial()
  .extend({ rowVersion: versionField });

// Document templates. The file is handled in 5f; fileId names a core_file row.

const documentTemplateFields = z.object({
  code: text(60),
  name: text(200),
  templateVersion: text(40),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  fileId: optionalUuid,
  fileName: optionalText(255),
  mimeType: optionalText(120),
  sizeBytes: intNonNegative,
  revision: intMinOne.optional(),
});
export const documentTemplateCreateBody = documentTemplateFields;
export const documentTemplatePatchBody = documentTemplateFields
  .partial()
  .extend({ rowVersion: versionField });

// Query filters

export const policyKindFilter = z.enum(POLICY_KINDS);
