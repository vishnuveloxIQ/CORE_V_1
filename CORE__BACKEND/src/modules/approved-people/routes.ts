import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { ORGANISATION_MANAGE } from '../organisation/routes.js';
import { approvedPersonSpec } from './resources.js';

/**
 * Approved people: GET /approved-people (filters projectId, status) and GET /approved-people/:id for any signed-in
 * user. POST, PATCH and DELETE need organisation.manage at company scope; POST and PATCH need an Idempotency-Key
 * header and PATCH needs rowVersion. Moving a person to With HRMS or Onboarded is PATCH status.
 */
export function registerApprovedPeopleRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, approvedPersonSpec, {
    path: '/approved-people',
    create: ORGANISATION_MANAGE,
    update: ORGANISATION_MANAGE,
    remove: ORGANISATION_MANAGE,
  });
}
