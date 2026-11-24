import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import {
  bumpSeriesCounter,
  latestYearSeries,
  lockSeriesRow,
  ORG_TABLE,
  openYearSeries,
  type SeriesRecord,
  snapshotOf,
} from './repo.js';
import { type Actor, auditChange } from './service.js';

const MIN_YEAR = 1900;
const MAX_YEAR = 9999;
const COUNTER_WIDTH = 5;

/**
 * Document number (design point g): the prefix, then the year when the series resets each year, then the
 * counter padded to five digits, joined with hyphens. A counter past 99999 simply grows.
 */
export function formatNumber(series: { prefix: string; yearScope: number; value: number }): string {
  const parts = [series.prefix];
  if (series.yearScope > 0) parts.push(String(series.yearScope));
  parts.push(String(series.value).padStart(COUNTER_WIDTH, '0'));
  return parts.join('-');
}

/**
 * Takes the next number of a series for the given year. The owning module calls this inside its own
 * transaction. The row lock lasts until that transaction ends, so a rollback returns the number and leaves
 * no gap.
 *
 * Which row is used:
 * 1. The row for this year, when it exists.
 * 2. Otherwise, when the series already has year rows, a new row for this year. Its prefix is copied from
 *    the latest year row. This is a judgement call the design text does not state.
 * 3. Otherwise the never-reset row (year_scope 0), when there is one.
 * 4. Otherwise 409 NUMBER_SERIES_MISSING.
 */
export async function allocateNumber(
  client: PoolClient,
  seriesCode: string,
  year: number,
  actor: Actor,
): Promise<string> {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`year must be a whole number from ${MIN_YEAR} to ${MAX_YEAR}`);
  }
  const series = await lockSeries(client, seriesCode, year, actor);
  const before = await snapshotOf(client, ORG_TABLE.series, series.id);
  await bumpSeriesCounter(client, series.id, actor.actorId);
  await auditChange(
    client,
    actor,
    ORG_TABLE.series,
    series.id,
    'UPDATE',
    before,
    await snapshotOf(client, ORG_TABLE.series, series.id),
  );
  return formatNumber({
    prefix: series.prefix,
    yearScope: series.yearScope,
    value: series.nextValue,
  });
}

async function lockSeries(
  client: PoolClient,
  seriesCode: string,
  year: number,
  actor: Actor,
): Promise<SeriesRecord> {
  let row = await lockSeriesRow(client, seriesCode, year);
  if (!row) {
    const template = await latestYearSeries(client, seriesCode);
    if (template) {
      const openedId = await openYearSeries(
        client,
        { seriesCode, prefix: template.prefix, yearScope: year, nextValue: 1 },
        actor.actorId,
      );
      if (openedId !== null) {
        await auditChange(
          client,
          actor,
          ORG_TABLE.series,
          openedId,
          'INSERT',
          null,
          await snapshotOf(client, ORG_TABLE.series, openedId),
        );
      }
      row = await lockSeriesRow(client, seriesCode, year);
    }
  }
  if (!row) {
    row = await lockSeriesRow(client, seriesCode, 0);
  }
  if (!row) {
    throw new AppError('NUMBER_SERIES_MISSING', 409, 'No number series is set up for this code');
  }
  return row;
}
