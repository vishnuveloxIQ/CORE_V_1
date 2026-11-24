import type { PoolClient } from 'pg';
import { many } from '../../core/rows.js';
import { AUTH_EVENT_TYPES, type AuditListQuery, type AuthEventsQuery } from './schema.js';

/** One sign-in or access event. Only these columns are ever read: no hash, challenge, IP or location. */
export interface AuthEventRow {
  id: string;
  occurred_at: Date | null;
  event_type: string;
  purpose: string | null;
  actor_name: string | null;
  actor_login: string | null;
}

/** One page of sign-in and access events, newest first, and the total that matches the filters. */
export async function listAuthEventRows(
  client: PoolClient,
  query: AuthEventsQuery,
): Promise<{ rows: AuthEventRow[]; total: number }> {
  // the listed event types only: internal rows (code hashes, passkey challenges) never match
  const params: unknown[] = [query.eventType ? [query.eventType] : [...AUTH_EVENT_TYPES]];
  const where: string[] = ['a.event_type = ANY($1::text[])'];
  if (query.from !== undefined) {
    params.push(query.from);
    where.push(`a.occurred_at >= (($${params.length}::date)::timestamp AT TIME ZONE 'UTC')`);
  }
  if (query.to !== undefined) {
    params.push(query.to);
    where.push(`a.occurred_at < ((($${params.length}::date + 1))::timestamp AT TIME ZONE 'UTC')`);
  }
  if (query.actor !== undefined) {
    params.push(`%${query.actor.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.login_id::text ILIKE $${params.length})`);
  }
  const clause = ` WHERE ${where.join(' AND ')}`;
  const rows = await many<AuthEventRow>(
    client,
    `SELECT a.id, a.occurred_at, a.event_type, a.purpose, u.name AS actor_name, u.login_id::text AS actor_login
     FROM core_auth_activity a
     LEFT JOIN core_user u ON u.id = a.user_id
     ${clause}
     ORDER BY a.occurred_at DESC NULLS LAST, a.id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.limit, query.offset],
  );
  const [counted] = await many<{ total: string }>(
    client,
    `SELECT count(*) AS total FROM core_auth_activity a LEFT JOIN core_user u ON u.id = a.user_id${clause}`,
    params,
  );
  return { rows, total: Number(counted?.total ?? 0) };
}

/** One audit_row_change row joined to the actor's name and login. Snapshots are as the audit writer stored them. */
export interface AuditRow {
  id: string;
  changed_at: Date | null;
  table_name: string | null;
  record_id: string | null;
  op: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  actor_name: string | null;
  actor_login: string | null;
}

/**
 * The WHERE clause and its parameters for a list query. The count and the page use the same clause, so the total
 * matches what the page draws from. Dates are read as whole days in UTC: from is the start of its day, to the end.
 */
function filterOf(query: AuditListQuery): { clause: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.from !== undefined) {
    params.push(query.from);
    where.push(`a.changed_at >= (($${params.length}::date)::timestamp AT TIME ZONE 'UTC')`);
  }
  if (query.to !== undefined) {
    params.push(query.to);
    where.push(`a.changed_at < ((($${params.length}::date + 1))::timestamp AT TIME ZONE 'UTC')`);
  }
  if (query.entityType !== undefined) {
    params.push(query.entityType);
    where.push(`a.table_name = $${params.length}`);
  }
  if (query.action !== undefined) {
    params.push({ created: 'INSERT', updated: 'UPDATE', deleted: 'DELETE' }[query.action]);
    where.push(`a.op = $${params.length}`);
  }
  if (query.actor !== undefined) {
    params.push(`%${query.actor.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(
      `EXISTS (SELECT 1 FROM core_user u WHERE u.id = a.actor_id
         AND (u.name ILIKE $${params.length} OR u.login_id::text ILIKE $${params.length}))`,
    );
  }
  return { clause: where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '', params };
}

/** One audit row by its id, read directly (not from a page of the list), or null when there is none. */
export async function findAuditRow(client: PoolClient, id: string): Promise<AuditRow | null> {
  const [row] = await many<AuditRow>(
    client,
    `SELECT a.id, a.changed_at, a.table_name, a.record_id, a.op, a.old_row, a.new_row,
            u.name AS actor_name, u.login_id::text AS actor_login
     FROM audit_row_change a
     LEFT JOIN core_user u ON u.id = a.actor_id
     WHERE a.id = $1`,
    [id],
  );
  return row ?? null;
}

/** One page of audit rows, newest first, and the total that matches the filters. */
export async function listAuditRows(
  client: PoolClient,
  query: AuditListQuery,
): Promise<{ rows: AuditRow[]; total: number }> {
  const { clause, params } = filterOf(query);
  const rows = await many<AuditRow>(
    client,
    `SELECT a.id, a.changed_at, a.table_name, a.record_id, a.op, a.old_row, a.new_row,
            u.name AS actor_name, u.login_id::text AS actor_login
     FROM audit_row_change a
     LEFT JOIN core_user u ON u.id = a.actor_id
     ${clause}
     ORDER BY a.changed_at DESC NULLS LAST, a.id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.limit, query.offset],
  );
  const [counted] = await many<{ total: string }>(
    client,
    `SELECT count(*) AS total FROM audit_row_change a${clause}`,
    params,
  );
  return { rows, total: Number(counted?.total ?? 0) };
}
