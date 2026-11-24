import type { PoolClient } from 'pg';
import { lockWithinSchema } from '../db/tenant.js';

/**
 * Status values used in integ_event.status. The handoff does not list them yet, so they are working decisions:
 * outbound rows go pending -> published or dead_lettered; inbound rows go received -> processed or dead_lettered.
 */
export const OUTBOUND_PENDING = 'pending';
export const INBOUND_RECEIVED = 'received';

export interface EventEnvelope {
  eventId: string;
  eventType: string;
  eventVersion: string;
  aggregateType: string;
  aggregateId: string;
  /** Set by the producer for inbound events. Outbound events get theirs from nextAggregateSeq. */
  aggregateSeq?: number | null;
  occurredAt: string;
  correlationId?: string | null;
  causationId?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  coalesceKey?: string | null;
  schemaVersion: string;
  sourceModule: string;
}

/**
 * Returns the next sequence number for one aggregate and stores it. The first call returns 1.
 * Locked per aggregate, so concurrent writers get distinct, gap-free numbers.
 */
export async function nextAggregateSeq(
  client: PoolClient,
  aggregateType: string,
  aggregateId: string,
): Promise<number> {
  await lockWithinSchema(client, `aggregate:${aggregateType}:${aggregateId}`);

  const bumped = await client.query<{ last_seq: string }>(
    `UPDATE integ_aggregate_sequence
     SET last_seq = last_seq + 1, updated_at = now()
     WHERE aggregate_type = $1 AND aggregate_id = $2
     RETURNING last_seq`,
    [aggregateType, aggregateId],
  );
  const row = bumped.rows[0];
  if (row) {
    return Number(row.last_seq);
  }

  await client.query(
    `INSERT INTO integ_aggregate_sequence (aggregate_type, aggregate_id, last_seq)
     VALUES ($1, $2, 1)`,
    [aggregateType, aggregateId],
  );
  return 1;
}

/**
 * Outbox: writes an outbound event in the same transaction as the business change, so an event exists if and only if the change committed.
 * A publisher reads pending rows later (not part of this step).
 */
export async function enqueueOutbound(
  client: PoolClient,
  event: EventEnvelope,
): Promise<{ id: string; aggregateSeq: number }> {
  const aggregateSeq = await nextAggregateSeq(client, event.aggregateType, event.aggregateId);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO integ_event (
       direction, event_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_seq,
       occurred_at, correlation_id, causation_id, actor_id, payload, coalesce_key, schema_version,
       source_module, status, attempts, next_attempt_at
     ) VALUES (
       'outbound', $1, $2, $3, $4, $5, $6,
       $7::timestamptz, $8, $9, $10::uuid, $11::jsonb, $12, $13,
       $14, $15, 0, now()
     )
     RETURNING id`,
    [
      event.eventId,
      event.eventType,
      event.eventVersion,
      event.aggregateType,
      event.aggregateId,
      aggregateSeq,
      event.occurredAt,
      event.correlationId ?? null,
      event.causationId ?? null,
      event.actorId ?? null,
      JSON.stringify(event.payload),
      event.coalesceKey ?? null,
      event.schemaVersion,
      event.sourceModule,
      OUTBOUND_PENDING,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    throw new Error('insert into integ_event returned no row');
  }
  // Wakes a listening relay when the transaction commits (and never if it rolls back). The relay also polls, so a
  // lost signal only delays delivery; the outbox row is the durable record.
  await client.query("SELECT pg_notify('core_outbox', current_schema())");
  return { id, aggregateSeq };
}

/** The channel enqueueOutbound signals on commit; its payload is the tenant schema name. */
export const OUTBOX_CHANNEL = 'core_outbox';

export type InboxResult = { status: 'recorded'; id: string } | { status: 'duplicate'; id: null };

/**
 * Inbox: records an inbound event once. A second delivery of the same event_id is reported as a duplicate and not stored again.
 */
export async function recordInbound(
  client: PoolClient,
  event: EventEnvelope,
): Promise<InboxResult> {
  await lockWithinSchema(client, `inbox:${event.eventId}`);

  const seen = await client.query(
    `SELECT 1 FROM integ_event WHERE direction = 'inbound' AND event_id = $1 LIMIT 1`,
    [event.eventId],
  );
  if ((seen.rowCount ?? 0) > 0) {
    return { status: 'duplicate', id: null };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO integ_event (
       direction, event_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_seq,
       occurred_at, correlation_id, causation_id, actor_id, payload, coalesce_key, schema_version,
       source_module, status, attempts, received_at
     ) VALUES (
       'inbound', $1, $2, $3, $4, $5, $6,
       $7::timestamptz, $8, $9, $10::uuid, $11::jsonb, $12, $13,
       $14, $15, 0, now()
     )
     RETURNING id`,
    [
      event.eventId,
      event.eventType,
      event.eventVersion,
      event.aggregateType,
      event.aggregateId,
      event.aggregateSeq ?? null,
      event.occurredAt,
      event.correlationId ?? null,
      event.causationId ?? null,
      event.actorId ?? null,
      JSON.stringify(event.payload),
      event.coalesceKey ?? null,
      event.schemaVersion,
      event.sourceModule,
      INBOUND_RECEIVED,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    throw new Error('insert into integ_event returned no row');
  }
  return { status: 'recorded', id };
}
