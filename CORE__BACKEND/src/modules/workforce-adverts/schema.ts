import { z } from 'zod';
import { filterUuid, isoDate, optionalDate, optionalText, text, uuid, versionField } from '../../core/resource.js';

/** Advert status (migration 0070 holds the same list in a CHECK). */
export const ADVERT_STATUS_VALUES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
/** Interest status of a sub-contractor's response (migration 0070). */
export const INTEREST_STATUS_VALUES = ['CONTACTED', 'IN_DISCUSSION', 'AGREED', 'DECLINED'] as const;

const advertFields = {
  title: text(200),
  projectId: uuid,
  state: optionalText(100),
  description: optionalText(2000),
  requiredFrom: isoDate,
  requiredTo: optionalDate,
  closesAt: optionalDate,
};

// POST body: a new advert is a draft. The code and status are set by the server.
export const advertCreateBody = z.object(advertFields).strict();

// PATCH body: any subset, plus the row version. Status moves only DRAFT to PUBLISHED and PUBLISHED to CLOSED.
export const advertPatchBody = z
  .object({ ...advertFields, status: z.enum(ADVERT_STATUS_VALUES), closedReason: optionalText(500) })
  .partial()
  .extend({ rowVersion: versionField })
  .strict();

export const advertStatusFilter = z.enum(ADVERT_STATUS_VALUES);

const requirementFields = {
  workerType: text(100),
  trade: text(100),
  notes: optionalText(500),
};
export const requirementCreateBody = z.object({ advertId: uuid, ...requirementFields }).strict();
export const requirementPatchBody = z.object(requirementFields).partial().extend({ rowVersion: versionField }).strict();
export const advertIdFilter = filterUuid;

const interestFields = {
  status: z.enum(INTEREST_STATUS_VALUES).optional(),
  reason: optionalText(500),
};
// A registered sub-contractor is named by subContractorId; a contractor who is not registered gives its firm and contact.
export const interestCreateBody = z
  .object({
    advertId: uuid,
    subContractorId: uuid.optional(),
    firmName: optionalText(200),
    contactName: optionalText(200),
    mailId: z.email().max(200).nullable().optional(),
    phone: optionalText(20),
    ...interestFields,
  })
  .strict();
export const interestPatchBody = z.object(interestFields).partial().extend({ rowVersion: versionField }).strict();
export const interestStatusFilter = z.enum(INTEREST_STATUS_VALUES);
export const interestIdFilter = filterUuid;

export const stepCreateBody = z.object({ interestId: uuid, remarks: text(1000) }).strict();

/** Mail is written by the server when an advert is published; nothing is posted to it directly. */
export const mailCreateBody = z.object({}).strict();
