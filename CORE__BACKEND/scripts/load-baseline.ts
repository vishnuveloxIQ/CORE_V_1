import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { hashSecret } from '../src/core/password.js';
import { enqueueOutbound } from '../src/core/events.js';
import { MockPublisher, relayTenant } from '../src/core/relay.js';
import { withTenant } from '../src/db/tenant.js';
import { grantPrivilegeByLogin } from '../src/modules/access/bootstrap.js';
import { createTestDatabase } from '../tests/db/helpers.js';

/**
 * CORE-27-05 / 27-06: a local performance baseline. It starts the real HTTP server on this machine against a fresh,
 * throwaway database (never the dev data), signs in fictional users and measures, workload by workload, throughput,
 * p50/p95/p99 latency and errors at a fixed concurrency. It also measures the outbox relay. It is NOT the staging
 * load test the schedule asks for (staging does not exist yet, blocker B1); compare its numbers with the provisional
 * targets in decision D19, and repeat on staging.
 *
 *   npm run load:baseline -- [concurrency=50] [requests=400] [out=evidence.json]
 */

const concurrency = Number(process.argv[2] ?? 50);
const perWorkload = Number(process.argv[3] ?? 400);
const out = process.argv[4];
const PASSWORD = 'Load-Baseline-Passphrase-7';

interface Stats { workload: string; requests: number; concurrency: number; errors: number; seconds: number; perSecond: number; p50: number; p95: number; p99: number; max: number }

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
const round = (n: number) => Math.round(n * 10) / 10;

async function run(name: string, total: number, width: number, one: (i: number) => Promise<boolean>): Promise<Stats> {
  const times: number[] = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < total) {
      const i = next++;
      const t = performance.now();
      const okay = await one(i).catch(() => false);
      times.push(performance.now() - t);
      if (!okay) errors += 1;
    }
  }));
  const seconds = (performance.now() - started) / 1000;
  times.sort((a, b) => a - b);
  return { workload: name, requests: total, concurrency: width, errors, seconds: round(seconds), perSecond: round(total / seconds), p50: round(pct(times, 50)), p95: round(pct(times, 95)), p99: round(pct(times, 99)), max: round(times.at(-1) ?? 0) };
}

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');
const db = await createTestDatabase(env.DATABASE_URL, ['acme']);
const app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: randomUUID() + randomUUID(), SESSION_DEVICE_LIMIT: '100' }), pool: db.pool, globalRateLimit: { limit: 1_000_000, windowMs: 60_000 } });
try {
  const address = (await app.listen({ host: '127.0.0.1', port: 0 })) as unknown as string | AddressInfo;
  const base = typeof address === 'string' ? address.replace(/\/$/, '') : `http://127.0.0.1:${address.port}`;
  const hash = await hashSecret(PASSWORD);
  const logins = Array.from({ length: 20 }, (_, i) => `LOAD${String(1000 + i)}`);
  for (const login of logins) {
    await db.pool.query(`INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count) VALUES ($1, 'Load User', 'active', $2, 0)`, [login, hash]);
  }
  await grantPrivilegeByLogin(db.pool, { tenantId: 'acme', loginId: logins[0]!, privilege: 'projects.manage' });
  const signIn = async (login: string) => {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': 'acme' }, body: JSON.stringify({ loginId: login, password: PASSWORD }) });
    if (!res.ok) return null;
    return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
  };
  const token = (await signIn(logins[0]!))!;
  const auth = { authorization: `Bearer ${token}` };
  // fixture data: 300 projects, so list and search have work to do
  for (let i = 0; i < 300; i += 1) {
    await fetch(`${base}/projects`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ code: `PRJ${i}`, name: `Fictional project ${i} highway package` }) });
  }

  const results: Stats[] = [];
  results.push(await run('sign-in (password)', Math.min(perWorkload, 100), Math.min(concurrency, 20), async (i) => (await signIn(logins[i % logins.length]!)) !== null));
  results.push(await run('GET /projects (300 rows)', perWorkload, concurrency, async () => (await fetch(`${base}/projects`, { headers: auth })).ok));
  results.push(await run('GET /search?q=highway', perWorkload, concurrency, async () => (await fetch(`${base}/search?q=highway`, { headers: auth })).ok));
  results.push(await run('POST /projects (write)', perWorkload, concurrency, async (i) =>
    (await fetch(`${base}/projects`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ code: `W${i}${randomUUID().slice(0, 4)}`, name: 'Load write' }) })).status === 201));
  results.push(await run('GET /health/ready', perWorkload, concurrency, async () => (await fetch(`${base}/health/ready`)).ok));

  // outbox relay throughput: 1,000 events across 100 aggregates, sent through the mock transport
  for (let a = 0; a < 100; a += 1) {
    const aggregateId = randomUUID();
    await withTenant(db.pool, 'acme', async (client) => {
      for (let n = 0; n < 10; n += 1) await enqueueOutbound(client, { eventId: randomUUID(), eventType: 'load.test', eventVersion: '1', aggregateType: 'load', aggregateId, occurredAt: new Date().toISOString(), payload: {}, schemaVersion: '1', sourceModule: 'core' });
    });
  }
  const publisher = new MockPublisher();
  const t = performance.now();
  await Promise.all([1, 2, 3, 4].map(() => relayTenant(db.pool, 'acme', publisher, { maxAttempts: 3, baseDelaySeconds: 1, factor: 2, maxDelaySeconds: 10 }, { batch: 1000 })));
  const relaySeconds = (performance.now() - t) / 1000;
  const relay = { events: publisher.sent.length, relays: 4, seconds: round(relaySeconds), perSecond: round(publisher.sent.length / relaySeconds) };

  const pool = { total: db.pool.totalCount, idle: db.pool.idleCount, waiting: db.pool.waitingCount };
  const summary = { ranAt: new Date().toISOString(), where: 'local machine, HTTP server and PostgreSQL on localhost (not staging)', node: process.version, results, relay, poolAfter: pool };
  console.table(results);
  console.log('relay', relay, 'pool after', pool);
  if (out) writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await app.close();
  await db.drop();
}
