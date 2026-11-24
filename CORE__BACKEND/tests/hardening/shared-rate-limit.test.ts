import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresRateLimiter } from '../../src/core/rate-limit-store.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Phase N decision 3: limits are counted in public.core_rate_limit_window, so every instance shares them.

describe.skipIf(!TEST_DATABASE_URL)('PostgresRateLimiter (hardening)', { timeout: 60_000 }, () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('allows up to the limit and refuses the next hit with Retry-After', async () => {
    const limiter = new PostgresRateLimiter(db.pool);
    const rule = { limit: 2, windowMs: 60_000 };
    expect((await limiter.hit('pg:basic', rule)).allowed).toBe(true);
    expect((await limiter.hit('pg:basic', rule)).allowed).toBe(true);
    const third = await limiter.hit('pg:basic', rule);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('shares the count between two limiter instances (two app instances)', async () => {
    const instanceA = new PostgresRateLimiter(db.pool);
    const instanceB = new PostgresRateLimiter(db.pool);
    const rule = { limit: 3, windowMs: 60_000 };
    expect((await instanceA.hit('pg:shared', rule)).allowed).toBe(true);
    expect((await instanceB.hit('pg:shared', rule)).allowed).toBe(true);
    expect((await instanceA.hit('pg:shared', rule)).allowed).toBe(true);
    expect((await instanceB.hit('pg:shared', rule)).allowed).toBe(false);
  });

  it('starts a new window after the old one has ended', async () => {
    const limiter = new PostgresRateLimiter(db.pool);
    const rule = { limit: 1, windowMs: 200 };
    expect((await limiter.hit('pg:reset', rule)).allowed).toBe(true);
    expect((await limiter.hit('pg:reset', rule)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect((await limiter.hit('pg:reset', rule)).allowed).toBe(true);
  });

  it('keeps keys apart', async () => {
    const limiter = new PostgresRateLimiter(db.pool);
    const rule = { limit: 1, windowMs: 60_000 };
    expect((await limiter.hit('pg:key-a', rule)).allowed).toBe(true);
    expect((await limiter.hit('pg:key-b', rule)).allowed).toBe(true);
  });

  it('sweeps nothing that is still inside its window', async () => {
    const limiter = new PostgresRateLimiter(db.pool);
    const rule = { limit: 5, windowMs: 60_000 };
    await limiter.hit('pg:sweep-live', rule);
    await limiter.sweep();
    const { rows } = await db.pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM public.core_rate_limit_window WHERE key = 'pg:sweep-live'",
    );
    expect(rows[0]?.n).toBe('1');
  });
});
