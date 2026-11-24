import { describe, expect, it } from 'vitest';
import { closedAtFor, isDraft, isSha256 } from '../../src/modules/records/rules.js';
import { usageIncrementBody } from '../../src/modules/records/schema.js';

// Pure tests for the Phase 5f rules. No database. Example data is fictional.

const VALID_HASH = 'a'.repeat(64);

describe('record rules (phase 5f, pure)', () => {
  it('a file checksum is exactly 64 lowercase hex characters', () => {
    expect(isSha256(VALID_HASH)).toBe(true);
    expect(isSha256('0123456789abcdef'.repeat(4))).toBe(true);
    expect(isSha256('A'.repeat(64))).toBe(false);
    expect(isSha256('a'.repeat(63))).toBe(false);
    expect(isSha256('a'.repeat(65))).toBe(false);
    expect(isSha256(`${'a'.repeat(63)}g`)).toBe(false);
  });

  it('a resolved or closed grievance has a closed-at time; open and in-review clear it', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    expect(closedAtFor('open', null, now)).toBeNull();
    expect(closedAtFor('in_review', null, now)).toBeNull();
    expect(closedAtFor('resolved', null, now)).toBe(now);
    expect(closedAtFor('closed', null, now)).toBe(now);
  });

  it('moving between resolved and closed keeps the first closed-at time', () => {
    const first = new Date('2026-11-01T09:00:00Z');
    const later = new Date('2026-11-19T10:00:00Z');
    expect(closedAtFor('closed', first, later)).toBe(first);
    expect(closedAtFor('resolved', first, later)).toBe(first);
  });

  it('reopening a grievance clears its closed-at time', () => {
    const closedOn = new Date('2026-11-01T09:00:00Z');
    expect(closedAtFor('open', closedOn, new Date())).toBeNull();
    expect(closedAtFor('in_review', closedOn, new Date())).toBeNull();
  });

  it('only a draft import batch takes rows or is submitted', () => {
    expect(isDraft('draft')).toBe(true);
    expect(isDraft('submitted')).toBe(false);
    expect(isDraft('processed')).toBe(false);
    expect(isDraft('rejected')).toBe(false);
  });

  it('a counter increment adds a whole number of 1 or more', () => {
    const base = { metric: 'logins', scopeKey: 'site-1', weekStart: '2026-11-16' };
    expect(usageIncrementBody.safeParse({ ...base, by: 3 }).success).toBe(true);
    expect(usageIncrementBody.safeParse({ ...base, by: 0 }).success).toBe(false);
    expect(usageIncrementBody.safeParse({ ...base, by: 1.5 }).success).toBe(false);
    expect(usageIncrementBody.safeParse({ ...base, by: -2 }).success).toBe(false);
  });
});
