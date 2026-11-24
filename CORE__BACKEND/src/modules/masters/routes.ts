import type { CoreApp, CoreRequest } from '../../http/app.js';
import type { Pool } from 'pg';
import { inTenant } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { parseInput } from '../../core/validation.js';
import { type AuthGuardOptions, createRequireAuth, requireAccess } from '../../plugins/auth.js';
import { registerStockLevelRoutes } from '../stock-levels/routes.js';
import {
  createAllocation,
  createAssignment,
  createEquipmentType,
  createMaterial,
  createPlanLine,
  createVendor,
  deleteAllocation,
  deleteAssignment,
  listAllocationRecords,
  listAssignmentRecords,
  listEquipmentTypeRecords,
  listMaterialRecords,
  listPlanLineRecords,
  listVendorRecords,
  updateAllocationRecord,
  updateAssignmentRecord,
  updateEquipmentTypeRecord,
  updateMaterialRecord,
  updatePlanLineRecord,
  updateVendorRecord,
  verifyVendor,
} from './service.js';
import {
  allocationCreateBody,
  allocationPatchBody,
  assignmentCreateBody,
  assignmentPatchBody,
  equipmentTypeCreateBody,
  equipmentTypePatchBody,
  idParamsSchema,
  materialCreateBody,
  materialPatchBody,
  planLineCreateBody,
  planLineFilterQuery,
  planLinePatchBody,
  projectFilterQuery,
  statusFilterQuery,
  vendorCreateBody,
  vendorPatchBody,
  vendorVerifyBody,
} from './schema.js';

/** The privilege for every write under the master data routes. Reads need only a signed-in user. */
export const MASTERS_MANAGE = 'masters.manage';

export interface MastersRouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/** The optional ?status= filter. Missing means every row. */
function statusOf(request: CoreRequest): string | null {
  return parseInput(statusFilterQuery, request.query).status ?? null;
}

/** The status filter on equipment types maps to the active flag: active is true, inactive is false. */
function activeOf(request: CoreRequest): boolean | null {
  const status = statusOf(request);
  if (status === null) return null;
  return status === 'active';
}

/** The optional ?projectId= filter. */
function projectOf(request: CoreRequest): string | null {
  return parseInput(projectFilterQuery, request.query).projectId ?? null;
}

/**
 * Master data routes (Phase 5c). Reads need a signed-in user. Writes need masters.manage at company scope.
 * A missing or invalid token answers 401; a missing privilege answers 403.
 */
export function registerMastersRoutes(app: CoreApp, options: MastersRouteOptions): void {
  const guard: AuthGuardOptions = { pool: options.pool, signingKey: options.signingKey };
  const requireAuth = createRequireAuth(guard);
  const requireManage = requireAccess(guard, MASTERS_MANAGE);
  const read = { preHandler: requireAuth };
  const write = { preHandler: [requireAuth, requireManage] };

  app.get('/vendors/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listVendorRecords(client, null));
    return ok(rowById(rows, id, 'Vendor'));
  });
  app.get('/materials/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listMaterialRecords(client, null));
    return ok(rowById(rows, id, 'Material'));
  });
  app.get('/equipment-types/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listEquipmentTypeRecords(client, null));
    return ok(rowById(rows, id, 'Equipment type'));
  });
  app.get('/equipment-assignments/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listAssignmentRecords(client, null));
    return ok(rowById(rows, id, 'Equipment assignment'));
  });
  app.get('/plan-lines/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listPlanLineRecords(client, null, null));
    return ok(rowById(rows, id, 'Plan line'));
  });

  // Vendors. Deactivated, not deleted (design point b). verify sets verified_at (point c).

  app.get('/vendors', { ...read, config: { openapi: { summary: 'GET /vendors', query: statusFilterQuery } } }, async (request) => {
    const status = statusOf(request);
    return ok(await inTenant(options, request, (client) => listVendorRecords(client, status)));
  });

  app.post('/vendors', { ...write, config: { openapi: { summary: 'POST /vendors', body: vendorCreateBody } } }, async (request, reply) => {
    const body = parseInput(vendorCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createVendor(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/vendors/:id', { ...write, config: { openapi: { summary: 'PATCH /vendors/:id', body: vendorPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(vendorPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateVendorRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.post('/vendors/:id/verify', { ...write, config: { openapi: { summary: 'POST /vendors/:id/verify', body: vendorVerifyBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const body = parseInput(vendorVerifyBody, request.body);
    const verified = await inTenant(options, request, (client, actor) =>
      verifyVendor(client, actor, id, body),
    );
    return ok(verified);
  });

  // Materials. Deactivated, not deleted (design point d).

  app.get('/materials', { ...read, config: { openapi: { summary: 'GET /materials', query: statusFilterQuery } } }, async (request) => {
    const status = statusOf(request);
    return ok(await inTenant(options, request, (client) => listMaterialRecords(client, status)));
  });

  app.post('/materials', { ...write, config: { openapi: { summary: 'POST /materials', body: materialCreateBody } } }, async (request, reply) => {
    const body = parseInput(materialCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createMaterial(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/materials/:id', { ...write, config: { openapi: { summary: 'PATCH /materials/:id', body: materialPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(materialPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateMaterialRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Equipment types. The code is fixed after create (design point e). Deactivated, not deleted.

  app.get('/equipment-types', { ...read, config: { openapi: { summary: 'GET /equipment-types', query: statusFilterQuery } } }, async (request) => {
    const active = activeOf(request);
    return ok(
      await inTenant(options, request, (client) => listEquipmentTypeRecords(client, active)),
    );
  });

  app.post('/equipment-types', { ...write, config: { openapi: { summary: 'POST /equipment-types', body: equipmentTypeCreateBody } } }, async (request, reply) => {
    const body = parseInput(equipmentTypeCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createEquipmentType(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/equipment-types/:id', { ...write, config: { openapi: { summary: 'PATCH /equipment-types/:id', body: equipmentTypePatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(equipmentTypePatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateEquipmentTypeRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Major material allocations. The project is fixed after create. Deleted when no longer needed (design point f).

  app.get('/major-material-allocations', { ...read, config: { openapi: { summary: 'GET /major-material-allocations', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectOf(request);
    return ok(
      await inTenant(options, request, (client) => listAllocationRecords(client, projectId)),
    );
  });

  app.post('/major-material-allocations', { ...write, config: { openapi: { summary: 'POST /major-material-allocations', body: allocationCreateBody } } }, async (request, reply) => {
    const body = parseInput(allocationCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createAllocation(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/major-material-allocations/:id', { ...write, config: { openapi: { summary: 'PATCH /major-material-allocations/:id', body: allocationPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(allocationPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateAllocationRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/major-material-allocations/:id', { ...write, config: { openapi: { summary: 'DELETE /major-material-allocations/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteAllocation(client, actor, id));
    return ok({ deleted: true });
  });

  // Equipment assignments. One row per project and equipment type. A PATCH changes qty only (design point g).

  app.get('/equipment-assignments', { ...read, config: { openapi: { summary: 'GET /equipment-assignments', query: projectFilterQuery } } }, async (request) => {
    const projectId = projectOf(request);
    return ok(
      await inTenant(options, request, (client) => listAssignmentRecords(client, projectId)),
    );
  });

  app.post('/equipment-assignments', { ...write, config: { openapi: { summary: 'POST /equipment-assignments', body: assignmentCreateBody } } }, async (request, reply) => {
    const body = parseInput(assignmentCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createAssignment(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/equipment-assignments/:id', { ...write, config: { openapi: { summary: 'PATCH /equipment-assignments/:id', body: assignmentPatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(assignmentPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateAssignmentRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  app.delete('/equipment-assignments/:id', { ...write, config: { openapi: { summary: 'DELETE /equipment-assignments/:id' } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await inTenant(options, request, (client, actor) => deleteAssignment(client, actor, id));
    return ok({ deleted: true });
  });

  // Plan lines. The project is fixed after create. Cancelling is a PATCH to status cancelled; no DELETE (design point i).

  app.get('/plan-lines', { ...read, config: { openapi: { summary: 'GET /plan-lines', query: planLineFilterQuery } } }, async (request) => {
    const filter = parseInput(planLineFilterQuery, request.query);
    return ok(
      await inTenant(options, request, (client) =>
        listPlanLineRecords(client, filter.projectId ?? null, filter.resourceKind ?? null),
      ),
    );
  });

  app.post('/plan-lines', { ...write, config: { openapi: { summary: 'POST /plan-lines', body: planLineCreateBody } } }, async (request, reply) => {
    const body = parseInput(planLineCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createPlanLine(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/plan-lines/:id', { ...write, config: { openapi: { summary: 'PATCH /plan-lines/:id', body: planLinePatchBody } } }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const patch = parseInput(planLinePatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updatePlanLineRecord(client, actor, id, patch),
    );
    return ok(updated);
  });

  // Stock levels (migration 0020). Reads need a signed-in user; writes need masters.manage, as the other masters writes.
  registerStockLevelRoutes(app, { ...options, managePrivilege: MASTERS_MANAGE });
}
