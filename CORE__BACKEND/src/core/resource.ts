import type { CoreApp, CoreRequest } from '../http/app.js';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { type AuditOp, appendAuditRow } from './audit.js';
import { AppError } from './errors.js';
import { hashRequest, runIdempotent } from './idempotency.js';
import {
  type Column,
  deleteRow,
  findRow,
  insertRow,
  many,
  one,
  snapshotOf,
  updateRow,
} from './rows.js';
import { ok } from './response.js';
import { parseInput } from './validation.js';
import { withTenant } from '../db/tenant.js';
import type { AccessClaims } from '../modules/auth/tokens.js';
import { type AuthGuardOptions, createRequireAuth, requireAccess } from '../plugins/auth.js';
import type { RouteDocs } from '../plugins/openapi.js';

/**
 * A generic resource layer for the Phase 5d to 5f tables. Each table is described once by a ResourceSpec: its fields,
 * its Zod input schemas, its list filters and its optional rules. The CRUD functions here do the work the masters
 * service does by hand: a versioned write, an audit row in the same transaction, and database errors mapped to API
 * errors with the resource prefix. Custom routes (publish, acknowledge, raise, submit) reuse these functions.
 *
 * Table, column and prefix names are constants in the module that defines the spec, never input.
 */

export const AUDIT_MODULE = 'core';

export type Row = Record<string, unknown>;

/** How a column is read and written. `num` is numeric or bigint and reads back as a number; `date` reads as YYYY-MM-DD. */
export type ColumnKind =
  'text' | 'citext' | 'int' | 'num' | 'bool' | 'date' | 'ts' | 'uuid' | 'json';

export interface FieldSpec {
  readonly key: string;
  readonly column: string;
  readonly kind: ColumnKind;
}

/** A field whose column is the snake_case form of its key, unless a column name is given. */
export function field(key: string, kind: ColumnKind, column?: string): FieldSpec {
  return { key, column: column ?? key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), kind };
}

/** One list filter: the query-string key is the map key; the value is compared with equality. */
export interface FilterSpec {
  readonly column: string;
  readonly schema: z.ZodType;
}

/** Who acts, and the request id that ties the audit rows of one request together. */
export interface Actor {
  readonly actorId: string | null;
  readonly correlationId: string | null;
}

/** A rule that failed on one field. The path names the field in the API's camelCase. */
export interface Issue {
  readonly path: string;
  readonly message: string;
}

export interface PrepareContext {
  readonly client: PoolClient;
  readonly actor: Actor;
  /** The stored row, API-shaped, or null on create. */
  readonly existing: Row | null;
  /** The row as it will be stored before this hook runs. */
  readonly row: Row;
}

export interface ResourceSpec {
  readonly table: string;
  readonly prefix: string;
  readonly label: string;
  readonly fields: readonly FieldSpec[];
  readonly create: z.ZodType<Row>;
  /** Must include rowVersion. The route removes it before the write. */
  readonly patch: z.ZodType<Row>;
  readonly filters: Readonly<Record<string, FilterSpec>>;
  readonly orderBy: string;
  /** A cross-field rule on the candidate row. Returns the first failure or null. */
  readonly check?: (row: Row) => Issue | null;
  /** Runs inside the write's transaction. Returns extra fields to write, such as a number allocated under a lock. */
  readonly prepare?: (ctx: PrepareContext) => Promise<Row>;
  /** Runs before a delete, in its transaction. Throws to refuse it; may remove dependent rows (audited with `actor`). */
  readonly beforeDelete?: (client: PoolClient, row: Row, actor: Actor) => Promise<void>;
}

export interface RouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/** A privilege checked at company scope, or null for any signed-in user. */
export type WritePrivilege = string | null;

export interface ResourceRoutes {
  readonly path: string;
  /** Registers GET list and GET one, always. */
  readonly create?: WritePrivilege;
  readonly update?: WritePrivilege;
  readonly remove?: WritePrivilege;
}

// Shared Zod helpers. Text is trimmed and never empty; optional fields accept null to clear them.

export const text = (max: number) => z.string().trim().min(1).max(max);
export const optionalText = (max: number) => text(max).nullable().optional();
export const isoDate = z.iso.date();
export const optionalDate = isoDate.nullable().optional();
export const uuid = z.uuid();
export const optionalUuid = uuid.nullable().optional();
export const versionField = z.number().int().min(1);
export const nonNegative = z.number().min(0);
export const optionalNonNegative = nonNegative.nullable().optional();
export const jsonObject = z.record(z.string(), z.unknown());
export const idParamsSchema = z.object({ id: uuid });

// Query-string filter schemas.
export const filterUuid = z.uuid();
export const filterText = z.string().trim().min(1).max(200);
export const filterBool = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Removes keys whose value is undefined. An absent key keeps the stored value; null clears it. */
export function definedOnly(values: Row): Row {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export function isSet(value: unknown): boolean {
  return value !== null && value !== undefined;
}

export function invalid(issue: Issue): AppError {
  return new AppError('VALIDATION_ERROR', 400, 'Request validation failed', { issues: [issue] });
}

export function notFound(spec: Pick<ResourceSpec, 'prefix' | 'label'>): AppError {
  return new AppError(`${spec.prefix}_NOT_FOUND`, 404, `${spec.label} not found`);
}

export function versionConflict(): AppError {
  return new AppError(
    'VERSION_CONFLICT',
    409,
    'The record changed since you read it. Reload it and try again',
  );
}

/** Turns Postgres errors into API errors. Unrecognised errors are rethrown as they were. */
export function mapDatabaseError(
  prefix: string,
  err: unknown,
  onForeignKey: 'reference' | 'in_use',
): unknown {
  if (err instanceof AppError) return err;
  const code =
    typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : '';
  if (code === '23505') {
    return new AppError(`${prefix}_DUPLICATE`, 409, 'A record with this value already exists');
  }
  if (code === '23503') {
    return onForeignKey === 'in_use'
      ? new AppError(`${prefix}_IN_USE`, 409, 'This record is in use and cannot be deleted')
      : new AppError(`${prefix}_REFERENCE_NOT_FOUND`, 400, 'A referenced record does not exist');
  }
  // 23502 and 23514 are NOT NULL and CHECK violations; class 22 covers bad values such as out-of-range numerics.
  if (code === '23502' || code === '23514' || code.startsWith('22')) {
    return new AppError('VALIDATION_ERROR', 400, 'A value breaks a stored rule');
  }
  return err;
}

async function guardWrite<T>(
  prefix: string,
  work: () => Promise<T>,
  onForeignKey: 'reference' | 'in_use' = 'reference',
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw mapDatabaseError(prefix, err, onForeignKey);
  }
}

/** Appends one audit row in the same transaction as the change. */
export async function auditWrite(
  client: PoolClient,
  actor: Actor,
  table: string,
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

function columnOf(f: FieldSpec): Column {
  return f.kind === 'json' ? { name: f.column, cast: 'jsonb' } : { name: f.column };
}

function valueOf(f: FieldSpec, value: unknown): unknown {
  return f.kind === 'json' && value !== null ? JSON.stringify(value) : value;
}

function selectExpr(f: FieldSpec): string {
  switch (f.kind) {
    case 'citext':
      return `${f.column}::text AS "${f.key}"`;
    case 'num':
      return `CAST(${f.column} AS double precision) AS "${f.key}"`;
    case 'date':
      return `to_char(${f.column}, 'YYYY-MM-DD') AS "${f.key}"`;
    default:
      return `${f.column} AS "${f.key}"`;
  }
}

/** The SELECT list that returns a row in API shape: camelCase keys, dates and numerics as plain values. */
export function selectOf(spec: Pick<ResourceSpec, 'fields'>): string {
  return [
    'id',
    ...spec.fields.map(selectExpr),
    'row_version AS "rowVersion"',
    'created_at AS "createdAt"',
    'updated_at AS "updatedAt"',
  ].join(', ');
}

export async function findRecord(
  client: PoolClient,
  spec: ResourceSpec,
  id: string,
  lock = false,
): Promise<Row | null> {
  return findRow<Row>(client, spec.table, selectOf(spec), id, lock);
}

/** Rows that match every filter the caller set, ordered by the spec. */
export async function listRecords(
  client: PoolClient,
  spec: ResourceSpec,
  filters: Row,
): Promise<Row[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  for (const [key, filter] of Object.entries(spec.filters)) {
    const value = filters[key];
    if (!isSet(value)) continue;
    params.push(value);
    where.push(`${filter.column} = $${params.length}`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return many<Row>(
    client,
    `SELECT ${selectOf(spec)} FROM ${spec.table}${clause} ORDER BY ${spec.orderBy}`,
    params,
  );
}

async function requireRecord(client: PoolClient, spec: ResourceSpec, id: string, lock: boolean) {
  const row = await findRecord(client, spec, id, lock);
  if (!row) throw notFound(spec);
  return row;
}

/** Inserts a row, audits it, and returns it in API shape. Fields left undefined take the database default. */
export async function createRecord(
  client: PoolClient,
  spec: ResourceSpec,
  actor: Actor,
  input: Row,
): Promise<Row> {
  const extra = spec.prepare
    ? await spec.prepare({ client, actor, existing: null, row: input })
    : {};
  const row = { ...input, ...extra };
  const issue = spec.check?.(row) ?? null;
  if (issue) throw invalid(issue);

  const columns = spec.fields.filter((f) => row[f.key] !== undefined);
  const id = await guardWrite(spec.prefix, () =>
    insertRow(
      client,
      spec.table,
      columns.map(columnOf),
      columns.map((f) => valueOf(f, row[f.key])),
      actor.actorId,
    ),
  );
  await auditWrite(
    client,
    actor,
    spec.table,
    id,
    'INSERT',
    null,
    await snapshotOf(client, spec.table, id),
  );
  return requireRecord(client, spec, id, false);
}

/**
 * Writes the fields the caller sent to one row, under the version guard. Only those fields are written, so a
 * concurrent change to another field is not overwritten by a partial PATCH.
 */
export async function updateRecord(
  client: PoolClient,
  spec: ResourceSpec,
  actor: Actor,
  id: string,
  rowVersion: number,
  changes: Row,
): Promise<Row> {
  const existing = await requireRecord(client, spec, id, true);
  if (existing['rowVersion'] !== rowVersion) throw versionConflict();

  const sent = definedOnly(changes);
  const merged = { ...existing, ...sent };
  const issue = spec.check?.(merged) ?? null;
  if (issue) throw invalid(issue);
  const extra = spec.prepare ? await spec.prepare({ client, actor, existing, row: merged }) : {};
  const writes = { ...sent, ...extra };
  const columns = spec.fields.filter((f) => writes[f.key] !== undefined);

  const before = await snapshotOf(client, spec.table, id);
  const updated = await guardWrite(spec.prefix, () =>
    updateRow(
      client,
      spec.table,
      columns.map(columnOf),
      id,
      rowVersion,
      columns.map((f) => valueOf(f, writes[f.key])),
      actor.actorId,
    ),
  );
  if (!updated) throw versionConflict();
  await auditWrite(
    client,
    actor,
    spec.table,
    id,
    'UPDATE',
    before,
    await snapshotOf(client, spec.table, id),
  );
  return requireRecord(client, spec, id, false);
}

/** Deletes a row and audits it. A foreign key still referring to the row answers <PREFIX>_IN_USE. */
export async function deleteRecord(
  client: PoolClient,
  spec: ResourceSpec,
  actor: Actor,
  id: string,
): Promise<void> {
  const existing = await requireRecord(client, spec, id, true);
  if (spec.beforeDelete) await spec.beforeDelete(client, existing, actor);
  const before = await snapshotOf(client, spec.table, id);
  const removed = await guardWrite(spec.prefix, () => deleteRow(client, spec.table, id), 'in_use');
  if (!removed) throw notFound(spec);
  await auditWrite(client, actor, spec.table, id, 'DELETE', before, null);
}

/**
 * Takes the lock on a parent row and returns the next number for its children (1 when there are none).
 * Two writers for one parent run one after the other, so the numbers stay unique without a retry.
 */
export async function nextChildNumber(
  client: PoolClient,
  prefix: string,
  parent: { readonly table: string; readonly id: string },
  child: { readonly table: string; readonly parentColumn: string; readonly numberColumn: string },
): Promise<number> {
  const locked = await one<{ id: string }>(
    client,
    `SELECT id FROM ${parent.table} WHERE id = $1 FOR UPDATE`,
    [parent.id],
  );
  if (!locked) {
    throw new AppError(`${prefix}_REFERENCE_NOT_FOUND`, 400, 'A referenced record does not exist');
  }
  const next = await one<{ next: number }>(
    client,
    `SELECT COALESCE(MAX(${child.numberColumn}), 0) + 1 AS next FROM ${child.table} WHERE ${child.parentColumn} = $1`,
    [parent.id],
  );
  return next?.next ?? 1;
}

// Routes

/**
 * The preHandlers for a route: a signed-in user, and the privilege when one is named. `docs` is what the
 * OpenAPI document shows for the route's input; it changes nothing at runtime.
 */
export function guardRoute(
  options: RouteOptions,
  privilege: WritePrivilege,
  docs?: RouteDocs,
): {
  preHandler: Array<(request: CoreRequest) => Promise<void>>;
  config: { openapi?: RouteDocs | undefined };
} {
  const guard: AuthGuardOptions = { pool: options.pool, signingKey: options.signingKey };
  const requireAuth = createRequireAuth(guard);
  return {
    preHandler: privilege === null ? [requireAuth] : [requireAuth, requireAccess(guard, privilege)],
    config: { openapi: docs },
  };
}

export function authOf(request: CoreRequest): AccessClaims {
  if (!request.auth) {
    throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
  }
  return request.auth;
}

/** Methods that change data. Each of these requires an Idempotency-Key header. */
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH']);

/** The Idempotency-Key header of a write. Missing or blank is refused with 400. */
export function idempotencyKeyOf(request: CoreRequest): string {
  const raw = request.headers['idempotency-key'];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new AppError(
      'IDEMPOTENCY_KEY_REQUIRED',
      400,
      'Idempotency-Key header is required on POST and PATCH requests',
    );
  }
  return raw;
}

/**
 * Runs one unit of work in the signed-in user's tenant, with the actor for the audit rows.
 * POST and PATCH run through the idempotency store: a repeat with the same key and request returns the stored
 * response, and the same key with a different request is refused with 409.
 * `toStored` shapes the stored copy; use it to keep a one-time secret out of the store (see runIdempotent).
 */
export function inTenant<T>(
  options: RouteOptions,
  request: CoreRequest,
  work: (client: PoolClient, actor: Actor) => Promise<T>,
  toStored?: (value: T) => unknown,
): Promise<T> {
  const auth = authOf(request);
  const actor: Actor = { actorId: auth.userId, correlationId: request.id };
  if (!WRITE_METHODS.has(request.method)) {
    return withTenant(options.pool, auth.tenantId, (client) => work(client, actor));
  }
  const key = idempotencyKeyOf(request);
  const requestHash = hashRequest({
    method: request.method,
    route: request.routeOptions.url,
    params: request.params,
    body: request.body ?? null,
  });
  return withTenant(options.pool, auth.tenantId, async (client) => {
    const outcome = await runIdempotent(
      client,
      toStored ? { key, requestHash, toStored } : { key, requestHash },
      () => work(client, actor),
    );
    return outcome.value;
  });
}

/** The list filters, each optional. An unknown query key is ignored. */
function filterQueryOf(spec: ResourceSpec): z.ZodType<Row> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, filter] of Object.entries(spec.filters)) {
    shape[key] = filter.schema.optional();
  }
  return z.object(shape);
}

/** Splits a validated PATCH body into its version and the fields to change. */
export function splitPatch(body: Row): { rowVersion: number; changes: Row } {
  const { rowVersion, ...changes } = body;
  return { rowVersion: rowVersion as number, changes };
}

/**
 * Registers the standard routes for one resource: GET list and GET one for any signed-in user, and POST, PATCH and
 * DELETE when the route set names them. A write needs its privilege at company scope, or only a signed-in user when
 * the privilege is null. Creates answer 201; a delete answers ok({ deleted: true }).
 */
export function registerResourceRoutes(
  app: CoreApp,
  options: RouteOptions,
  spec: ResourceSpec,
  routes: ResourceRoutes,
): void {
  const listQuery = filterQueryOf(spec);

  app.get(
    routes.path,
    guardRoute(options, null, { summary: `List ${spec.label} records`, query: listQuery }),
    async (request) => {
      const filters = parseInput(listQuery, request.query);
      return ok(await inTenant(options, request, (client) => listRecords(client, spec, filters)));
    },
  );

  app.get(`${routes.path}/:id`, guardRoute(options, null, { summary: `Read one ${spec.label}` }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const found = await inTenant(options, request, (client) => findRecord(client, spec, id, false));
    if (!found) throw notFound(spec);
    return ok(found);
  });

  if (routes.create !== undefined) {
    app.post(
      routes.path,
      guardRoute(options, routes.create, { summary: `Create a ${spec.label}`, body: spec.create }),
      async (request, reply) => {
        const body = parseInput(spec.create, request.body);
        const created = await inTenant(options, request, (client, actor) =>
          createRecord(client, spec, actor, body),
        );
        return reply.code(201).send(ok(created));
      },
    );
  }

  if (routes.update !== undefined) {
    app.patch(
      `${routes.path}/:id`,
      guardRoute(options, routes.update, { summary: `Update a ${spec.label}`, body: spec.patch }),
      async (request) => {
        const { id } = parseInput(idParamsSchema, request.params);
        const { rowVersion, changes } = splitPatch(parseInput(spec.patch, request.body));
        const updated = await inTenant(options, request, (client, actor) =>
          updateRecord(client, spec, actor, id, rowVersion, changes),
        );
        return ok(updated);
      },
    );
  }

  if (routes.remove !== undefined) {
    app.delete(`${routes.path}/:id`, guardRoute(options, routes.remove, { summary: `Delete a ${spec.label}` }), async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      await inTenant(options, request, (client, actor) => deleteRecord(client, spec, actor, id));
      return ok({ deleted: true });
    });
  }
}
