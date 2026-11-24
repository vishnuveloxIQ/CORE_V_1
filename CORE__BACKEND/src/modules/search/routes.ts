import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { CoreApp } from '../../http/app.js';
import { guardRoute, inTenant, type RouteOptions } from '../../core/resource.js';
import { ok } from '../../core/response.js';
import { many } from '../../core/rows.js';
import { parseInput } from '../../core/validation.js';

/**
 * CORE-25-06: one search box across Core's master records, for any signed-in user. It runs in the signed-in tenant's
 * schema only, takes a bounded text (2 to 100 characters, wildcards escaped, sent as a parameter, never spliced into
 * SQL) and returns at most `limit` matches per record type. There is no cache (decision D18): results are always read
 * fresh. Users are not searched here, because listing users needs access.manage.
 */

export const SEARCH_TYPES = ['project', 'location', 'store', 'material', 'vendor', 'equipment'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const searchQuery = z.object({
  q: z.string().trim().min(2, 'at least 2 characters').max(100),
  types: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return [...SEARCH_TYPES];
      const list = v.split(',').map((t) => t.trim()).filter(Boolean);
      const bad = list.filter((t) => !(SEARCH_TYPES as readonly string[]).includes(t));
      if (bad.length) ctx.addIssue({ code: 'custom', message: `unknown type: ${bad.join(', ')}` });
      return list as SearchType[];
    }),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export interface SearchHit {
  type: SearchType;
  id: string;
  code: string | null;
  label: string;
  rank: number;
}

/** Table, code column and label column per type. Constants only: never built from input. */
const SOURCES: Record<SearchType, { table: string; code: string; label: string }> = {
  project: { table: 'core_project', code: 'code', label: 'name' },
  location: { table: 'core_location', code: 'code', label: 'name' },
  store: { table: 'core_store', code: 'code', label: 'name' },
  material: { table: 'core_material', code: 'code', label: 'name' },
  vendor: { table: 'core_vendor', code: 'code', label: 'name' },
  equipment: { table: 'core_equipment_unit', code: 'asset_code', label: 'COALESCE(name, asset_code)' },
};

/**
 * Matches by code or name, case-insensitively. Exact codes rank first, then codes and names that start with the
 * text, then any other match.
 */
export async function search(client: PoolClient, q: { q: string; types: SearchType[]; limit: number }): Promise<SearchHit[]> {
  const contains = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const prefix = `${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const hits: SearchHit[] = [];
  for (const type of q.types) {
    const s = SOURCES[type];
    const rows = await many<SearchHit>(
      client,
      `SELECT $1::text AS type, id, ${s.code}::text AS code, ${s.label}::text AS label,
              CASE WHEN lower(${s.code}::text) = lower($2) THEN 0
                   WHEN ${s.code}::text ILIKE $3 OR (${s.label})::text ILIKE $3 THEN 1 ELSE 2 END AS rank
         FROM ${s.table}
        WHERE ${s.code}::text ILIKE $4 OR (${s.label})::text ILIKE $4
        ORDER BY rank, ${s.code}
        LIMIT $5`,
      [type, q.q, prefix, contains, q.limit],
    );
    hits.push(...rows);
  }
  return hits.sort((a, b) => a.rank - b.rank);
}

export function registerSearchRoutes(app: CoreApp, options: RouteOptions): void {
  app.get('/search', guardRoute(options, null, { summary: 'GET /search', query: searchQuery }), async (request) => {
    const query = parseInput(searchQuery, request.query);
    return ok(await inTenant(options, request, (client) => search(client, query)));
  });
}
