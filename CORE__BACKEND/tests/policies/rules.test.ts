import { describe, expect, it } from 'vitest';
import {
  MAX_HOURS_PER_DAY,
  MAX_HOURS_PER_MONTH,
  customFieldIssue,
  documentTemplateIssue,
  isPublished,
  leavePolicyIssue,
  leavePolicyRuleIssue,
  otPolicyIssue,
  otPolicyRuleIssue,
  policyVersionIssue,
} from '../../src/modules/policies/rules.js';

// Pure tests for the Phase 5d rules. No database. Example data is fictional.

describe('policy rules (phase 5d, pure)', () => {
  it('OT hour caps are 24 a day and 744 a month', () => {
    expect(MAX_HOURS_PER_DAY).toBe(24);
    expect(MAX_HOURS_PER_MONTH).toBe(744);
    expect(otPolicyIssue({ maxHoursPerDay: 24, maxHoursPerMonth: 744 })).toBeNull();
    expect(otPolicyIssue({ maxHoursPerDay: 25 })?.path).toBe('maxHoursPerDay');
    expect(otPolicyIssue({ maxHoursPerMonth: 745 })?.path).toBe('maxHoursPerMonth');
  });

  it('OT rates, day counts and minutes are not negative; absent values are not checked', () => {
    expect(otPolicyIssue({ rateWorkingDay: 1.5, minMinutes: 0 })).toBeNull();
    expect(otPolicyIssue({ rateHoliday: -1 })?.path).toBe('rateHoliday');
    expect(otPolicyIssue({ compOffExpiryDays: -3 })?.path).toBe('compOffExpiryDays');
    expect(otPolicyIssue({ rateWeekOff: null })).toBeNull();
  });

  it('OT rule and leave policy date ranges must not end before they start', () => {
    expect(
      otPolicyRuleIssue({ effectiveFrom: '2026-04-01', effectiveTo: '2026-03-31' })?.path,
    ).toBe('effectiveTo');
    expect(
      otPolicyRuleIssue({ effectiveFrom: '2026-04-01', effectiveTo: '2026-04-01' }),
    ).toBeNull();
    expect(otPolicyRuleIssue({ effectiveFrom: '2026-04-01', effectiveTo: null })).toBeNull();
    expect(
      leavePolicyIssue({
        effectiveFrom: '2026-04-01',
        yearStart: '2026-04-01',
        yearEnd: '2026-03-31',
      })?.path,
    ).toBe('yearEnd');
    expect(
      leavePolicyRuleIssue({ effectiveFrom: '2026-05-01', effectiveTo: '2026-04-30' })?.path,
    ).toBe('effectiveTo');
  });

  it('custom field sort order and policy version numbers start at the lowest allowed value', () => {
    expect(customFieldIssue({ sortOrder: 0 })).toBeNull();
    expect(customFieldIssue({ sortOrder: -1 })?.path).toBe('sortOrder');
    expect(policyVersionIssue({ versionNo: 1 })).toBeNull();
    expect(policyVersionIssue({ versionNo: 0 })?.path).toBe('versionNo');
  });

  it('document template revision is at least 1 and size is not negative', () => {
    expect(documentTemplateIssue({ revision: 1, sizeBytes: 0 })).toBeNull();
    expect(documentTemplateIssue({ revision: 0 })?.path).toBe('revision');
    expect(documentTemplateIssue({ sizeBytes: -5 })?.path).toBe('sizeBytes');
  });

  it('a version is published once published_at is set', () => {
    expect(isPublished(null)).toBe(false);
    expect(isPublished(undefined)).toBe(false);
    expect(isPublished(new Date('2026-11-19T00:00:00Z'))).toBe(true);
  });
});
