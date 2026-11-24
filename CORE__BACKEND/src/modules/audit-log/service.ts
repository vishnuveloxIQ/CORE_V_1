import type { PoolClient } from 'pg';
import { appendAuditRow, redactSnapshot } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import type { Actor } from '../../core/resource.js';
import { findAuditRow, listAuditRows, listAuthEventRows, type AuditRow } from './repo.js';
import type { AuditListQuery, AuthEventsQuery, ExternalAuditInput } from './schema.js';

/** One sign-in or access event as the API returns it. `detail` is the route for access_denied events. */
export interface AuthEventRecord {
  id: string;
  at: string | null;
  event: string;
  user: string | null;
  loginId: string | null;
  detail: string | null;
  /** core, or the module whose sign-in this is: hrms, pm, pms or stores */
  module: string;
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
      module: row.module_name,
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
  /** which module the entry comes from: core, hrms, pm, pms or stores */
  module: string;
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

/** "leave_request" as "Leave request". */
function words(value: string): string {
  const text = value.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * An entry another module sent (POST /audit-log/external). Its person, action, summary and time are kept inside the
 * stored entry, so they are read from there; the extra details follow the summary in the "after" text.
 */
function toExternalEntry(row: AuditRow): AuditEntryRecord {
  const stored = row.new_row ?? {};
  const { summary, action, actorName, actorLogin, occurredAt, ...details } = stored;
  return {
    id: row.id,
    at: textOf(occurredAt) ?? (row.changed_at ? row.changed_at.toISOString() : null),
    user: textOf(actorName) ?? textOf(actorLogin),
    action: words(textOf(action) ?? 'activity'),
    entity: words(row.table_name ?? 'record'),
    entityId: row.record_id,
    before: '',
    after: JSON.stringify(redactSnapshot({ summary, ...details })),
    module: row.module_name ?? 'core',
  };
}

function toEntry(row: AuditRow): AuditEntryRecord {
  if (row.module_name !== null && row.module_name !== 'core') return toExternalEntry(row);
  return {
    id: row.id,
    at: row.changed_at ? row.changed_at.toISOString() : null,
    user: row.actor_name ?? row.actor_login ?? null,
    action: ACTION_VERB[row.op ?? ''] ?? String(row.op),
    entity: entityLabel(row.table_name),
    entityId: row.record_id,
    before: snapshotText(row.old_row),
    after: snapshotText(row.new_row),
    module: 'core',
  };
}

/**
 * Stores one entry from another module in the tenant's audit chain (the same append-only, hash-linked table as CORE's
 * own entries). The module is recorded as the entry's source. The person named in the entry is not a CORE user, so no
 * actor id is stored; the name and login travel inside the entry. The entry id is returned.
 */
export async function recordExternalAudit(client: PoolClient, actor: Actor, input: ExternalAuditInput): Promise<{ id: string; module: string }> {
  const id = await appendAuditRow(client, {
    tableName: input.entityType,
    recordId: input.recordRef ?? '-',
    op: 'INSERT',
    newRow: {
      ...(input.details ?? {}),
      summary: input.summary,
      action: input.action,
      actorName: input.actorName,
      actorLogin: input.actorLogin ?? null,
      occurredAt: input.occurredAt,
    },
    actorId: null,
    correlationId: input.correlationId ?? actor.correlationId,
    moduleName: input.sourceModule,
  });
  return { id, module: input.sourceModule };
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
