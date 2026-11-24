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
import { isSha256 } from './rules.js';

export const FILE_VISIBILITIES = ['private', 'team', 'company'] as const;
export const GRIEVANCE_STATUSES = ['open', 'in_review', 'resolved', 'closed'] as const;
/** Where a grievance's site visit stands (0029). Independent of the grievance status. */
export const GRIEVANCE_VISIT_STATUSES = [
  'requested',
  'confirmed',
  'rescheduled',
  'visited',
  'not_visited',
] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const;

export const rowVersionBody = z.object({ rowVersion: versionField });

const sha256 = z.string().refine(isSha256, 'Must be 64 lowercase hex characters');
const instant = z.iso.datetime();

// Files (design point b). Metadata only.
const fileFields = z.object({
  ownerType: text(60),
  ownerId: uuid,
  fileName: text(255),
  contentType: text(120),
  sizeBytes: z.number().int().min(0),
  sha256: sha256.nullable().optional(),
  objectKey: text(500),
  visibility: z.enum(FILE_VISIBILITIES).optional(),
  capturedAt: instant.nullable().optional(),
});
export const fileCreateBody = fileFields;
export const filePatchBody = fileFields.partial().extend({ rowVersion: versionField });

// Record timeline (design point c). Append-only: create only.
export const timelineCreateBody = z.object({
  entityType: text(80),
  entityId: uuid,
  action: text(80),
  statusDimension: optionalText(80),
  oldStatus: optionalText(80),
  newStatus: optionalText(80),
  remarks: optionalText(2000),
  correlationId: optionalText(120),
  occurredAt: instant.nullable().optional(),
  details: jsonObject.nullable().optional(),
  isInternal: z.boolean().optional(),
});

// Grievances (design point d). The closed-at value is set by the service, never by the body.
const grievanceFields = z.object({
  code: text(60),
  subject: text(200),
  message: optionalText(4000),
  status: z.enum(GRIEVANCE_STATUSES).optional(),
  sourceModule: optionalText(60),
  sourceRecordId: optionalText(120),
  raisedBy: optionalUuid,
  raisedByName: optionalText(200),
  employeeId: optionalUuid,
  // The employee's code as HR holds it (e.g. EMP-1021). Trimmed; the database caps it at 60 characters.
  employeeCode: optionalText(60),
  visitDate: optionalDate,
  // Visit status (0029): optional; null clears it.
  visitStatus: z.enum(GRIEVANCE_VISIT_STATUSES).nullable().optional(),
});
export const grievanceCreateBody = grievanceFields;
/** A PATCH may also set the note (0027): trimmed, at most 2000 characters; null clears it. */
export const grievancePatchBody = grievanceFields
  .partial()
  .extend({ note: optionalText(2000), rowVersion: versionField });

// Notifications (design point e). Recorded only; nothing is sent in 5f.
export const notificationCreateBody = z.object({
  recipientUserId: uuid,
  notificationType: text(60),
  sourceType: optionalText(60),
  sourceId: optionalUuid,
  title: text(200),
  body: optionalText(4000),
  deliveryStatus: z.enum(DELIVERY_STATUSES).optional(),
});

// Tickets (design point f). Anyone raises; the raiser is the signed-in user, and only records.manage changes the rest.
export const ticketCreateBody = z.object({
  code: text(60),
  subject: text(200),
  category: text(60),
  description: optionalText(4000),
});
export const ticketPatchBody = z
  .object({
    subject: text(200),
    category: text(60),
    description: optionalText(4000),
    priority: z.enum(TICKET_PRIORITIES),
    status: z.enum(TICKET_STATUSES),
    rowVersion: versionField,
  })
  .partial()
  .extend({ rowVersion: versionField });

// Import batches and rows (design point g). No file is parsed in 5f.
const importBatchFields = z.object({
  batchCode: text(60),
  importType: text(60),
  uploadFileId: optionalUuid,
  templateVersion: text(40),
  requesterMode: optionalText(40),
  expiresAt: instant.nullable().optional(),
});
export const importBatchCreateBody = importBatchFields;
export const importBatchPatchBody = importBatchFields
  .partial()
  .extend({ rowVersion: versionField });

export const importRowCreateBody = z.object({
  rowNumber: z.number().int().min(1),
  rawValues: jsonObject,
});
export const importRowPatchBody = z.object({ rowVersion: versionField });

// Usage counters (design point h).
export const usageIncrementBody = z.object({
  metric: text(120),
  scopeKey: text(120),
  weekStart: isoDate,
  by: z.number().int().min(1).max(1_000_000),
});
