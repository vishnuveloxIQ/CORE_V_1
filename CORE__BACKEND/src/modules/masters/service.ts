import type { PoolClient } from 'pg';
import { type AuditOp, appendAuditRow } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import {
  type AllocationFields,
  type AllocationRecord,
  type AssignmentFields,
  type AssignmentRecord,
  type EquipmentTypeFields,
  type EquipmentTypeRecord,
  type MastersTable,
  type MaterialFields,
  type MaterialRecord,
  type PlanLineFields,
  type PlanLineRecord,
  type ReferenceKind,
  referenceExists,
  deleteRow,
  findAllocation,
  findAssignment,
  findEquipmentType,
  findMaterial,
  findPlanLine,
  findVendor,
  insertAllocation,
  insertAssignment,
  insertEquipmentType,
  insertMaterial,
  insertPlanLine,
  insertVendor,
  listAllocations,
  listAssignments,
  listEquipmentTypes,
  listMaterials,
  listPlanLines,
  listVendors,
  MASTERS_TABLE,
  snapshotOf,
  storeProjectId,
  type VendorFields,
  type VendorRecord,
  updateAllocation,
  updateAssignment,
  updateEquipmentType,
  updateMaterial,
  updatePlanLine,
  updateVendor,
} from './repo.js';
import {
  planDatesIssue,
  planLineKindIssue,
  planLineStageIssue,
  toleranceKeyAllowed,
  toleranceSettingKey,
} from './rules.js';
import type {
  AllocationInput,
  AllocationPatch,
  AssignmentInput,
  AssignmentPatch,
  EquipmentTypeInput,
  EquipmentTypePatch,
  MaterialInput,
  MaterialPatch,
  PlanLineInput,
  PlanLinePatch,
  VendorInput,
  VendorPatch,
  VendorVerify,
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
  core_vendor_code_key: 'A vendor with this code already exists',
  core_material_code_key: 'A material with this code already exists',
  core_equipment_type_code_key: 'An equipment type with this code already exists',
  core_equipment_assignment_project_type_key:
    'This equipment type is already assigned to this project; change its quantity instead',
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

/** Optimistic lock. Every change to an existing row names the version it read. */
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

/** A referenced row does not exist. */
function referenceMissing(): AppError {
  return new AppError('MASTERS_REFERENCE_NOT_FOUND', 400, 'A referenced record does not exist');
}

function referenceMismatch(message: string): AppError {
  return new AppError('MASTERS_REFERENCE_MISMATCH', 400, message);
}

/** Turns Postgres errors into API errors. Anything unrecognised is rethrown as it was. */
function mapDatabaseError(err: unknown, onForeignKey: 'reference' | 'in_use'): unknown {
  if (err instanceof AppError) return err;
  const pgErr = err as { code?: unknown; constraint?: unknown };
  if (pgErr.code === '23505') {
    const constraint = typeof pgErr.constraint === 'string' ? pgErr.constraint : '';
    return new AppError(
      'MASTERS_DUPLICATE',
      409,
      DUPLICATE_MESSAGES[constraint] ?? 'That value already exists',
    );
  }
  if (pgErr.code === '23503') {
    return onForeignKey === 'in_use'
      ? new AppError('MASTERS_IN_USE', 409, 'This record is in use and cannot be deleted')
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

/** Appends the audit row for one change, in the same transaction as the change. */
async function auditChange(
  client: PoolClient,
  actor: Actor,
  table: MastersTable,
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
  table: MastersTable,
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
  table: MastersTable,
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
  table: MastersTable,
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

/** A row this write refers to must exist in its table. */
async function requireReference(
  client: PoolClient,
  kind: ReferenceKind,
  id: string,
): Promise<void> {
  if (!(await referenceExists(client, kind, id))) throw referenceMissing();
}

// Vendors (design points b and c). Deactivated, not deleted. registered_by is set from the signed-in user.

function vendorFields(input: VendorInput, actorId: string | null): VendorFields {
  return {
    code: input.code,
    name: input.name,
    status: input.status ?? 'active',
    gstin: input.gstin ?? null,
    pan: input.pan ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    registeredBy: actorId,
    verifiedAt: null,
  };
}

export function listVendorRecords(
  client: PoolClient,
  status: string | null,
): Promise<VendorRecord[]> {
  return listVendors(client, status);
}

export async function createVendor(
  client: PoolClient,
  actor: Actor,
  input: VendorInput,
): Promise<VendorRecord> {
  const fields = vendorFields(input, actor.actorId);
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.vendor, () =>
    insertVendor(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findVendor(client, id), 'VENDOR_NOT_FOUND', 'Vendor not found');
}

export async function updateVendorRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: VendorPatch,
): Promise<VendorRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findVendor(client, id, true),
    'VENDOR_NOT_FOUND',
    'Vendor not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<VendorFields>(current, changes);
  await updateWithAudit(client, actor, MASTERS_TABLE.vendor, id, () =>
    updateVendor(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findVendor(client, id), 'VENDOR_NOT_FOUND', 'Vendor not found');
}

/** Sets verified_at to the current time. The verify call names the version it read, as a PATCH does. */
export async function verifyVendor(
  client: PoolClient,
  actor: Actor,
  id: string,
  body: VendorVerify,
): Promise<VendorRecord> {
  const current = await notFoundIfMissing(
    findVendor(client, id, true),
    'VENDOR_NOT_FOUND',
    'Vendor not found',
  );
  checkVersion(current.rowVersion, body.rowVersion);
  const fields: VendorFields = { ...current, verifiedAt: new Date() };
  await updateWithAudit(client, actor, MASTERS_TABLE.vendor, id, () =>
    updateVendor(client, id, current.rowVersion, fields, actor.actorId),
  );
  return notFoundIfMissing(findVendor(client, id), 'VENDOR_NOT_FOUND', 'Vendor not found');
}

// Materials (design point d). Deactivated, not deleted.

function materialFields(input: MaterialInput): MaterialFields {
  return {
    code: input.code,
    name: input.name,
    uomId: input.uomId,
    status: input.status ?? 'active',
    hsn: input.hsn ?? null,
    reorderLevel: input.reorderLevel ?? null,
    category: input.category ?? null,
    subCategory: input.subCategory ?? null,
  };
}

export function listMaterialRecords(
  client: PoolClient,
  status: string | null,
): Promise<MaterialRecord[]> {
  return listMaterials(client, status);
}

export async function createMaterial(
  client: PoolClient,
  actor: Actor,
  input: MaterialInput,
): Promise<MaterialRecord> {
  const fields = materialFields(input);
  await requireReference(client, 'uom', fields.uomId);
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.material, () =>
    insertMaterial(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findMaterial(client, id), 'MATERIAL_NOT_FOUND', 'Material not found');
}

export async function updateMaterialRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: MaterialPatch,
): Promise<MaterialRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findMaterial(client, id, true),
    'MATERIAL_NOT_FOUND',
    'Material not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<MaterialFields>(current, changes);
  await requireReference(client, 'uom', merged.uomId);
  await updateWithAudit(client, actor, MASTERS_TABLE.material, id, () =>
    updateMaterial(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findMaterial(client, id), 'MATERIAL_NOT_FOUND', 'Material not found');
}

// Equipment types (design point e). The code is fixed after create. The tolerance key is set from it on create.

function equipmentTypeFields(input: EquipmentTypeInput): EquipmentTypeFields {
  return {
    code: input.code,
    name: input.name,
    meterKind: input.meterKind ?? null,
    meterPrecision: input.meterPrecision ?? null,
    fuelNormUnit: input.fuelNormUnit ?? null,
    toleranceSettingKey: toleranceSettingKey(input.code),
    active: input.active ?? true,
  };
}

/** The status filter maps to the active flag: active lists true, inactive lists false. */
export function listEquipmentTypeRecords(
  client: PoolClient,
  active: boolean | null,
): Promise<EquipmentTypeRecord[]> {
  return listEquipmentTypes(client, active);
}

export async function createEquipmentType(
  client: PoolClient,
  actor: Actor,
  input: EquipmentTypeInput,
): Promise<EquipmentTypeRecord> {
  ruleCheck(
    'code',
    toleranceKeyAllowed(input.code) ? null : 'code cannot form a valid tolerance setting key',
  );
  const fields = equipmentTypeFields(input);
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.equipmentType, () =>
    insertEquipmentType(client, fields, actor.actorId),
  );
  return notFoundIfMissing(
    findEquipmentType(client, id),
    'EQUIPMENT_TYPE_NOT_FOUND',
    'Equipment type not found',
  );
}

export async function updateEquipmentTypeRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: EquipmentTypePatch,
): Promise<EquipmentTypeRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findEquipmentType(client, id, true),
    'EQUIPMENT_TYPE_NOT_FOUND',
    'Equipment type not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<EquipmentTypeFields>(current, changes);
  await updateWithAudit(client, actor, MASTERS_TABLE.equipmentType, id, () =>
    updateEquipmentType(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(
    findEquipmentType(client, id),
    'EQUIPMENT_TYPE_NOT_FOUND',
    'Equipment type not found',
  );
}

// Major material allocations (design point f). The project is fixed after create. Delete is allowed.

function allocationFields(input: AllocationInput): AllocationFields {
  return {
    projectId: input.projectId,
    materialId: input.materialId,
    uomId: input.uomId,
    quantity: input.quantity,
    requiredBy: input.requiredBy ?? null,
  };
}

/** The project, material and unit a row refers to must all exist. */
async function requireAllocationReferences(client: PoolClient, f: AllocationFields): Promise<void> {
  await requireReference(client, 'project', f.projectId);
  await requireReference(client, 'material', f.materialId);
  await requireReference(client, 'uom', f.uomId);
}

export function listAllocationRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<AllocationRecord[]> {
  return listAllocations(client, projectId);
}

export async function createAllocation(
  client: PoolClient,
  actor: Actor,
  input: AllocationInput,
): Promise<AllocationRecord> {
  const fields = allocationFields(input);
  await requireAllocationReferences(client, fields);
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.allocation, () =>
    insertAllocation(client, fields, actor.actorId),
  );
  return notFoundIfMissing(
    findAllocation(client, id),
    'ALLOCATION_NOT_FOUND',
    'Allocation not found',
  );
}

export async function updateAllocationRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: AllocationPatch,
): Promise<AllocationRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findAllocation(client, id, true),
    'ALLOCATION_NOT_FOUND',
    'Allocation not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<AllocationFields>(current, changes);
  await requireAllocationReferences(client, merged);
  await updateWithAudit(client, actor, MASTERS_TABLE.allocation, id, () =>
    updateAllocation(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(
    findAllocation(client, id),
    'ALLOCATION_NOT_FOUND',
    'Allocation not found',
  );
}

export async function deleteAllocation(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await notFoundIfMissing(
    findAllocation(client, id, true),
    'ALLOCATION_NOT_FOUND',
    'Allocation not found',
  );
  await deleteWithAudit(client, actor, MASTERS_TABLE.allocation, id);
}

// Equipment assignments (design point g). One row per project and equipment type. PATCH changes qty only.

export function listAssignmentRecords(
  client: PoolClient,
  projectId: string | null,
): Promise<AssignmentRecord[]> {
  return listAssignments(client, projectId);
}

export async function createAssignment(
  client: PoolClient,
  actor: Actor,
  input: AssignmentInput,
): Promise<AssignmentRecord> {
  await requireReference(client, 'project', input.projectId);
  await requireReference(client, 'equipmentType', input.equipmentTypeId);
  const fields: AssignmentFields = {
    projectId: input.projectId,
    equipmentTypeId: input.equipmentTypeId,
    qty: input.qty,
    assignedAt: new Date(),
    assignedByUserId: actor.actorId,
  };
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.assignment, () =>
    insertAssignment(client, fields, actor.actorId),
  );
  return notFoundIfMissing(
    findAssignment(client, id),
    'ASSIGNMENT_NOT_FOUND',
    'Assignment not found',
  );
}

export async function updateAssignmentRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: AssignmentPatch,
): Promise<AssignmentRecord> {
  const current = await notFoundIfMissing(
    findAssignment(client, id, true),
    'ASSIGNMENT_NOT_FOUND',
    'Assignment not found',
  );
  checkVersion(current.rowVersion, patch.rowVersion);
  const fields: AssignmentFields = { ...current, qty: patch.qty };
  await updateWithAudit(client, actor, MASTERS_TABLE.assignment, id, () =>
    updateAssignment(client, id, current.rowVersion, fields, actor.actorId),
  );
  return notFoundIfMissing(
    findAssignment(client, id),
    'ASSIGNMENT_NOT_FOUND',
    'Assignment not found',
  );
}

export async function deleteAssignment(
  client: PoolClient,
  actor: Actor,
  id: string,
): Promise<void> {
  await notFoundIfMissing(
    findAssignment(client, id, true),
    'ASSIGNMENT_NOT_FOUND',
    'Assignment not found',
  );
  await deleteWithAudit(client, actor, MASTERS_TABLE.assignment, id);
}

// Plan lines (design points h and i). The project is fixed after create. Cancelling is a PATCH to status cancelled.

function planLineFields(input: PlanLineInput): PlanLineFields {
  return {
    projectId: input.projectId,
    resourceKind: input.resourceKind,
    equipmentTypeId: input.equipmentTypeId ?? null,
    positionId: input.positionId ?? null,
    role: input.role ?? null,
    materialId: input.materialId ?? null,
    uomId: input.uomId ?? null,
    storeId: input.storeId ?? null,
    quantity: input.quantity ?? null,
    withdrawn: input.withdrawn ?? false,
    fromDate: input.fromDate ?? null,
    toDate: input.toDate ?? null,
    requiredBy: input.requiredBy ?? null,
    status: input.status ?? 'draft',
    stage: input.stage ?? null,
    reason: input.reason ?? null,
    capacity: input.capacity ?? null,
    model: input.model ?? null,
  };
}

/**
 * Cross-field and reference rules for a plan line. A store must sit on the same project through its location.
 * Every reference must exist, so a bad id gets a clear 400 rather than a foreign key error.
 */
async function planLineChecks(client: PoolClient, f: PlanLineFields): Promise<void> {
  ruleCheck('toDate', planDatesIssue(f.fromDate, f.toDate));
  ruleCheck(
    'resourceKind',
    planLineKindIssue(f.resourceKind, {
      equipmentTypeId: f.equipmentTypeId,
      positionId: f.positionId,
      materialId: f.materialId,
      uomId: f.uomId,
    }),
  );
  ruleCheck('stage', planLineStageIssue(f.resourceKind, f.stage));
  await requireReference(client, 'project', f.projectId);
  if (f.equipmentTypeId !== null)
    await requireReference(client, 'equipmentType', f.equipmentTypeId);
  if (f.positionId !== null) await requireReference(client, 'position', f.positionId);
  if (f.materialId !== null) await requireReference(client, 'material', f.materialId);
  if (f.uomId !== null) await requireReference(client, 'uom', f.uomId);
  if (f.storeId !== null) {
    const storeProject = await storeProjectId(client, f.storeId);
    if (storeProject === null) throw referenceMissing();
    if (storeProject !== f.projectId) {
      throw referenceMismatch('The store belongs to a different project than the plan line');
    }
  }
}

export function listPlanLineRecords(
  client: PoolClient,
  projectId: string | null,
  resourceKind: string | null,
): Promise<PlanLineRecord[]> {
  return listPlanLines(client, projectId, resourceKind);
}

export async function createPlanLine(
  client: PoolClient,
  actor: Actor,
  input: PlanLineInput,
): Promise<PlanLineRecord> {
  const fields = planLineFields(input);
  await planLineChecks(client, fields);
  const id = await insertWithAudit(client, actor, MASTERS_TABLE.planLine, () =>
    insertPlanLine(client, fields, actor.actorId),
  );
  return notFoundIfMissing(findPlanLine(client, id), 'PLAN_LINE_NOT_FOUND', 'Plan line not found');
}

export async function updatePlanLineRecord(
  client: PoolClient,
  actor: Actor,
  id: string,
  patch: PlanLinePatch,
): Promise<PlanLineRecord> {
  const { rowVersion, ...changes } = patch;
  const current = await notFoundIfMissing(
    findPlanLine(client, id, true),
    'PLAN_LINE_NOT_FOUND',
    'Plan line not found',
  );
  checkVersion(current.rowVersion, rowVersion);
  const merged = merge<PlanLineFields>(current, changes);
  await planLineChecks(client, merged);
  await updateWithAudit(client, actor, MASTERS_TABLE.planLine, id, () =>
    updatePlanLine(client, id, current.rowVersion, merged, actor.actorId),
  );
  return notFoundIfMissing(findPlanLine(client, id), 'PLAN_LINE_NOT_FOUND', 'Plan line not found');
}
