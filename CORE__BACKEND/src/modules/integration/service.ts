import type { PoolClient } from 'pg';
import { type Actor, auditWrite } from '../../core/resource.js';
import { AppError } from '../../core/errors.js';
import { recordInbound } from '../../core/events.js';
import { many, one, snapshotOf } from '../../core/rows.js';
import type { EventListQuery, InboundEventInput } from './schema.js';

/**
 * Integration events (CORE-23-02, 23-03, 24-05, 24-07): the monitor's reads, replay of dead-lettered events, and the
 * inbox that keeps the read models. Payload values are never returned by the monitor, only their field names, so
 * personal or commercial data inside an event is not shown to administrators.
 */

export interface EventSummaryRow {
  id: string;
  direction: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateSeq: number | null;
  sourceModule: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  occurredAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  processedAt: string | null;
  deadLetteredAt: string | null;
  replayStatus: string | null;
  correlationId: string | null;
  payloadKeys: string[];
}

const SELECT = `
  id, direction, event_id AS "eventId", event_type AS "eventType", aggregate_type AS "aggregateType",
  aggregate_id AS "aggregateId", aggregate_seq::int AS "aggregateSeq", source_module AS "sourceModule", status,
  COALESCE(attempts, 0) AS attempts, last_error AS "lastError", next_attempt_at AS "nextAttemptAt",
  occurred_at AS "occurredAt", created_at AS "createdAt", published_at AS "publishedAt", processed_at AS "processedAt",
  dead_lettered_at AS "deadLetteredAt", replay_status AS "replayStatus", correlation_id AS "correlationId",
  COALESCE((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(COALESCE(payload, '{}'::jsonb)) k), '{}') AS "payloadKeys"`;

/** One page of events, newest first, with the total that match. */
export async function listEvents(client: PoolClient, q: EventListQuery): Promise<{ rows: EventSummaryRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (q.direction) add('direction = ?', q.direction);
  if (q.status) add('status = ?', q.status);
  if (q.eventType) add('event_type = ?', q.eventType);
  if (q.from) add('created_at >= ?::date', q.from);
  if (q.to) add("created_at < (?::date + interval '1 day')", q.to);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ n: string }>(client, `SELECT count(*) AS n FROM integ_event ${clause}`, params);
  const rows = await many<EventSummaryRow>(
    client,
    `SELECT ${SELECT} FROM integ_event ${clause} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, q.offset],
  );
  return { rows, total: Number(total?.n ?? 0) };
}

export async function getEvent(client: PoolClient, id: string): Promise<EventSummaryRow> {
  const row = await one<EventSummaryRow>(client, `SELECT ${SELECT} FROM integ_event WHERE id = $1`, [id]);
  if (!row) throw new AppError('INTEGRATION_EVENT_NOT_FOUND', 404, 'Event not found');
  return row;
}

/** Counts per direction and status, and how long the oldest waiting outbound event has waited. */
export async function eventSummary(client: PoolClient): Promise<{
  counts: Array<{ direction: string; status: string; count: number }>;
  oldestPendingAt: string | null;
  deadLettered: number;
}> {
  const counts = await many<{ direction: string; status: string; count: number }>(
    client,
    `SELECT direction, status, count(*)::int AS count FROM integ_event WHERE status IS NOT NULL GROUP BY direction, status ORDER BY direction, status`,
  );
  const oldest = await one<{ at: string | null }>(
    client,
    `SELECT min(created_at) AS at FROM integ_event WHERE direction = 'outbound' AND status = 'pending'`,
  );
  return {
    counts,
    oldestPendingAt: oldest?.at ?? null,
    deadLettered: counts.filter((c) => c.status === 'dead_lettered').reduce((n, c) => n + c.count, 0),
  };
}

/**
 * Sends a dead-lettered event again (CORE-24-07): an outbound event goes back to the relay's queue with its attempts
 * reset; an inbound event is applied to the read models again. Its aggregate order is kept, because the relay sends an
 * event only after every earlier one of its aggregate. Audited. Any other state answers 409.
 */
export async function replayEvent(client: PoolClient, actor: Actor, id: string): Promise<EventSummaryRow> {
  const row = await one<{ direction: string; status: string }>(client, 'SELECT direction, status FROM integ_event WHERE id = $1 FOR UPDATE', [id]);
  if (!row) throw new AppError('INTEGRATION_EVENT_NOT_FOUND', 404, 'Event not found');
  if (row.status !== 'dead_lettered') {
    throw new AppError('INTEGRATION_EVENT_NOT_REPLAYABLE', 409, 'Only a dead-lettered event can be replayed');
  }
  const before = await snapshotOf(client, 'integ_event', id);
  if (row.direction === 'outbound') {
    await client.query(
      `UPDATE integ_event
          SET status = 'pending', attempts = 0, next_attempt_at = now(), dead_lettered_at = NULL,
              replay_status = 'requested', replayed_at = now(), updated_at = now(), updated_by = $2,
              row_version = row_version + 1
        WHERE id = $1`,
      [id, actor.actorId],
    );
    await client.query("SELECT pg_notify('core_outbox', current_schema())");
  } else {
    await client.query(
      `UPDATE integ_event
          SET status = 'received', dead_lettered_at = NULL, replay_status = 'requested', replayed_at = now(),
              updated_at = now(), updated_by = $2, row_version = row_version + 1
        WHERE id = $1`,
      [id, actor.actorId],
    );
    await applyInbound(client, id);
  }
  await auditWrite(client, actor, 'integ_event', id, 'UPDATE', before, await snapshotOf(client, 'integ_event', id));
  return getEvent(client, id);
}

export type InboundOutcome = 'applied' | 'stale' | 'duplicate';

/**
 * The inbox (CORE-24-05): records the event once (a second delivery of the same eventId is a duplicate) and applies
 * it to the read model in the same transaction. An event older than, or equal to, the stored sequence for that record
 * changes nothing (stale); a `*.deleted` event marks the copy deleted. References to records Core does not hold are
 * kept as they are (soft references); unknown payload fields are kept too.
 */
export async function receiveInbound(client: PoolClient, actor: Actor, input: InboundEventInput): Promise<{ outcome: InboundOutcome; eventId: string }> {
  const recorded = await recordInbound(client, {
    eventId: input.eventId,
    eventType: input.eventType,
    eventVersion: input.eventVersion,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateSeq: input.aggregateSeq,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId ?? actor.correlationId,
    causationId: input.causationId ?? null,
    actorId: actor.actorId,
    payload: input.payload,
    schemaVersion: input.schemaVersion,
    sourceModule: input.sourceModule,
  });
  if (recorded.status === 'duplicate') return { outcome: 'duplicate', eventId: input.eventId };
  return { outcome: await applyInbound(client, recorded.id), eventId: input.eventId };
}

/** Applies one received inbound event to ref_record and marks it processed. */
async function applyInbound(client: PoolClient, id: string): Promise<'applied' | 'stale'> {
  const e = await one<{ event_id: string; event_type: string; aggregate_type: string; aggregate_id: string; aggregate_seq: string; source_module: string; payload: Record<string, unknown> }>(
    client,
    `SELECT event_id, event_type, aggregate_type, aggregate_id, aggregate_seq, source_module, payload FROM integ_event WHERE id = $1`,
    [id],
  );
  if (!e) throw new AppError('INTEGRATION_EVENT_NOT_FOUND', 404, 'Event not found');
  const deleted = e.event_type.endsWith('.deleted');
  // Insert, or update only when this event is newer than the stored copy: the sequence check is in the statement, so
  // two deliveries racing on one record cannot let the older win.
  const written = await client.query(
    `INSERT INTO ref_record (source_module, entity_type, source_id, source_seq, event_id, data, deleted, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
     ON CONFLICT (source_module, entity_type, source_id) DO UPDATE
       SET source_seq = EXCLUDED.source_seq, event_id = EXCLUDED.event_id, data = EXCLUDED.data, deleted = EXCLUDED.deleted,
           synced_at = EXCLUDED.synced_at, updated_at = now(), row_version = ref_record.row_version + 1
     WHERE ref_record.source_seq < EXCLUDED.source_seq`,
    [e.source_module, e.aggregate_type, e.aggregate_id, Number(e.aggregate_seq), e.event_id, JSON.stringify(e.payload ?? {}), deleted],
  );
  const applied = (written.rowCount ?? 0) > 0;
  await client.query(
    `UPDATE integ_event SET status = 'processed', processed_at = now(), last_error = $2,
            replay_status = CASE WHEN replay_status = 'requested' THEN 'replayed' ELSE replay_status END, updated_at = now()
      WHERE id = $1`,
    [id, applied ? null : 'Stale: the read model already holds this or a newer version of the record'],
  );
  return applied ? 'applied' : 'stale';
}

export interface RefRecordRow {
  id: string;
  sourceModule: string;
  entityType: string;
  sourceId: string;
  sourceSeq: number;
  deleted: boolean;
  syncedAt: string;
  data: Record<string, unknown>;
}

/** Read models, one page at a time, optionally filtered and searched (the search looks at the record's fields). */
export async function listRefRecords(
  client: PoolClient,
  q: { sourceModule?: string | undefined; entityType?: string | undefined; q?: string | undefined; limit: number; offset: number },
): Promise<{ rows: RefRecordRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.sourceModule) { params.push(q.sourceModule); where.push(`source_module = $${params.length}`); }
  if (q.entityType) { params.push(q.entityType); where.push(`entity_type = $${params.length}`); }
  if (q.q) { params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); where.push(`data::text ILIKE $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ n: string }>(client, `SELECT count(*) AS n FROM ref_record ${clause}`, params);
  const rows = await many<RefRecordRow>(
    client,
    `SELECT id, source_module AS "sourceModule", entity_type AS "entityType", source_id AS "sourceId", source_seq::int AS "sourceSeq",
            deleted, synced_at AS "syncedAt", data
       FROM ref_record ${clause} ORDER BY synced_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, q.offset],
  );
  return { rows, total: Number(total?.n ?? 0) };
}

/** Per module and entity: how many records Core holds, the newest sequence, and when it last synced. */
export async function syncStatus(client: PoolClient): Promise<Array<{ sourceModule: string; entityType: string; records: number; lastSeq: number; lastSyncedAt: string }>> {
  return many(
    client,
    `SELECT source_module AS "sourceModule", entity_type AS "entityType", count(*)::int AS records,
            max(source_seq)::int AS "lastSeq", max(synced_at) AS "lastSyncedAt"
       FROM ref_record GROUP BY source_module, entity_type ORDER BY source_module, entity_type`,
  );
}
