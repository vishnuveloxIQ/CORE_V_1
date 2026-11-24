import type { CoreApp } from '../../http/app.js';
import { guardRoute, idParamsSchema, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import { ACCESS_MANAGE } from '../access/roles.js';
import { auditListQuery, authEventsQuery, externalAuditBody } from './schema.js';
import { getAuditEntry, listAuditEntries, listAuthEvents, recordExternalAudit } from './service.js';

/**
 * GET /audit-log: the tenant's audit trail, read-only, newest first. It needs access.manage at company scope:
 * no audit-reading privilege exists yet, and reviewing who changed access and records is the access administrator's
 * duty, so the users routes' privilege is reused. There are no writes; audit_row_change is append-only (migration 0002).
 */
export function registerAuditLogRoutes(app: CoreApp, options: RouteOptions): void {
  const read = guardRoute(options, ACCESS_MANAGE);

  app.get('/audit-log', { ...read, config: { openapi: { summary: 'GET /audit-log', query: auditListQuery } } }, async (request) => {
    const query = parseInput(auditListQuery, request.query);
    const { entries, total } = await inTenant(options, request, (client) =>
      listAuditEntries(client, query),
    );
    return ok(entries, { limit: query.limit, offset: query.offset, total });
  });

  // Sign-in and access history (logins, failures, lockouts, sessions, step-up, refused privileges). Registered before
  // /audit-log/:id so the literal path is not read as an id. Same privilege as the audit trail.
  app.get(
    '/audit-log/auth-events',
    guardRoute(options, ACCESS_MANAGE, { summary: 'GET /audit-log/auth-events', query: authEventsQuery }),
    async (request) => {
      const query = parseInput(authEventsQuery, request.query);
      const { events, total } = await inTenant(options, request, (client) => listAuthEvents(client, query));
      return ok(events, { limit: query.limit, offset: query.offset, total });
    },
  );

  // An entry from another module's own audit trail (a sign-in in HRMS, a request raised in PMS). Stored in the same
  // append-only chain as CORE's entries, so the trail shows every module's activity in one place. Same privilege as
  // the inbound event route: the calling module signs in as a user who holds access.manage.
  app.post(
    '/audit-log/external',
    guardRoute(options, ACCESS_MANAGE, { summary: 'POST /audit-log/external', body: externalAuditBody }),
    async (request, reply) => {
      const body = parseInput(externalAuditBody, request.body);
      const result = await inTenant(options, request, (client, actor) => recordExternalAudit(client, actor, body));
      return reply.code(201).send(ok(result));
    },
  );

  // One entry by id, read directly, so an older entry beyond the first pages of the list is still found.
  app.get('/audit-log/:id', guardRoute(options, ACCESS_MANAGE, { summary: 'GET /audit-log/:id' }), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return ok(await inTenant(options, request, (client) => getAuditEntry(client, id)));
  });
}
