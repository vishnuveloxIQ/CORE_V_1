import type { CoreApp } from '../http/app.js';
import { AppError } from '../core/errors.js';
import { FixedWindowLimiter, type RateLimiter, type RateLimitRule } from '../core/rate-limit.js';

/** Global per-IP limit (Phase N, design default b). Shared through PostgreSQL when a pool exists (decision 3). */
export const GLOBAL_RATE_LIMIT: RateLimitRule = { limit: 600, windowMs: 60_000 };

/** Probes are never throttled, so an orchestrator cannot be locked out by traffic. */
const EXEMPT_PATHS = new Set(['/health', '/health/ready']);

export interface GlobalRateLimitOptions {
  rule?: RateLimitRule | undefined;
  /** Counts the hits. Defaults to an in-process limiter, which is per process only. */
  limiter?: RateLimiter | undefined;
  /** Clock for the in-process limiter. Ignored when a limiter is given. */
  now?: (() => number) | undefined;
}

/** Refuses requests over the per-IP limit with 429 RATE_LIMITED and Retry-After. Keyed by the client address. */
export function registerGlobalRateLimit(
  app: CoreApp,
  options: GlobalRateLimitOptions = {},
): void {
  const rule = options.rule ?? GLOBAL_RATE_LIMIT;
  const limiter = options.limiter ?? new FixedWindowLimiter(options.now);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (EXEMPT_PATHS.has(path)) {
      return;
    }
    const decision = await limiter.hit(`ip:${request.ip}`, rule);
    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 429, 'Too many requests. Try again later.', {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  });
}
