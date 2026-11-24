import { loadEnv } from '../../config/env.js';
import { createPool } from '../../db/client.js';
import { grantPrivilegeByLogin } from './bootstrap.js';

const USAGE = `Usage:
  npm run access:grant -- <tenantId> <loginId> <privilege>
      grants a privilege (for example access.manage) to a user in tenant_<tenantId>, and writes an audit row`;

/** Entry point for `npm run access:grant`. Used once, to create the first access.manage holder. */
async function main(): Promise<void> {
  const [tenantId, loginId, privilege] = process.argv.slice(2);
  if (!tenantId || !loginId || !privilege) {
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
    await grantPrivilegeByLogin(pool, { tenantId, loginId, privilege });
    console.log(`granted ${privilege} to ${loginId} in tenant_${tenantId}`);
  } catch (err) {
    // Report the message only, as the migration CLI does. Driver errors can be long; the connection string is never printed.
    console.error(`Grant failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
