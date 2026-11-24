import type { PoolClient } from 'pg';
import { redactSnapshot } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import { findAuditRow, listAuditRows, listAuthEventRows, type AuditRow } from './repo.js';
import type { AuditListQuery, AuthEventsQuery } from './schema.js';

/** One sign-in or access event as the API returns it. `detail` is the route for access_denied events. */
export interface AuthEventRecord {
  id: string;
  at: string | null;
  event: string;
  user: string | null;
  loginId: string | null;
  detail: string | null;
}

/** One page of the sign-in and access history, newest first. A failure for an unknown login has no user. */
export async function listAuthEvents(
  client: PoolClient,
  query: AuthEventsQuery,
): Promise<{ events: AuthEventRecord[]; total: number }> {
  const { rows, total } = await listAuthEventRows(client, query);
  return {
    events: rows.map((row) => ({
      id: row.id,
      at: row.occurred_at ? row.occurred_at.toISOString() : null,
      event: row.event_type,
      user: row.actor_name ?? row.actor_login ?? null,
      loginId: row.actor_login,
      detail: row.purpose,
    })),
    total,
  };
}

/**
 * One audit entry in the shape the frontend AuditEntry type uses. The stored row has no human summary, so action
 * and entity are derived from the operation and the table. before and after are the stored snapshots as JSON text,
 * with the secret columns removed again on the way out (defence in depth: the writer already redacts them).
 */
export interface AuditEntryRecord {
  id: string;
  at: string | null;
  user: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: string;
  after: string;
}

const ACTION_VERB: Record<string, string> = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
};

/** Human names for the tables the audit trail records. Any other table is shown from its name. */
const ENTITY_LABEL: Record<string, string> = {
  core_company_profile: 'Company',
  core_vendor: 'Vendor',
  core_role: 'Role',
  core_equipment_type: 'Equipment type',
  core_equipment_unit: 'Equipment unit',
  core_location: 'Location',
  core_project: 'Project',
  core_store: 'Store',
  core_material: 'Material',
  core_major_material_allocation: 'Material allocation',
  core_equipment_assignment: 'Equipment assignment',
  core_plan_line: 'Plan line',
  core_stock_level: 'Stock level',
  core_user: 'User',
  core_user_access: 'User access',
  core_policy: 'Policy',
  core_policy_version: 'Policy version',
  core_approval_chain: 'Approval chain',
  core_approval_request: 'Approval request',
  core_grievance: 'Grievance',
  core_department: 'Department',
  core_position: 'Position',
  core_file: 'File',
};

function entityLabel(table: string | null): string {
  if (table === null) return 'Unknown';
  const known = ENTITY_LABEL[table];
  if (known) return known;
  const words = table.replace(/^core_/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A stored snapshot as JSON text, with secret keys removed at any depth. Empty when there is no snapshot. */
function snapshotText(row: Record<string, unknown> | null): string {
  return row === null ? '' : JSON.stringify(redactSnapshot(row));
}

function toEntry(row: AuditRow): AuditEntryRecord {
  return {
    id: row.id,
    at: row.changed_at ? row.changed_at.toISOString() : null,
    user: row.actor_name ?? row.actor_login ?? null,
    action: ACTION_VERB[row.op ?? ''] ?? String(row.op),
    entity: entityLabel(row.table_name),
    entityId: row.record_id,
    before: snapshotText(row.old_row),
    after: snapshotText(row.new_row),
  };
}

/** One audit entry by id, in the same shape as a list item. Unknown ids are 404 NOT_FOUND. */
export async function getAuditEntry(client: PoolClient, id: string): Promise<AuditEntryRecord> {
  const row = await findAuditRow(client, id);
  if (!row) throw new AppError('NOT_FOUND', 404, 'Audit entry not found');
  return toEntry(row);
}

/** One page of the audit trail, newest first, with the total that matches the filters. */
export async function listAuditEntries(
  client: PoolClient,
  query: AuditListQuery,
): Promise<{ entries: AuditEntryRecord[]; total: number }> {
  const { rows, total } = await listAuditRows(client, query);
  return { entries: rows.map(toEntry), total };
}
