import { z } from 'zod';
import { field, filterText, filterUuid, type ResourceSpec } from '../../core/resource.js';
import {
  fileCreateBody,
  filePatchBody,
  grievanceCreateBody,
  grievancePatchBody,
  importBatchCreateBody,
  importBatchPatchBody,
  importRowCreateBody,
  importRowPatchBody,
  notificationCreateBody,
  ticketCreateBody,
  ticketPatchBody,
  timelineCreateBody,
  usageIncrementBody,
} from './schema.js';
import { closedAtFor } from './rules.js';

/** Errors for the record tables use the RECORD prefix (design point k). */
export const RECORD_PREFIX = 'RECORD';

export const fileSpec: ResourceSpec = {
  table: 'core_file',
  prefix: RECORD_PREFIX,
  label: 'File',
  fields: [
    field('ownerType', 'text'),
    field('ownerId', 'uuid'),
    field('fileName', 'text'),
    field('contentType', 'text'),
    field('sizeBytes', 'num'),
    field('sha256', 'text'),
    field('objectKey', 'text'),
    field('visibility', 'text'),
    field('capturedAt', 'ts'),
  ],
  create: fileCreateBody,
  patch: filePatchBody,
  filters: {
    ownerType: { column: 'owner_type', schema: filterText },
    ownerId: { column: 'owner_id', schema: filterUuid },
  },
  orderBy: 'created_at desc, id',
};

export const timelineSpec: ResourceSpec = {
  table: 'core_record_timeline',
  prefix: RECORD_PREFIX,
  label: 'Timeline entry',
  fields: [
    field('entityType', 'text'),
    field('entityId', 'uuid'),
    field('action', 'text'),
    field('actorId', 'uuid'),
    field('statusDimension', 'text'),
    field('oldStatus', 'text'),
    field('newStatus', 'text'),
    field('remarks', 'text'),
    field('correlationId', 'text'),
    field('occurredAt', 'ts'),
    field('details', 'json'),
    field('isInternal', 'bool'),
  ],
  create: timelineCreateBody,
  // Append-only: no patch shape is ever used, so the placeholder only satisfies the spec type.
  patch: z.object({ rowVersion: z.number().int().min(1) }),
  filters: {
    entityType: { column: 'entity_type', schema: filterText },
    entityId: { column: 'entity_id', schema: filterUuid },
  },
  orderBy: 'occurred_at, id',
  // The actor comes from the signed-in user, never from the body.
  prepare: async ({ actor }) => ({ actorId: actor.actorId }),
};

export const grievanceSpec: ResourceSpec = {
  table: 'core_grievance',
  prefix: RECORD_PREFIX,
  label: 'Grievance',
  fields: [
    field('code', 'text'),
    field('subject', 'text'),
    field('message', 'text'),
    field('status', 'text'),
    field('closedAt', 'ts'),
    field('sourceModule', 'text'),
    field('sourceRecordId', 'text'),
    field('raisedBy', 'uuid'),
    field('raisedByName', 'text'),
    field('raisedAt', 'ts'),
    field('employeeId', 'uuid'),
    field('employeeCode', 'text'),
    field('visitDate', 'date'),
    field('visitStatus', 'text'),
    field('note', 'text'),
  ],
  create: grievanceCreateBody,
  patch: grievancePatchBody,
  filters: {
    status: { column: 'status', schema: filterText },
    employeeId: { column: 'employee_id', schema: filterUuid },
  },
  orderBy: 'raised_at desc, code',
  // Resolved and closed set closed_at; open and in_review clear it (design point d).
  prepare: async ({ existing, row }) => {
    const status = String(row['status'] ?? existing?.['status'] ?? 'open');
    const currentClosedAt = (existing?.['closedAt'] as Date | string | null | undefined) ?? null;
    return { closedAt: closedAtFor(status, currentClosedAt, new Date()) };
  },
};

export const notificationSpec: ResourceSpec = {
  table: 'core_notification',
  prefix: RECORD_PREFIX,
  label: 'Notification',
  fields: [
    field('recipientUserId', 'uuid'),
    field('notificationType', 'text'),
    field('sourceType', 'text'),
    field('sourceId', 'uuid'),
    field('title', 'text'),
    field('body', 'text'),
    field('deliveryStatus', 'text'),
    field('readAt', 'ts'),
  ],
  create: notificationCreateBody,
  patch: z.object({ rowVersion: z.number().int().min(1) }),
  // Only the service reads notifications, and only for the signed-in recipient.
  filters: { recipientUserId: { column: 'recipient_user_id', schema: filterUuid } },
  orderBy: 'created_at desc, id',
};

export const ticketSpec: ResourceSpec = {
  table: 'core_ticket',
  prefix: RECORD_PREFIX,
  label: 'Ticket',
  fields: [
    field('code', 'text'),
    field('subject', 'text'),
    field('category', 'text'),
    field('priority', 'text'),
    field('description', 'text'),
    field('status', 'text'),
    field('raisedByUserId', 'uuid'),
    field('answer', 'text'),
  ],
  create: ticketCreateBody,
  patch: ticketPatchBody,
  filters: {
    status: { column: 'status', schema: filterText },
    priority: { column: 'priority', schema: filterText },
  },
  orderBy: 'created_at desc, code',
  prepare: async ({ existing, actor }) => (existing ? {} : { raisedByUserId: actor.actorId }),
};

export const importBatchSpec: ResourceSpec = {
  table: 'core_import_batch',
  prefix: RECORD_PREFIX,
  label: 'Import batch',
  fields: [
    field('batchCode', 'text'),
    field('importType', 'text'),
    field('uploadFileId', 'uuid'),
    field('templateVersion', 'text'),
    field('uploadedBy', 'uuid'),
    field('totalRows', 'int'),
    field('validRows', 'int'),
    field('errorRows', 'int'),
    field('status', 'text'),
    field('submittedAt', 'ts'),
    field('requesterMode', 'text'),
    field('expiresAt', 'ts'),
  ],
  create: importBatchCreateBody,
  patch: importBatchPatchBody,
  filters: {
    status: { column: 'status', schema: filterText },
    importType: { column: 'import_type', schema: filterText },
  },
  orderBy: 'created_at desc, batch_code',
  prepare: async ({ existing, actor }) => (existing ? {} : { uploadedBy: actor.actorId }),
};

export const importRowSpec: ResourceSpec = {
  table: 'core_import_row',
  prefix: RECORD_PREFIX,
  label: 'Import row',
  fields: [
    field('batchId', 'uuid'),
    field('rowNumber', 'int'),
    field('rawValues', 'json'),
    field('validatedValues', 'json'),
    field('errorMessages', 'json'),
    field('linkedRecordType', 'text'),
    field('linkedRecordId', 'uuid'),
    field('status', 'text'),
    field('createdIds', 'json'),
  ],
  // Rows are written only through POST /import-batches/:id/rows, so the create shape is the nested one.
  create: importRowCreateBody,
  patch: importRowPatchBody,
  filters: {
    batchId: { column: 'batch_id', schema: filterUuid },
    status: { column: 'status', schema: filterText },
  },
  orderBy: 'batch_id, row_number',
};

export const usageCounterSpec: ResourceSpec = {
  table: 'core_usage_counter',
  prefix: RECORD_PREFIX,
  label: 'Usage counter',
  fields: [
    field('metric', 'text'),
    field('scopeKey', 'text'),
    field('weekStart', 'date'),
    field('counterValue', 'num'),
  ],
  // Counters change only through POST /usage-counters/increment, so the generic writes are never registered.
  create: usageIncrementBody,
  patch: z.object({ rowVersion: z.number().int().min(1) }),
  filters: {
    metric: { column: 'metric', schema: filterText },
    scopeKey: { column: 'scope_key', schema: filterText },
  },
  orderBy: 'week_start desc, metric, scope_key',
};
