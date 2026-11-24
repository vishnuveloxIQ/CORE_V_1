import type { Issue, Row } from '../../core/resource.js';
import { dateOrderIssue, firstIssue, numberRangeIssue } from '../../core/ranges.js';

/**
 * Pure rules for the policy tables (Phase 5d). Each takes the candidate row in API shape and returns the first
 * failure, or null. The rules that need a stored row (publish, immutability, the rule write window) live in the
 * resource hooks in resources.ts.
 */

/** Maximum hours an OT policy may allow in a day and in a month (design point d). */
export const MAX_HOURS_PER_DAY = 24;
export const MAX_HOURS_PER_MONTH = 744;

export function otPolicyIssue(row: Row): Issue | null {
  return firstIssue(
    numberRangeIssue(row, 'maxHoursPerDay', 0, MAX_HOURS_PER_DAY),
    numberRangeIssue(row, 'maxHoursPerMonth', 0, MAX_HOURS_PER_MONTH),
    numberRangeIssue(row, 'rateWorkingDay', 0),
    numberRangeIssue(row, 'rateWeekOff', 0),
    numberRangeIssue(row, 'rateHoliday', 0),
    numberRangeIssue(row, 'compOffMultiplier', 0),
    numberRangeIssue(row, 'compOffExpiryDays', 0),
    numberRangeIssue(row, 'claimWithinDays', 0),
    numberRangeIssue(row, 'minMinutes', 0),
  );
}

export function otPolicyRuleIssue(row: Row): Issue | null {
  return dateOrderIssue(row, 'effectiveFrom', 'effectiveTo');
}

export function leaveTypeIssue(row: Row): Issue | null {
  return firstIssue(
    numberRangeIssue(row, 'annualDays', 0),
    numberRangeIssue(row, 'maxCarryDays', 0),
    numberRangeIssue(row, 'expiryMonths', 0),
  );
}

export function leavePolicyIssue(row: Row): Issue | null {
  return firstIssue(
    dateOrderIssue(row, 'effectiveFrom', 'effectiveTo'),
    dateOrderIssue(row, 'yearStart', 'yearEnd'),
  );
}

export function leavePolicyRuleIssue(row: Row): Issue | null {
  return dateOrderIssue(row, 'effectiveFrom', 'effectiveTo');
}

export function customFieldIssue(row: Row): Issue | null {
  return numberRangeIssue(row, 'sortOrder', 0);
}

export function customVersionIssue(row: Row): Issue | null {
  // An effective date and a version number are required on create; the zod schema checks the form, this checks the
  // number once it is known (it is assigned on create when the caller leaves it out).
  return numberRangeIssue(row, 'versionNo', 1);
}

export function documentTemplateIssue(row: Row): Issue | null {
  return firstIssue(numberRangeIssue(row, 'revision', 1), numberRangeIssue(row, 'sizeBytes', 0));
}

/** The policy version number is at least 1; a rule or version without one is numbered on create. */
export function policyVersionIssue(row: Row): Issue | null {
  return numberRangeIssue(row, 'versionNo', 1);
}

/** A version is published once published_at is set. Published versions and their rules are immutable. */
export function isPublished(publishedAt: unknown): boolean {
  return publishedAt !== null && publishedAt !== undefined;
}
