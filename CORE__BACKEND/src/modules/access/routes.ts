import type { CoreApp } from '../../http/app.js';
import type { Pool } from 'pg';
import { authOf, inTenant } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import { withTenant } from '../../db/tenant.js';
import { type AuthGuardOptions, createRequireAuth, requireAccess } from '../../plugins/auth.js';
import { requireStepUp } from '../auth/step-up.js';
import { ACCESS_MANAGE } from './roles.js';
import {
  grantBodySchema,
  idParamsSchema,
  suspensionBodySchema,
  userCreateBody,
  userListQuery,
  userParamsSchema,
  userPatchBody,
} from './schema.js';
import {
  accessForUser,
  createUser,
  getUser,
  grantAccess,
  listUsers,
  resetUserPassword,
  restoreSuspension,
  revokeGrant,
  suspendUser,
  updateUser,
  withoutTemporaryPassword,
} from './service.js';

export interface AccessRouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/**
 * GET /auth/me/access (any signed-in user, own access only), and the admin routes under /access
 * (each needs access.manage, company-wide). Writes (POST) need an Idempotency-Key header.
 */
export function registerAccessRoutes(app: CoreApp, options: AccessRouteOptions): void {
  const guard: AuthGuardOptions = { pool: options.pool, signingKey: options.signingKey };
  const requireAuth = createRequireAuth(guard);
  const requireManage = requireAccess(guard, ACCESS_MANAGE);
  const admin = { preHandler: [requireAuth, requireManage] };
  // Granting and revoking access also needs a fresh passkey check (step-up, see auth/step-up.ts).
  const adminStepUp = { preHandler: [requireAuth, requireManage, requireStepUp(guard)] };
  // The signed-in user's own access stays readable while a temporary password is pending, so the UI can load.
  const requireAuthPending = createRequireAuth(guard, { allowPasswordChangePending: true });

  app.get('/auth/me/access', { preHandler: requireAuthPending }, async (request) => {
    const auth = authOf(request);
    const access = await withTenant(options.pool, auth.tenantId, (client) =>
      accessForUser(client, auth.userId),
    );
    return ok(access);
  });

  app.get('/access/users/:userId', admin, async (request) => {
    const auth = authOf(request);
    const { userId } = parseInput(userParamsSchema, request.params);
    const access = await withTenant(options.pool, auth.tenantId, (client) =>
      accessForUser(client, userId),
    );
    return ok(access);
  });

  // Users of the tenant (access.manage). Login state and credential hashes are never returned.
  app.get('/users', { ...admin, config: { openapi: { summary: 'GET /users', query: userListQuery } } }, async (request) => {
    const auth = authOf(request);
    const query = parseInput(userListQuery, request.query);
    const { rows, total } = await withTenant(options.pool, auth.tenantId, (client) =>
      listUsers(client, query),
    );
    return ok(rows, { limit: query.limit, offset: query.offset, total });
  });

  app.get('/users/:id', admin, async (request) => {
    const auth = authOf(request);
    const { id } = parseInput(idParamsSchema, request.params);
    const user = await withTenant(options.pool, auth.tenantId, (client) => getUser(client, id));
    return ok(user);
  });

  // Creates a user with a temporary password. The password is in this 201 response only: it is hashed before it is
  // stored, the idempotency store keeps the response without it, and no route returns it again.
  app.post('/users', { ...admin, config: { openapi: { summary: 'POST /users', body: userCreateBody } } }, async (request, reply) => {
    const body = parseInput(userCreateBody, request.body);
    const created = await inTenant(
      options,
      request,
      (client, actor) => createUser(client, actor, body),
      withoutTemporaryPassword,
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/users/:id', { ...admin, config: { openapi: { summary: 'PATCH /users/:id', body: userPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const body = parseInput(userPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateUser(client, actor, id, body),
    );
    return ok(updated);
  });

  // Admin reset: a new temporary password, returned once; the user must change it and every session ends.
  app.post('/users/:id/password-reset', { ...admin, config: { openapi: { summary: 'POST /users/:id/password-reset' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const reset = await inTenant(
      options,
      request,
      (client, actor) => resetUserPassword(client, actor, id),
      withoutTemporaryPassword,
    );
    return ok(reset);
  });

  app.post('/access/users/:userId/grants', { ...adminStepUp, config: { openapi: { summary: 'POST /access/users/:userId/grants', body: grantBodySchema } } }, async (request, reply) => {
    const { userId } = parseInput(userParamsSchema, request.params);
    const input = parseInput(grantBodySchema, request.body);
    const grant = await inTenant(options, request, (client, actor) =>
      grantAccess(client, actor, userId, input),
    );
    return reply.code(201).send(ok(grant));
  });

  app.delete('/access/grants/:id', { ...adminStepUp, config: { openapi: { summary: 'DELETE /access/grants/:id' } } }, async (request) => {
    const auth = authOf(request);
    const { id } = parseInput(idParamsSchema, request.params);
    await withTenant(options.pool, auth.tenantId, (client) =>
      revokeGrant(client, { actorId: auth.userId, correlationId: request.id }, id),
    );
    return ok({ revoked: true });
  });

  app.post('/access/users/:userId/suspensions', { ...admin, config: { openapi: { summary: 'POST /access/users/:userId/suspensions', body: suspensionBodySchema } } }, async (request, reply) => {
    const { userId } = parseInput(userParamsSchema, request.params);
    const body = parseInput(suspensionBodySchema, request.body);
    const suspension = await inTenant(options, request, (client, actor) =>
      suspendUser(client, actor, userId, body.reason),
    );
    return reply.code(201).send(ok(suspension));
  });

  app.post('/access/suspensions/:id/restore', { ...admin, config: { openapi: { summary: 'POST /access/suspensions/:id/restore' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const suspension = await inTenant(options, request, (client, actor) =>
      restoreSuspension(client, actor, id),
    );
    return ok(suspension);
  });
}
