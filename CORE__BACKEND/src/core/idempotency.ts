import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { lockWithinSchema } from '../db/tenant.js';
import { canonicalJson } from './canonical-json.js';
import { AppError } from './errors.js';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 255;

/** Hash of the request that a key was first used with: method, path and body. */
export function hashRequest(request: unknown): string {
  return createHash('sha256').update(canonicalJson(request)).digest('hex');
}

export interface IdempotentOutcome<T> {
  /** True when the stored response was returned and `work` did not run. */
  replayed: boolean;
  value: T;
}

/**
 * Runs `work` once per idempotency key. A repeat with the same key and request hash returns the stored response
 * without running `work` again. The same key with a different request hash is refused with 409.
 *
 * `work` runs in the caller's transaction, so its writes and the stored response commit or roll back together.
 * It must do its side effects through that transaction only. Call inside withTenant.
 *
 * `toStored` shapes the response that is kept for replays. A response that carries a one-time secret (a temporary
 * password) removes it there, so the secret is never written to the store and a replay does not return it again.
 */
export async function runIdempotent<T>(
  client: PoolClient,
  options: { key: string; requestHash: string; ttlMs?: number; toStored?: (value: T) => unknown },
  work: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  if (options.key.length === 0 || options.key.length > MAX_KEY_LENGTH) {
    throw new AppError(
      'INVALID_IDEMPOTENCY_KEY',
      400,
      'Idempotency key must be 1 to 255 characters',
    );
  }
  await lockWithinSchema(client, `idempotency:${options.key}`);

  const existing = await client.query<{ request_hash: string; response: T }>(
    `SELECT request_hash, response FROM integ_idempotency_key
     WHERE key = $1 AND expires_at > now()
     ORDER BY expires_at DESC LIMIT 1`,
    [options.key],
  );
  const stored = existing.rows[0];
  if (stored) {
    if (stored.request_hash !== options.requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        409,
        'Idempotency key was already used for a different request',
      );
    }
    return { replayed: true, value: stored.response };
  }

  const value = await work();
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? IDEMPOTENCY_TTL_MS)).toISOString();
  // key is unique (migration 0004), so an expired row with the same key must go first.
  await client.query('DELETE FROM integ_idempotency_key WHERE key = $1 AND expires_at <= now()', [
    options.key,
  ]);
  await client.query(
    `INSERT INTO integ_idempotency_key (key, request_hash, response, expires_at)
     VALUES ($1, $2, $3::jsonb, $4::timestamptz)`,
    [
      options.key,
      options.requestHash,
      JSON.stringify((options.toStored ? options.toStored(value) : value) ?? null),
      expiresAt,
    ],
  );
  return { replayed: false, value };
}
