import { describe, expect, it } from 'vitest';
import {
  chainageRangeIssue,
  coordinatePairIssue,
  geoShapeIssue,
  milestoneWeightIssue,
  projectDatesIssue,
  type ZoneGeometry,
  zoneGeometryChanged,
} from '../../src/modules/projects/rules.js';

// Pure rules for Phase 5b. No database: each function returns a message or null.

const circle: ZoneGeometry = {
  shape: 'circle',
  centerLat: 12.9716,
  centerLng: 77.5946,
  radiusM: 150,
  points: null,
  bufferM: null,
};

describe('project dates', () => {
  it('accepts an end on or after the start, and a missing date', () => {
    expect(projectDatesIssue('2026-04-01', '2027-03-31')).toBeNull();
    expect(projectDatesIssue('2026-04-01', '2026-04-01')).toBeNull();
    expect(projectDatesIssue(null, '2026-04-01')).toBeNull();
    expect(projectDatesIssue('2026-04-01', null)).toBeNull();
  });

  it('refuses an end before the start', () => {
    expect(projectDatesIssue('2026-04-01', '2026-03-31')).toBe(
      'end_date must be on or after start_date',
    );
  });
});

describe('coordinate pairs', () => {
  it('accepts both set or both missing', () => {
    expect(coordinatePairIssue(12.9, 77.6)).toBeNull();
    expect(coordinatePairIssue(null, null)).toBeNull();
  });

  it('refuses one of the two set', () => {
    expect(coordinatePairIssue(12.9, null)).toBe('latitude and longitude must be set together');
    expect(coordinatePairIssue(null, 77.6)).toBe('latitude and longitude must be set together');
  });
});

describe('chainage ranges', () => {
  it('accepts an ordered pair, or no range at all', () => {
    expect(chainageRangeIssue(10.5, 12)).toBeNull();
    expect(chainageRangeIssue(10.5, 10.5)).toBeNull();
    expect(chainageRangeIssue(null, null)).toBeNull();
  });

  it('refuses a half range and an end before the start', () => {
    expect(chainageRangeIssue(10.5, null)).toBe(
      'chainage_start_km and chainage_end_km must be set together',
    );
    expect(chainageRangeIssue(12, 10.5)).toBe(
      'chainage_end_km must be on or after chainage_start_km',
    );
  });
});

describe('geo zone shapes', () => {
  it('accepts a circle with a centre and a radius', () => {
    expect(geoShapeIssue(circle)).toBeNull();
  });

  it('refuses a circle without a centre, without a radius, or with points', () => {
    expect(geoShapeIssue({ ...circle, centerLat: null })).toBe(
      'a circle needs center_lat and center_lng',
    );
    expect(geoShapeIssue({ ...circle, radiusM: 0 })).toBe('a circle needs radius_m above zero');
    expect(geoShapeIssue({ ...circle, points: [[12.9, 77.6]] })).toBe('a circle has no points');
  });

  it('needs three points for a polygon', () => {
    const polygon = {
      ...circle,
      shape: 'polygon',
      centerLat: null,
      centerLng: null,
      radiusM: null,
    };
    expect(
      geoShapeIssue({
        ...polygon,
        points: [
          [12.9, 77.6],
          [12.91, 77.61],
        ],
      }),
    ).toBe('a polygon needs at least three points');
    expect(
      geoShapeIssue({
        ...polygon,
        points: [
          [12.9, 77.6],
          [12.91, 77.61],
          [12.92, 77.6],
        ],
      }),
    ).toBeNull();
  });

  it('needs two points and a positive buffer for a corridor', () => {
    const corridor = {
      ...circle,
      shape: 'corridor',
      centerLat: null,
      centerLng: null,
      radiusM: null,
    };
    expect(geoShapeIssue({ ...corridor, points: [[12.9, 77.6]], bufferM: 50 })).toBe(
      'a corridor needs at least two points',
    );
    expect(
      geoShapeIssue({
        ...corridor,
        points: [
          [12.9, 77.6],
          [12.91, 77.61],
        ],
        bufferM: 0,
      }),
    ).toBe('a corridor needs buffer_m above zero');
    expect(
      geoShapeIssue({
        ...corridor,
        points: [
          [12.9, 77.6],
          [12.91, 77.61],
        ],
        bufferM: 50,
      }),
    ).toBeNull();
  });

  it('refuses a shape it does not know', () => {
    expect(geoShapeIssue({ ...circle, shape: 'square' })).toBe(
      'shape must be circle, polygon or corridor',
    );
  });
});

describe('geo zone version', () => {
  const before = { ...circle, zoneType: 'attendance' };

  it('does not change for a label or a status-only edit', () => {
    expect(zoneGeometryChanged(before, { ...before })).toBe(false);
  });

  it('changes for a new radius, centre, zone type or points', () => {
    expect(zoneGeometryChanged(before, { ...before, radiusM: 200 })).toBe(true);
    expect(zoneGeometryChanged(before, { ...before, centerLat: 12.95 })).toBe(true);
    expect(zoneGeometryChanged(before, { ...before, zoneType: 'equipment' })).toBe(true);
    expect(
      zoneGeometryChanged(
        { ...before, shape: 'polygon', points: [[1, 1]] },
        { ...before, shape: 'polygon', points: [[1, 2]] },
      ),
    ).toBe(true);
  });
});

describe('milestone weights', () => {
  it('accepts a total up to 100, and compares in hundredths so rounding does not decide it', () => {
    expect(milestoneWeightIssue([60], 40)).toBeNull();
    expect(milestoneWeightIssue([33.33, 33.33], 33.34)).toBeNull();
    expect(milestoneWeightIssue([], null)).toBeNull();
  });

  it('refuses a total above 100', () => {
    expect(milestoneWeightIssue([60], 40.01)).toBe(
      'the milestone weights of this project would total more than 100',
    );
  });
});
