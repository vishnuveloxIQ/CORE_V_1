import { z } from 'zod';
import type { CoreApp } from '../../http/app.js';
import { guardRoute, idParamsSchema, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import { ACCESS_MANAGE } from '../access/roles.js';
import { eventListQuery, inboundEventBody, replayBody } from './schema.js';
import { eventSummary, getEvent, listEvents, listRefRecords, receiveInbound, replayEvent, syncStatus } from './service.js';

const refListQuery = z.object({
  sourceModule: z.enum(['hrms', 'pm', 'pms', 'stores']).optional(),
  entityType: z.string().trim().regex(/^[a-z_]{1,60}$/).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

/**
 * Integration events and read models (CORE-23-02, 23-03, 24-01, 24-02, 24-05, 24-07). Every route needs access.manage:
 * these are internal diagnostics for the Core administrator. The monitor never returns payload values. Inbound events
 * arrive here until the production transport is chosen (decision D13); the source modules' own credentials for it are
 * part of that decision.
 */
export function registerIntegrationRoutes(app: CoreApp, options: RouteOptions): void {
  const admin = (summary: string, extra: Record<string, unknown> = {}) => guardRoute(options, ACCESS_MANAGE, { summary, ...extra });

  app.get('/integration-events', admin('GET /integration-events', { query: eventListQuery }), async (request) => {
    const query = parseInput(eventListQuery, request.query);
    const { rows, total } = await inTenant(options, request, (client) => listEvents(client, query));
    return ok(rows, { limit: query.limit, offset: query.offset, total });
  });

  app.get('/integration-events/summary', admin('GET /integration-events/summary'), async (request) =>
    ok(await inTenant(options, request, (client) => eventSummary(client))));

  app.get('/integration-events/:id', admin('GET /integration-events/:id'), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return ok(await inTenant(options, request, (client) => getEvent(client, id)));
  });

  app.post('/integration-events/:id/replay', admin('POST /integration-events/:id/replay', { body: replayBody }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    parseInput(replayBody, request.body ?? {});
    return ok(await inTenant(options, request, (client, actor) => replayEvent(client, actor, id)));
  });

  app.post('/integration-events/inbound', admin('POST /integration-events/inbound', { body: inboundEventBody }), async (request, reply) => {
    const body = parseInput(inboundEventBody, request.body);
    const result = await inTenant(options, request, (client, actor) => receiveInbound(client, actor, body));
    return reply.code(result.outcome === 'duplicate' ? 200 : 202).send(ok(result));
  });

  app.get('/ref-records', admin('GET /ref-records', { query: refListQuery }), async (request) => {
    const query = parseInput(refListQuery, request.query);
    const { rows, total } = await inTenant(options, request, (client) => listRefRecords(client, query));
    return ok(rows, { limit: query.limit, offset: query.offset, total });
  });

  app.get('/ref-records/sync-status', admin('GET /ref-records/sync-status'), async (request) =>
    ok(await inTenant(options, request, (client) => syncStatus(client))));
}
