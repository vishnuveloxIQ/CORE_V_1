import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { APPROVALS_MANAGE } from '../approvals/routes.js';
import { quotationSpec } from './resources.js';

/**
 * Quotation approval: GET /quotations (filter status) and GET /quotations/:id for any signed-in user. POST sends a
 * quotation for approval; PATCH records the decision (status APPROVED, or REJECTED with a reason). Writes need
 * approvals.manage at company scope and an Idempotency-Key header; PATCH needs rowVersion. There is no DELETE.
 */
export function registerQuotationRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, quotationSpec, {
    path: '/quotations',
    create: APPROVALS_MANAGE,
    update: APPROVALS_MANAGE,
  });
}
