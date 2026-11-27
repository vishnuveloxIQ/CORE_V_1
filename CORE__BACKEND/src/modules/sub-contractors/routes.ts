import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { PROJECTS_MANAGE } from '../projects/routes.js';
import { subContractorSpec } from './resources.js';

/**
 * Sub-contractor registrations: GET /sub-contractors (filter projectId) and GET /sub-contractors/:id for any signed-in
 * user. POST, PATCH and DELETE need projects.manage at company scope; POST and PATCH need an Idempotency-Key header
 * and PATCH needs rowVersion.
 */
export function registerSubContractorRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, subContractorSpec, {
    path: '/sub-contractors',
    create: PROJECTS_MANAGE,
    update: PROJECTS_MANAGE,
    remove: PROJECTS_MANAGE,
  });
}
