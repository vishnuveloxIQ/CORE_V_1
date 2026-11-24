import type { Pool } from 'pg';
import { isValidTenantId } from '../../db/migrate.js';
import { withTenant } from '../../db/tenant.js';

/**
 * Approval reminders (owner decision, 2026-11-22). Requests are never escalated: when the current level's time
 * (timeoutHours in the level snapshot) has passed since the request was raised, since the last action on it, or since
 * the last reminder, whichever is latest, the person it waits on gets a notification, and the clock starts again.
 * A level without a time (null or 0) is never reminded.
 *
 * Safe to run on several servers at once: each request is locked while it is reminded (SKIP LOCKED), and the due
 * condition is checked under that lock.
 */

const WAITING = ['pending', 'clarification_requested'];
const TENANT_PREFIX = 'tenant_';

export interface ReminderResult {
  tenant: string;
  reminded: number;
}

/** Sends the reminders that are due in one tenant, and returns how many were sent. */
export async function remindTenant(pool: Pool, tenantId: string, now: Date = new Date()): Promise<number> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ id: string; code: string | null; title: string | null; assigned_actor_id: string; status: string }>(
      `WITH waiting AS (
         SELECT r.id, r.code, r.title, r.assigned_actor_id, r.status,
                (SELECT (l->>'timeoutHours')::numeric
                   FROM jsonb_array_elements(COALESCE(r.levels_snapshot, '[]'::jsonb)) l
                  WHERE (l->>'levelNo')::int = r.current_level
                  LIMIT 1) AS hours,
                GREATEST(
                  r.raised_at,
                  r.last_reminded_at,
                  (SELECT max(a.acted_at) FROM core_approval_action a WHERE a.approval_request_id = r.id)
                ) AS since
           FROM core_approval_request r
          WHERE r.status = ANY($1::text[]) AND r.assigned_actor_id IS NOT NULL
            FOR UPDATE OF r SKIP LOCKED
       )
       SELECT id, code, title, assigned_actor_id, status
         FROM waiting
        WHERE hours > 0 AND since IS NOT NULL AND since + make_interval(secs => hours * 3600) <= $2`,
      [WAITING, now],
    );
    for (const r of rows) {
      const ref = r.code ?? 'An approval request';
      const title = r.status === 'clarification_requested'
        ? `Reminder: ${ref} is waiting for your response`
        : `Reminder: ${ref} is waiting for your decision`;
      await client.query(
        `INSERT INTO core_notification (recipient_user_id, notification_type, source_type, source_id, title, body)
         VALUES ($1, 'approval_reminder', 'approval_request', $2, $3, $4)`,
        [r.assigned_actor_id, r.id, title, r.title ?? null],
      );
      await client.query('UPDATE core_approval_request SET last_reminded_at = $2 WHERE id = $1', [r.id, now]);
    }
    return rows.length;
  });
}

/** Runs the reminder sweep in every tenant schema. One tenant's failure does not stop the others. */
export async function remindAllTenants(
  pool: Pool,
  now: Date = new Date(),
  onError: (tenant: string, err: unknown) => void = () => undefined,
): Promise<ReminderResult[]> {
  const { rows } = await pool.query<{ nspname: string }>(
    'SELECT nspname FROM pg_namespace WHERE left(nspname, 7) = $1 ORDER BY nspname',
    [TENANT_PREFIX],
  );
  const results: ReminderResult[] = [];
  for (const { nspname } of rows) {
    const tenant = nspname.slice(TENANT_PREFIX.length);
    if (!isValidTenantId(tenant)) continue;
    try {
      results.push({ tenant, reminded: await remindTenant(pool, tenant, now) });
    } catch (err) {
      onError(tenant, err);
    }
  }
  return results;
}

/**
 * Runs the sweep every `minutes` in this process, first one interval after start. Returns a stop function.
 * A sweep still running when the next is due is not overlapped.
 */
export function startReminderSchedule(
  pool: Pool,
  minutes: number,
  log: { info(fields: object, message: string): void; error(fields: object, message: string): void },
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    remindAllTenants(pool, new Date(), (tenant, err) => log.error({ tenant, err }, 'approval reminder sweep failed'))
      .then((results) => {
        const sent = results.reduce((n, r) => n + r.reminded, 0);
        if (sent > 0) log.info({ sent }, 'approval reminders sent');
      })
      .catch((err: unknown) => log.error({ err }, 'approval reminder sweep failed'))
      .finally(() => {
        running = false;
      });
  }, minutes * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
