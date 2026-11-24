import type { CoreApp } from '../../http/app.js';
import { guardRoute, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { idParamsSchema } from '../../core/resource.js';
import { parseInput } from '../../core/validation.js';
import { MASTERS_MANAGE } from '../masters/routes.js';
import { unitCreateBody, unitFilterQuery, unitIdParams, unitPatchBody } from './schema.js';
import { createUnit, listUnitRecords, updateUnitRecord } from './service.js';

/**
 * Equipment unit register (migration 0022). GET needs a signed-in user, with the filters equipmentTypeId, status
 * (availability) and search (asset code). POST and PATCH need masters.manage at company scope and an
 * Idempotency-Key header. There is no DELETE: a unit is retired by setting its availability. PATCH needs rowVersion.
 */
export function registerEquipmentUnitRoutes(app: CoreApp, options: RouteOptions): void {
  const read = guardRoute(options, null);
  const write = guardRoute(options, MASTERS_MANAGE);

  app.get('/equipment-units/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listUnitRecords(client, {}));
    return ok(rowById(rows, id, 'Equipment unit'));
  });

  app.get('/equipment-units', { ...read, config: { openapi: { summary: 'GET /equipment-units', query: unitFilterQuery } } }, async (request) => {
    const filter = parseInput(unitFilterQuery, request.query);
    return ok(await inTenant(options, request, (client) => listUnitRecords(client, filter)));
  });

  app.post('/equipment-units', { ...write, config: { openapi: { summary: 'POST /equipment-units', body: unitCreateBody } } }, async (request, reply) => {
    const body = parseInput(unitCreateBody, request.body);
    const created = await inTenant(options, request, (client, actor) =>
      createUnit(client, actor, body),
    );
    return reply.code(201).send(ok(created));
  });

  app.patch('/equipment-units/:id', { ...write, config: { openapi: { summary: 'PATCH /equipment-units/:id', body: unitPatchBody } } }, async (request) => {
    const { id } = parseInput(unitIdParams, request.params);
    const patch = parseInput(unitPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      updateUnitRecord(client, actor, id, patch),
    );
    return ok(updated);
  });
}
