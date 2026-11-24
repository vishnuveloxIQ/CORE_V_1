import { describe, expect, it } from 'vitest';
import {
  type LevelSnapshot,
  chainScopeIssue,
  isApproverOf,
  matchingLevels,
  matrixLevelIssue,
  nextLevel,
  pmsLimitIssue,
} from '../../src/modules/approvals/rules.js';

// Pure tests for the Phase 5e rules. No database. Example data is fictional.

function level(levelNo: number, overrides: Partial<LevelSnapshot> = {}): LevelSnapshot {
  return {
    levelNo,
    amountFrom: 0,
    amountTo: null,
    approverRoleId: null,
    approverUserId: null,
    escalateToUserId: null,
    timeoutHours: null,
    onTimeout: null,
    cashLimitInr: null,
    ...overrides,
  };
}

describe('approval rules (phase 5e, pure)', () => {
  it('a level covers an amount from amount_from up to amount_to, both ends included', () => {
    const levels = [
      level(1, { amountFrom: 0, amountTo: 100000 }),
      level(2, { amountFrom: 100000 }),
    ];
    expect(matchingLevels(levels, 50000).map((l) => l.levelNo)).toEqual([1]);
    expect(matchingLevels(levels, 100000).map((l) => l.levelNo)).toEqual([1, 2]);
    expect(matchingLevels(levels, 250000).map((l) => l.levelNo)).toEqual([2]);
  });

  it('an amount that no level covers matches nothing', () => {
    const levels = [level(1, { amountFrom: 0, amountTo: 1000 })];
    expect(matchingLevels(levels, 5000)).toEqual([]);
  });

  it('the snapshot is in level_no order whatever order the levels arrive in', () => {
    const levels = [level(3), level(1), level(2)];
    expect(matchingLevels(levels, 10).map((l) => l.levelNo)).toEqual([1, 2, 3]);
  });

  it('the next level is the first one above the current level, or null at the last', () => {
    const snapshot = [level(1), level(2), level(3)];
    expect(nextLevel(snapshot, 1)?.levelNo).toBe(2);
    expect(nextLevel(snapshot, 3)).toBeNull();
  });

  it('a named user approves a level, and so does a holder of the level role', () => {
    const byUser = level(1, { approverUserId: 'user-a' });
    const byRole = level(2, { approverRoleId: 'role-finance' });
    expect(isApproverOf(byUser, 'user-a', [])).toBe(true);
    expect(isApproverOf(byUser, 'user-b', [])).toBe(false);
    expect(isApproverOf(byRole, 'user-b', ['role-finance'])).toBe(true);
    expect(isApproverOf(byRole, 'user-b', ['role-hr'])).toBe(false);
  });

  it('a level names an approver role or an approver user, not neither', () => {
    expect(matrixLevelIssue({ approverRoleId: null, approverUserId: null })?.path).toBe(
      'approverRoleId',
    );
    expect(matrixLevelIssue({ approverUserId: 'user-a' })).toBeNull();
    expect(matrixLevelIssue({ approverRoleId: 'role-a' })).toBeNull();
  });

  it('a level amount_to is on or after amount_from', () => {
    expect(matrixLevelIssue({ approverUserId: 'u', amountFrom: 500, amountTo: 100 })?.path).toBe(
      'amountTo',
    );
    expect(matrixLevelIssue({ approverUserId: 'u', amountFrom: 100, amountTo: 500 })).toBeNull();
  });

  it('a project chain names a project and a company chain does not', () => {
    expect(chainScopeIssue({ scopeType: 'project', projectId: null })?.path).toBe('projectId');
    expect(chainScopeIssue({ scopeType: 'company', projectId: 'p-1' })?.path).toBe('projectId');
    expect(chainScopeIssue({ scopeType: 'project', projectId: 'p-1' })).toBeNull();
    expect(chainScopeIssue({ scopeType: 'company', projectId: null })).toBeNull();
  });

  it('PMS limit rows keep hours to 0 to 23 and minutes to 0 to 59', () => {
    expect(pmsLimitIssue({ tier: 1, hours: 23, minutes: 59 })).toBeNull();
    expect(pmsLimitIssue({ tier: 1, hours: 24 })?.path).toBe('hours');
    expect(pmsLimitIssue({ tier: 1, minutes: 60 })?.path).toBe('minutes');
    expect(pmsLimitIssue({ tier: 0 })?.path).toBe('tier');
  });
});
