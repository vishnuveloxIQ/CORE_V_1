import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/client.js';
import { stableJson } from './api-contract.js';

/**
 * `npm run api:snapshot`: writes the current OpenAPI document to docs/api/openapi-v1.json, the locked v1 contract.
 * Run it only for a change that docs/API_V1.md allows (an addition, with a minor version bump). The lock test
 * (tests/regression/api-v1-lock.test.ts) fails until the snapshot and the code agree.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. The module routes register only with a database pool.');
    process.exitCode = 1;
    return;
  }
  const pool = createPool(env.DATABASE_URL, 2);
  const app = buildApp({ env: { ...env, LOG_LEVEL: 'silent' }, pool });
  try {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    if (res.statusCode !== 200) throw new Error(`GET /openapi.json answered ${res.statusCode}`);
    const doc = res.json() as { info: { version: string }; paths: Record<string, Record<string, unknown>> };
    const count = Object.values(doc.paths).reduce((n, methods) => n + Object.keys(methods).length, 0);
    writeFileSync(new URL('../docs/api/openapi-v1.json', import.meta.url), stableJson(doc));
    console.log(`wrote docs/api/openapi-v1.json: version ${doc.info.version}, ${count} operations`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'snapshot failed');
    process.exitCode = 1;
  } finally {
    await app.close();
    await pool.end();
  }
}

await main();
