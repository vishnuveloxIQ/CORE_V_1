import type { CoreApp } from '../../http/app.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import {
  type RouteOptions,
  guardRoute,
  idParamsSchema,
  inTenant,
  registerResourceRoutes,
} from '../../core/resource.js';
import {
  cashLimitSpec,
  chainSpec,
  matrixLevelSpec,
  matrixVersionSpec,
  requestSpec,
} from './resources.js';
import {
  actOnRequest,
  listActions,
  publishJobOpening,
  publishMatrixVersion,
  raiseRequest,
} from './service.js';
import { actionBody, publishRequestBody, raiseBody, rowVersionBody } from './schema.js';

export const APPROVALS_MANAGE = 'approvals.manage';

/**
 * Registers the approval routes (Phase 5e). Chains, matrix versions and levels, and PMS limit rows are written under
 * approvals.manage. Raising and acting need only a signed-in user; the approver check is the control there.
 */
export function registerApprovalsRoutes(app: CoreApp, options: RouteOptions): void {
  const write = APPROVALS_MANAGE;
  const crud = { create: write, update: write, remove: write } as const;

  registerResourceRoutes(app, options, chainSpec, { path: '/approval-chains', ...crud });
  registerResourceRoutes(app, options, matrixVersionSpec, { path: '/matrix-versions', ...crud });
  registerResourceRoutes(app, options, matrixLevelSpec, { path: '/matrix-levels', ...crud });
  // Cash limit rows: /cash-limit-rows is the name; /pms-limit-rows is the same resource, kept so API v1 callers work.
  registerResourceRoutes(app, options, cashLimitSpec, { path: '/cash-limit-rows', ...crud });
  registerResourceRoutes(app, options, cashLimitSpec, { path: '/pms-limit-rows', ...crud });
  // Requests have no generic writes: they are raised and acted on below.
  registerResourceRoutes(app, options, requestSpec, { path: '/approval-requests' });

  app.post('/matrix-versions/:id/publish', guardRoute(options, write, { summary: 'POST /matrix-versions/:id/publish', body: rowVersionBody }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const { rowVersion } = parseInput(rowVersionBody, request.body);
    const published = await inTenant(options, request, (client, actor) =>
      publishMatrixVersion(client, actor, id, rowVersion),
    );
    return ok(published);
  });

  app.post('/approval-requests', guardRoute(options, null, { summary: 'POST /approval-requests', body: raiseBody }), async (request, reply) => {
    const body = parseInput(raiseBody, request.body);
    const raised = await inTenant(options, request, (client, actor) =>
      raiseRequest(client, actor, body),
    );
    // a raise for a source record that already has a request returns that request with 200, not a second one
    return reply.code(raised.created ? 201 : 200).send(ok(raised.request));
  });

  app.post('/approval-requests/:id/actions', guardRoute(options, null, { summary: 'POST /approval-requests/:id/actions', body: actionBody }), async (request, reply) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const body = parseInput(actionBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      actOnRequest(client, actor, id, body),
    );
    return reply.code(201).send(ok(updated));
  });

  // Publishes an approved job opening to a location (approvals.manage). Returns the updated request.
  app.post('/approval-requests/:id/publish', guardRoute(options, write, { summary: 'POST /approval-requests/:id/publish', body: publishRequestBody }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const body = parseInput(publishRequestBody, request.body);
    const published = await inTenant(options, request, (client, actor) =>
      publishJobOpening(client, actor, id, body),
    );
    return ok(published);
  });

  app.get('/approval-requests/:id/actions', guardRoute(options, null), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return ok(await inTenant(options, request, (client) => listActions(client, id)));
  });
}
