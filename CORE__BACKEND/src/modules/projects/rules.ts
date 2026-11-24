/**
 * Pure rules for the projects and sites tables (Phase 5b design defaults, PROGRESS.md). No database access.
 * Each function returns a message when the rule is broken, or null when the value is fine.
 */

/** Hundredths of a weight point. Weights are numeric(5,2), so whole hundredths keep the total exact. */
const HUNDREDTHS_LIMIT = 10000;

/** A project ends on or after it starts. Dates are YYYY-MM-DD, so string order is date order (point b). */
export function projectDatesIssue(startDate: string | null, endDate: string | null): string | null {
  if (startDate !== null && endDate !== null && endDate < startDate) {
    return 'end_date must be on or after start_date';
  }
  return null;
}

/** Latitude and longitude are set together or not at all (point c). */
export function coordinatePairIssue(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if ((latitude === null) !== (longitude === null)) {
    return 'latitude and longitude must be set together';
  }
  return null;
}

/** Chainage start and end are set together, and the start is on or before the end (point c). */
export function chainageRangeIssue(start: number | null, end: number | null): string | null {
  if ((start === null) !== (end === null)) {
    return 'chainage_start_km and chainage_end_km must be set together';
  }
  if (start !== null && end !== null && start > end) {
    return 'chainage_end_km must be on or after chainage_start_km';
  }
  return null;
}

/** The geometry a geo zone is drawn with. points holds [lat, lng] pairs for polygon and corridor shapes. */
export interface ZoneGeometry {
  shape: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  points: readonly unknown[] | null;
  bufferM: number | null;
}

/** Each shape needs its own fields and no others that matter (point g). */
export function geoShapeIssue(zone: ZoneGeometry): string | null {
  const pointCount = zone.points?.length ?? 0;
  if (zone.shape === 'circle') {
    if (zone.centerLat === null || zone.centerLng === null) {
      return 'a circle needs center_lat and center_lng';
    }
    if (zone.radiusM === null || zone.radiusM <= 0) {
      return 'a circle needs radius_m above zero';
    }
    if (pointCount > 0) {
      return 'a circle has no points';
    }
    return null;
  }
  if (zone.shape === 'polygon') {
    return pointCount >= 3 ? null : 'a polygon needs at least three points';
  }
  if (zone.shape === 'corridor') {
    if (pointCount < 2) {
      return 'a corridor needs at least two points';
    }
    if (zone.bufferM === null || zone.bufferM <= 0) {
      return 'a corridor needs buffer_m above zero';
    }
    return null;
  }
  return 'shape must be circle, polygon or corridor';
}

/**
 * True when the fence changed, so the zone version must rise (point g). Attendance reads the version to tell
 * which fence applied. A change to the label or the status does not count.
 */
export function zoneGeometryChanged(
  before: ZoneGeometry & { zoneType: string },
  after: ZoneGeometry & { zoneType: string },
): boolean {
  return (
    before.zoneType !== after.zoneType ||
    before.shape !== after.shape ||
    before.centerLat !== after.centerLat ||
    before.centerLng !== after.centerLng ||
    before.radiusM !== after.radiusM ||
    before.bufferM !== after.bufferM ||
    JSON.stringify(before.points ?? null) !== JSON.stringify(after.points ?? null)
  );
}

/**
 * The milestone weights of one project must total 100 or less (point h). Compared in hundredths, so
 * floating point sums do not decide the answer.
 */
export function milestoneWeightIssue(
  otherWeights: readonly number[],
  weight: number | null,
): string | null {
  const others = otherWeights.reduce((sum, w) => sum + Math.round(w * 100), 0);
  const added = weight === null ? 0 : Math.round(weight * 100);
  if (others + added > HUNDREDTHS_LIMIT) {
    return 'the milestone weights of this project would total more than 100';
  }
  return null;
}
