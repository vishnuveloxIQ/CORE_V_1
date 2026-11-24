import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { PROJECTS_MANAGE } from '../projects/routes.js';
import { boqItemSpec } from './resources.js';

/**
 * Bill of Quantities: GET /boq-items (filters projectId, wbsNodeId, status) and GET /boq-items/:id for any signed-in
 * user. POST, PATCH and DELETE need projects.manage at company scope; POST and PATCH need an Idempotency-Key header
 * and PATCH needs rowVersion.
 */
export function registerBoqRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, boqItemSpec, {
    path: '/boq-items',
    create: PROJECTS_MANAGE,
    update: PROJECTS_MANAGE,
    remove: PROJECTS_MANAGE,
  });
}
