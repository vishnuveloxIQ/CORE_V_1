/** A limit of `limit` hits per fixed window of `windowMs` milliseconds. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the window resets. 0 when the hit was allowed. */
  retryAfterSeconds: number;
}

/** Counts hits per key. Implemented in memory (per process) and by PostgresRateLimiter (shared). */
export interface RateLimiter {
  hit(key: string, rule: RateLimitRule): RateLimitDecision | Promise<RateLimitDecision>;
}

interface WindowState {
  startedAt: number;
  windowMs: number;
  count: number;
}

/** Once the map holds this many keys, expired windows are removed on the next hit. */
const SWEEP_THRESHOLD = 10_000;

/**
 * In-memory fixed-window limiter. Each key gets its own window that starts at its first hit. Counts
 * live in this process only, so limits are per process until a shared store is added.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Counts one hit against `key` and says whether it is within the rule. Rejected hits still count. */
  hit(key: string, rule: RateLimitRule): RateLimitDecision {
    const current = this.now();
    if (this.windows.size >= SWEEP_THRESHOLD) {
      this.sweep(current);
    }

    let state = this.windows.get(key);
    if (!state || current - state.startedAt >= state.windowMs) {
      state = { startedAt: current, windowMs: rule.windowMs, count: 0 };
      this.windows.set(key, state);
    }
    state.count += 1;

    if (state.count <= rule.limit) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const remainingMs = state.startedAt + state.windowMs - current;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }

  /** Removes every window that has already ended. */
  private sweep(current: number): void {
    for (const [key, state] of this.windows) {
      if (current - state.startedAt >= state.windowMs) {
        this.windows.delete(key);
      }
    }
  }

  /** Number of keys currently held. Exposed for tests. */
  size(): number {
    return this.windows.size;
  }
}
