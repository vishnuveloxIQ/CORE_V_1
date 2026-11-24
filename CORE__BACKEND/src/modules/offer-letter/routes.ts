import type { CoreApp } from '../../http/app.js';
import { guardRoute, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { idParamsSchema } from '../../core/resource.js';
import { parseInput } from '../../core/validation.js';
import { ORGANISATION_MANAGE } from '../organisation/routes.js';
import { revisionCreateBody } from './schema.js';
import { createRevision, listRevisions } from './service.js';

/**
 * Offer letter revision history. Both routes need organisation.manage at company scope: the same privilege the
 * company profile uses for writes. The GET lists every revision, newest first. The POST records a revision for a
 * stored offer letter file and needs an Idempotency-Key (inTenant runs POST through the idempotency store).
 */
export function registerOfferLetterRoutes(app: CoreApp, options: RouteOptions): void {
  const manage = guardRoute(options, ORGANISATION_MANAGE);

  app.get('/offer-letter/revisions/:id', manage, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listRevisions(client));
    return ok(rowById(rows, id, 'Offer letter revision'));
  });

  app.get('/offer-letter/revisions', manage, async (request) =>
    ok(await inTenant(options, request, (client) => listRevisions(client))),
  );

  app.post('/offer-letter/revisions', { ...manage, config: { openapi: { summary: 'POST /offer-letter/revisions', body: revisionCreateBody } } }, async (request, reply) => {
    const body = parseInput(revisionCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createRevision(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });
}
