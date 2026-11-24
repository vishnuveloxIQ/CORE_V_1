import type { PoolClient } from 'pg';
import { lockWithinSchema } from '../../db/tenant.js';
import { AppError } from '../../core/errors.js';
import { type Actor, auditWrite } from '../../core/resource.js';
import { snapshotOf } from '../../core/rows.js';
import {
  findFileOwner,
  findRevisionRow,
  insertRevisionRow,
  listRevisionRows,
  nextRevisionNumber,
  REVISION_TABLE,
  type RevisionRecord,
} from './repo.js';
import {
  OFFER_LETTER_OWNER_ID,
  OFFER_LETTER_OWNER_TYPE,
  type RevisionCreateInput,
} from './schema.js';

/** Every revision, newest first. Nothing is removed, so older letters stay viewable. */
export async function listRevisions(client: PoolClient): Promise<RevisionRecord[]> {
  const rows = await listRevisionRows(client);
  return rows.map(toApi);
}

/**
 * Records a new offer letter revision for a file that is already stored. The revision number is the highest
 * stored plus one, taken under a schema lock so two uploads cannot share a number. The file must exist (404) and
 * must be an offer letter file: owner type offer_letter and the fixed offer letter owner id (400 otherwise).
 */
export async function createRevision(
  client: PoolClient,
  actor: Actor,
  input: RevisionCreateInput,
): Promise<RevisionRecord> {
  await lockWithinSchema(client, 'offer-letter-revision');

  const file = await findFileOwner(client, input.fileId);
  if (!file) {
    throw new AppError('FILE_NOT_FOUND', 404, 'The file does not exist');
  }
  if (file.ownerType !== OFFER_LETTER_OWNER_TYPE || file.ownerId !== OFFER_LETTER_OWNER_ID) {
    throw new AppError('OFFER_LETTER_FILE_OWNER', 400, 'The file is not an offer letter file');
  }

  const revision = await nextRevisionNumber(client);
  const id = await insertRevisionRow(
    client,
    {
      revision,
      fileId: input.fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
    actor.actorId,
  );
  await auditWrite(
    client,
    actor,
    REVISION_TABLE,
    id,
    'INSERT',
    null,
    await snapshotOf(client, REVISION_TABLE, id),
  );

  const created = await findRevisionRow(client, id);
  if (!created) throw new Error(`offer letter revision ${id} was not found after insert`);
  return toApi(created);
}

/** bigint columns come back from pg as strings; the API sends a number. */
function toApi(row: RevisionRecord): RevisionRecord {
  return { ...row, sizeBytes: Number(row.sizeBytes) };
}
