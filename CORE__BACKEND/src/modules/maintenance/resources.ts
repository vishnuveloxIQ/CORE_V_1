import { field, type ResourceSpec } from '../../core/resource.js';
import { scheduleCreateBody, schedulePatchBody, scheduleUnitFilter } from './schema.js';

/**
 * Maintenance schedules (migration 0037). Errors use the MAINTENANCE prefix: a second schedule with the same task on
 * a unit is 409 MAINTENANCE_DUPLICATE, and an unknown unit is 400 MAINTENANCE_REFERENCE_NOT_FOUND. A schedule needs
 * an interval in months or in hours (400 VALIDATION_ERROR on intervalMonths otherwise).
 */
export const maintenanceScheduleSpec: ResourceSpec = {
  table: 'core_maintenance_schedule',
  prefix: 'MAINTENANCE',
  label: 'Maintenance schedule',
  fields: [
    field('equipmentUnitId', 'uuid'),
    field('task', 'text'),
    field('intervalMonths', 'int'),
    field('intervalHours', 'int'),
    field('lastServiceDate', 'date'),
    field('lastServiceHours', 'num'),
    field('notes', 'text'),
  ],
  create: scheduleCreateBody,
  patch: schedulePatchBody,
  filters: { equipmentUnitId: { column: 'equipment_unit_id', schema: scheduleUnitFilter } },
  orderBy: 'equipment_unit_id, lower(task), id',
  check(row) {
    const none = (v: unknown) => v === null || v === undefined;
    return none(row['intervalMonths']) && none(row['intervalHours'])
      ? { path: 'intervalMonths', message: 'Set an interval in months, in hours, or both' }
      : null;
  },
};
