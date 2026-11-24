import type { CoreApp } from '../../http/app.js';
import type { PoolClient } from 'pg';
import { guardRoute, idParamsSchema, inTenant, type RouteOptions } from '../../core/resource.js';
import { rowById } from '../../core/detail.js';
import { many } from '../../core/rows.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';

/** One unit of measure from shared.uom, in API shape. */
export interface UomRecord {
  id: string;
  code: string;
  name: string;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Units of measure (shared.uom, global migration 0001). Read only: Core reads this table but does not own it
 * (Platform Administration does), so there is no create, update or delete route here. GET needs a signed-in user
 * and returns every unit, sorted by name. GET /uoms/:id returns one unit from the same rows.
 */
export function registerUomRoutes(app: CoreApp, options: RouteOptions): void {
  app.get('/uoms', guardRoute(options, null), async (request) =>
    ok(await inTenant(options, request, (client) => listUnits(client))),
  );

  app.get('/uoms/:id', guardRoute(options, null), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listUnits(client));
    return ok(rowById(rows, id, 'Unit of measure'));
  });
}

function listUnits(client: PoolClient): Promise<UomRecord[]> {
  return many<UomRecord>(
    client,
    `SELECT id, uom_code AS code, uom_name AS name, row_version AS "rowVersion",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM shared.uom ORDER BY uom_name, uom_code`,
    [],
  );
}
