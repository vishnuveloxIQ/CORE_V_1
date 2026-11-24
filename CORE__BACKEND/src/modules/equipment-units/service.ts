import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import {
  type Actor,
  auditWrite,
  definedOnly,
  mapDatabaseError,
  versionConflict,
} from '../../core/resource.js';
import { snapshotOf } from '../../core/rows.js';
import {
  findUnit,
  insertUnit,
  listUnits,
  missingFileIds,
  type UnitRecord,
  UNIT_TABLE,
  updateUnitRow,
} from './repo.js';
import type { UnitCreateInput, UnitFilter, UnitPatchInput } from './schema.js';

/** Prefix of the error codes this module returns (EQUIPMENT_UNIT_NOT_FOUND, EQUIPMENT_UNIT_DUPLICATE, ...). */
const PREFIX = 'EQUIPMENT_UNIT';

function notFound(): AppError {
  return new AppError(`${PREFIX}_NOT_FOUND`, 404, 'Equipment unit not found');
}

/** Maps a database error from one write to an API error. The caller's transaction rolls back on throw. */
async function guardWrite<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw mapDatabaseError(PREFIX, err, 'reference');
  }
}

async function requireUnit(client: PoolClient, id: string): Promise<UnitRecord> {
  const row = await findUnit(client, id);
  if (!row) throw notFound();
  return row;
}

/**
 * Every file the write links (photoFileId and each documents value) must exist in core_file, or the write is refused
 * with 400 EQUIPMENT_UNIT_FILE_NOT_FOUND naming the first missing field.
 */
async function requireFiles(
  client: PoolClient,
  input: Pick<UnitPatchInput, 'photoFileId' | 'documents'>,
): Promise<void> {
  const links: { path: string; id: string }[] = [];
  if (typeof input.photoFileId === 'string')
    links.push({ path: 'photoFileId', id: input.photoFileId });
  for (const [key, id] of Object.entries(input.documents ?? {})) {
    if (typeof id === 'string') links.push({ path: `documents.${key}`, id });
  }
  const missing = new Set(await missingFileIds(client, [...new Set(links.map((l) => l.id))]));
  const first = links.find((l) => missing.has(l.id));
  if (first) {
    throw new AppError(`${PREFIX}_FILE_NOT_FOUND`, 400, 'A linked file does not exist', {
      issues: [{ path: first.path, message: 'No file with this id' }],
    });
  }
}

/** The register, filtered by equipment type, availability status and asset code. */
export function listUnitRecords(client: PoolClient, filter: UnitFilter): Promise<UnitRecord[]> {
  return listUnits(client, filter);
}

/** Creates a unit and audits it. A duplicate asset code answers 409 EQUIPMENT_UNIT_DUPLICATE. */
export async function createUnit(
  client: PoolClient,
  actor: Actor,
  input: UnitCreateInput,
): Promise<UnitRecord> {
  await requireFiles(client, input);
  const id = await guardWrite(() => insertUnit(client, input, actor.actorId));
  await auditWrite(
    client,
    actor,
    UNIT_TABLE,
    id,
    'INSERT',
    null,
    await snapshotOf(client, UNIT_TABLE, id),
  );
  return requireUnit(client, id);
}

/**
 * Writes the fields the caller sent to one unit. The rowVersion must match the stored version, or the write is
 * refused with 409 VERSION_CONFLICT. Fields left out keep their value; null clears a nullable field.
 */
export async function updateUnitRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: UnitPatchInput,
): Promise<UnitRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await findUnit(client, id, true);
  if (!current) throw notFound();
  if (current.rowVersion !== rowVersion) throw versionConflict();

  await requireFiles(client, changes);
  const sent = definedOnly(changes);
  const before = await snapshotOf(client, UNIT_TABLE, id);
  const updated = await guardWrite(() =>
    updateUnitRow(client, id, rowVersion, sent, actor.actorId),
  );
  if (!updated) throw versionConflict();
  await auditWrite(
    client,
    actor,
    UNIT_TABLE,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, UNIT_TABLE, id),
  );
  return requireUnit(client, id);
}
