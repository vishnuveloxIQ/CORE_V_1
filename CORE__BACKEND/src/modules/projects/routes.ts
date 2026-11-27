import type { CoreApp, CoreRequest } from '../../http/app.js';
import type { Pool } from 'pg';
import { inTenant } from '../../core/resource.js';
import { requireStepUp } from '../auth/step-up.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { parseInput } from '../../core/validation.js';
import { type AuthGuardOptions, createRequireAuth, requireAccess } from '../../plugins/auth.js';
import {
  createLocation,
  createMarker,
  createMilestone,
  createProject,
  createStore,
  createZone,
  deleteMarker,
  deleteMilestone,
  deleteZone,
  listLocationRecords,
  listMarkerRecords,
  listMilestoneRecords,
  listProjectRecords,
  listStoreRecords,
  listZoneRecords,
  updateLocationRecord,
  updateMarkerRecord,
  updateMilestoneRecord,
  updateProjectRecord,
  updateStoreRecord,
  updateZoneRecord,
} from './service.js';
import {
  chainageMarkerCreateBody,
  chainageMarkerPatchBody,
  geoZoneCreateBody,
  geoZonePatchBody,
  idParamsSchema,
  locationCreateBody,
  locationPatchBody,
  milestoneCreateBody,
  milestonePatchBody,
  projectCreateBody,
  projectFilterQuery,
  projectPatchBody,
  storeCreateBody,
  storePatchBody,
} from './schema.js';

/** The privilege for every write under the projects and sites routes. Reads need only a signed-in user. */
export const PROJECTS_MANAGE = 'projects.manage';

export interface ProjectsRouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/** The optional ?projectId= filter on the list routes that belong to a project. */
function projectFilterOf(request: CoreRequest): string | null {
  return parseInput(projectFilterQuery, request.query).projectId ?? null;
}

/**
 * Projects and sites routes (Phase 5b). Reads need a signed-in user. Writes need projects.manage at company
 * scope. A missing or invalid token answers 401; a missing privilege answers 403.
 */
export function registerProjectsRoutes(app: CoreApp, options: ProjectsRouteOptions): void {
  const guard: AuthGuardOptions = { pool: options.pool, signingKey: options.signingKey };
  const requireAuth = createRequireAuth(guard);
  const requireManage = requireAccess(guard, PROJECTS_MANAGE);
  const read = { preHandler: requireAuth };
  const write = { preHandler: [requireAuth, requireManage] };
  // Geo-fence zones change where attendance is accepted, so they need a fresh check (step-up): a passkey, or the
  // user's password again. Privilege grants accept the passkey only.
  const zoneWrite = { preHandler: [requireAuth, requireManage, requireStepUp(guard, { allowPassword: true })] };

  app.get('/projects/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listProjectRecords(client));
    return ok(rowById(rows, id, 'Project'));
  });
  app.get('/locations/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listLocationRecords(client, null));
    return ok(rowById(rows, id, 'Location'));
  });
  app.get('/stores/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listStoreRecords(client));
    return ok(rowById(rows, id, 'Store'));
  });
  app.get('/chainage-markers/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listMarkerRecords(client, null));
    return ok(rowById(rows, id, 'Chainage marker'));
  });
  app.get('/geo-zones/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listZoneRecords(client, null));
    return ok(rowById(rows, id, 'Geo-fence zone'));
  });
  app.get('/milestones/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listMilestoneRecords(client, null));
    return ok(rowById(rows, id, 'Milestone'));
  });

  // Projects. Closed by status, never deleted (design point b).

  app.get('/projects', read, async (request) =>
    ok(await inTenant(options, request, (client) => listProjectRecords(client))),
  );

  app.post('/projects', { ...write, config: { openapi: { summary: 'POST /projects', body: projectCreateBody } } }, async (request, reply) => {
    const body = parseInput(projectCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createProject(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/projects/:id', { ...write, config: { openapi: { summary: 'PATCH /projects/:id', body: projectPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(projectPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateProjectRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Locations. Deactivated, not deleted (design point c).

  app.get('/locations', { ...read, config: { openapi: { summary: 'GET /locations', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectFilterOf(request);
    return ok(await inTenant(options, request, (client) => listLocationRecords(client, projectId)));
  });

  app.post('/locations', { ...write, config: { openapi: { summary: 'POST /locations', body: locationCreateBody } } }, async (request, reply) => {
    const body = parseInput(locationCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createLocation(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/locations/:id', { ...write, config: { openapi: { summary: 'PATCH /locations/:id', body: locationPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(locationPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateLocationRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Stores. Deactivated, not deleted (design point d).

  app.get('/stores', read, async (request) =>
    ok(await inTenant(options, request, (client) => listStoreRecords(client))),
  );

  app.post('/stores', { ...write, config: { openapi: { summary: 'POST /stores', body: storeCreateBody } } }, async (request, reply) => {
    const body = parseInput(storeCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createStore(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/stores/:id', { ...write, config: { openapi: { summary: 'PATCH /stores/:id', body: storePatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(storePatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateStoreRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Chainage markers. Deleted only when nothing refers to them (design point f).

  app.get('/chainage-markers', { ...read, config: { openapi: { summary: 'GET /chainage-markers', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectFilterOf(request);
    return ok(await inTenant(options, request, (client) => listMarkerRecords(client, projectId)));
  });

  app.post('/chainage-markers', { ...write, config: { openapi: { summary: 'POST /chainage-markers', body: chainageMarkerCreateBody } } }, async (request, reply) => {
    const body = parseInput(chainageMarkerCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createMarker(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/chainage-markers/:id', { ...write, config: { openapi: { summary: 'PATCH /chainage-markers/:id', body: chainageMarkerPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(chainageMarkerPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateMarkerRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/chainage-markers/:id', { ...write, config: { openapi: { summary: 'DELETE /chainage-markers/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteMarker(client, actor, id));
    return ok({ deleted: true });
  });

  // Geo zones. The version rises when the geometry changes (design point g).

  app.get('/geo-zones', { ...read, config: { openapi: { summary: 'GET /geo-zones', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectFilterOf(request);
    return ok(await inTenant(options, request, (client) => listZoneRecords(client, projectId)));
  });

  app.post('/geo-zones', { ...zoneWrite, config: { openapi: { summary: 'POST /geo-zones', body: geoZoneCreateBody } } }, async (request, reply) => {
    const body = parseInput(geoZoneCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createZone(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/geo-zones/:id', { ...zoneWrite, config: { openapi: { summary: 'PATCH /geo-zones/:id', body: geoZonePatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(geoZonePatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateZoneRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/geo-zones/:id', { ...zoneWrite, config: { openapi: { summary: 'DELETE /geo-zones/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteZone(client, actor, id));
    return ok({ deleted: true });
  });

  // Milestones. Deleted only when nothing refers to them (design point h).

  app.get('/milestones', { ...read, config: { openapi: { summary: 'GET /milestones', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectFilterOf(request);
    return ok(
      await inTenant(options, request, (client) => listMilestoneRecords(client, projectId)),
    );
  });

  app.post('/milestones', { ...write, config: { openapi: { summary: 'POST /milestones', body: milestoneCreateBody } } }, async (request, reply) => {
    const body = parseInput(milestoneCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createMilestone(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/milestones/:id', { ...write, config: { openapi: { summary: 'PATCH /milestones/:id', body: milestonePatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(milestonePatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateMilestoneRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/milestones/:id', { ...write, config: { openapi: { summary: 'DELETE /milestones/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteMilestone(client, actor, id));
    return ok({ deleted: true });
  });
}
