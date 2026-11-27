import type { CoreApp } from '../../http/app.js';
import { type RouteOptions, registerResourceRoutes } from '../../core/resource.js';
import { POLICIES_MANAGE } from '../policies/routes.js';
import { equipmentRateSpec, materialRateSpec } from './resources.js';

/**
 * Rate tables for the Fleet and Equipment and Material management policies. Reads need a signed-in user; writes need
 * policies.manage, the privilege that publishes company policies.
 */
export function registerRateRoutes(app: CoreApp, options: RouteOptions): void {
  const crud = { create: POLICIES_MANAGE, update: POLICIES_MANAGE, remove: POLICIES_MANAGE } as const;
  registerResourceRoutes(app, options, equipmentRateSpec, { path: '/equipment-rates', ...crud });
  registerResourceRoutes(app, options, materialRateSpec, { path: '/material-rates', ...crud });
}
