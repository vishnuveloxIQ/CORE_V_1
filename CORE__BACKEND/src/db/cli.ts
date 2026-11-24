import { loadEnv } from '../config/env.js';
import { createPool } from './client.js';
import { migrateAll, provisionTenant } from './migrate.js';

const USAGE = `Usage:
  npm run db:migrate                 apply pending migrations to the database and every tenant schema
  npm run db:provision -- <tenantId> create tenant_<tenantId> and apply the Core tenant migration`;

/** Entry point for `npm run db:migrate` and `npm run db:provision`. */
async function main(): Promise<void> {
  const [command, tenantId] = process.argv.slice(2);
  if (command !== 'migrate' && command !== 'provision') {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (command === 'provision' && !tenantId) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const env = loadEnv();
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
    process.exitCode = 1;
    return;
  }

  const pool = createPool(env.DATABASE_URL, 1);
  try {
    if (command === 'provision' && tenantId) {
      const outcome = await provisionTenant(pool, tenantId);
      console.log(`tenant_${tenantId}: ${outcome}`);
    } else {
      const result = await migrateAll(pool);
      console.log(`global: ${result.global}`);
      const tenants = Object.entries(result.tenants);
      for (const [id, outcome] of tenants) {
        console.log(`tenant_${id}: ${outcome}`);
      }
      if (tenants.length === 0) {
        console.log('no tenant schemas found');
      }
    }
  } catch (err) {
    // Report the message only. Driver errors can be long, and the connection string is never printed.
    console.error(`Migration failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
