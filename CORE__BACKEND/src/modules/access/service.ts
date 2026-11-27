import type { PoolClient } from 'pg';
import { appendAuditRow } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import {
  assertPasswordPolicy,
  generateTemporaryPassword,
  hashSecret,
} from '../../core/password.js';
import { snapshotOf } from '../../core/rows.js';
import {
  findPublicUser,
  recordAuthEvent,
  revokeAllSessions,
  setTemporaryPassword,
} from '../auth/repo.js';
import { type AccessScope, type HeldPrivilege } from './policy.js';
import { ACCESS_MANAGE } from './roles.js';
import {
  auditSnapshot,
  type AccessRecord,
  deleteGrantRow,
  findUserIdByLogin,
  findUserRow,
  type GrantRecord,
  insertAccessRow,
  insertUserRow,
  listAccessRows,
  listUserRows,
  lockActiveSuspension,
  lockUserRow,
  missingProjectIds,
  type NewAccessRow,
  restoreSuspensionRow,
  updateUserProfileRow,
  type UserProfileRow,
  type UserRecord,
} from './repo.js';
import { privilegesOfRole } from './roles.js';
import { primaryRole, rolesFrom, type GrantInput, type UserCreateInput, type UserListQuery, type UserPatchInput, type UserRole } from './schema.js';

const AUDIT_MODULE = 'core';
const ACCESS_TABLE = 'core_user_access';

/** Who acts, and the request id that ties the audit rows of one request together. */
export interface Actor {
  actorId: string | null;
  correlationId: string | null;
}

export interface GrantView {
  id: string;
  accessType: 'role' | 'privilege' | 'module_head';
  roleId: string | null;
  privilege: string | null;
  module: string | null;
  scope: AccessScope;
  reason: string | null;
  createdAt: string;
}

export interface SuspensionView {
  id: string;
  reason: string | null;
  createdAt: string;
  restoredAt: string | null;
}

export interface AccessView {
  userId: string;
  suspended: boolean;
  grants: GrantView[];
  suspensions: SuspensionView[];
  /** Privileges held now, from active role and privilege grants. */
  privileges: HeldPrivilege[];
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23503';
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

function scopeOf(row: AccessRecord): AccessScope {
  return { projectId: row.projectId, storeId: row.storeId };
}

function toGrantView(row: AccessRecord): GrantView {
  return {
    id: row.id,
    accessType: row.accessType as GrantView['accessType'],
    roleId: row.roleId,
    privilege: row.privilege,
    module: row.module,
    scope: scopeOf(row),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSuspensionView(row: AccessRecord): SuspensionView {
  return {
    id: row.id,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    restoredAt: row.restoredAt?.toISOString() ?? null,
  };
}

/** Privileges held now. Module heads hold none in Phase 4d (design point b). */
export function heldPrivileges(rows: readonly GrantRecord[]): HeldPrivilege[] {
  const held: HeldPrivilege[] = [];
  for (const row of rows) {
    if (row.restoredAt !== null) continue;
    if (row.accessType === 'privilege' && row.privilege !== null) {
      held.push({
        privilege: row.privilege,
        source: 'privilege',
        grantId: row.id,
        scope: scopeOf(row),
      });
    } else if (row.accessType === 'role' && row.roleCode !== null) {
      const privileges = privilegesOfRole({
        code: row.roleCode,
        isSystem: row.roleIsSystem === true,
      });
      for (const privilege of privileges) {
        held.push({ privilege, source: 'role', grantId: row.id, scope: scopeOf(row) });
      }
    }
  }
  return held;
}

/** The guard's decision. A suspended user holds nothing, whatever the grants say. */
export async function userMayAct(
  client: PoolClient,
  userId: string,
  privilege: string,
  requested: AccessScope,
): Promise<boolean> {
  // The guard asks per route and scope, but today every route needs the administrator privilege, whatever it names.
  void privilege;
  void requested;
  const rows = await listAccessRows(client, userId);
  const suspended = rows.some((row) => row.accessType === 'suspension' && row.restoredAt === null);
  if (suspended) return false;
  // Only an administrator (a holder of access.manage) may act. Module heads and approvers hold no privileges, even
  // when grants from before this rule still exist; they use only their own module's screens.
  const held = heldPrivileges(rows);
  if (!held.some((entry) => entry.privilege === ACCESS_MANAGE)) return false;
  return true;
}

async function requireUser(client: PoolClient, userId: string): Promise<void> {
  const found = await findPublicUser(client, userId);
  if (!found) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found');
  }
}

/** A user's grants, suspensions and held privileges. Throws 404 when the user does not exist. */
export async function accessForUser(client: PoolClient, userId: string): Promise<AccessView> {
  await requireUser(client, userId);
  const rows = await listAccessRows(client, userId);
  const suspensions = rows.filter((row) => row.accessType === 'suspension');
  const grants = rows.filter((row) => row.accessType !== 'suspension');
  return {
    userId,
    suspended: suspensions.some((row) => row.restoredAt === null),
    grants: grants.map(toGrantView),
    suspensions: suspensions.map(toSuspensionView),
    privileges: heldPrivileges(rows),
  };
}

function newRowFor(userId: string, input: GrantInput): NewAccessRow {
  const scope = {
    projectId: input.scope?.projectId ?? null,
    storeId: input.scope?.storeId ?? null,
  };
  const reason = input.reason ?? null;
  switch (input.accessType) {
    case 'role':
      return {
        userId,
        accessType: 'role',
        roleId: input.roleId,
        privilege: null,
        module: null,
        reason,
        ...scope,
      };
    case 'privilege':
      return {
        userId,
        accessType: 'privilege',
        roleId: null,
        privilege: input.privilege,
        module: null,
        reason,
        ...scope,
      };
    case 'module_head':
      return {
        userId,
        accessType: 'module_head',
        roleId: null,
        privilege: null,
        module: input.module,
        reason,
        ...scope,
      };
  }
}

/** Adds a role, privilege or module-head grant. Writes one audit row in the caller's transaction. */
export async function grantAccess(
  client: PoolClient,
  actor: Actor,
  userId: string,
  input: GrantInput,
): Promise<GrantView> {
  await requireUser(client, userId);
  let row: AccessRecord;
  try {
    row = await insertAccessRow(client, newRowFor(userId, input), actor.actorId);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        'ACCESS_REFERENCE_NOT_FOUND',
        400,
        'The role, project or store does not exist',
      );
    }
    throw err;
  }
  await appendAuditRow(client, {
    tableName: ACCESS_TABLE,
    recordId: row.id,
    op: 'INSERT',
    newRow: auditSnapshot(row),
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
  return toGrantView(row);
}

/** Revokes a grant by deleting its row. The audit row keeps the deleted snapshot. */
export async function revokeGrant(
  client: PoolClient,
  actor: Actor,
  grantId: string,
): Promise<void> {
  const row = await deleteGrantRow(client, grantId);
  if (!row) {
    throw new AppError('ACCESS_GRANT_NOT_FOUND', 404, 'Grant not found');
  }
  await appendAuditRow(client, {
    tableName: ACCESS_TABLE,
    recordId: row.id,
    op: 'DELETE',
    oldRow: auditSnapshot(row),
    newRow: null,
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
}

/** Suspends a user. Denies every protected route from the next request; sessions stay as they are. */
export async function suspendUser(
  client: PoolClient,
  actor: Actor,
  userId: string,
  reason: string,
): Promise<SuspensionView> {
  await requireUser(client, userId);
  let row: AccessRecord;
  try {
    row = await insertAccessRow(
      client,
      {
        userId,
        accessType: 'suspension',
        roleId: null,
        privilege: null,
        module: null,
        projectId: null,
        storeId: null,
        reason,
      },
      actor.actorId,
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('ACCESS_ALREADY_SUSPENDED', 409, 'The user is already suspended');
    }
    throw err;
  }
  await appendAuditRow(client, {
    tableName: ACCESS_TABLE,
    recordId: row.id,
    op: 'INSERT',
    newRow: auditSnapshot(row),
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
  return toSuspensionView(row);
}

/** Restores a suspended user by setting restored_at on the suspension row. */
export async function restoreSuspension(
  client: PoolClient,
  actor: Actor,
  suspensionId: string,
): Promise<SuspensionView> {
  const before = await lockActiveSuspension(client, suspensionId);
  if (!before) {
    throw new AppError('ACCESS_SUSPENSION_NOT_FOUND', 404, 'Active suspension not found');
  }
  const after = await restoreSuspensionRow(client, suspensionId, actor.actorId);
  await appendAuditRow(client, {
    tableName: ACCESS_TABLE,
    recordId: after.id,
    op: 'UPDATE',
    oldRow: auditSnapshot(before),
    newRow: auditSnapshot(after),
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
  return toSuspensionView(after);
}

/** One page of tenant users, with the total that matches the filters. Read-only: no audit row. */
export function listUsers(
  client: PoolClient,
  query: UserListQuery,
): Promise<{ rows: UserRecord[]; total: number }> {
  return listUserRows(client, {
    status: query.status,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  });
}

const USER_TABLE = 'core_user';

/** A user view with the temporary password, returned once by create and admin reset. */
export type UserWithTemporaryPassword = UserRecord & { temporaryPassword: string };

export interface PasswordResetView {
  userId: string;
  mustChangePassword: true;
  temporaryPassword: string;
}

/**
 * The copy of a response that the idempotency store keeps: everything except the temporary password, so the secret is
 * never stored in plain text and a replay of the same request does not return it again.
 */
export function withoutTemporaryPassword<T extends { temporaryPassword: string }>(
  value: T,
): Omit<T, 'temporaryPassword'> {
  const copy: Partial<T> = { ...value };
  delete copy.temporaryPassword;
  return copy as Omit<T, 'temporaryPassword'>;
}

function userIssue(path: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', 400, 'Request validation failed', {
    issues: [{ path, message }],
  });
}

function duplicateLogin(): AppError {
  return new AppError('USER_DUPLICATE_LOGIN', 409, 'A user with this login id already exists');
}

function userVersionConflict(): AppError {
  return new AppError(
    'VERSION_CONFLICT',
    409,
    'The record changed since you read it. Reload it and try again',
  );
}

/**
 * Cross-field rules of the profile. A module head heads at least one module and an approver heads none; a company
 * scope names no projects and a project scope names at least one, each of which must exist.
 */
async function checkProfile(client: PoolClient, profile: UserProfileRow): Promise<void> {
  const heads = profile.roles.includes('module_head');
  if (heads && profile.modules.length === 0) {
    throw userIssue('modules', 'a module head heads at least one module');
  }
  if (!heads && profile.modules.length > 0) {
    throw userIssue('modules', 'only a module head heads modules');
  }
  if (profile.scopeType === 'company' && profile.scopeIds.length > 0) {
    throw userIssue('scopeIds', 'a company scope names no projects');
  }
  if (profile.scopeType === 'project' && profile.scopeIds.length === 0) {
    throw userIssue('scopeIds', 'a project scope names at least one project');
  }
  const missing = await missingProjectIds(client, profile.scopeIds);
  if (missing.length > 0) {
    throw new AppError('USER_REFERENCE_NOT_FOUND', 400, 'A project in scopeIds does not exist');
  }
}

async function auditUser(
  client: PoolClient,
  actor: Actor,
  userId: string,
  op: 'INSERT' | 'UPDATE',
  oldRow: Record<string, unknown> | null,
): Promise<void> {
  // The snapshot is the stored row; the audit writer removes password_hash and the other hash columns.
  await appendAuditRow(client, {
    tableName: USER_TABLE,
    recordId: userId,
    op,
    oldRow,
    newRow: await snapshotOf(client, USER_TABLE, userId),
    actorId: actor.actorId,
    correlationId: actor.correlationId,
    moduleName: AUDIT_MODULE,
  });
}

/**
 * Creates an active user with a server-generated temporary password, which the user must change at first sign-in.
 * The password is hashed before it is stored and is returned only in this response.
 */
export async function createUser(
  client: PoolClient,
  actor: Actor,
  input: UserCreateInput,
): Promise<UserWithTemporaryPassword> {
  const roles = rolesFrom(input, ['approver']);
  const profile: UserProfileRow = {
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    designation: input.designation ?? null,
    role: primaryRole(roles),
    roles,
    modules: input.modules,
    scopeType: input.scopeType,
    scopeIds: input.scopeIds,
  };
  await checkProfile(client, profile);
  if (await findUserIdByLogin(client, input.loginId)) {
    throw duplicateLogin();
  }
  const temporaryPassword = generateTemporaryPassword();
  assertPasswordPolicy(temporaryPassword, input.loginId);
  const hash = await hashSecret(temporaryPassword);
  let userId: string;
  try {
    userId = await insertUserRow(client, input.loginId, profile, hash, actor.actorId);
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateLogin();
    throw err;
  }
  await auditUser(client, actor, userId, 'INSERT', null);
  return { ...(await getUser(client, userId)), temporaryPassword };
}

/** Changes the profile fields the caller sent, under the row-version guard. The login id never changes. */
export async function updateUser(
  client: PoolClient,
  actor: Actor,
  userId: string,
  input: UserPatchInput,
): Promise<UserRecord> {
  const current = await lockUserRow(client, userId);
  if (!current) throw new AppError('USER_NOT_FOUND', 404, 'User not found');
  if (current.rowVersion !== input.rowVersion) throw userVersionConflict();
  const roles = rolesFrom(input, current.roles as UserRole[]);
  const profile: UserProfileRow = {
    name: input.name ?? current.name ?? '',
    email: input.email !== undefined ? input.email : current.email,
    phone: input.phone !== undefined ? input.phone : current.phone,
    designation: input.designation !== undefined ? input.designation : current.designation,
    role: primaryRole(roles),
    roles,
    modules: input.modules ?? current.modules,
    scopeType: input.scopeType ?? current.scopeType,
    scopeIds: input.scopeIds ?? current.scopeIds,
  };
  if (profile.name === '') throw userIssue('name', 'name is required');
  await checkProfile(client, profile);
  const before = await snapshotOf(client, USER_TABLE, userId);
  const updated = await updateUserProfileRow(
    client,
    userId,
    input.rowVersion,
    profile,
    actor.actorId,
  );
  if (!updated) throw userVersionConflict();
  await auditUser(client, actor, userId, 'UPDATE', before);
  return getUser(client, userId);
}

/**
 * Admin reset: sets a new server-generated temporary password, requires a change at the next sign-in, clears failures
 * and locks, and revokes every session of the user. The password is returned only in this response.
 */
export async function resetUserPassword(
  client: PoolClient,
  actor: Actor,
  userId: string,
): Promise<PasswordResetView> {
  const current = await lockUserRow(client, userId);
  if (!current) throw new AppError('USER_NOT_FOUND', 404, 'User not found');
  const temporaryPassword = generateTemporaryPassword();
  assertPasswordPolicy(temporaryPassword, current.loginId);
  const hash = await hashSecret(temporaryPassword);
  const before = await snapshotOf(client, USER_TABLE, userId);
  await setTemporaryPassword(client, userId, hash, actor.actorId);
  await revokeAllSessions(client, userId);
  await recordAuthEvent(client, userId, 'password_admin_reset');
  await auditUser(client, actor, userId, 'UPDATE', before);
  return { userId, mustChangePassword: true, temporaryPassword };
}

/** One user by id. A user that the tenant does not have answers 404. */
export async function getUser(client: PoolClient, userId: string): Promise<UserRecord> {
  const user = await findUserRow(client, userId);
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found');
  return user;
}
