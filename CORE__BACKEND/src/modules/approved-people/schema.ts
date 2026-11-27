import { z } from 'zod';
import { filterUuid, optionalText, text, uuid, versionField } from '../../core/resource.js';

/** Approved -> sent to HRMS -> onboarded by HRMS. */
export const APPROVED_STATUS_VALUES = ['Approved', 'With HRMS', 'Onboarded'] as const;

/** The reason a person is not onboarded yet may be at most this many words. */
export const REASON_WORD_LIMIT = 50;

const personFields = {
  department: text(200),
  name: text(200),
  designation: text(200),
  joiningDate: z.iso.date(),
  status: z.enum(APPROVED_STATUS_VALUES).optional(),
  // why the person is not onboarded yet, as the HR admin gave it
  reason: optionalText(1000),
  // when the admin asked the HR admin for the reason
  reasonRequestedAt: z.iso.datetime().nullable().optional(),
};

// POST body. A person starts Approved; the project is fixed at create.
export const approvedPersonCreateBody = z.object({ projectId: uuid, ...personFields }).strict();

// PATCH body: any subset of the fields, plus the row version the client read. The project can change.
export const approvedPersonPatchBody = z
  .object({ projectId: uuid, ...personFields })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

export const approvedPersonFilters = {
  projectId: filterUuid,
  status: z.enum(APPROVED_STATUS_VALUES),
};
