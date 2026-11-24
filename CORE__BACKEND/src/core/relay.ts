import type { Pool, PoolClient } from 'pg';
import { isValidTenantId } from '../db/migrate.js';
import { withTenant } from '../db/tenant.js';
import { OUTBOX_CHANNEL } from './events.js';

/**
 * The outbox relay (CORE-23-07, 24-06, 24-07). It reads due outbound events from integ_event and hands each to a
 * Publisher. The production transport is an open owner decision (D13), so the only publisher in this codebase is the
 * MockPublisher used by tests; a real one plugs in through the same interface.
 *
 * Guarantees:
 * - at least once: an event is marked published only after the publisher returns; a crash in between re-sends it;
 * - per-aggregate order: an event is sent only when every earlier event of its aggregate has been published, so a
 *   dead-lettered event holds back the later ones until it is replayed;
 * - one relay per event at a time: each event is locked while it is sent (SKIP LOCKED), so several relays never send
 *   the same event concurrently.
 *
 * LISTEN/NOTIFY only wakes the relay early (enqueueOutbound signals on commit); polling is the fallback after a lost
 * signal or a restart. The outbox row, not the signal, is the record of the event.
 */

/** What a publisher receives: the event envelope, with the tenant it belongs to. */
export interface EventMessage {
  id: string;
  tenant: string;
  eventId: string;
  eventType: string;
  eventVersion: string;
  schemaVersion: string;
  aggregateType: string;
  aggregateId: string;
  aggregateSeq: number;
  occurredAt: string;
  correlationId: string | null;
  causationId: string | null;
  actorId: string | null;
  sourceModule: string;
  payload: Record<string, unknown>;
}

/** Sends one event to the chosen transport. Throwing means not delivered: the relay retries it later. */
export interface Publisher {
  publish(message: EventMessage): Promise<void>;
}

/** A transport for tests: keeps what it was sent, and can be told to fail. */
export class MockPublisher implements Publisher {
  readonly sent: EventMessage[] = [];
  /** When set, decides per message whether this attempt fails (return an error message) or succeeds (null). */
  failWith: ((message: EventMessage) => string | null) | null = null;

  async publish(message: EventMessage): Promise<void> {
    const error = this.failWith?.(message) ?? null;
    if (error) throw new Error(error);
    this.sent.push(message);
  }
}

/**
 * How failures are retried: up to maxAttempts tries, waiting baseDelaySeconds × factor^(attempt − 1) between them, at
 * most maxDelaySeconds. The values are an open owner decision (D14), so there are no defaults: see retryPolicyFrom.
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  factor: number;
  maxDelaySeconds: number;
}

/**
 * The retry policy from the environment, or null when any value is missing. The relay does not start without one,
 * so an unconfigured server never invents retry numbers.
 */
export function retryPolicyFrom(env: Record<string, string | undefined>): RetryPolicy | null {
  const read = (name: string) => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const maxAttempts = read('EVENT_RETRY_MAX_ATTEMPTS');
  const baseDelaySeconds = read('EVENT_RETRY_BASE_SECONDS');
  const factor = read('EVENT_RETRY_FACTOR');
  const maxDelaySeconds = read('EVENT_RETRY_MAX_DELAY_SECONDS');
  if (maxAttempts === null || baseDelaySeconds === null || factor === null || maxDelaySeconds === null) return null;
  return { maxAttempts: Math.floor(maxAttempts), baseDelaySeconds, factor, maxDelaySeconds };
}

/** The wait before the next try, after `attempts` failed tries (1 = the first failure). */
export function retryDelaySeconds(policy: RetryPolicy, attempts: number): number {
  return Math.min(policy.maxDelaySeconds, policy.baseDelaySeconds * policy.factor ** Math.max(0, attempts - 1));
}

/** A failure message safe to store and show: one line, no more than 500 characters. */
export function safeError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, ' ').trim().slice(0, 500) || 'Unknown error';
}

export interface RelayResult {
  published: number;
  retried: number;
  deadLettered: number;
}

interface DueRow {
  id: string;
  event_id: string;
  event_type: string;
  event_version: string | null;
  schema_version: string | null;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_seq: string;
  occurred_at: Date;
  correlation_id: string | null;
  causation_id: string | null;
  actor_id: string | null;
  source_module: string | null;
  payload: Record<string, unknown> | null;
  attempts: number | null;
  replay_status: string | null;
}

/** The next due outbound event that heads its aggregate, locked for this relay; null when there is none. */
async function lockNextDue(client: PoolClient, now: Date): Promise<DueRow | null> {
  const { rows } = await client.query<DueRow>(
    `SELECT e.id, e.event_id, e.event_type, e.event_version, e.schema_version, e.aggregate_type, e.aggregate_id,
            e.aggregate_seq, e.occurred_at, e.correlation_id, e.causation_id, e.actor_id, e.source_module, e.payload,
            e.attempts, e.replay_status
       FROM integ_event e
      WHERE e.direction = 'outbound' AND e.status = 'pending' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= $1)
        -- the aggregate's head: the lowest sequence still waiting or dead-lettered. Written as a correlated min()
        -- over integ_event_aggregate_seq_idx so the plan stays an index lookup per candidate even before the table has
        -- statistics (an anti-join planned without them took 200 ms per event in the load baseline).
        AND e.aggregate_seq = (
          SELECT min(p.aggregate_seq) FROM integ_event p
           WHERE p.direction = 'outbound' AND p.aggregate_type = e.aggregate_type AND p.aggregate_id = e.aggregate_id
             AND p.status IN ('pending', 'dead_lettered'))
      ORDER BY e.next_attempt_at NULLS FIRST, e.aggregate_seq
      LIMIT 1
      FOR UPDATE OF e SKIP LOCKED`,
    [now],
  );
  return rows[0] ?? null;
}

/**
 * Sends up to `batch` due events of one tenant, one transaction per event (the lock is the lease). Returns what
 * happened. An event that fails is retried after the policy's delay; after maxAttempts it is dead-lettered.
 */
export async function relayTenant(
  pool: Pool,
  tenant: string,
  publisher: Publisher,
  policy: RetryPolicy,
  options: { now?: () => Date; batch?: number; onDeadLetter?: (message: EventMessage, error: string) => void } = {},
): Promise<RelayResult> {
  const result: RelayResult = { published: 0, retried: 0, deadLettered: 0 };
  const now = options.now ?? (() => new Date());
  for (let i = 0; i < (options.batch ?? 50); i += 1) {
    const done = await withTenant(pool, tenant, async (client) => {
      const at = now();
      const row = await lockNextDue(client, at);
      if (!row) return false;
      const message: EventMessage = {
        id: row.id,
        tenant,
        eventId: row.event_id,
        eventType: row.event_type,
        eventVersion: row.event_version ?? '1',
        schemaVersion: row.schema_version ?? '1',
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        aggregateSeq: Number(row.aggregate_seq),
        occurredAt: row.occurred_at.toISOString(),
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        actorId: row.actor_id,
        sourceModule: row.source_module ?? 'core',
        payload: row.payload ?? {},
      };
      try {
        await publisher.publish(message);
        await client.query(
          `UPDATE integ_event
              SET status = 'published', published_at = $2, last_error = NULL, next_attempt_at = NULL,
                  replay_status = CASE WHEN replay_status = 'requested' THEN 'replayed' ELSE replay_status END,
                  updated_at = now()
            WHERE id = $1`,
          [row.id, at],
        );
        result.published += 1;
      } catch (err) {
        const attempts = (row.attempts ?? 0) + 1;
        const error = safeError(err);
        if (attempts >= policy.maxAttempts) {
          await client.query(
            `UPDATE integ_event
                SET status = 'dead_lettered', attempts = $2, last_error = $3, dead_lettered_at = $4, next_attempt_at = NULL,
                    updated_at = now()
              WHERE id = $1`,
            [row.id, attempts, error, at],
          );
          result.deadLettered += 1;
          options.onDeadLetter?.(message, error);
        } else {
          const next = new Date(at.getTime() + retryDelaySeconds(policy, attempts) * 1000);
          await client.query(
            `UPDATE integ_event SET attempts = $2, last_error = $3, next_attempt_at = $4, updated_at = now() WHERE id = $1`,
            [row.id, attempts, error, next],
          );
          result.retried += 1;
        }
      }
      return true;
    });
    if (!done) break;
  }
  return result;
}

/** The tenant ids that have a schema. */
export async function tenantIds(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ nspname: string }>(
    'SELECT nspname FROM pg_namespace WHERE left(nspname, 7) = $1 ORDER BY nspname',
    ['tenant_'],
  );
  return rows.map((r) => r.nspname.slice('tenant_'.length)).filter(isValidTenantId);
}

export interface RelayLog {
  info(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

/**
 * Runs the relay in this process: woken by the outbox signal for the tenant that wrote, and polling every tenant
 * every `pollSeconds` as the fallback. Returns a stop function. Only started when a publisher and a retry policy are
 * configured (decisions D13 and D14).
 */
export async function startRelay(options: {
  pool: Pool;
  publisher: Publisher;
  policy: RetryPolicy;
  pollSeconds: number;
  log: RelayLog;
}): Promise<() => Promise<void>> {
  const { pool, publisher, policy, log } = options;
  const running = new Set<string>();
  const onDeadLetter = (m: EventMessage, error: string) =>
    log.error({ tenant: m.tenant, eventId: m.eventId, eventType: m.eventType, error }, 'event dead-lettered');
  const run = async (tenant: string) => {
    if (running.has(tenant)) return;
    running.add(tenant);
    try {
      await relayTenant(pool, tenant, publisher, policy, { onDeadLetter });
    } catch (err) {
      log.error({ tenant, err }, 'event relay failed');
    } finally {
      running.delete(tenant);
    }
  };
  const listener = await pool.connect();
  await listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
  listener.on('notification', (n) => {
    const schema = n.payload ?? '';
    const tenant = schema.startsWith('tenant_') ? schema.slice('tenant_'.length) : '';
    if (isValidTenantId(tenant)) void run(tenant);
  });
  const timer = setInterval(() => {
    void tenantIds(pool).then((ids) => Promise.all(ids.map(run)), (err: unknown) => log.error({ err }, 'event relay poll failed'));
  }, options.pollSeconds * 1000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await listener.query(`UNLISTEN ${OUTBOX_CHANNEL}`).catch(() => undefined);
    listener.release();
  };
}
