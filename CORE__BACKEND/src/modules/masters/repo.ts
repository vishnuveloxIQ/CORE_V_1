import type { PoolClient } from 'pg';
import {
  type Column,
  deleteRow,
  findRow,
  insertRow,
  many,
  one,
  snapshotOf,
  updateRow,
} from '../../core/rows.js';

/**
 * Master data tables. Only these names are ever interpolated into SQL; they are constants, never input.
 */
export const MASTERS_TABLE = {
  vendor: 'core_vendor',
  material: 'core_material',
  equipmentType: 'core_equipment_type',
  allocation: 'core_major_material_allocation',
  assignment: 'core_equipment_assignment',
  planLine: 'core_plan_line',
} as const;
export type MastersTable = (typeof MASTERS_TABLE)[keyof typeof MASTERS_TABLE];

/** Rows that a master record refers to. Existence checks use only these names. */
const REFERENCE_TABLE = {
  project: 'core_project',
  store: 'core_store',
  material: 'core_material',
  equipmentType: 'core_equipment_type',
  position: 'core_position',
  uom: 'shared.uom',
} as const;
export type ReferenceKind = keyof typeof REFERENCE_TABLE;

/** Storage shapes. Dates are read with to_char and numerics with a double cast, so they come back as plain values. */
export interface VendorFields {
  code: string;
  name: string;
  status: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  registeredBy: string | null;
  verifiedAt: Date | null;
}

export interface MaterialFields {
  code: string;
  name: string;
  uomId: string;
  status: string;
  hsn: string | null;
  reorderLevel: number | null;
  category: string | null;
  subCategory: string | null;
}

export interface EquipmentTypeFields {
  code: string;
  name: string;
  meterKind: string | null;
  meterPrecision: number | null;
  fuelNormUnit: string | null;
  toleranceSettingKey: string;
  active: boolean;
}

export interface AllocationFields {
  projectId: string;
  materialId: string;
  uomId: string;
  quantity: number;
  requiredBy: string | null;
}

export interface AssignmentFields {
  projectId: string;
  equipmentTypeId: string;
  qty: number;
  assignedAt: Date;
  assignedByUserId: string | null;
}

export interface PlanLineFields {
  projectId: string;
  resourceKind: string;
  equipmentTypeId: string | null;
  positionId: string | null;
  role: string | null;
  department: string | null;
  materialId: string | null;
  uomId: string | null;
  storeId: string | null;
  quantity: number | null;
  withdrawn: boolean;
  fromDate: string | null;
  toDate: string | null;
  requiredBy: string | null;
  status: string;
  stage: string | null;
  reason: string | null;
  capacity: string | null;
  model: string | null;
}

export interface Versioned {
  id: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type VendorRecord = VendorFields & Versioned;
export type MaterialRecord = MaterialFields & Versioned & {
  /** the stores this material is available in (core_material_store) */
  storeIds: string[];
};
export type EquipmentTypeRecord = EquipmentTypeFields & Versioned;
/** The unit is read from shared.uom; the allocation table keeps no unit text of its own. */
export type AllocationRecord = AllocationFields & Versioned & { unit: string | null };
export type AssignmentRecord = AssignmentFields & Versioned;
export type PlanLineRecord = PlanLineFields & Versioned;

const TIMESTAMPS = `row_version AS "rowVersion", created_at AS "createdAt", updated_at AS "updatedAt"`;

const VENDOR_SELECT = `id, code, name, status, gstin, pan, email::text AS email, phone, address,
  registered_by AS "registeredBy", verified_at AS "verifiedAt", ${TIMESTAMPS}`;

const MATERIAL_SELECT = `id, code::text AS code, name, uom_id AS "uomId", status, hsn,
  CAST(reorder_level AS double precision) AS "reorderLevel", category,
  sub_category AS "subCategory",
  ARRAY(SELECT a.store_id FROM core_material_store a WHERE a.material_id = core_material.id ORDER BY a.store_id) AS "storeIds",
  ${TIMESTAMPS}`;

const EQUIPMENT_TYPE_SELECT = `id, code::text AS code, name, meter_kind AS "meterKind",
  meter_precision AS "meterPrecision", fuel_norm_unit AS "fuelNormUnit",
  tolerance_setting_key AS "toleranceSettingKey", active, ${TIMESTAMPS}`;

const ALLOCATION_SELECT = `id, project_id AS "projectId", material_id AS "materialId", uom_id AS "uomId",
  CAST(quantity AS double precision) AS quantity, to_char(required_by, 'YYYY-MM-DD') AS "requiredBy",
  (SELECT u.uom_code FROM shared.uom u WHERE u.id = core_major_material_allocation.uom_id) AS unit,
  ${TIMESTAMPS}`;

const ASSIGNMENT_SELECT = `id, project_id AS "projectId", equipment_type_id AS "equipmentTypeId", qty,
  assigned_at AS "assignedAt", assigned_by_user_id AS "assignedByUserId", ${TIMESTAMPS}`;

const PLAN_LINE_SELECT = `id, project_id AS "projectId", resource_kind AS "resourceKind",
  equipment_type_id AS "equipmentTypeId", position_id AS "positionId", role, department,
  material_id AS "materialId", uom_id AS "uomId", store_id AS "storeId",
  CAST(quantity AS double precision) AS quantity, withdrawn,
  to_char(from_date, 'YYYY-MM-DD') AS "fromDate", to_char(to_date, 'YYYY-MM-DD') AS "toDate",
  to_char(required_by, 'YYYY-MM-DD') AS "requiredBy", status, stage, reason,
  capacity, model, ${TIMESTAMPS}`;

const VENDOR_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'status' },
  { name: 'gstin' },
  { name: 'pan' },
  { name: 'email' },
  { name: 'phone' },
  { name: 'address' },
  { name: 'registered_by' },
  { name: 'verified_at' },
];

const MATERIAL_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'uom_id' },
  { name: 'status' },
  { name: 'hsn' },
  { name: 'reorder_level' },
  { name: 'category' },
  { name: 'sub_category' },
];

const EQUIPMENT_TYPE_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'meter_kind' },
  { name: 'meter_precision' },
  { name: 'fuel_norm_unit' },
  { name: 'tolerance_setting_key' },
  { name: 'active' },
];

const ALLOCATION_COLUMNS: readonly Column[] = [
  { name: 'project_id' },
  { name: 'material_id' },
  { name: 'uom_id' },
  { name: 'quantity' },
  { name: 'required_by' },
];

const ASSIGNMENT_COLUMNS: readonly Column[] = [
  { name: 'project_id' },
  { name: 'equipment_type_id' },
  { name: 'qty' },
  { name: 'assigned_at' },
  { name: 'assigned_by_user_id' },
];

const PLAN_LINE_COLUMNS: readonly Column[] = [
  { name: 'project_id' },
  { name: 'resource_kind' },
  { name: 'equipment_type_id' },
  { name: 'position_id' },
  { name: 'role' },
  { name: 'department' },
  { name: 'material_id' },
  { name: 'uom_id' },
  { name: 'store_id' },
  { name: 'quantity' },
  { name: 'withdrawn' },
  { name: 'from_date' },
  { name: 'to_date' },
  { name: 'required_by' },
  { name: 'status' },
  { name: 'stage' },
  { name: 'reason' },
  { name: 'capacity' },
  { name: 'model' },
];

/** True when a row with this id exists in the named reference table. */
export async function referenceExists(
  client: PoolClient,
  kind: ReferenceKind,
  id: string,
): Promise<boolean> {
  const row = await one<{ found: number }>(
    client,
    `SELECT 1 AS found FROM ${REFERENCE_TABLE[kind]} WHERE id = $1`,
    [id],
  );
  return row !== null;
}

/** The project a store belongs to. Null when the store does not exist. */
export async function storeProjectId(client: PoolClient, storeId: string): Promise<string | null> {
  const row = await one<{ projectId: string }>(
    client,
    `SELECT s.project_id AS "projectId"
     FROM core_store s
     WHERE s.id = $1`,
    [storeId],
  );
  return row?.projectId ?? null;
}

// Vendors. Deactivated, not deleted. The optional status filter applies to the list.

export function listVendors(client: PoolClient, status: string | null): Promise<VendorRecord[]> {
  return many<VendorRecord>(
    client,
    `SELECT ${VENDOR_SELECT} FROM core_vendor
     WHERE ($1::text IS NULL OR status = $1) ORDER BY lower(code)`,
    [status],
  );
}

export function findVendor(client: PoolClient, id: string, lock = false) {
  return findRow<VendorRecord>(client, MASTERS_TABLE.vendor, VENDOR_SELECT, id, lock);
}

function vendorValues(f: VendorFields): unknown[] {
  return [
    f.code,
    f.name,
    f.status,
    f.gstin,
    f.pan,
    f.email,
    f.phone,
    f.address,
    f.registeredBy,
    f.verifiedAt,
  ];
}

export function insertVendor(client: PoolClient, f: VendorFields, actorId: string | null) {
  return insertRow(client, MASTERS_TABLE.vendor, VENDOR_COLUMNS, vendorValues(f), actorId);
}

export function updateVendor(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: VendorFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.vendor,
    VENDOR_COLUMNS,
    id,
    rowVersion,
    vendorValues(f),
    actorId,
  );
}

// Materials. Deactivated, not deleted.

export function listMaterials(
  client: PoolClient,
  status: string | null,
): Promise<MaterialRecord[]> {
  return many<MaterialRecord>(
    client,
    `SELECT ${MATERIAL_SELECT} FROM core_material
     WHERE ($1::text IS NULL OR status = $1) ORDER BY lower(code)`,
    [status],
  );
}

export function findMaterial(client: PoolClient, id: string, lock = false) {
  return findRow<MaterialRecord>(client, MASTERS_TABLE.material, MATERIAL_SELECT, id, lock);
}

function materialValues(f: MaterialFields): unknown[] {
  return [f.code, f.name, f.uomId, f.status, f.hsn, f.reorderLevel, f.category, f.subCategory];
}

export function insertMaterial(client: PoolClient, f: MaterialFields, actorId: string | null) {
  return insertRow(client, MASTERS_TABLE.material, MATERIAL_COLUMNS, materialValues(f), actorId);
}

export function updateMaterial(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: MaterialFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.material,
    MATERIAL_COLUMNS,
    id,
    rowVersion,
    materialValues(f),
    actorId,
  );
}

// Equipment types. The status filter maps to the active flag. The code is fixed after create.

export function listEquipmentTypes(
  client: PoolClient,
  active: boolean | null,
): Promise<EquipmentTypeRecord[]> {
  return many<EquipmentTypeRecord>(
    client,
    `SELECT ${EQUIPMENT_TYPE_SELECT} FROM core_equipment_type
     WHERE ($1::boolean IS NULL OR active = $1) ORDER BY lower(code)`,
    [active],
  );
}

export function findEquipmentType(client: PoolClient, id: string, lock = false) {
  return findRow<EquipmentTypeRecord>(
    client,
    MASTERS_TABLE.equipmentType,
    EQUIPMENT_TYPE_SELECT,
    id,
    lock,
  );
}

function equipmentTypeValues(f: EquipmentTypeFields): unknown[] {
  return [
    f.code,
    f.name,
    f.meterKind,
    f.meterPrecision,
    f.fuelNormUnit,
    f.toleranceSettingKey,
    f.active,
  ];
}

export function insertEquipmentType(
  client: PoolClient,
  f: EquipmentTypeFields,
  actorId: string | null,
) {
  return insertRow(
    client,
    MASTERS_TABLE.equipmentType,
    EQUIPMENT_TYPE_COLUMNS,
    equipmentTypeValues(f),
    actorId,
  );
}

export function updateEquipmentType(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: EquipmentTypeFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.equipmentType,
    EQUIPMENT_TYPE_COLUMNS,
    id,
    rowVersion,
    equipmentTypeValues(f),
    actorId,
  );
}

// Major material allocations. An optional project filter: null lists every allocation.

export function listAllocations(
  client: PoolClient,
  projectId: string | null,
): Promise<AllocationRecord[]> {
  return many<AllocationRecord>(
    client,
    `SELECT ${ALLOCATION_SELECT} FROM core_major_material_allocation
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY required_by NULLS LAST, id`,
    [projectId],
  );
}

export function findAllocation(client: PoolClient, id: string, lock = false) {
  return findRow<AllocationRecord>(client, MASTERS_TABLE.allocation, ALLOCATION_SELECT, id, lock);
}

function allocationValues(f: AllocationFields): unknown[] {
  return [f.projectId, f.materialId, f.uomId, f.quantity, f.requiredBy];
}

export function insertAllocation(client: PoolClient, f: AllocationFields, actorId: string | null) {
  return insertRow(
    client,
    MASTERS_TABLE.allocation,
    ALLOCATION_COLUMNS,
    allocationValues(f),
    actorId,
  );
}

export function updateAllocation(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: AllocationFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.allocation,
    ALLOCATION_COLUMNS,
    id,
    rowVersion,
    allocationValues(f),
    actorId,
  );
}

// Equipment assignments. One row per project and equipment type. An optional project filter applies.

export function listAssignments(
  client: PoolClient,
  projectId: string | null,
): Promise<AssignmentRecord[]> {
  return many<AssignmentRecord>(
    client,
    `SELECT ${ASSIGNMENT_SELECT} FROM core_equipment_assignment
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY assigned_at, id`,
    [projectId],
  );
}

export function findAssignment(client: PoolClient, id: string, lock = false) {
  return findRow<AssignmentRecord>(client, MASTERS_TABLE.assignment, ASSIGNMENT_SELECT, id, lock);
}

function assignmentValues(f: AssignmentFields): unknown[] {
  return [f.projectId, f.equipmentTypeId, f.qty, f.assignedAt, f.assignedByUserId];
}

export function insertAssignment(client: PoolClient, f: AssignmentFields, actorId: string | null) {
  return insertRow(
    client,
    MASTERS_TABLE.assignment,
    ASSIGNMENT_COLUMNS,
    assignmentValues(f),
    actorId,
  );
}

export function updateAssignment(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: AssignmentFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.assignment,
    ASSIGNMENT_COLUMNS,
    id,
    rowVersion,
    assignmentValues(f),
    actorId,
  );
}

// Plan lines. Optional filters on project and resource kind. Plan lines have no delete.

export function listPlanLines(
  client: PoolClient,
  projectId: string | null,
  resourceKind: string | null,
): Promise<PlanLineRecord[]> {
  return many<PlanLineRecord>(
    client,
    `SELECT ${PLAN_LINE_SELECT} FROM core_plan_line
     WHERE ($1::uuid IS NULL OR project_id = $1) AND ($2::text IS NULL OR resource_kind = $2)
     ORDER BY from_date NULLS LAST, id`,
    [projectId, resourceKind],
  );
}

export function findPlanLine(client: PoolClient, id: string, lock = false) {
  return findRow<PlanLineRecord>(client, MASTERS_TABLE.planLine, PLAN_LINE_SELECT, id, lock);
}

function planLineValues(f: PlanLineFields): unknown[] {
  return [
    f.projectId,
    f.resourceKind,
    f.equipmentTypeId,
    f.positionId,
    f.role,
    f.department,
    f.materialId,
    f.uomId,
    f.storeId,
    f.quantity,
    f.withdrawn,
    f.fromDate,
    f.toDate,
    f.requiredBy,
    f.status,
    f.stage,
    f.reason,
    f.capacity,
    f.model,
  ];
}

export function insertPlanLine(client: PoolClient, f: PlanLineFields, actorId: string | null) {
  return insertRow(client, MASTERS_TABLE.planLine, PLAN_LINE_COLUMNS, planLineValues(f), actorId);
}

export function updatePlanLine(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: PlanLineFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    MASTERS_TABLE.planLine,
    PLAN_LINE_COLUMNS,
    id,
    rowVersion,
    planLineValues(f),
    actorId,
  );
}

export { deleteRow, snapshotOf };
