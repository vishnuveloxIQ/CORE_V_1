import { loadEnv } from '../config/env.js';
import { createPool } from './client.js';
import { createDevUser } from './dev-user.js';

const USAGE = `Usage:
  SEED_PASSWORD=<password> npm run dev:seed-user -- <tenantId> <loginId> [privilege]
      creates an active user in tenant_<tenantId> for local testing (not available in production).
      Optional privilege, for example access.manage, is granted at once.
      The name comes from DEV_USER_NAME (default "Dev User"). The password is read from SEED_PASSWORD only.`;

/** Entry point for `npm run dev:seed-user`. */
async function main(): Promise<void> {
  const [tenantId, loginId, privilege] = process.argv.slice(2);
  const password = process.env.SEED_PASSWORD;
  if (!tenantId || !loginId) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (!password) {
    console.error('SEED_PASSWORD is not set. Set it in the shell for this command only.');
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
    await createDevUser(pool, {
      tenantId,
      loginId,
      name: process.env.DEV_USER_NAME ?? 'Dev User',
      password,
      ...(privilege ? { privilege } : {}),
    });
    console.log(
      `created user ${loginId} in tenant_${tenantId}${privilege ? ` with ${privilege}` : ''}`,
    );
  } catch (err) {
    // Report the message only. Never print the password or the connection string.
    console.error(`Seed failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
