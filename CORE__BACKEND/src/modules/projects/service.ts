import type { PoolClient } from 'pg';
import { type AuditOp, appendAuditRow } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import { normaliseWeekOffDays } from '../organisation/rules.js';
import {
  chainageRangeIssue,
  coordinatePairIssue,
  geoShapeIssue,
  milestoneWeightIssue,
  projectDatesIssue,
  zoneGeometryChanged,
} from './rules.js';
import {
  ancestorWbsNodes,
  type ChainageMarkerFields,
  type ChainageMarkerRecord,
  deleteRow,
  findLocation,
  findMarker,
  findMilestone,
  findProject,
  findStore,
  findWbsNode,
  findZone,
  type GeoZoneFields,
  type GeoZoneRecord,
  insertLocation,
  insertMarker,
  insertMilestone,
  insertProject,
  insertStore,
  insertWbsNode,
  insertZone,
  listLocations,
  listMarkers,
  listMilestones,
  listProjects,
  listStores,
  listWbsNodes,
  listZones,
  type LocationFields,
  type LocationRecord,
  type MilestoneFields,
  type MilestoneRecord,
  otherMilestoneWeights,
  type ProjectFields,
  type ProjectRecord,
  PROJ_TABLE,
  type ProjTable,
  snapshotOf,
  type StoreFields,
  type StoreRecord,
  updateLocation,
  updateMarker,
  updateMilestone,
  updateProject,
  updateStore,
  updateWbsNode,
  updateZone,
  type WbsNodeFields,
  type WbsNodeRecord,
} from './repo.js';
import type {
  ChainageMarkerInput,
  ChainageMarkerPatch,
  GeoZoneInput,
  GeoZonePatch,
  LocationInput,
  LocationPatch,
  MilestoneInput,
  MilestonePatch,
  ProjectInput,
  ProjectPatch,
  StoreInput,
  StorePatch,
  WbsNodeInput,
  WbsNodePatch,
} from './schema.js';

const AUDIT_MODULE = 'core';

/** Who acts, and the request id that ties the audit rows of one request together. */
export interface Actor {
  actorId: string | null;
  correlationId: string | null;
}

interface Issue {
  path: string;
  message: string;
}

const DUPLICATE_MESSAGES: Record<string, string> = {
  core_project_code_key: 'A project with this code already exists',
  core_location_code_key: 'A location with this code already exists',
  core_store_code_key: 'A store with this code already exists',
  core_wbs_node_project_code_key: 'A WBS node with this code already exists in this project',
  core_chainage_marker_project_code_key:
    'A chainage marker with this code already exists in this project',
};

function invalid(issues: Issue[]): AppError {
  return new AppError('VALIDATION_ERROR', 400, 'Request validation failed', { issues });
}

/** Throws a validation error for the first rule that failed, if any. */
function ruleCheck(path: string, message: string | null): void {
  if (message !== null) throw invalid([{ path, message }]);
}

function notFound(code: string, message: string): AppError {
  return new AppError(code, 404, message);
}

function versionConflict(): AppError {
  return new AppError(
    'VERSION_CONFLICT',
    409,
    'The record changed since you read it. Reload it and try again',
  );
}

/** Optimistic lock. Every change to an existing row names the version it read (design point l). */
function checkVersion(currentVersion: number, supplied: number | undefined): void {
  if (supplied === undefined) {
    throw new AppError('VERSION_REQUIRED', 400, 'row_version is required to change this record');
  }
  if (supplied !== currentVersion) throw versionConflict();
}

/** Applies the fields the caller sent. A missing field keeps its value; null clears a nullable one. */
function merge<T extends object>(base: T, changes: object): T {
  const sent = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  return { ...base, ...sent };
}

/** A referenced row is missing, or belongs to another row this write may not touch. */
function referenceMissing(): AppError {
  return new AppError('PROJECTS_REFERENCE_NOT_FOUND', 400, 'A referenced record does not exist');
}

function referenceMismatch(message: string): AppError {
  return new AppError('PROJECTS_REFERENCE_MISMATCH', 400, message);
}

/** Turns Postgres errors into API errors. Anything unrecognised is rethrown as it was. */
function mapDatabaseError(err: unknown, onForeignKey: 'reference' | 'in_use'): unknown {
  if (err instanceof AppError) return err;
  const pgErr = err as { code?: unknown; constraint?: unknown };
  if (pgErr.code === '23505') {
    const constraint = typeof pgErr.constraint === 'string' ? pgErr.constraint : '';
    return new AppError(
      'PROJECTS_DUPLICATE',
      409,
      DUPLICATE_MESSAGES[constraint] ?? 'That value already exists',
    );
  }
  if (pgErr.code === '23503') {
    return onForeignKey === 'in_use'
      ? new AppError('PROJECTS_IN_USE', 409, 'This record is in use and cannot be deleted')
      : referenceMissing();
  }
  if (pgErr.code === '23514') {
    return new AppError('VALIDATION_ERROR', 400, 'A value breaks a stored rule');
  }
  return err;
}

/** Runs one write, mapping database errors to API errors. The caller's transaction rolls back on throw. */
async function guardWrite<T>(
  work: () => Promise<T>,
  onForeignKey: 'reference' | 'in_use' = 'reference',
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw mapDatabaseError(err, onForeignKey);
  }
}

/** Appends the audit row for one change, in the same transaction as the change (design point m). */
async function auditChange(
  client: PoolClient,
  actor: Actor,
  table: ProjTable,
  recordId: string,
  op: AuditOp,
  oldRow: Record<string, unknown> | null,
  newRow: Record<string, unknown> | null,
): Promise<void> {
  await appendAuditRow(client, {
    tableName: table,
    recordId,
    op,
    oldRow,
    newRow,
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
}

/** Inserts one row, audits it, and returns its id. */
async function insertWithAudit(
  client: PoolClient,
  actor: Actor,
  table: ProjTable,
  write: () => Promise<string>,
): Promise<string> {
  const id = await guardWrite(write);
  await auditChange(client, actor, table, id, 'INSERT', null, await snapshotOf(client, table, id));
  return id;
}

/** Writes one change to an existing row under the version guard, then audits it. */
async function updateWithAudit(
  client: PoolClient,
  actor: Actor,
  table: ProjTable,
  id: string,
  write: () => Promise<boolean>,
): Promise<void> {
  const before = await snapshotOf(client, table, id);
  const updated = await guardWrite(write);
  if (!updated) throw versionConflict();
  await auditChange(
    client,
    actor,
    table,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, table, id),
  );
}

/** Deletes one row and audits it. The caller has already checked the row exists. */
async function deleteWithAudit(
  client: PoolClient,
  actor: Actor,
  table: ProjTable,
  id: string,
): Promise<void> {
  const before = await snapshotOf(client, table, id);
  await guardWrite(() => deleteRow(client, table, id), 'in_use');
  await auditChange(client, actor, table, id, 'DELETE', before, null);
}

async function notFoundIfMissing<T>(
  found: Promise<T | null>,
  code: string,
  message: string,
): Promise<T> {
  const value = await found;
  if (value === null) throw notFound(code, message);
  return value;
}

/** Null or undefined stays null. Otherwise the ISO weekdays are deduplicated and sorted. */
function weekOffsOrNull(days: readonly number[] | null | undefined): number[] | null {
  return days === null || days === undefined ? null : normaliseWeekOffDays(days);
}

/** A WBS node used by another row must belong to the same project (design points e and f). */
async function requireWbsInProject(
  client: PoolClient,
  projectId: string,
  wbsNodeId: string,
): Promise<void> {
  const node = await findWbsNode(client, wbsNodeId);
  if (!node) throw referenceMissing();
  if (node.projectId !== projectId) {
    throw referenceMismatch('The WBS node belongs to a different project');
  }
}

// Projects (design point b). Closed by status, never deleted.

function projectFields(input: ProjectInput): ProjectFields {
  return {
    code: input.code,
    name: input.name,
    status: input.status ?? 'active',
    client: input.client ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    valueAmount: input.valueAmount ?? null,
    description: input.description ?? null,
    chainageStartKm: input.chainageStartKm ?? null,
    chainageEndKm: input.chainageEndKm ?? null,
  };
}

export function listProjectRecords(client: PoolClient): Promise<ProjectRecord[]> {
  return listProjects(client);
}

export async function createProject(
  client: PoolClient,
  actor: Actor,
  input: ProjectInput,
): Promise<ProjectRecord> {
  const fields = projectFields(input);
  ruleCheck('endDate', projectDatesIssue(fields.startDate, fields.endDate));
  ruleCheck('chainageEndKm', chainageRangeIssue(fields.chainageStartKm, fields.chainageEndKm));
  const id = await insertWithAudit(client, actor, PROJ_TABLE.project, () =>
    insertProject(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findProject(client, id), 'PROJECT_NOT_FOUND', 'Project not found');
}

export async function updateProjectRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: ProjectPatch,
): Promise<ProjectRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findProject(client, id, true),
    'PROJECT_NOT_FOUND',
    'Project not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<ProjectFields>(current, changes);
  ruleCheck('endDate', projectDatesIssue(merged.startDate, merged.endDate));
  // The range is checked on its own. Chainage markers outside a new range are allowed and are not checked here.
  ruleCheck('chainageEndKm', chainageRangeIssue(merged.chainageStartKm, merged.chainageEndKm));
  await updateWithAudit(client, actor, PROJ_TABLE.project, id, () =>
    updateProject(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findProject(client, id), 'PROJECT_NOT_FOUND', 'Project not found');
}

// Locations (design point c). Deactivated, not deleted. projectId is fixed at create.

function locationFields(input: LocationInput): LocationFields {
  return {
    code: input.code,
    name: input.name,
    projectId: input.projectId,
    status: input.status ?? 'active',
    addressLine: input.addressLine ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    pin: input.pin ?? null,
    inCharge: input.inCharge ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    chainageStartKm: input.chainageStartKm ?? null,
    chainageEndKm: input.chainageEndKm ?? null,
    weekOffDays: weekOffsOrNull(input.weekOffDays),
  };
}

function locationChecks(f: LocationFields): void {
  ruleCheck('latitude', coordinatePairIssue(f.latitude, f.longitude));
  ruleCheck('chainageEndKm', chainageRangeIssue(f.chainageStartKm, f.chainageEndKm));
}

export function listLocationRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<LocationRecord[]> {
  return listLocations(client, projectId);
}

export async function createLocation(
  client: PoolClient,
  actor: Actor,
  input: LocationInput,
): Promise<LocationRecord> {
  const fields = locationFields(input);
  locationChecks(fields);
  const id = await insertWithAudit(client, actor, PROJ_TABLE.location, () =>
    insertLocation(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findLocation(client, id), 'LOCATION_NOT_FOUND', 'Location not found');
}

export async function updateLocationRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: LocationPatch,
): Promise<LocationRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findLocation(client, id, true),
    'LOCATION_NOT_FOUND',
    'Location not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<LocationFields>(current, changes);
  const fields: LocationFields = { ...merged, weekOffDays: weekOffsOrNull(merged.weekOffDays) };
  locationChecks(fields);
  await updateWithAudit(client, actor, PROJ_TABLE.location, id, () =>
    updateLocation(client, id, current.rowVersion, fields, actor.actorId),
  );
  return notFoundIfMissing(findLocation(client, id), 'LOCATION_NOT_FOUND', 'Location not found');
}

// Stores (design point d). Deactivated, not deleted.

function storeFields(input: StoreInput): StoreFields {
  return {
    code: input.code,
    name: input.name,
    locationId: input.locationId,
    status: input.status ?? 'active',
    locationText: input.locationText ?? null,
    keeper: input.keeper ?? null,
    phone: input.phone ?? null,
    chainageMarkerId: input.chainageMarkerId ?? null,
  };
}

/** A store sits at a location, and its chainage marker must be on the same project as that location. */
async function requireStoreReferences(
  client: PoolClient,
  locationId: string,
  chainageMarkerId: string | null,
): Promise<void> {
  const location = await findLocation(client, locationId);
  if (!location) throw referenceMissing();
  if (chainageMarkerId === null) return;
  const marker = await findMarker(client, chainageMarkerId);
  if (!marker) throw referenceMissing();
  if (marker.projectId !== location.projectId) {
    throw referenceMismatch('The chainage marker belongs to a different project than the location');
  }
}

export function listStoreRecords(client: PoolClient): Promise<StoreRecord[]> {
  return listStores(client);
}

export async function createStore(
  client: PoolClient,
  actor: Actor,
  input: StoreInput,
): Promise<StoreRecord> {
  const fields = storeFields(input);
  await requireStoreReferences(client, fields.locationId, fields.chainageMarkerId);
  const id = await insertWithAudit(client, actor, PROJ_TABLE.store, () =>
    insertStore(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findStore(client, id), 'STORE_NOT_FOUND', 'Store not found');
}

export async function updateStoreRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: StorePatch,
): Promise<StoreRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findStore(client, id, true),
    'STORE_NOT_FOUND',
    'Store not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<StoreFields>(current, changes);
  await requireStoreReferences(client, merged.locationId, merged.chainageMarkerId);
  await updateWithAudit(client, actor, PROJ_TABLE.store, id, () =>
    updateStore(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findStore(client, id), 'STORE_NOT_FOUND', 'Store not found');
}

// WBS nodes (design point e). Deleted only when nothing refers to them.

function wbsNodeFields(input: WbsNodeInput): WbsNodeFields {
  return {
    code: input.code,
    name: input.name,
    projectId: input.projectId,
    parentWbsNodeId: input.parentWbsNodeId ?? null,
    status: input.status ?? 'active',
  };
}

export function listWbsNodeRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<WbsNodeRecord[]> {
  return listWbsNodes(client, projectId);
}

export async function createWbsNode(
  client: PoolClient,
  actor: Actor,
  input: WbsNodeInput,
): Promise<WbsNodeRecord> {
  const fields = wbsNodeFields(input);
  if (fields.parentWbsNodeId !== null) {
    await requireWbsInProject(client, fields.projectId, fields.parentWbsNodeId);
  }
  const id = await insertWithAudit(client, actor, PROJ_TABLE.wbsNode, () =>
    insertWbsNode(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findWbsNode(client, id), 'WBS_NODE_NOT_FOUND', 'WBS node not found');
}

export async function updateWbsNodeRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: WbsNodePatch,
): Promise<WbsNodeRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findWbsNode(client, id, true),
    'WBS_NODE_NOT_FOUND',
    'WBS node not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<WbsNodeFields>(current, changes);
  if (merged.parentWbsNodeId !== null) {
    await requireWbsInProject(client, merged.projectId, merged.parentWbsNodeId);
    // The walk starts at the new parent and includes it, so a parent equal to this node is caught too.
    const chain = await ancestorWbsNodes(client, merged.parentWbsNodeId);
    if (chain.includes(id)) {
      throw new AppError(
        'PROJECTS_CYCLE',
        400,
        'A WBS node cannot be placed under its own children',
      );
    }
  }
  await updateWithAudit(client, actor, PROJ_TABLE.wbsNode, id, () =>
    updateWbsNode(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findWbsNode(client, id), 'WBS_NODE_NOT_FOUND', 'WBS node not found');
}

export async function deleteWbsNode(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(
    findWbsNode(client, id, true),
    'WBS_NODE_NOT_FOUND',
    'WBS node not found',
  );
  await deleteWithAudit(client, actor, PROJ_TABLE.wbsNode, id);
}

// Chainage markers (design point f). Deleted only when nothing refers to them.

function markerFields(input: ChainageMarkerInput): ChainageMarkerFields {
  return {
    code: input.code,
    label: input.label ?? null,
    projectId: input.projectId,
    chainageKm: input.chainageKm,
    wbsNodeId: input.wbsNodeId ?? null,
  };
}

export function listMarkerRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<ChainageMarkerRecord[]> {
  return listMarkers(client, projectId);
}

export async function createMarker(
  client: PoolClient,
  actor: Actor,
  input: ChainageMarkerInput,
): Promise<ChainageMarkerRecord> {
  const fields = markerFields(input);
  if (fields.wbsNodeId !== null) {
    await requireWbsInProject(client, fields.projectId, fields.wbsNodeId);
  }
  const id = await insertWithAudit(client, actor, PROJ_TABLE.marker, () =>
    insertMarker(client, fields, actor.actorId),
  );
  return notFoundIfMissing(
    findMarker(client, id),
    'CHAINAGE_MARKER_NOT_FOUND',
    'Chainage marker not found',
  );
}

export async function updateMarkerRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: ChainageMarkerPatch,
): Promise<ChainageMarkerRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findMarker(client, id, true),
    'CHAINAGE_MARKER_NOT_FOUND',
    'Chainage marker not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<ChainageMarkerFields>(current, changes);
  if (merged.wbsNodeId !== null) {
    await requireWbsInProject(client, merged.projectId, merged.wbsNodeId);
  }
  await updateWithAudit(client, actor, PROJ_TABLE.marker, id, () =>
    updateMarker(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(
    findMarker(client, id),
    'CHAINAGE_MARKER_NOT_FOUND',
    'Chainage marker not found',
  );
}

export async function deleteMarker(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(
    findMarker(client, id, true),
    'CHAINAGE_MARKER_NOT_FOUND',
    'Chainage marker not found',
  );
  await deleteWithAudit(client, actor, PROJ_TABLE.marker, id);
}

// Geo zones (design point g). The version rises by one when the geometry changes.

function zoneFields(input: GeoZoneInput): GeoZoneFields {
  return {
    projectId: input.projectId,
    label: input.label,
    zoneType: input.zoneType,
    shape: input.shape,
    centerLat: input.centerLat ?? null,
    centerLng: input.centerLng ?? null,
    radiusM: input.radiusM ?? null,
    points: input.points ?? null,
    bufferM: input.bufferM ?? null,
    version: 1,
  };
}

export function listZoneRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<GeoZoneRecord[]> {
  return listZones(client, projectId);
}

export async function createZone(
  client: PoolClient,
  actor: Actor,
  input: GeoZoneInput,
): Promise<GeoZoneRecord> {
  const fields = zoneFields(input);
  ruleCheck('shape', geoShapeIssue(fields));
  const id = await insertWithAudit(client, actor, PROJ_TABLE.zone, () =>
    insertZone(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findZone(client, id), 'GEO_ZONE_NOT_FOUND', 'Geo zone not found');
}

export async function updateZoneRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: GeoZonePatch,
): Promise<GeoZoneRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findZone(client, id, true),
    'GEO_ZONE_NOT_FOUND',
    'Geo zone not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<GeoZoneFields>(current, changes);
  ruleCheck('shape', geoShapeIssue(merged));
  const version = zoneGeometryChanged(current, merged) ? current.version + 1 : current.version;
  const fields: GeoZoneFields = { ...merged, version };
  await updateWithAudit(client, actor, PROJ_TABLE.zone, id, () =>
    updateZone(client, id, current.rowVersion, fields, actor.actorId),
  );
  return notFoundIfMissing(findZone(client, id), 'GEO_ZONE_NOT_FOUND', 'Geo zone not found');
}

export async function deleteZone(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(findZone(client, id, true), 'GEO_ZONE_NOT_FOUND', 'Geo zone not found');
  await deleteWithAudit(client, actor, PROJ_TABLE.zone, id);
}

// Milestones (design point h). Deleted only when nothing refers to them.

function milestoneFields(input: MilestoneInput): MilestoneFields {
  return {
    projectId: input.projectId,
    name: input.name,
    dueDate: input.dueDate ?? null,
    weight: input.weight ?? null,
    status: input.status ?? 'pending',
  };
}

/**
 * Locks the project row, then checks the total of its milestone weights. Every milestone counts,
 * whatever its status. Locking the project serialises concurrent weight changes for one project.
 */
async function requireWeightWithinLimit(
  client: PoolClient,
  projectId: string,
  excludeId: string | null,
  weight: number | null,
): Promise<void> {
  const project = await findProject(client, projectId, true);
  if (!project) throw referenceMissing();
  const others = await otherMilestoneWeights(client, projectId, excludeId);
  const issue = milestoneWeightIssue(others, weight);
  if (issue !== null) throw new AppError('PROJECTS_WEIGHT_EXCEEDED', 400, issue);
}

export function listMilestoneRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<MilestoneRecord[]> {
  return listMilestones(client, projectId);
}

export async function createMilestone(
  client: PoolClient,
  actor: Actor,
  input: MilestoneInput,
): Promise<MilestoneRecord> {
  const fields = milestoneFields(input);
  await requireWeightWithinLimit(client, fields.projectId, null, fields.weight);
  const id = await insertWithAudit(client, actor, PROJ_TABLE.milestone, () =>
    insertMilestone(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findMilestone(client, id), 'MILESTONE_NOT_FOUND', 'Milestone not found');
}

export async function updateMilestoneRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: MilestonePatch,
): Promise<MilestoneRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findMilestone(client, id, true),
    'MILESTONE_NOT_FOUND',
    'Milestone not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<MilestoneFields>(current, changes);
  await requireWeightWithinLimit(client, current.projectId, id, merged.weight);
  await updateWithAudit(client, actor, PROJ_TABLE.milestone, id, () =>
    updateMilestone(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findMilestone(client, id), 'MILESTONE_NOT_FOUND', 'Milestone not found');
}

export async function deleteMilestone(client: PoolClient, actor: Actor, id: string): Promise<void> {
  await notFoundIfMissing(
    findMilestone(client, id, true),
    'MILESTONE_NOT_FOUND',
    'Milestone not found',
  );
  await deleteWithAudit(client, actor, PROJ_TABLE.milestone, id);
}
