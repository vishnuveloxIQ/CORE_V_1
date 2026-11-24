import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Bill of Quantities rules (migration 0035, src/modules/boq). The shared master-data behaviour (auth, privilege,
// versioning, 404s) is in tests/regression/masters-contract.test.ts. Example data is fictional.

const SLOW_TEST_MS = 60_000;
const code = (prefix: string) => `${prefix}-${randomUUID().slice(0, 6).toUpperCase()}`;

interface Item {
  id: string;
  projectId: string;
  itemCode: string;
  wbsNodeId: string | null;
  quantity: number;
  rate: number;
  amount: number;
  status: string;
  rowVersion: number;
}

interface ErrorBody {
  code?: string;
  details?: { issues?: Array<{ path: string }> };
}

const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;
const errorOf = (reply: Reply) => (reply.json() as { error?: ErrorBody }).error;

describe.skipIf(!TEST_DATABASE_URL)('Bill of Quantities', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let plain: string;
  let uomId: string;
  let projectA: string;
  let projectB: string;
  let wbsA: string;
  let wbsB: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool });
    const managerLogin = uniqueLogin('boq-manager');
    await seedUser(db.pool, 'tenant_acme', managerLogin);
    await grant(db.pool, 'acme', managerLogin, PROJECTS_MANAGE);
    manager = await signIn(app, 'acme', managerLogin);
    const plainLogin = uniqueLogin('boq-plain');
    await seedUser(db.pool, 'tenant_acme', plainLogin);
    plain = await signIn(app, 'acme', plainLogin);

    const uom = await db.pool.query<{ id: string }>(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ('CUM', 'Cubic metre') RETURNING id`,
    );
    uomId = uom.rows[0]!.id;
    const make = async (path: string, body: object) => {
      const res = await call(app, 'POST', path, manager, body);
      expect(res.statusCode, `${path}: ${res.body}`).toBe(201);
      return dataOf<{ id: string }>(res).id;
    };
    projectA = await make('/projects', { code: code('PA'), name: 'Fictional Highway' });
    projectB = await make('/projects', { code: code('PB'), name: 'Fictional Bridge' });
    wbsA = await make('/wbs-nodes', { code: code('WA'), name: 'Earthwork', projectId: projectA });
    wbsB = await make('/wbs-nodes', { code: code('WB'), name: 'Piling', projectId: projectB });
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  const create = (body: Record<string, unknown>) =>
    call(app, 'POST', '/boq-items', manager, {
      projectId: projectA,
      itemCode: code('BOQ'),
      description: 'Excavation in ordinary soil',
      uomId,
      quantity: 1,
      rate: 1,
      ...body,
    });

  it('stores the amount as quantity x rate, rounded to the paisa, and keeps it right after a change', async () => {
    const created = await create({ quantity: 12.5, rate: 340.25 });
    expect(created.statusCode, created.body).toBe(201);
    const item = dataOf<Item>(created);
    expect(item).toMatchObject({ quantity: 12.5, rate: 340.25, amount: 4253.13, status: 'draft', rowVersion: 1 });

    const changed = await call(app, 'PATCH', `/boq-items/${item.id}`, manager, { quantity: 20, rowVersion: 1 });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(dataOf<Item>(changed)).toMatchObject({ quantity: 20, rate: 340.25, amount: 6805, rowVersion: 2 });
  });

  it('refuses an amount sent by the client, a negative quantity and a move to another project', async () => {
    expect((await create({ amount: 1 })).statusCode).toBe(400);
    expect((await create({ quantity: -1 })).statusCode).toBe(400);
    const item = dataOf<Item>(await create({}));
    const move = await call(app, 'PATCH', `/boq-items/${item.id}`, manager, { projectId: projectB, rowVersion: 1 });
    expect(move.statusCode).toBe(400);
  });

  it('links a WBS node of the same project, and refuses one of another project on wbsNodeId', async () => {
    const own = await create({ wbsNodeId: wbsA });
    expect(own.statusCode, own.body).toBe(201);
    expect(dataOf<Item>(own).wbsNodeId).toBe(wbsA);

    const foreign = await create({ wbsNodeId: wbsB });
    expect(foreign.statusCode).toBe(400);
    expect(errorOf(foreign)?.code).toBe('VALIDATION_ERROR');
    expect(errorOf(foreign)?.details?.issues?.[0]?.path).toBe('wbsNodeId');

    const moved = await call(app, 'PATCH', `/boq-items/${dataOf<Item>(own).id}`, manager, { wbsNodeId: wbsB, rowVersion: 1 });
    expect(moved.statusCode).toBe(400);
  });

  it('answers 400 BOQ_ITEM_REFERENCE_NOT_FOUND for an unknown unit or project', async () => {
    expect(errorOf(await create({ uomId: randomUUID() }))?.code).toBe('BOQ_ITEM_REFERENCE_NOT_FOUND');
    expect(errorOf(await create({ projectId: randomUUID() }))?.code).toBe('BOQ_ITEM_REFERENCE_NOT_FOUND');
  });

  it('keeps item codes unique within a project, ignoring case, but allows the same code in another project', async () => {
    const itemCode = code('ITEM');
    expect((await create({ itemCode })).statusCode).toBe(201);
    const again = await create({ itemCode: itemCode.toLowerCase() });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again)?.code).toBe('BOQ_ITEM_DUPLICATE');
    expect((await create({ itemCode, projectId: projectB })).statusCode).toBe(201);
  });

  it('lists one project at a time and filters by status', async () => {
    const approved = dataOf<Item>(await create({ projectId: projectB, status: 'approved' }));
    const listB = dataOf<Item[]>(await call(app, 'GET', `/boq-items?projectId=${projectB}`, plain));
    expect(listB.length).toBeGreaterThan(0);
    expect(listB.every((i) => i.projectId === projectB)).toBe(true);
    const approvedB = dataOf<Item[]>(await call(app, 'GET', `/boq-items?projectId=${projectB}&status=approved`, plain));
    expect(approvedB.map((i) => i.id)).toContain(approved.id);
    expect(approvedB.every((i) => i.status === 'approved')).toBe(true);
  });

  it('deletes with projects.manage only, and the item is gone afterwards', async () => {
    const item = dataOf<Item>(await create({}));
    expect((await call(app, 'DELETE', `/boq-items/${item.id}`, plain)).statusCode).toBe(403);
    const removed = await call(app, 'DELETE', `/boq-items/${item.id}`, manager);
    expect(removed.statusCode, removed.body).toBe(200);
    expect((await call(app, 'GET', `/boq-items/${item.id}`, manager)).statusCode).toBe(404);
  });
});
