import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import {
  call as callApp,
  grant,
  JWT_SECRET,
  seedUser,
  signIn,
  uniqueLogin,
} from '../testing-pass/helpers.js';

// GET /uoms: a read-only view of shared.uom, which Platform Administration owns. Core has no write route for it.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface UomRow {
  id: string;
  code: string;
  name: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('units of measure (GET /uoms)', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });
  const tag = randomUUID().slice(0, 6).toUpperCase();

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
    await db.pool.query(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, 'Metre'), ($2, 'Bag'), ($3, 'Kilogram')`,
      [`M-${tag}`, `BAG-${tag}`, `KG-${tag}`],
    );
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  beforeEach(() => {
    app = buildApp({ env, pool: db.pool });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function tokenWith(privileges: string[]): Promise<string> {
    const loginId = uniqueLogin('uom-user');
    await seedUser(db.pool, SCHEMA, loginId);
    for (const privilege of privileges) await grant(db.pool, TENANT, loginId, privilege);
    return signIn(app!, TENANT, loginId);
  }

  it('lists every unit for a plain signed-in user, sorted by name', async () => {
    const token = await tokenWith([]);
    const res = await callApp(app!, 'GET', '/uoms', token);
    expect(res.statusCode, res.body).toBe(200);
    const rows = (res.json() as { data: UomRow[] }).data;
    const mine = rows.filter((r) => r.code.endsWith(tag));
    expect(mine.map((r) => [r.code, r.name])).toEqual([
      [`BAG-${tag}`, 'Bag'],
      [`KG-${tag}`, 'Kilogram'],
      [`M-${tag}`, 'Metre'],
    ]);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(Object.keys(mine[0]!).sort()).toEqual(
      ['code', 'createdAt', 'id', 'name', 'rowVersion', 'updatedAt'].sort(),
    );
  });

  it('refuses an anonymous read with 401', async () => {
    const res = await callApp(app!, 'GET', '/uoms', null);
    expect(res.statusCode).toBe(401);
  });

  it('has no write routes, even for masters.manage', async () => {
    const token = await tokenWith([MASTERS_MANAGE]);
    const post = await callApp(app!, 'POST', '/uoms', token, { code: 'X', name: 'X' });
    expect(post.statusCode).toBe(404);
    const patch = await callApp(app!, 'PATCH', `/uoms/${randomUUID()}`, token, { rowVersion: 1 });
    expect(patch.statusCode).toBe(404);
  });
});
