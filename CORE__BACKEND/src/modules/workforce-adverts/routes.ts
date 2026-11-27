import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { PROJECTS_MANAGE } from '../projects/routes.js';
import {
  advertMailSpec, contractorInterestSpec, interestStepSpec, workforceAdvertSpec, workforceRequirementSpec,
} from './resources.js';

/**
 * Workforce adverts (head office advertises workers to its registered sub-contractors):
 *   GET/POST/PATCH/DELETE /workforce-adverts              drafts are created, edited and deleted; publish and close are PATCH status
 *   GET/POST/PATCH/DELETE /workforce-advert-requirements  worker lines, only while the advert is a draft (filter advertId)
 *   GET /advert-mail                                      the messages queued for sub-contractors (filter advertId); written on publish
 *   GET/POST/PATCH        /contractor-interests           a sub-contractor's response, recorded by head office (filter advertId, status, subContractorId)
 *   GET/POST              /interest-steps                 discussion steps against an interest (filter interestId)
 * Reads need a signed-in user; writes need projects.manage at company scope and an Idempotency-Key header.
 */
export function registerWorkforceAdvertRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, workforceAdvertSpec, {
    path: '/workforce-adverts',
    create: PROJECTS_MANAGE,
    update: PROJECTS_MANAGE,
    remove: PROJECTS_MANAGE,
  });
  registerResourceRoutes(app, options, workforceRequirementSpec, {
    path: '/workforce-advert-requirements',
    create: PROJECTS_MANAGE,
    update: PROJECTS_MANAGE,
    remove: PROJECTS_MANAGE,
  });
  registerResourceRoutes(app, options, advertMailSpec, { path: '/advert-mail' });
  registerResourceRoutes(app, options, contractorInterestSpec, {
    path: '/contractor-interests',
    create: PROJECTS_MANAGE,
    update: PROJECTS_MANAGE,
  });
  registerResourceRoutes(app, options, interestStepSpec, {
    path: '/interest-steps',
    create: PROJECTS_MANAGE,
  });
}
