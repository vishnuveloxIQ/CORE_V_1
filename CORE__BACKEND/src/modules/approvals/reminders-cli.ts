import { loadEnv } from '../../config/env.js';
import { createPool } from '../../db/client.js';
import { remindAllTenants } from './reminders.js';

/** `npm run approvals:remind`: one reminder sweep across every tenant, for an external scheduler such as cron. */
const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
  process.exit(1);
}
const pool = createPool(env.DATABASE_URL, 2);
try {
  const results = await remindAllTenants(pool, new Date(), (tenant, err) =>
    console.error(`tenant ${tenant}: ${err instanceof Error ? err.message : String(err)}`),
  );
  for (const r of results) console.log(`${r.tenant}: ${r.reminded} reminder(s)`);
} finally {
  await pool.end();
}
