import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// CORE-25-06 and 25-08: tenant-scoped search across master records, bounded, with hostile input refused or made
// harmless. Example data is fictional.

const data = <T>(res: Reply) => (res.json() as { data: T }).data;
interface Hit { type: string; id: string; code: string; label: string }

describe.skipIf(!TEST_DATABASE_URL)('search', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let acme: string;
  let beta: string;
  const tag = randomUUID().slice(0, 6).toUpperCase();

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme', 'beta']);
    app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET }), pool: db.pool });
    const signInManager = async (tenant: 'acme' | 'beta') => {
      const login = uniqueLogin(`srch-${tenant}`);
      await seedUser(db.pool, `tenant_${tenant}`, login);
      await grant(db.pool, tenant, login, PROJECTS_MANAGE);
      await grant(db.pool, tenant, login, MASTERS_MANAGE);
      return signIn(app, tenant, login);
    };
    acme = await signInManager('acme');
    beta = await signInManager('beta');
    await call(app, 'POST', '/projects', acme, { code: `NH${tag}`, name: 'Fictional Highway Package' });
    await call(app, 'POST', '/projects', acme, { code: `BR${tag}`, name: `Bridge near NH${tag} junction` });
    await call(app, 'POST', '/vendors', acme, { code: `VEN${tag}`, name: 'Highway Supplies 100% Co' });
    await call(app, 'POST', '/projects', beta, { code: `NHB${tag}`, name: 'Beta Highway' });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('finds records by code or name, exact code first, across types', async () => {
    const res = await call(app, 'GET', `/search?q=NH${tag}`, acme);
    expect(res.statusCode, res.body).toBe(200);
    const hits = data<Hit[]>(res);
    expect(hits[0]).toMatchObject({ type: 'project', code: `NH${tag}` });
    expect(hits.map((h) => h.code)).toContain(`BR${tag}`);
    const vendors = data<Hit[]>(await call(app, 'GET', '/search?q=highway&types=vendor', acme));
    expect(vendors.every((h) => h.type === 'vendor')).toBe(true);
    expect(vendors.map((h) => h.code)).toContain(`VEN${tag}`);
  });

  it('never returns another tenant\'s records', async () => {
    const hits = data<Hit[]>(await call(app, 'GET', `/search?q=${tag}`, acme));
    expect(hits.some((h) => h.code === `NHB${tag}`)).toBe(false);
    const theirs = data<Hit[]>(await call(app, 'GET', `/search?q=${tag}`, beta));
    expect(theirs.map((h) => h.code)).toEqual([`NHB${tag}`]);
  });

  it('treats wildcards and SQL as plain text, bounds the page, and refuses bad input', async () => {
    expect(data<Hit[]>(await call(app, 'GET', '/search?q=100%25', acme)).map((h) => h.code)).toContain(`VEN${tag}`);
    expect(data<Hit[]>(await call(app, 'GET', '/search?q=%25%25', acme))).toEqual([]);
    const injection = await call(app, 'GET', `/search?q=${encodeURIComponent("x' OR '1'='1")}`, acme);
    expect(injection.statusCode).toBe(200);
    expect(data<Hit[]>(injection)).toEqual([]);
    expect(data<Hit[]>(await call(app, 'GET', '/search?q=highway&limit=1&types=project', acme))).toHaveLength(1);
    expect((await call(app, 'GET', '/search?q=a', acme)).statusCode).toBe(400);
    expect((await call(app, 'GET', '/search?q=highway&limit=500', acme)).statusCode).toBe(400);
    expect((await call(app, 'GET', '/search?q=highway&types=users', acme)).statusCode).toBe(400);
    expect((await call(app, 'GET', '/search?q=highway', null)).statusCode).toBe(401);
  });
});
