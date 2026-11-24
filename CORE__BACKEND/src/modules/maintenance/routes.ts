import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { MASTERS_MANAGE } from '../masters/routes.js';
import { maintenanceScheduleSpec } from './resources.js';

/**
 * Equipment maintenance schedules: GET /maintenance-schedules (filter equipmentUnitId) and GET one for any signed-in
 * user; POST, PATCH and DELETE need masters.manage, as for the equipment register. POST and PATCH need an
 * Idempotency-Key header, and PATCH needs rowVersion.
 */
export function registerMaintenanceRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, maintenanceScheduleSpec, {
    path: '/maintenance-schedules',
    create: MASTERS_MANAGE,
    update: MASTERS_MANAGE,
    remove: MASTERS_MANAGE,
  });
}
