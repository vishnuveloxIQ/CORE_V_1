import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { scopeFrom } from '../access/policy.js';
import { userMayAct } from '../access/service.js';
import { AppError } from '../../core/errors.js';
import { one, snapshotOf } from '../../core/rows.js';
import {
  type Actor,
  auditWrite,
  createRecord,
  findRecord,
  listRecords,
  notFound,
  type Row,
  updateRecord,
  versionConflict,
} from '../../core/resource.js';
import { FILE_CONTENT_MAX_BYTES, isDraft, mediaTypeOf } from './rules.js';
import {
  fileSpec,
  importBatchSpec,
  importRowSpec,
  notificationSpec,
  usageCounterSpec,
} from './resources.js';
import type { importRowCreateBody, notificationCreateBody, usageIncrementBody } from './schema.js';

type NotificationInput = z.infer<typeof notificationCreateBody>;
type ImportRowInput = z.infer<typeof importRowCreateBody>;
type UsageIncrement = z.infer<typeof usageIncrementBody>;

/** The signed-in user's id. Routes that reach here have passed the auth guard, so a missing id is a server error. */
function signedInUser(actor: Actor): string {
  if (actor.actorId === null) throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
  return actor.actorId;
}

function notDraft(): AppError {
  return new AppError('RECORD_BATCH_NOT_DRAFT', 409, 'The import batch is no longer a draft');
}

// Notifications (design point e). A user sees and marks only their own rows.

export async function listOwnNotifications(client: PoolClient, actor: Actor): Promise<Row[]> {
  return listRecords(client, notificationSpec, { recipientUserId: signedInUser(actor) });
}

export async function ownNotification(client: PoolClient, actor: Actor, id: string): Promise<Row> {
  const row = await findRecord(client, notificationSpec, id, false);
  if (!row || row['recipientUserId'] !== signedInUser(actor)) throw notFound(notificationSpec);
  return row;
}

/** Sets read_at once. A second read leaves the first time in place. */
export async function markNotificationRead(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<Row> {
  const row = await findRecord(client, notificationSpec, id, true);
  if (!row || row['recipientUserId'] !== signedInUser(actor)) throw notFound(notificationSpec);
  if (row['readAt'] !== null && row['readAt'] !== undefined) return row;
  return updateRecord(client, notificationSpec, actor, id, Number(row['rowVersion']), {
    readAt: new Date(),
  });
}

export function createNotification(
  client: PoolClient,
  actor: Actor,
  input: NotificationInput,
): Promise<Row> {
  return createRecord(client, notificationSpec, actor, input);
}

// Import batches (design point g). A batch is a draft until it is submitted.

/** Submits a draft batch and records the row count. Only a draft can be submitted. */
export async function submitBatch(
  client: PoolClient,
  actor: Actor,
  id: string,
  rowVersion: number,
): Promise<Row> {
  const batch = await findRecord(client, importBatchSpec, id, true);
  if (!batch) throw notFound(importBatchSpec);
  if (batch['rowVersion'] !== rowVersion) throw versionConflict();
  if (!isDraft(String(batch['status']))) throw notDraft();

  const counted = await one<{ total: number }>(
    client,
    'SELECT count(*)::int AS total FROM core_import_row WHERE batch_id = $1',
    [id],
  );
  return updateRecord(client, importBatchSpec, actor, id, rowVersion, {
    status: 'submitted',
    submittedAt: new Date(),
    totalRows: counted?.total ?? 0,
  });
}

/** Adds one row to a draft batch. The batch row lock keeps a concurrent submit from slipping in between. */
export async function addImportRow(
  client: PoolClient,
  actor: Actor,
  batchId: string,
  input: ImportRowInput,
): Promise<Row> {
  const batch = await findRecord(client, importBatchSpec, batchId, true);
  if (!batch) throw notFound(importBatchSpec);
  if (!isDraft(String(batch['status']))) throw notDraft();
  return createRecord(client, importRowSpec, actor, {
    batchId,
    rowNumber: input.rowNumber,
    rawValues: input.rawValues,
  });
}

// Usage counters (design point h). One counter per metric, scope and week; the increment adds to it or creates it.

export async function incrementCounter(
  client: PoolClient,
  actor: Actor,
  input: UsageIncrement,
): Promise<Row> {
  const existing = await one<{ id: string }>(
    client,
    `SELECT id FROM core_usage_counter
      WHERE metric = $1 AND scope_key = $2 AND week_start = $3
      FOR UPDATE`,
    [input.metric, input.scopeKey, input.weekStart],
  );
  const before = existing ? await snapshotOf(client, 'core_usage_counter', existing.id) : null;

  const written = await one<{ id: string }>(
    client,
    `INSERT INTO core_usage_counter (metric, scope_key, week_start, counter_value, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (metric, scope_key, week_start) DO UPDATE SET
       counter_value = core_usage_counter.counter_value + EXCLUDED.counter_value,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by,
       row_version = core_usage_counter.row_version + 1
     RETURNING id`,
    [input.metric, input.scopeKey, input.weekStart, input.by, actor.actorId],
  );
  if (!written) throw new Error('The usage counter upsert returned no row');

  await auditWrite(
    client,
    actor,
    'core_usage_counter',
    written.id,
    existing ? 'UPDATE' : 'INSERT',
    before,
    await snapshotOf(client, 'core_usage_counter', written.id),
  );
  const counter = await findRecord(client, usageCounterSpec, written.id, false);
  if (!counter) throw notFound(usageCounterSpec);
  return counter;
}

// File content (migration 0015). The bytes live in core_file_content; the metadata row in core_file.

interface FileHead {
  readonly id: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly visibility: string;
  readonly createdBy: string | null;
}

async function fileHead(client: PoolClient, id: string, lock: boolean): Promise<FileHead | null> {
  return one<FileHead>(
    client,
    `SELECT id, content_type AS "contentType", CAST(size_bytes AS double precision) AS "sizeBytes",
            visibility, created_by AS "createdBy"
     FROM core_file WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
}

export interface StoredFileContent {
  readonly id: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/**
 * Stores the bytes of one file, replacing any earlier content. The declared size and the content type of the
 * file row must match the upload. The checksum is written back to core_file, in the same transaction.
 */
export async function storeFileContent(
  client: PoolClient,
  actor: Actor,
  fileId: string,
  mediaType: string,
  content: Buffer,
): Promise<StoredFileContent> {
  const head = await fileHead(client, fileId, true);
  if (!head) throw notFound(fileSpec);
  if (content.length === 0) throw new AppError('FILE_EMPTY', 400, 'The file is empty');
  if (content.length > FILE_CONTENT_MAX_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'The file is larger than 2 MB');
  }
  if (mediaTypeOf(head.contentType) !== mediaType) {
    throw new AppError(
      'FILE_CONTENT_TYPE_MISMATCH',
      400,
      'The content type does not match the file record',
    );
  }
  if (head.sizeBytes !== content.length) {
    throw new AppError('FILE_SIZE_MISMATCH', 400, 'The size does not match the file record');
  }

  const sha256 = createHash('sha256').update(content).digest('hex');
  const before = await snapshotOf(client, 'core_file', fileId);
  await client.query(
    `INSERT INTO core_file_content (file_id, content, sha256, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (file_id) DO UPDATE
       SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256,
           updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [fileId, content, sha256, actor.actorId],
  );
  await one<{ id: string }>(
    client,
    `UPDATE core_file SET sha256 = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1
     WHERE id = $3 RETURNING id`,
    [sha256, actor.actorId, fileId],
  );
  await auditWrite(
    client,
    actor,
    'core_file',
    fileId,
    'UPDATE',
    before,
    await snapshotOf(client, 'core_file', fileId),
  );
  return { id: fileId, sizeBytes: content.length, sha256 };
}

export interface ReadFileContent {
  readonly contentType: string;
  readonly content: Buffer;
}

/** True when the file is the logo of the company profile. The logo is shown to every signed-in user. */
async function isCompanyLogo(client: PoolClient, fileId: string): Promise<boolean> {
  const row = await one<{ found: number }>(
    client,
    'SELECT 1 AS found FROM core_company_profile WHERE logo_file_id = $1 LIMIT 1',
    [fileId],
  );
  return row !== null;
}

/**
 * Returns the stored bytes of one file. A private file is readable by its creator and by anyone holding the
 * management privilege, except that the company logo is readable by any signed-in user; team and company files
 * by any signed-in user of the tenant.
 */
export async function readFileContent(
  client: PoolClient,
  actor: Actor,
  fileId: string,
  managePrivilege: string,
): Promise<ReadFileContent> {
  const head = await fileHead(client, fileId, false);
  if (!head) throw notFound(fileSpec);
  if (head.visibility === 'private' && head.createdBy !== actor.actorId && !(await isCompanyLogo(client, fileId))) {
    const mayManage =
      actor.actorId !== null &&
      (await userMayAct(client, actor.actorId, managePrivilege, scopeFrom({})));
    if (!mayManage) {
      throw new AppError('ACCESS_DENIED', 403, 'You do not have access to this action');
    }
  }
  const stored = await one<{ content: Buffer }>(
    client,
    'SELECT content FROM core_file_content WHERE file_id = $1',
    [fileId],
  );
  if (!stored) {
    throw new AppError('RECORD_FILE_CONTENT_NOT_FOUND', 404, 'File content not found');
  }
  return { contentType: head.contentType, content: stored.content };
}
