import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { lockWithinSchema } from '../db/tenant.js';
import { canonicalJson } from './canonical-json.js';
import { isSensitiveKey, REDACTED } from './redaction.js';

export type AuditOp = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditEntry {
  tableName: string;
  recordId: string;
  op: AuditOp;
  oldRow?: Record<string, unknown> | null;
  newRow?: Record<string, unknown> | null;
  actorId?: string | null;
  correlationId?: string | null;
  moduleName: string;
  /** Hash of the client IP, computed by the caller. The raw address is never stored. */
  ipHash?: string | null;
}

/** Every column the hash covers. prev_hash is the row_hash of the previous row in the tenant chain. */
interface ChainFields {
  table_name: string;
  record_id: string;
  op: string;
  old_row: unknown;
  new_row: unknown;
  actor_id: string | null;
  correlation_id: string | null;
  module_name: string;
  ip_hash: string | null;
  changed_at: string;
  prev_hash: string | null;
}

interface StoredRow extends ChainFields {
  id: string;
  row_hash: string;
}

/** changed_at as text in the same form the writer hashes: UTC with millisecond precision. */
const CHANGED_AT_TEXT = `to_char(changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Hash columns that audit snapshots must never store (handoff section 8, approved 2026-11-19).
 * These keys are removed from the snapshot at any depth, not replaced.
 */
export const AUDIT_EXCLUDED_KEYS: readonly string[] = [
  'password_hash',
  'pin_hash',
  'refresh_hash',
  'secret_hash',
];

/**
 * Prepares a row for audit storage: removes the excluded hash columns at any depth, and replaces
 * the value of any other sensitive key with REDACTED.
 */
export function redactSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSnapshot(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (AUDIT_EXCLUDED_KEYS.includes(key.toLowerCase())) {
        continue;
      }
      out[key] = isSensitiveKey(key) ? REDACTED : redactSnapshot(inner);
    }
    return out;
  }
  return value;
}

export function computeRowHash(fields: ChainFields): string {
  return createHash('sha256').update(canonicalJson(fields)).digest('hex');
}

function jsonParam(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/**
 * Appends one row to the tenant's audit chain. Call inside withTenant, in the same transaction as the change it records.
 * An advisory lock serializes writers in the tenant, so each row links to the current head.
 * Snapshots are redacted before they are hashed or stored.
 */
export async function appendAuditRow(client: PoolClient, entry: AuditEntry): Promise<string> {
  await lockWithinSchema(client, 'audit_row_change');

  const head = await client.query<{ row_hash: string; changed_at: string }>(
    `SELECT row_hash, ${CHANGED_AT_TEXT} AS changed_at
     FROM audit_row_change ORDER BY changed_at DESC LIMIT 1`,
  );
  const previous = head.rows[0];
  const prevHash = previous?.row_hash ?? null;

  // Timestamps are strictly increasing at millisecond precision, so the chain order is unambiguous.
  const previousMs = previous ? Date.parse(previous.changed_at) : Number.NEGATIVE_INFINITY;
  const changedAt = new Date(Math.max(Date.now(), previousMs + 1)).toISOString();

  const fields: ChainFields = {
    table_name: entry.tableName,
    record_id: entry.recordId,
    op: entry.op,
    old_row: entry.oldRow ? redactSnapshot(entry.oldRow) : null,
    new_row: entry.newRow ? redactSnapshot(entry.newRow) : null,
    actor_id: entry.actorId ? entry.actorId.toLowerCase() : null,
    correlation_id: entry.correlationId ?? null,
    module_name: entry.moduleName,
    ip_hash: entry.ipHash ?? null,
    changed_at: changedAt,
    prev_hash: prevHash,
  };
  const rowHash = computeRowHash(fields);

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO audit_row_change (
       table_name, record_id, op, old_row, new_row, actor_id, correlation_id,
       module_name, ip_hash, changed_at, prev_hash, row_hash
     ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::uuid, $7, $8, $9, $10::timestamptz, $11, $12)
     RETURNING id`,
    [
      fields.table_name,
      fields.record_id,
      fields.op,
      jsonParam(fields.old_row),
      jsonParam(fields.new_row),
      fields.actor_id,
      fields.correlation_id,
      fields.module_name,
      fields.ip_hash,
      fields.changed_at,
      fields.prev_hash,
      rowHash,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    throw new Error('insert into audit_row_change returned no row');
  }
  return id;
}

export interface ChainReport {
  rows: number;
  /** Id of the first row that fails the check, or null when the whole chain is intact. */
  brokenAt: string | null;
}

/**
 * Walks the tenant chain in order. For each row it checks that prev_hash is the previous row_hash
 * and that row_hash matches the stored values. Any edit made behind the append-only trigger shows up here.
 */
export async function verifyAuditChain(client: PoolClient): Promise<ChainReport> {
  const { rows } = await client.query<StoredRow>(
    `SELECT id, table_name, record_id, op, old_row, new_row, actor_id::text AS actor_id,
            correlation_id, module_name, ip_hash, prev_hash, row_hash,
            ${CHANGED_AT_TEXT} AS changed_at
     FROM audit_row_change ORDER BY changed_at ASC`,
  );

  let expectedPrev: string | null = null;
  for (const row of rows) {
    const recomputed = computeRowHash({
      table_name: row.table_name,
      record_id: row.record_id,
      op: row.op,
      old_row: row.old_row,
      new_row: row.new_row,
      actor_id: row.actor_id,
      correlation_id: row.correlation_id,
      module_name: row.module_name,
      ip_hash: row.ip_hash,
      changed_at: row.changed_at,
      prev_hash: row.prev_hash,
    });
    if (row.prev_hash !== expectedPrev || recomputed !== row.row_hash) {
      return { rows: rows.length, brokenAt: row.id };
    }
    expectedPrev = row.row_hash;
  }
  return { rows: rows.length, brokenAt: null };
}
