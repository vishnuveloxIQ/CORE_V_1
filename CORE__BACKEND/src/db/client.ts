import { Pool } from 'pg';

/** How long to wait for a database connection before failing the request (CORE-16-07). */
export const CONNECT_TIMEOUT_MS = 5_000;
/** How long an unused pooled connection is kept before it is closed. */
export const IDLE_TIMEOUT_MS = 30_000;

/**
 * Creates the node-postgres connection pool: one per process, plain SQL, no ORM. A connection attempt fails after
 * CONNECT_TIMEOUT_MS instead of hanging while the database is down or unreachable. TLS follows the connection
 * string (for example `?sslmode=require`), so each environment sets its own rule. Pool errors are handled by pg's
 * default listeners; callers must call `pool.end()` on shutdown.
 */
export function createPool(connectionString: string, max = 10, connectTimeoutMs = CONNECT_TIMEOUT_MS): Pool {
  return new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: connectTimeoutMs,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
}
