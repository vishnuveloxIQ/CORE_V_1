import type { Pool } from 'pg';
import type { RateLimitDecision, RateLimitRule, RateLimiter } from './rate-limit.js';

/** Windows that ended more than this long ago are removed by the sweep. Longest rule in use is 15 minutes. */
const SWEEP_AFTER = '1 day';
/** The sweep runs on about one hit in this many, so the table stays small without a separate job. */
const SWEEP_ONE_IN = 100;

/**
 * Fixed-window limiter backed by public.core_rate_limit_window (migration 0002), so every instance shares the
 * counts (Phase N decision 3). Each hit is one atomic upsert. The window clock is the database's.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly pool: Pool,
    private readonly random: () => number = Math.random,
  ) {}

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const { rows } = await this.pool.query<{ hits: number; remaining_ms: number }>(
      `INSERT INTO public.core_rate_limit_window AS w (key, window_start, hits)
       VALUES ($1, clock_timestamp(), 1)
       ON CONFLICT (key) DO UPDATE SET
         window_start = CASE WHEN w.window_start + ($2::int * interval '1 millisecond') <= clock_timestamp()
                             THEN clock_timestamp() ELSE w.window_start END,
         hits = CASE WHEN w.window_start + ($2::int * interval '1 millisecond') <= clock_timestamp()
                     THEN 1 ELSE w.hits + 1 END
       RETURNING hits,
         GREATEST(0, EXTRACT(EPOCH FROM (w.window_start + ($2::int * interval '1 millisecond') - clock_timestamp())) * 1000)
           AS remaining_ms`,
      [key, rule.windowMs],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('rate limit upsert returned no row');
    }
    if (this.random() * SWEEP_ONE_IN < 1) {
      await this.sweep();
    }
    if (row.hits <= rule.limit) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(Number(row.remaining_ms) / 1000)),
    };
  }

  /** Deletes windows that ended long ago. Safe to run from several instances at once. */
  async sweep(): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.core_rate_limit_window
       WHERE window_start < clock_timestamp() - $1::interval`,
      [SWEEP_AFTER],
    );
  }
}
