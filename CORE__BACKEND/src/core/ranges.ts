import type { Issue, Row } from './resource.js';

/**
 * Pure range checks shared by the Phase 5d to 5f rules. Each returns the first failure as an Issue, or null. A key that
 * is absent or null is not checked: the database and the zod schema decide whether it is required.
 * ISO dates (YYYY-MM-DD) compare correctly as text, so they need no parsing.
 */

export function issue(path: string, message: string): Issue {
  return { path, message };
}

/** The first non-null issue among the checks, or null when every check passed. */
export function firstIssue(...checks: Array<Issue | null>): Issue | null {
  return checks.find((check) => check !== null) ?? null;
}

/** A number between min and max, inclusive. */
export function numberRangeIssue(
  row: Row,
  key: string,
  min: number,
  max: number = Number.POSITIVE_INFINITY,
): Issue | null {
  const value = row[key];
  if (typeof value !== 'number') return null;
  if (value < min || value > max) {
    return issue(key, `must be between ${min} and ${max}`);
  }
  return null;
}

/** The `toKey` date, when set, must fall on or after the `fromKey` date. */
export function dateOrderIssue(row: Row, fromKey: string, toKey: string): Issue | null {
  const from = row[fromKey];
  const to = row[toKey];
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (to < from) return issue(toKey, `must be on or after ${fromKey}`);
  return null;
}
