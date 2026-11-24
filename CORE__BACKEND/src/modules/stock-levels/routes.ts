import type { CoreApp } from '../../http/app.js';
import { guardRoute, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { rowById } from '../../core/detail.js';
import { idParamsSchema } from '../../core/resource.js';
import { parseInput } from '../../core/validation.js';
import {
  stockFilterQuery,
  stockLevelCreateBody,
  stockLevelIdParams,
  stockLevelPatchBody,
} from './schema.js';
import { listStockLevels, patchStockLevel, setStockLevel } from './service.js';

export interface StockLevelRouteOptions extends RouteOptions {
  /** The privilege for POST and PATCH. Passed in by the masters module, which owns masters.manage. */
  managePrivilege: string;
}

/**
 * Stock level routes (migration 0020). GET needs a signed-in user. POST and PATCH need the manage privilege at
 * company scope and an Idempotency-Key header. POST creates the row for a store and material, or sets it when
 * the row exists.
 */
export function registerStockLevelRoutes(
  app: CoreApp,
  options: StockLevelRouteOptions,
): void {
  const read = guardRoute(options, null);
  const write = guardRoute(options, options.managePrivilege);

  app.get('/stock-levels/:id', read, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listStockLevels(client, { storeId: null, materialId: null }));
    return ok(rowById(rows, id, 'Stock level'));
  });

  app.get('/stock-levels', { ...read, config: { openapi: { summary: 'GET /stock-levels', query: stockFilterQuery } } }, async (request) => {
    const filter = parseInput(stockFilterQuery, request.query);
    return ok(
      await inTenant(options, request, (client) =>
        listStockLevels(client, {
          storeId: filter.storeId ?? null,
          materialId: filter.materialId ?? null,
        }),
      ),
    );
  });

  app.post('/stock-levels', { ...write, config: { openapi: { summary: 'POST /stock-levels', body: stockLevelCreateBody } } }, async (request, reply) => {
    const body = parseInput(stockLevelCreateBody, request.body);
    const { row, created } = await inTenant(options, request, (client, actor) =>
      setStockLevel(client, actor, body),
    );
    return reply.code(created ? 201 : 200).send(ok(row));
  });

  app.patch('/stock-levels/:id', { ...write, config: { openapi: { summary: 'PATCH /stock-levels/:id', body: stockLevelPatchBody } } }, async (request) => {
    const { id } = parseInput(stockLevelIdParams, request.params);
    const body = parseInput(stockLevelPatchBody, request.body);
    const updated = await inTenant(options, request, (client, actor) =>
      patchStockLevel(client, actor, id, body),
    );
    return ok(updated);
  });
}
