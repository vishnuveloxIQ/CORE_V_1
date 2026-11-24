import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/client.js';
import { migrateGlobal, provisionTenant } from '../../src/db/migrate.js';

// Load the local test connection string when present. Real environment variables take precedence.
try {
  process.loadEnvFile('.env.test');
} catch {
  // No .env.test: database tests are skipped.
}

export const TEST_DATABASE_URL = process.env.DATABASE_URL;

export interface TestDatabase {
  pool: Pool;
  /** Connection string of this test database. Never print it. */
  url: string;
  /** Closes the pool and drops the database. */
  drop: () => Promise<void>;
}

/**
 * Drops a test database. The test role is not a superuser. A superuser-owned background process (such as an
 * autovacuum worker) can be attached to a new database for a moment, and FORCE cannot terminate it, so the drop is
 * retried briefly until that process exits. Other errors are thrown at once.
 */
export async function dropDatabase(admin: Pool, name: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const transient = /permission denied to terminate|being accessed by other users/.test(message);
      if (!transient || attempt >= 10) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
}

/**
 * Creates a fresh database with the global migration and the given tenant schemas.
 * The shared test database is never modified by tests; each test file gets its own database.
 */
export async function createTestDatabase(
  baseUrl: string,
  tenants: string[],
): Promise<TestDatabase> {
  const name = `velox_test_${randomBytes(6).toString('hex')}`;
  const admin = createPool(baseUrl, 1);
  await admin.query(`CREATE DATABASE "${name}"`);

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString(), 4);

  const drop = async (): Promise<void> => {
    // DROP ... WITH (FORCE) terminates any connection that is still closing (57P01). That is expected here, and a
    // pool without an error listener would turn it into an uncaught error that fails an unrelated test file.
    // Any other connection error is still raised.
    pool.on('error', (err) => {
      if ((err as { code?: string }).code !== '57P01') throw err;
    });
    await pool.end();
    await dropDatabase(admin, name);
    await admin.end();
  };

  try {
    await migrateGlobal(pool);
    for (const tenant of tenants) {
      await provisionTenant(pool, tenant);
    }
  } catch (err) {
    await drop();
    throw err;
  }
  return { pool, url: url.toString(), drop };
}
