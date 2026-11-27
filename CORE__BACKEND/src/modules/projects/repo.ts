import type { PoolClient } from 'pg';
import {
  type Column,
  deleteRow,
  findRow,
  insertRow,
  many,
  snapshotOf,
  updateRow,
} from '../../core/rows.js';

/**
 * Projects and sites tables. Only these names are ever interpolated into SQL; they are constants, never input.
 */
export const PROJ_TABLE = {
  project: 'core_project',
  location: 'core_location',
  store: 'core_store',
  marker: 'core_chainage_marker',
  zone: 'core_geo_zone',
  milestone: 'core_project_milestone',
} as const;
export type ProjTable = (typeof PROJ_TABLE)[keyof typeof PROJ_TABLE];

/** Storage shapes. Dates are read with to_char and numerics with a double cast, so they come back as plain values. */
export interface ProjectFields {
  code: string;
  name: string;
  status: string;
  client: string | null;
  /** Optional consultant on the project (0050). */
  consultantName: string | null;
  /** Optional state the project works in (0051). */
  state: string | null;
  /** How the project is executed (0052). */
  executionMode: string | null;
  /** The owning department, as chosen or typed (0053). */
  department: string | null;
  /** How the project was awarded (0054). */
  projectType: string | null;
  startDate: string | null;
  endDate: string | null;
  valueAmount: number | null;
  description: string | null;
  /** Chainage range in km (0026). Set together; markers outside it are allowed. */
  chainageStartKm: number | null;
  chainageEndKm: number | null;
}

export interface LocationFields {
  code: string;
  name: string;
  projectId: string;
  status: string;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  inCharge: string | null;
  phone: string | null;
  email: string | null;
  chainageStartKm: number | null;
  chainageEndKm: number | null;
  weekOffDays: number[] | null;
}

export interface StoreFields {
  code: string;
  name: string;
  projectId: string;
  status: string;
  locationText: string | null;
  keeper: string | null;
  phone: string | null;
  chainageMarkerId: string | null;
}

export interface ChainageMarkerFields {
  code: string;
  label: string | null;
  projectId: string;
  chainageKm: number;
}

export type ZonePoint = [number, number];

export interface GeoZoneFields {
  projectId: string;
  label: string;
  zoneType: string;
  shape: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  points: ZonePoint[] | null;
  bufferM: number | null;
  version: number;
}

export interface MilestoneFields {
  projectId: string;
  name: string;
  dueDate: string | null;
  weight: number | null;
  status: string;
}

export interface Versioned {
  id: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectRecord = ProjectFields & Versioned;
export type LocationRecord = LocationFields & Versioned;
export type StoreRecord = StoreFields & Versioned;
export type ChainageMarkerRecord = ChainageMarkerFields & Versioned;
export type GeoZoneRecord = GeoZoneFields & Versioned;
export type MilestoneRecord = MilestoneFields & Versioned;

/** Column lists. SQL aliases map snake_case to camelCase here, in the repo layer only. */
const TIMESTAMPS = `row_version AS "rowVersion", created_at AS "createdAt", updated_at AS "updatedAt"`;

const PROJECT_SELECT = `id, code, name, status, client, consultant_name AS "consultantName", state, execution_mode AS "executionMode", department, project_type AS "projectType",
  to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
  CAST(value_amount AS double precision) AS "valueAmount", description,
  CAST(chainage_start_km AS double precision) AS "chainageStartKm",
  CAST(chainage_end_km AS double precision) AS "chainageEndKm", ${TIMESTAMPS}`;

const LOCATION_SELECT = `id, code, name, project_id AS "projectId", status,
  address_line AS "addressLine", CAST(latitude AS double precision) AS latitude,
  CAST(longitude AS double precision) AS longitude, city, state, pin,
  in_charge AS "inCharge", phone, email::text AS email,
  CAST(chainage_start_km AS double precision) AS "chainageStartKm",
  CAST(chainage_end_km AS double precision) AS "chainageEndKm",
  week_off_days_json AS "weekOffDays", ${TIMESTAMPS}`;

const STORE_SELECT = `id, code, name, project_id AS "projectId", status,
  location_text AS "locationText", keeper, phone,
  chainage_marker_id AS "chainageMarkerId", ${TIMESTAMPS}`;

const MARKER_SELECT = `id, code, label, project_id AS "projectId",
  CAST(chainage_km AS double precision) AS "chainageKm", ${TIMESTAMPS}`;

const ZONE_SELECT = `id, project_id AS "projectId", label, zone_type AS "zoneType", shape,
  CAST(center_lat AS double precision) AS "centerLat", CAST(center_lng AS double precision) AS "centerLng",
  CAST(radius_m AS double precision) AS "radiusM", points_json AS points,
  CAST(buffer_m AS double precision) AS "bufferM", version, ${TIMESTAMPS}`;

const MILESTONE_SELECT = `id, project_id AS "projectId", name,
  to_char(due_date, 'YYYY-MM-DD') AS "dueDate", CAST(weight AS double precision) AS weight,
  status, ${TIMESTAMPS}`;

const PROJECT_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'status' },
  { name: 'client' },
  { name: 'consultant_name' },
  { name: 'state' },
  { name: 'execution_mode' },
  { name: 'department' },
  { name: 'project_type' },
  { name: 'start_date' },
  { name: 'end_date' },
  { name: 'value_amount' },
  { name: 'description' },
  { name: 'chainage_start_km' },
  { name: 'chainage_end_km' },
];

const LOCATION_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'project_id' },
  { name: 'status' },
  { name: 'address_line' },
  { name: 'latitude' },
  { name: 'longitude' },
  { name: 'city' },
  { name: 'state' },
  { name: 'pin' },
  { name: 'in_charge' },
  { name: 'phone' },
  { name: 'email' },
  { name: 'chainage_start_km' },
  { name: 'chainage_end_km' },
  { name: 'week_off_days_json', cast: 'jsonb' },
];

const STORE_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'name' },
  { name: 'project_id' },
  { name: 'status' },
  { name: 'location_text' },
  { name: 'keeper' },
  { name: 'phone' },
  { name: 'chainage_marker_id' },
];

const MARKER_COLUMNS: readonly Column[] = [
  { name: 'code' },
  { name: 'label' },
  { name: 'project_id' },
  { name: 'chainage_km' },
];

const ZONE_COLUMNS: readonly Column[] = [
  { name: 'project_id' },
  { name: 'label' },
  { name: 'zone_type' },
  { name: 'shape' },
  { name: 'center_lat' },
  { name: 'center_lng' },
  { name: 'radius_m' },
  { name: 'points_json', cast: 'jsonb' },
  { name: 'buffer_m' },
  { name: 'version' },
];

const MILESTONE_COLUMNS: readonly Column[] = [
  { name: 'project_id' },
  { name: 'name' },
  { name: 'due_date' },
  { name: 'weight' },
  { name: 'status' },
];

// Projects.

export function listProjects(client: PoolClient): Promise<ProjectRecord[]> {
  return many<ProjectRecord>(
    client,
    `SELECT ${PROJECT_SELECT} FROM core_project ORDER BY lower(code)`,
  );
}

export function findProject(client: PoolClient, id: string, lock = false) {
  return findRow<ProjectRecord>(client, PROJ_TABLE.project, PROJECT_SELECT, id, lock);
}

function projectValues(f: ProjectFields): unknown[] {
  return [
    f.code,
    f.name,
    f.status,
    f.client,
    f.consultantName,
    f.state,
    f.executionMode,
    f.department,
    f.projectType,
    f.startDate,
    f.endDate,
    f.valueAmount,
    f.description,
    f.chainageStartKm,
    f.chainageEndKm,
  ];
}

export function insertProject(client: PoolClient, f: ProjectFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.project, PROJECT_COLUMNS, projectValues(f), actorId);
}

export function updateProject(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: ProjectFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    PROJ_TABLE.project,
    PROJECT_COLUMNS,
    id,
    rowVersion,
    projectValues(f),
    actorId,
  );
}

// Locations. An optional project filter: null lists every location.

export function listLocations(
  client: PoolClient,
  projectId: string | null,
): Promise<LocationRecord[]> {
  return many<LocationRecord>(
    client,
    `SELECT ${LOCATION_SELECT} FROM core_location
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY lower(code)`,
    [projectId],
  );
}

export function findLocation(client: PoolClient, id: string, lock = false) {
  return findRow<LocationRecord>(client, PROJ_TABLE.location, LOCATION_SELECT, id, lock);
}

function locationValues(f: LocationFields): unknown[] {
  return [
    f.code,
    f.name,
    f.projectId,
    f.status,
    f.addressLine,
    f.latitude,
    f.longitude,
    f.city,
    f.state,
    f.pin,
    f.inCharge,
    f.phone,
    f.email,
    f.chainageStartKm,
    f.chainageEndKm,
    f.weekOffDays === null ? null : JSON.stringify(f.weekOffDays),
  ];
}

export function insertLocation(client: PoolClient, f: LocationFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.location, LOCATION_COLUMNS, locationValues(f), actorId);
}

export function updateLocation(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: LocationFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    PROJ_TABLE.location,
    LOCATION_COLUMNS,
    id,
    rowVersion,
    locationValues(f),
    actorId,
  );
}

// Stores.

export function listStores(client: PoolClient): Promise<StoreRecord[]> {
  return many<StoreRecord>(client, `SELECT ${STORE_SELECT} FROM core_store ORDER BY lower(code)`);
}

export function findStore(client: PoolClient, id: string, lock = false) {
  return findRow<StoreRecord>(client, PROJ_TABLE.store, STORE_SELECT, id, lock);
}

function storeValues(f: StoreFields): unknown[] {
  return [
    f.code,
    f.name,
    f.projectId,
    f.status,
    f.locationText,
    f.keeper,
    f.phone,
    f.chainageMarkerId,
  ];
}

export function insertStore(client: PoolClient, f: StoreFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.store, STORE_COLUMNS, storeValues(f), actorId);
}

export function updateStore(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: StoreFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    PROJ_TABLE.store,
    STORE_COLUMNS,
    id,
    rowVersion,
    storeValues(f),
    actorId,
  );
}

// Chainage markers.

export function listMarkers(
  client: PoolClient,
  projectId: string | null,
): Promise<ChainageMarkerRecord[]> {
  return many<ChainageMarkerRecord>(
    client,
    `SELECT ${MARKER_SELECT} FROM core_chainage_marker
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY lower(code)`,
    [projectId],
  );
}

export function findMarker(client: PoolClient, id: string, lock = false) {
  return findRow<ChainageMarkerRecord>(client, PROJ_TABLE.marker, MARKER_SELECT, id, lock);
}

function markerValues(f: ChainageMarkerFields): unknown[] {
  return [f.code, f.label, f.projectId, f.chainageKm];
}

export function insertMarker(client: PoolClient, f: ChainageMarkerFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.marker, MARKER_COLUMNS, markerValues(f), actorId);
}

export function updateMarker(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: ChainageMarkerFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    PROJ_TABLE.marker,
    MARKER_COLUMNS,
    id,
    rowVersion,
    markerValues(f),
    actorId,
  );
}

// Geo zones.

export function listZones(client: PoolClient, projectId: string | null): Promise<GeoZoneRecord[]> {
  return many<GeoZoneRecord>(
    client,
    `SELECT ${ZONE_SELECT} FROM core_geo_zone
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY label, id`,
    [projectId],
  );
}

export function findZone(client: PoolClient, id: string, lock = false) {
  return findRow<GeoZoneRecord>(client, PROJ_TABLE.zone, ZONE_SELECT, id, lock);
}

function zoneValues(f: GeoZoneFields): unknown[] {
  return [
    f.projectId,
    f.label,
    f.zoneType,
    f.shape,
    f.centerLat,
    f.centerLng,
    f.radiusM,
    f.points === null ? null : JSON.stringify(f.points),
    f.bufferM,
    f.version,
  ];
}

export function insertZone(client: PoolClient, f: GeoZoneFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.zone, ZONE_COLUMNS, zoneValues(f), actorId);
}

export function updateZone(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: GeoZoneFields,
  actorId: string | null,
) {
  return updateRow(client, PROJ_TABLE.zone, ZONE_COLUMNS, id, rowVersion, zoneValues(f), actorId);
}

// Milestones.

export function listMilestones(
  client: PoolClient,
  projectId: string | null,
): Promise<MilestoneRecord[]> {
  return many<MilestoneRecord>(
    client,
    `SELECT ${MILESTONE_SELECT} FROM core_project_milestone
     WHERE ($1::uuid IS NULL OR project_id = $1) ORDER BY due_date NULLS LAST, name, id`,
    [projectId],
  );
}

export function findMilestone(client: PoolClient, id: string, lock = false) {
  return findRow<MilestoneRecord>(client, PROJ_TABLE.milestone, MILESTONE_SELECT, id, lock);
}

function milestoneValues(f: MilestoneFields): unknown[] {
  return [f.projectId, f.name, f.dueDate, f.weight, f.status];
}

export function insertMilestone(client: PoolClient, f: MilestoneFields, actorId: string | null) {
  return insertRow(client, PROJ_TABLE.milestone, MILESTONE_COLUMNS, milestoneValues(f), actorId);
}

export function updateMilestone(
  client: PoolClient,
  id: string,
  rowVersion: number,
  f: MilestoneFields,
  actorId: string | null,
) {
  return updateRow(
    client,
    PROJ_TABLE.milestone,
    MILESTONE_COLUMNS,
    id,
    rowVersion,
    milestoneValues(f),
    actorId,
  );
}

/** Weights of the other milestones of one project. A null weight counts as zero. */
export async function otherMilestoneWeights(
  client: PoolClient,
  projectId: string,
  excludeId: string | null,
): Promise<number[]> {
  const rows = await many<{ weight: number }>(
    client,
    `SELECT COALESCE(CAST(weight AS double precision), 0) AS weight
     FROM core_project_milestone
     WHERE project_id = $1 AND id IS DISTINCT FROM $2`,
    [projectId, excludeId],
  );
  return rows.map((r) => r.weight);
}

export { deleteRow, snapshotOf };
