import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/client.js';
import { migrateGlobal, provisionTenant } from '../../src/db/migrate.js';

// Load the local test connection string when present. Real environment variables take precedence.
try {
  process.loadEnvFile('.env.test');
} catch {
  // No .env.test: database tests are skipped.
}

/**
 * The owner account (velox_core). It creates and drops test databases, runs the migrations and applies the grants.
 * MIGRATION_DATABASE_URL is preferred; DATABASE_URL is the fallback when no separate owner URL is set.
 */
export const TEST_DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Optional: the application's own login (core_app_login). When set, the tests use each test database through this
 * login, with the grants from scripts/admin/grant-core-app-tables.sql, so the permissions are really exercised.
 * Unset, the tests use the owner account as before.
 */
export const APP_TEST_DATABASE_URL = process.env.APP_TEST_DATABASE_URL;

const GRANTS_FILE = fileURLToPath(new URL('../../scripts/admin/grant-core-app-tables.sql', import.meta.url));

export interface TestDatabase {
  /** The application's connection: the app login when APP_TEST_DATABASE_URL is set, otherwise the owner. */
  pool: Pool;
  /** The owner's connection to this database, for setup that the app login must not do (DDL, seeding shared.uom). */
  owner: Pool;
  /** Connection string of the application connection. Never print it. */
  url: string;
  /** Connection string of the owner. Backup, restore and the restore drill are admin operations, so they use this. */
  ownerUrl: string;
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

  // the owner's pool: creates the schema, runs the migrations and applies the grants
  const ownerUrl = new URL(baseUrl);
  ownerUrl.pathname = `/${name}`;
  const owner = createPool(ownerUrl.toString(), 4);

  // the application's pool: the app login when one is configured, otherwise the owner (as before)
  let pool = owner;
  let url = ownerUrl.toString();
  let appPool: Pool | undefined;
  if (APP_TEST_DATABASE_URL) {
    const appUrl = new URL(APP_TEST_DATABASE_URL);
    appUrl.pathname = `/${name}`;
    appPool = createPool(appUrl.toString(), 4);
    pool = appPool;
    url = appUrl.toString();
  }

  const drop = async (): Promise<void> => {
    // DROP ... WITH (FORCE) terminates any connection that is still closing (57P01). That is expected here, and a
    // pool without an error listener would turn it into an uncaught error that fails an unrelated test file.
    // Any other connection error is still raised.
    for (const p of [owner, appPool]) {
      p?.on('error', (err) => {
        if ((err as { code?: string }).code !== '57P01') throw err;
      });
    }
    await appPool?.end();
    await owner.end();
    await dropDatabase(admin, name);
    await admin.end();
  };

  try {
    await migrateGlobal(owner);
    for (const tenant of tenants) {
      await provisionTenant(owner, tenant);
    }
    if (appPool) {
      // the same grants production gets from an administrator, applied to this database as the owner
      await owner.query(readFileSync(GRANTS_FILE, 'utf8'));
    }
  } catch (err) {
    await drop();
    throw err;
  }
  return { pool, owner, url, ownerUrl: ownerUrl.toString(), drop };
}
