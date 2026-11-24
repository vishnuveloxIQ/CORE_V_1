import { z } from 'zod';
import { filterUuid, optionalDate, optionalText, text, uuid, versionField } from '../../core/resource.js';

const months = z.number().int().min(1).max(120);
const hours = z.number().int().min(1).max(100_000);

const scheduleFields = {
  task: text(100),
  // every N months of calendar time, or every N hours of running time, whichever comes first (at least one)
  intervalMonths: months.nullable().optional(),
  intervalHours: hours.nullable().optional(),
  lastServiceDate: optionalDate,
  lastServiceHours: z.number().min(0).max(999_999_999).nullable().optional(),
  notes: optionalText(1000),
};

// POST body. The unit is fixed at create.
export const scheduleCreateBody = z.object({ equipmentUnitId: uuid, ...scheduleFields }).strict();

// PATCH body: any subset of the schedule's fields, plus the row version the client read. The unit cannot change.
export const schedulePatchBody = z.object(scheduleFields).partial().extend({ rowVersion: versionField }).strict();

export const scheduleUnitFilter = filterUuid;
