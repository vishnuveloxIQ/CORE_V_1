import type { Pool, PoolClient } from 'pg';
import { quoteIdent, tenantSchemaName } from './migrate.js';

/**
 * Runs `work` in one transaction whose search_path is the tenant schema only.
 * SET LOCAL ends with the transaction, so a pooled connection never keeps one tenant's path for the next request.
 * The tenant id must come from the verified session, never straight from request input.
 * Tables in another tenant can still be named with a schema prefix; stopping that needs per-tenant database roles.
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const schema = tenantSchemaName(tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${quoteIdent(schema)}`);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * True when the tenant's schema exists. Pre-login routes take the tenant from a header, so they check this before
 * withTenant: an unknown tenant must get the same answer as an unknown login, not a database error.
 */
export async function tenantExists(pool: Pool, tenantId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [
    tenantSchemaName(tenantId),
  ]);
  return rows.length > 0;
}

/**
 * Takes a transaction-scoped advisory lock keyed by the tenant schema and `name`.
 * Use inside withTenant so that two writers in the same tenant run one after the other.
 */
export async function lockWithinSchema(client: PoolClient, name: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':' || $1))`, [
    name,
  ]);
}
