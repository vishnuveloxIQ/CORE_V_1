import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../../src/core/rate-limit.js';

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const rule = { limit: 3, windowMs: 60_000 };

describe('FixedWindowLimiter', () => {
  it('allows hits up to the limit and rejects the next one', () => {
    const limiter = new FixedWindowLimiter(clock().now);
    expect(limiter.hit('a', rule).allowed).toBe(true);
    expect(limiter.hit('a', rule).allowed).toBe(true);
    expect(limiter.hit('a', rule).allowed).toBe(true);
    expect(limiter.hit('a', rule)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('counts each key separately', () => {
    const limiter = new FixedWindowLimiter(clock().now);
    for (let i = 0; i < 3; i += 1) limiter.hit('a', rule);
    expect(limiter.hit('a', rule).allowed).toBe(false);
    expect(limiter.hit('b', rule).allowed).toBe(true);
  });

  it('reports the seconds left in the window, rounded up', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(c.now);
    for (let i = 0; i < 3; i += 1) limiter.hit('a', rule);
    c.advance(20_500);
    expect(limiter.hit('a', rule).retryAfterSeconds).toBe(40);
  });

  it('never reports a retry time below one second', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(c.now);
    for (let i = 0; i < 3; i += 1) limiter.hit('a', rule);
    c.advance(59_999);
    expect(limiter.hit('a', rule)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('starts a new window once the old one has ended', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(c.now);
    for (let i = 0; i < 4; i += 1) limiter.hit('a', rule);
    c.advance(60_000);
    expect(limiter.hit('a', rule)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('keeps a rejected hit in the count, so a caller cannot hammer past the limit', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(c.now);
    for (let i = 0; i < 10; i += 1) limiter.hit('a', rule);
    c.advance(59_000);
    expect(limiter.hit('a', rule).allowed).toBe(false);
  });

  it('removes ended windows once the map is large', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(c.now);
    for (let i = 0; i < 10_000; i += 1) limiter.hit(`old-${i}`, rule);
    expect(limiter.size()).toBe(10_000);
    c.advance(60_000);
    limiter.hit('new', rule);
    expect(limiter.size()).toBe(1);
  });
});
