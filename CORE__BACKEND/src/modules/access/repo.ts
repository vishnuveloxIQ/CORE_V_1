import type { PoolClient } from 'pg';

export type AccessType = 'role' | 'privilege' | 'module_head' | 'suspension';

/** One core_user_access row. SQL aliases map the columns to camelCase here, in the repo layer. */
export interface AccessRecord {
  id: string;
  userId: string;
  accessType: AccessType;
  roleId: string | null;
  privilege: string | null;
  module: string | null;
  locationId: string | null;
  projectId: string | null;
  storeId: string | null;
  reason: string | null;
  restoredAt: Date | null;
  createdAt: Date;
}

/** An access row with its role, for the guard and the admin view. */
export interface GrantRecord extends AccessRecord {
  roleCode: string | null;
  roleIsSystem: boolean | null;
}

export interface NewAccessRow {
  userId: string;
  accessType: AccessType;
  roleId: string | null;
  privilege: string | null;
  module: string | null;
  locationId: string | null;
  projectId: string | null;
  storeId: string | null;
  reason: string | null;
}

const COLUMNS = `id, user_id AS "userId", access_type AS "accessType", role_id AS "roleId",
  privilege, module, location_id AS "locationId", project_id AS "projectId",
  store_id AS "storeId", reason, restored_at AS "restoredAt", created_at AS "createdAt"`;

/** Every row of the user: grants, and suspensions active or restored. Read on each guarded request. */
export async function listAccessRows(client: PoolClient, userId: string): Promise<GrantRecord[]> {
  const { rows } = await client.query<GrantRecord>(
    `SELECT a.id, a.user_id AS "userId", a.access_type AS "accessType", a.role_id AS "roleId",
            a.privilege, a.module, a.location_id AS "locationId", a.project_id AS "projectId",
            a.store_id AS "storeId", a.reason, a.restored_at AS "restoredAt",
            a.created_at AS "createdAt", r.code AS "roleCode", r.is_system AS "roleIsSystem"
     FROM core_user_access a
     LEFT JOIN core_role r ON r.id = a.role_id
     WHERE a.user_id = $1
     ORDER BY a.created_at, a.id`,
    [userId],
  );
  return rows;
}

/** True when the user has an active suspension (restored_at is null). */
export async function isSuspended(client: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await client.query<{ suspended: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM core_user_access
       WHERE user_id = $1 AND access_type = 'suspension' AND restored_at IS NULL
     ) AS suspended`,
    [userId],
  );
  return rows[0]?.suspended ?? false;
}

export async function findUserIdByLogin(
  client: PoolClient,
  loginId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM core_user WHERE login_id = $1`,
    [loginId],
  );
  return rows[0]?.id ?? null;
}

export async function insertAccessRow(
  client: PoolClient,
  row: NewAccessRow,
  actorId: string | null,
): Promise<AccessRecord> {
  const { rows } = await client.query<AccessRecord>(
    `INSERT INTO core_user_access
       (user_id, access_type, role_id, privilege, module, location_id, project_id, store_id,
        reason, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING ${COLUMNS}`,
    [
      row.userId,
      row.accessType,
      row.roleId,
      row.privilege,
      row.module,
      row.locationId,
      row.projectId,
      row.storeId,
      row.reason,
      actorId,
    ],
  );
  const inserted = rows[0];
  if (!inserted) throw new Error('insert into core_user_access returned no row');
  return inserted;
}

/** Deletes a grant (not a suspension). Returns the deleted row, or null when there is none. */
export async function deleteGrantRow(
  client: PoolClient,
  grantId: string,
): Promise<AccessRecord | null> {
  const { rows } = await client.query<AccessRecord>(
    `DELETE FROM core_user_access
     WHERE id = $1 AND access_type <> 'suspension'
     RETURNING ${COLUMNS}`,
    [grantId],
  );
  return rows[0] ?? null;
}

/** Locks an active suspension so two restores cannot both run. */
export async function lockActiveSuspension(
  client: PoolClient,
  suspensionId: string,
): Promise<AccessRecord | null> {
  const { rows } = await client.query<AccessRecord>(
    `SELECT ${COLUMNS} FROM core_user_access
     WHERE id = $1 AND access_type = 'suspension' AND restored_at IS NULL
     FOR UPDATE`,
    [suspensionId],
  );
  return rows[0] ?? null;
}

export async function restoreSuspensionRow(
  client: PoolClient,
  suspensionId: string,
  actorId: string | null,
): Promise<AccessRecord> {
  const { rows } = await client.query<AccessRecord>(
    `UPDATE core_user_access
     SET restored_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [suspensionId, actorId],
  );
  const restored = rows[0];
  if (!restored) throw new Error('restore of core_user_access returned no row');
  return restored;
}

/** The row as the audit chain stores it: column names as in the table, dates as ISO text. */
export function auditSnapshot(row: AccessRecord): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    access_type: row.accessType,
    role_id: row.roleId,
    privilege: row.privilege,
    module: row.module,
    location_id: row.locationId,
    project_id: row.projectId,
    store_id: row.storeId,
    reason: row.reason,
    restored_at: row.restoredAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * One core_user row for the admin user views. The column list is explicit: password_hash, pin_hash, failed_count,
 * locked_until and the other login-state columns are never selected, so they cannot reach a response.
 */
export interface UserRecord {
  id: string;
  loginId: string;
  email: string | null;
  name: string | null;
  status: string | null;
  phone: string | null;
  designation: string | null;
  /** UI role; a user created before 0024 reads as approver. */
  role: string;
  modules: string[];
  /** company or project; a user created before 0024 reads as company. */
  scopeType: string;
  scopeIds: string[];
  /** True while the user has an open suspension (restored_at is null). */
  suspended: boolean;
  /** True while the user must change a temporary password. */
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  rowVersion: number;
}

const USER_COLUMNS = `id, login_id::text AS "loginId", email::text AS email, name, status,
  phone, designation, COALESCE(user_role, 'approver') AS role, modules,
  COALESCE(scope, 'company') AS "scopeType", scope_ids::text[] AS "scopeIds",
  EXISTS (
    SELECT 1 FROM core_user_access sa
    WHERE sa.user_id = core_user.id AND sa.access_type = 'suspension' AND sa.restored_at IS NULL
  ) AS suspended,
  COALESCE(must_change_password, false) AS "mustChangePassword",
  last_login_at AS "lastLoginAt", created_at AS "createdAt", row_version AS "rowVersion"`;

/** The profile values as stored. Arrays are written as text[] and uuid[]. */
export interface UserProfileRow {
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  role: string;
  modules: string[];
  scopeType: string;
  scopeIds: string[];
}

/**
 * Inserts an active user with a temporary password hash and must_change_password set. Returns the new id.
 * A duplicate login id fails with 23505 on core_user_login_id_unique.
 */
export async function insertUserRow(
  client: PoolClient,
  loginId: string,
  profile: UserProfileRow,
  passwordHash: string,
  actorId: string | null,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO core_user
       (login_id, name, email, phone, designation, user_role, modules, scope, scope_ids, status,
        password_hash, password_set_at, must_change_password, failed_count, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9::uuid[], 'active',
             $10, now(), true, 0, $11, $11)
     RETURNING id`,
    [
      loginId,
      profile.name,
      profile.email,
      profile.phone,
      profile.designation,
      profile.role,
      profile.modules,
      profile.scopeType,
      profile.scopeIds,
      passwordHash,
      actorId,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into core_user returned no row');
  return id;
}

/** Writes the profile under the row-version guard. Returns false when the version no longer matches. */
export async function updateUserProfileRow(
  client: PoolClient,
  userId: string,
  rowVersion: number,
  profile: UserProfileRow,
  actorId: string | null,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE core_user
     SET name = $3, email = $4, phone = $5, designation = $6, user_role = $7, modules = $8::text[],
         scope = $9, scope_ids = $10::uuid[], updated_by = $11, updated_at = now(),
         row_version = row_version + 1
     WHERE id = $1 AND row_version = $2`,
    [
      userId,
      rowVersion,
      profile.name,
      profile.email,
      profile.phone,
      profile.designation,
      profile.role,
      profile.modules,
      profile.scopeType,
      profile.scopeIds,
      actorId,
    ],
  );
  return rowCount === 1;
}

/** The project ids from the list that do not exist. */
export async function missingProjectIds(
  client: PoolClient,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await client.query<{ id: string }>(
    `SELECT x.id::text AS id FROM unnest($1::uuid[]) AS x(id)
     WHERE NOT EXISTS (SELECT 1 FROM core_project p WHERE p.id = x.id)`,
    [ids],
  );
  return rows.map((row) => row.id);
}

/** One user by id with a row lock, for a change that must not race another. */
export async function lockUserRow(client: PoolClient, userId: string): Promise<UserRecord | null> {
  const { rows } = await client.query<UserRecord>(
    `SELECT ${USER_COLUMNS} FROM core_user WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface UserFilter {
  status: string | undefined;
  search: string | undefined;
  limit: number;
  offset: number;
}

/** Escapes LIKE wildcards so a search for "50%" matches that text and nothing else. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** One page of users, ordered by login, and the total that matches the filters. */
export async function listUserRows(
  client: PoolClient,
  filter: UserFilter,
): Promise<{ rows: UserRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status !== undefined) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.search !== undefined) {
    params.push(likePattern(filter.search));
    where.push(`(login_id::text ILIKE $${params.length} OR name ILIKE $${params.length})`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

  const count = await client.query<{ total: string }>(
    `SELECT count(*) AS total FROM core_user${clause}`,
    params,
  );
  params.push(filter.limit, filter.offset);
  const { rows } = await client.query<UserRecord>(
    `SELECT ${USER_COLUMNS} FROM core_user${clause}
     ORDER BY login_id::text, id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(count.rows[0]?.total ?? 0) };
}

/** One user by id, or null when the tenant has no such user. */
export async function findUserRow(client: PoolClient, userId: string): Promise<UserRecord | null> {
  const { rows } = await client.query<UserRecord>(
    `SELECT ${USER_COLUMNS} FROM core_user WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}
