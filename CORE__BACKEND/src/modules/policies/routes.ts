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
import { rowVersionBody } from './schema.js';
import {
  customFieldSpec,
  customPolicySpec,
  customVersionSpec,
  documentTemplateSpec,
  leavePolicyRuleSpec,
  leavePolicySpec,
  leaveTypeSpec,
  otPolicyRuleSpec,
  otPolicySpec,
  policyRuleSpec,
  policySpec,
  policyVersionSpec,
} from './resources.js';
import { acknowledgeRule, listMyAcknowledgements, publishVersion } from './service.js';

export const POLICIES_MANAGE = 'policies.manage';

/** Registers the policy routes (Phase 5d). Reads need a signed-in user; every write needs policies.manage. */
export function registerPoliciesRoutes(app: CoreApp, options: RouteOptions): void {
  const write = POLICIES_MANAGE;
  const crud = { create: write, update: write, remove: write } as const;

  registerResourceRoutes(app, options, policySpec, { path: '/policies', ...crud });
  registerResourceRoutes(app, options, policyVersionSpec, { path: '/policy-versions', ...crud });
  registerResourceRoutes(app, options, policyRuleSpec, { path: '/policy-rules', ...crud });
  registerResourceRoutes(app, options, otPolicySpec, { path: '/ot-policies', ...crud });
  registerResourceRoutes(app, options, otPolicyRuleSpec, { path: '/ot-policy-rules', ...crud });
  registerResourceRoutes(app, options, leaveTypeSpec, { path: '/leave-types', ...crud });
  registerResourceRoutes(app, options, leavePolicySpec, { path: '/leave-policies', ...crud });
  registerResourceRoutes(app, options, leavePolicyRuleSpec, {
    path: '/leave-policy-rules',
    ...crud,
  });
  registerResourceRoutes(app, options, customPolicySpec, { path: '/custom-policies', ...crud });
  registerResourceRoutes(app, options, customFieldSpec, { path: '/custom-policy-fields', ...crud });
  registerResourceRoutes(app, options, customVersionSpec, {
    path: '/custom-policy-versions',
    ...crud,
  });
  registerResourceRoutes(app, options, documentTemplateSpec, {
    path: '/document-templates',
    ...crud,
  });

  // Publish: sets published_at under the row-version guard. The version is immutable from then on.
  app.post('/policy-versions/:id/publish', guardRoute(options, write, { summary: 'POST /policy-versions/:id/publish', body: rowVersionBody }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const { rowVersion } = parseInput(rowVersionBody, request.body);
    const published = await inTenant(options, request, (client, actor) =>
      publishVersion(client, actor, id, rowVersion),
    );
    return ok(published);
  });

  // The signed-in user's own acknowledgements (rule id and time), so a client can show rules already read.
  app.get('/policy-rules/acknowledgements', guardRoute(options, null), async (request) =>
    ok(await inTenant(options, request, (client, actor) => listMyAcknowledgements(client, actor))),
  );

  // Acknowledge: any signed-in user records that they have read a published rule.
  app.post('/policy-rules/:id/acknowledge', guardRoute(options, null, { summary: 'POST /policy-rules/:id/acknowledge' }), async (request, reply) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const result = await inTenant(options, request, (client, actor) =>
      acknowledgeRule(client, actor, id),
    );
    return reply.code(result.created ? 201 : 200).send(ok(result.ack));
  });
}
