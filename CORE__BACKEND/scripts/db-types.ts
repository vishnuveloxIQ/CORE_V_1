import { writeFileSync } from 'node:fs';
import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/client.js';
import { generateDbTypes } from '../src/db/types-gen.js';

/** `npm run db:types`: writes src/db/types.generated.ts from the database in DATABASE_URL (after db:migrate). */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exitCode = 1;
    return;
  }
  const pool = createPool(env.DATABASE_URL, 1);
  try {
    const text = await generateDbTypes(pool, process.argv[2] ?? 'acme');
    writeFileSync(new URL('../src/db/types.generated.ts', import.meta.url), text);
    console.log(`wrote src/db/types.generated.ts (${(text.match(/export interface/g) ?? []).length} tables)`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'type generation failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
