import type { CoreApp } from '../../http/app.js';
import { registerResourceRoutes, type RouteOptions } from '../../core/resource.js';
import { billingPlanSpec, invoiceSpec, subscriptionSpec } from './resources.js';

/**
 * Billing, read-only for a tenant: GET /subscriptions (the tenant's one subscription), GET /invoices and
 * GET /billing-plans (the upgrade catalogue), each with GET /:id. Any signed-in user can read; there are no writes.
 */
export function registerBillingRoutes(app: CoreApp, options: RouteOptions): void {
  registerResourceRoutes(app, options, subscriptionSpec, { path: '/subscriptions' });
  registerResourceRoutes(app, options, invoiceSpec, { path: '/invoices' });
  registerResourceRoutes(app, options, billingPlanSpec, { path: '/billing-plans' });
}
