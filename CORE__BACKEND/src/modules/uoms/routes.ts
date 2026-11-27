import type { CoreApp } from '../../http/app.js';
import type { PoolClient } from 'pg';
import { guardRoute, idParamsSchema, inTenant, type RouteOptions } from '../../core/resource.js';
import { rowById } from '../../core/detail.js';
import { many } from '../../core/rows.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { MASTERS_MANAGE } from '../masters/routes.js';

/** POST /uoms: a unit typed for a material whose category has no fixed unit. */
export const uomCreateBody = z
  .object({
    code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9][A-Za-z0-9 ./()-]*$/, 'Use letters, digits, spaces and . / ( ) -'),
    name: z.string().trim().min(1).max(60),
  })
  .strict();

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

  // A unit of measure typed for a material. Writes need masters.manage (the same privilege as the other master data).
  app.post('/uoms', guardRoute(options, MASTERS_MANAGE, { summary: 'POST /uoms', body: uomCreateBody }), async (request, reply) => {
    const body = parseInput(uomCreateBody, request.body);
    const unit = await inTenant(options, request, (client, actor) => createUnit(client, actor.actorId, body));
    return reply.code(201).send(ok(unit));
  });

  app.get('/uoms/:id', guardRoute(options, null), async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const rows = await inTenant(options, request, (client) => listUnits(client));
    return ok(rowById(rows, id, 'Unit of measure'));
  });
}

async function createUnit(client: PoolClient, actorId: string | null, input: { code: string; name: string }): Promise<UomRecord> {
  const taken = await many<{ n: number }>(client, 'SELECT 1 AS n FROM shared.uom WHERE lower(uom_code) = lower($1)', [input.code]);
  if (taken.length > 0) throw new AppError('CONFLICT', 409, 'A unit with this code already exists');
  const [row] = await many<UomRecord>(
    client,
    `INSERT INTO shared.uom (uom_code, uom_name, created_by, updated_by) VALUES ($1, $2, $3, $3)
     RETURNING id, uom_code AS code, uom_name AS name, row_version AS "rowVersion",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [input.code, input.name, actorId],
  );
  if (!row) throw new AppError('INTERNAL_ERROR', 500, 'The unit was not saved');
  return row;
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
