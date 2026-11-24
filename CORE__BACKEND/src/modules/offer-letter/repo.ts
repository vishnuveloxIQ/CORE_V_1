import type { PoolClient } from 'pg';
import { insertRow, many, one } from '../../core/rows.js';

export const REVISION_TABLE = 'core_offer_letter_revision';

/** One revision in API shape. createdBy is the uploader's name, else their login, else null. */
export interface RevisionRecord {
  id: string;
  revision: number;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  createdBy: string | null;
  hasContent: boolean;
}

/** Revisions newest first. hasContent is true when the file's bytes are stored in core_file_content. */
export function listRevisionRows(client: PoolClient): Promise<RevisionRecord[]> {
  return many<RevisionRecord>(
    client,
    `SELECT r.id, r.revision, r.file_id AS "fileId", r.file_name AS "fileName",
            r.mime_type AS "mimeType", r.size_bytes::bigint AS "sizeBytes",
            r.created_at AS "createdAt",
            COALESCE(NULLIF(u.name, ''), u.login_id::text) AS "createdBy",
            EXISTS (SELECT 1 FROM core_file_content c WHERE c.file_id = r.file_id) AS "hasContent"
     FROM ${REVISION_TABLE} r
     LEFT JOIN core_user u ON u.id = r.created_by
     ORDER BY r.revision DESC`,
  );
}

export function findRevisionRow(client: PoolClient, id: string): Promise<RevisionRecord | null> {
  return one<RevisionRecord>(
    client,
    `SELECT r.id, r.revision, r.file_id AS "fileId", r.file_name AS "fileName",
            r.mime_type AS "mimeType", r.size_bytes::bigint AS "sizeBytes",
            r.created_at AS "createdAt",
            COALESCE(NULLIF(u.name, ''), u.login_id::text) AS "createdBy",
            EXISTS (SELECT 1 FROM core_file_content c WHERE c.file_id = r.file_id) AS "hasContent"
     FROM ${REVISION_TABLE} r
     LEFT JOIN core_user u ON u.id = r.created_by
     WHERE r.id = $1`,
    [id],
  );
}

/** The file row fields the revision check needs. */
export function findFileOwner(
  client: PoolClient,
  fileId: string,
): Promise<{ ownerType: string | null; ownerId: string | null } | null> {
  return one<{ ownerType: string | null; ownerId: string | null }>(
    client,
    `SELECT owner_type AS "ownerType", owner_id::text AS "ownerId" FROM core_file WHERE id = $1`,
    [fileId],
  );
}

/** The next revision number: the highest stored plus one, or 1 when there are none. */
export async function nextRevisionNumber(client: PoolClient): Promise<number> {
  const row = await one<{ next: number }>(
    client,
    `SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM ${REVISION_TABLE}`,
  );
  return row?.next ?? 1;
}

export function insertRevisionRow(
  client: PoolClient,
  values: {
    revision: number;
    fileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
  actorId: string | null,
): Promise<string> {
  return insertRow(
    client,
    REVISION_TABLE,
    [
      { name: 'revision' },
      { name: 'file_id' },
      { name: 'file_name' },
      { name: 'mime_type' },
      { name: 'size_bytes' },
    ],
    [values.revision, values.fileId, values.fileName, values.mimeType, values.sizeBytes],
    actorId,
  );
}
