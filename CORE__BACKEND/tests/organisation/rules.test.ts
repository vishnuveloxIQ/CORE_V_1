import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../src/modules/organisation/numbering.js';
import {
  colourIssue,
  effectiveIssue,
  holidayDateIssue,
  isAllowedSettingKey,
  isValidTimeZone,
  normaliseWeekOffDays,
  settingsKeyIssues,
  shiftTimingIssue,
  TAX_ID_PATTERNS,
} from '../../src/modules/organisation/rules.js';

// Pure rules for Phase 5a: no database needed.

describe('tax ID formats (phase 5a, point b)', () => {
  it('accepts well-formed GSTIN, PAN, TAN and CIN values', () => {
    expect(TAX_ID_PATTERNS.gstin.test('29ABCDE1234F1Z5')).toBe(true);
    expect(TAX_ID_PATTERNS.pan.test('ABCDE1234F')).toBe(true);
    expect(TAX_ID_PATTERNS.tan.test('ABCD12345E')).toBe(true);
    expect(TAX_ID_PATTERNS.cin.test('L12345KA2000PLC123456')).toBe(true);
  });

  it('refuses values with the wrong shape', () => {
    expect(TAX_ID_PATTERNS.gstin.test('29ABCDE1234F1A5')).toBe(false);
    expect(TAX_ID_PATTERNS.gstin.test('29abcde1234f1z5')).toBe(false);
    expect(TAX_ID_PATTERNS.pan.test('ABCDE12345')).toBe(false);
    expect(TAX_ID_PATTERNS.tan.test('ABC12345DE')).toBe(false);
    expect(TAX_ID_PATTERNS.cin.test('X12345KA2000PLC123456')).toBe(false);
  });
});

describe('time zone, settings keys and date rules (phase 5a, points c, e, f)', () => {
  it('accepts IANA zone names and refuses unknown ones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('allows only the two fuel key families, with a lower-case name', () => {
    expect(isAllowedSettingKey('fuel.tolerance.excavator')).toBe(true);
    expect(isAllowedSettingKey('fuel.variance_threshold.over_fill')).toBe(true);
    expect(isAllowedSettingKey('fuel.tolerance.Excavator')).toBe(false);
    expect(isAllowedSettingKey('fuel.other.x')).toBe(false);
    expect(isAllowedSettingKey('fuel.tolerance.')).toBe(false);
  });

  it('reports each unknown settings key by name', () => {
    expect(settingsKeyIssues(['fuel.tolerance.excavator', 'fuel.bad'])).toEqual([
      'unknown setting key: fuel.bad',
    ]);
    expect(settingsKeyIssues([])).toEqual([]);
  });

  it('holidays end on or after they start; an open end is one day', () => {
    expect(holidayDateIssue('2026-08-15', null)).toBeNull();
    expect(holidayDateIssue('2026-08-15', '2026-08-16')).toBeNull();
    expect(holidayDateIssue('2026-08-15', '2026-08-14')).not.toBeNull();
  });

  it('shifts may end before they start for a night shift, but equal times are refused', () => {
    expect(shiftTimingIssue('22:00', '06:00')).toBeNull();
    expect(shiftTimingIssue('09:00:00', '09:00')).not.toBeNull();
  });

  it('effective dates: an open end is allowed; a closed end must not precede the start', () => {
    expect(effectiveIssue('2026-01-01', null)).toBeNull();
    expect(effectiveIssue('2026-01-01', '2026-01-01')).toBeNull();
    expect(effectiveIssue('2026-01-01', '2025-12-31')).not.toBeNull();
  });

  it('week-off days are stored once each, sorted', () => {
    expect(normaliseWeekOffDays([7, 1, 7, 3])).toEqual([1, 3, 7]);
    expect(normaliseWeekOffDays([])).toEqual([]);
  });

  it('the colour index and the hex value are set together or not at all', () => {
    expect(colourIssue(null, null)).toBeNull();
    expect(colourIssue(3, '#3366CC')).toBeNull();
    expect(colourIssue(3, null)).not.toBeNull();
    expect(colourIssue(null, '#3366CC')).not.toBeNull();
  });
});

describe('document number format (phase 5a, point g)', () => {
  it('pads the counter to five digits, with no year for a series that never resets', () => {
    expect(formatNumber({ prefix: 'INV', yearScope: 0, value: 1 })).toBe('INV-00001');
    expect(formatNumber({ prefix: 'INV', yearScope: 0, value: 123456 })).toBe('INV-123456');
  });

  it('puts the year between the prefix and the counter for a yearly series', () => {
    expect(formatNumber({ prefix: 'PO', yearScope: 2026, value: 42 })).toBe('PO-2026-00042');
  });
});
