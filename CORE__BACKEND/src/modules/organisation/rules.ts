/**
 * Pure rules for the organisation tables (Phase 5a design defaults, PROGRESS.md). No database access.
 * Each function returns a message when the rule is broken, or null when the value is fine.
 */

/** Indian tax identifiers: format only. The values are not checked against any register (point b). */
export const TAX_ID_PATTERNS = {
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  tan: /^[A-Z]{4}[0-9]{5}[A-Z]$/,
  cin: /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/,
} as const;

/** The two approved settings families in handoff section 8 (point c). */
const SETTING_KEY = /^(fuel\.tolerance|fuel\.variance_threshold)\.[a-z][a-z0-9_]*$/;

export function isAllowedSettingKey(key: string): boolean {
  return SETTING_KEY.test(key);
}

/** True when the runtime accepts the name as an IANA time zone (point f). */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Trims HH:MM:SS to HH:MM, the form the API returns. */
export function hhmm(value: string): string {
  return value.slice(0, 5);
}

/** A holiday ends on or after it starts. Dates are YYYY-MM-DD, so string order is date order. */
export function holidayDateIssue(holidayDate: string, endDate: string | null): string | null {
  if (endDate !== null && endDate < holidayDate) {
    return 'end_date must be on or after holiday_date';
  }
  return null;
}

/** A night shift may end before it starts. Equal times are refused (point f). */
export function shiftTimingIssue(inTime: string, outTime: string): string | null {
  if (hhmm(inTime) === hhmm(outTime)) {
    return 'out_time must differ from in_time';
  }
  return null;
}

/** Effective dates: an open end is allowed; a closed end must be on or after the start (point f). */
export function effectiveIssue(effectiveFrom: string, effectiveTo: string | null): string | null {
  if (effectiveTo !== null && effectiveTo < effectiveFrom) {
    return 'effective_to must be on or after effective_from';
  }
  return null;
}

/** Week-off days are ISO weekdays, 1 (Monday) to 7 (Sunday), each at most once. Stored sorted. */
export function normaliseWeekOffDays(days: readonly number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

/** The colour index and its hex value are set together or not at all (point h). */
export function colourIssue(colorIndex: number | null, colorHex: string | null): string | null {
  if ((colorIndex === null) !== (colorHex === null)) {
    return 'color_index and color_hex must be set together';
  }
  return null;
}

/** Settings keys must belong to one of the approved families; values are numbers of zero or more. */
export function settingsKeyIssues(keys: readonly string[]): string[] {
  return keys
    .filter((key) => !isAllowedSettingKey(key))
    .map((key) => `unknown setting key: ${key}`);
}
