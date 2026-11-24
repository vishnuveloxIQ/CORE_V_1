import type { Issue, Row } from '../../core/resource.js';
import { firstIssue, issue, numberRangeIssue } from '../../core/ranges.js';

/**
 * Pure rules for the approval tables (Phase 5e). Each takes a row in API shape, or a snapshot level, and returns the
 * first failure, or null. The rules that need stored rows (publish, immutability, the approver check) are in
 * service.ts and resources.ts.
 */

/** A level as the request snapshot keeps it: the matrix level's fields, in API shape. */
export interface LevelSnapshot {
  readonly levelNo: number;
  readonly amountFrom: number | null;
  readonly amountTo: number | null;
  readonly approverRoleId: string | null;
  readonly approverUserId: string | null;
  readonly escalateToUserId: string | null;
  readonly timeoutHours: number | null;
  readonly onTimeout: string | null;
  readonly cashLimitInr: number | null;
}

/**
 * The levels that cover an amount: amount_from <= amount and (amount_to is null or amount <= amount_to). Returned in
 * level_no order, so the first is the lowest level the request must pass (design point d).
 */
export function matchingLevels(levels: readonly LevelSnapshot[], amount: number): LevelSnapshot[] {
  return levels
    .filter((level) => {
      const from = level.amountFrom ?? 0;
      const to = level.amountTo;
      return from <= amount && (to === null || amount <= to);
    })
    .sort((a, b) => a.levelNo - b.levelNo);
}

/** The next matching level after the current one, or null when the current level is the last. */
export function nextLevel(
  snapshot: readonly LevelSnapshot[],
  currentLevel: number,
): LevelSnapshot | null {
  const after = snapshot
    .filter((level) => level.levelNo > currentLevel)
    .sort((a, b) => a.levelNo - b.levelNo);
  return after[0] ?? null;
}

/**
 * Whether a user may act on a level: the named user, or a holder of the role the level names. A suspended user is
 * refused by the caller before this runs.
 */
export function isApproverOf(
  level: LevelSnapshot,
  userId: string,
  heldRoleIds: readonly string[],
): boolean {
  if (level.approverUserId === userId) return true;
  return level.approverRoleId !== null && heldRoleIds.includes(level.approverRoleId);
}

/** The amount approved on an approve action may not exceed the request amount. */
export function approvedAmountIssue(approved: number, amount: number): Issue | null {
  if (approved > amount) return issue('amountApproved', 'must not exceed the request amount');
  return null;
}

/** A matrix level's amount_to, when set, is on or after amount_from. */
export function levelAmountIssue(row: Row): Issue | null {
  const from = typeof row['amountFrom'] === 'number' ? row['amountFrom'] : 0;
  const to = row['amountTo'];
  if (typeof to === 'number' && to < from)
    return issue('amountTo', 'must be on or after amountFrom');
  return null;
}

/** A level names an approver role or an approver user, or both. Neither is refused. */
export function levelApproverIssue(row: Row): Issue | null {
  const role = row['approverRoleId'];
  const user = row['approverUserId'];
  if ((role === null || role === undefined) && (user === null || user === undefined)) {
    return issue('approverRoleId', 'name an approver role or an approver user');
  }
  return null;
}

export function matrixLevelIssue(row: Row): Issue | null {
  return firstIssue(
    levelApproverIssue(row),
    levelAmountIssue(row),
    numberRangeIssue(row, 'levelNo', 1),
    numberRangeIssue(row, 'amountFrom', 0),
    numberRangeIssue(row, 'cashLimitInr', 0),
    numberRangeIssue(row, 'timeoutHours', 0),
  );
}

/** A chain has a project exactly when its scope is project. timeout_hours is zero or more when set. */
export function chainScopeIssue(row: Row): Issue | null {
  const scope = row['scopeType'];
  const project = row['projectId'];
  const hasProject = project !== null && project !== undefined;
  if (scope === 'project' && !hasProject) {
    return issue('projectId', 'a project chain names a project');
  }
  if (scope === 'company' && hasProject) {
    return issue('projectId', 'a company chain has no project');
  }
  return numberRangeIssue(row, 'timeoutHours', 0);
}

export function matrixVersionIssue(row: Row): Issue | null {
  return numberRangeIssue(row, 'versionNo', 1);
}

/** PMS limit rows: the hour and minute fields are clock values, the rest are not negative. */
export function pmsLimitIssue(row: Row): Issue | null {
  return firstIssue(
    numberRangeIssue(row, 'tier', 1),
    numberRangeIssue(row, 'amountInr', 0),
    numberRangeIssue(row, 'days', 0),
    numberRangeIssue(row, 'hours', 0, 23),
    numberRangeIssue(row, 'minutes', 0, 59),
  );
}
