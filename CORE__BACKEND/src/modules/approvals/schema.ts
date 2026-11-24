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

/** Vocabularies from PROGRESS.md, Phase 5e. All are open for the team to change. */
export const SCOPE_TYPES = ['company', 'project'] as const;
export const ON_TIMEOUT_MODES = ['escalate', 'auto_reject', 'hold'] as const;
/** clarification_requested (0025): an approver asked the raiser a question; the request waits at its level. */
export const REQUEST_STATUSES = [
  'pending',
  'clarification_requested',
  'approved',
  'rejected',
  'returned',
  'cancelled',
] as const;
/** clarify (approver) and respond (raiser) were added in 0025. */
export const ACTION_TYPES = [
  'approve',
  'reject',
  'return',
  'cancel',
  'clarify',
  'respond',
] as const;
export const PMS_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const intMinOne = z.number().int().min(1);
/** Approval chains have levels 1 to 4 (owner decision; migration 0034). */
const levelNumber = z.number().int().min(1).max(4);
const numNonNegative = z.number().min(0);

// Approval chains

const chainFields = z.object({
  scopeType: z.enum(SCOPE_TYPES),
  projectId: optionalUuid,
  requestType: text(60),
  module: text(60),
  name: text(200),
  timeoutHours: numNonNegative.nullable().optional(),
  isActive: z.boolean().optional(),
});
export const chainCreateBody = chainFields;
export const chainPatchBody = chainFields.partial().extend({ rowVersion: versionField });

// Matrix versions and levels

const matrixVersionFields = z.object({
  chainId: uuid,
  versionNo: intMinOne.optional(),
  effectiveFrom: isoDate,
  reason: optionalText(500),
});
export const matrixVersionCreateBody = matrixVersionFields;
export const matrixVersionPatchBody = matrixVersionFields
  .omit({ chainId: true, versionNo: true })
  .partial()
  .extend({ rowVersion: versionField });

const matrixLevelFields = z.object({
  matrixVersionId: uuid,
  levelNo: levelNumber,
  amountFrom: numNonNegative.optional(),
  amountTo: numNonNegative.nullable().optional(),
  approverRoleId: optionalUuid,
  approverUserId: optionalUuid,
  escalateToUserId: optionalUuid,
  timeoutHours: numNonNegative.nullable().optional(),
  onTimeout: z.enum(ON_TIMEOUT_MODES).nullable().optional(),
  cashLimitInr: numNonNegative.nullable().optional(),
});
export const matrixLevelCreateBody = matrixLevelFields;
export const matrixLevelPatchBody = matrixLevelFields
  .omit({ matrixVersionId: true })
  .partial()
  .extend({ rowVersion: versionField });

// Approval requests

/** The body that raises a request. The server sets the code, status, snapshot and assignee. */
export const raiseBody = z.object({
  requestType: text(60),
  module: text(60),
  amount: numNonNegative,
  projectId: optionalUuid,
  locationId: optionalUuid,
  chainageMarkerId: optionalUuid,
  title: text(200),
  payload: jsonObject.optional(),
  emergency: z.boolean().optional(),
  /** The date the request is needed by. The CORE screen asks for it whenever the request is not an emergency. */
  neededBy: optionalDate,
  /** The raising module's own record. A second raise for the same module and record returns the first request. */
  sourceRecordId: optionalUuid,
});

/** The body of a publish request. The row version guards against publishing a stale read. */
export const rowVersionBody = z.object({ rowVersion: versionField });

/** The body that acts on a request. A row version guards against acting on a stale read. */
export const actionBody = z.object({
  action: z.enum(ACTION_TYPES),
  comment: optionalText(2000),
  rowVersion: versionField,
  amountApproved: numNonNegative.optional(),
  /** The approver's choice recorded with the action, such as a store or vendor, or a local or Head Office hire. */
  decision: optionalText(100),
});

/** POST /approval-requests/:id/publish: publishes an approved job opening to a location. */
export const publishRequestBody = z.object({ locationId: uuid, rowVersion: versionField }).strict();

// PMS limit rows

const pmsLimitFields = z.object({
  tier: intMinOne,
  priority: z.enum(PMS_PRIORITIES),
  amountInr: numNonNegative,
  days: z.number().int().min(0),
  hours: z.number().int().min(0).max(23),
  minutes: z.number().int().min(0).max(59),
  isFinal: z.boolean().optional(),
});
export const pmsLimitCreateBody = pmsLimitFields;
export const pmsLimitPatchBody = pmsLimitFields.partial().extend({ rowVersion: versionField });

export const requestStatusFilter = z.enum(REQUEST_STATUSES);
