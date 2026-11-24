import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import {
  call as callApp,
  grant,
  JWT_SECRET,
  type Reply,
  seedUser,
  signIn,
  uniqueLogin,
} from '../testing-pass/helpers.js';

// Integration tests for migration 0030: the plan line stage, checked against the line's resource kind. The status
// (draft, approved, cancelled) is unchanged. All codes are fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface LineRow {
  id: string;
  resourceKind: string;
  status: string;
  stage: string | null;
  rowVersion: number;
}

function dataOf<T>(reply: Reply): T {
  return (reply.json() as { data: T }).data;
}

function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

describe.skipIf(!TEST_DATABASE_URL)('plan line stage (migration 0030)', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  let token: string;
  let refs: {
    projectId: string;
    positionId: string;
    materialId: string;
    uomId: string;
    typeId: string;
  };
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  beforeEach(async () => {
    app = buildApp({ env, pool: db.pool });
    const loginId = uniqueLogin('plan-stage');
    await seedUser(db.pool, SCHEMA, loginId);
    for (const privilege of [MASTERS_MANAGE, PROJECTS_MANAGE]) {
      await grant(db.pool, TENANT, loginId, privilege);
    }
    token = await signIn(app, TENANT, loginId);

    const uom = await db.owner.query<{ id: string }>(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, 'Fictional bag') RETURNING id`,
      [uniq('UOM')],
    );
    const position = await db.pool.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.core_position (code, title, status) VALUES ($1, 'Fictional fitter', 'active') RETURNING id`,
      [uniq('POS')],
    );
    const uomId = uom.rows[0]!.id;
    const project = await call('POST', '/projects', { code: uniq('PRJ'), name: 'Fictional Road' });
    const material = await call('POST', '/materials', {
      code: uniq('MAT'),
      name: 'Fictional Sand',
      uomId,
    });
    const type = await call('POST', '/equipment-types', {
      code: uniq('EQ'),
      name: 'Fictional Roller',
    });
    for (const res of [project, material, type]) expect(res.statusCode, res.body).toBe(201);
    refs = {
      projectId: dataOf<{ id: string }>(project).id,
      positionId: position.rows[0]!.id,
      materialId: dataOf<{ id: string }>(material).id,
      uomId,
      typeId: dataOf<{ id: string }>(type).id,
    };
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function call(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
    as: string | null = token,
  ) {
    return callApp(app!, method, url, as, payload);
  }

  function lineBody(kind: 'people' | 'material' | 'equipment', extra: object = {}) {
    const byKind = {
      people: { positionId: refs.positionId, role: 'Fitter' },
      material: { materialId: refs.materialId, uomId: refs.uomId, quantity: 10 },
      equipment: { equipmentTypeId: refs.typeId },
    }[kind];
    return { projectId: refs.projectId, resourceKind: kind, ...byKind, ...extra };
  }

  const allowed = {
    people: ['planned', 'confirmed', 'fulfilled'],
    material: ['planned', 'requested', 'ordered', 'received'],
    equipment: ['planned'],
  } as const;
  const all = ['planned', 'confirmed', 'fulfilled', 'requested', 'ordered', 'received'];

  it('is null by default, and the status stays draft', async () => {
    const res = await call('POST', '/plan-lines', lineBody('people'));
    expect(res.statusCode, res.body).toBe(201);
    expect(dataOf<LineRow>(res)).toMatchObject({ stage: null, status: 'draft' });
  });

  for (const kind of ['people', 'material', 'equipment'] as const) {
    it(`a ${kind} line accepts only its own stages on POST`, async () => {
      for (const stage of all) {
        const res = await call('POST', '/plan-lines', lineBody(kind, { stage }));
        if ((allowed[kind] as readonly string[]).includes(stage)) {
          expect(res.statusCode, `${kind}/${stage}: ${res.body}`).toBe(201);
          expect(dataOf<LineRow>(res).stage).toBe(stage);
        } else {
          expect(res.statusCode, `${kind}/${stage}`).toBe(400);
          const error = (
            res.json() as { error: { code: string; details: { issues: { path: string }[] } } }
          ).error;
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.details.issues[0]!.path).toBe('stage');
        }
      }
    });
  }

  it('refuses an unknown stage or a UI label with 400', async () => {
    for (const stage of ['Planned', 'approved', 'cancelled', '']) {
      const res = await call('POST', '/plan-lines', lineBody('people', { stage }));
      expect(res.statusCode, stage).toBe(400);
    }
  });

  it('changes, checks and clears the stage on PATCH; the GET list returns it', async () => {
    const line = dataOf<LineRow>(
      await call('POST', '/plan-lines', lineBody('material', { stage: 'requested' })),
    );

    const ordered = await call('PATCH', `/plan-lines/${line.id}`, {
      rowVersion: 1,
      stage: 'ordered',
      status: 'approved',
    });
    expect(ordered.statusCode, ordered.body).toBe(200);
    expect(dataOf<LineRow>(ordered)).toMatchObject({ stage: 'ordered', status: 'approved' });

    const wrong = await call('PATCH', `/plan-lines/${line.id}`, {
      rowVersion: 2,
      stage: 'fulfilled',
    });
    expect(wrong.statusCode).toBe(400);

    // Changing the kind re-checks the stored stage against the new kind.
    const kindChange = await call('PATCH', `/plan-lines/${line.id}`, {
      rowVersion: 2,
      resourceKind: 'equipment',
      equipmentTypeId: refs.typeId,
    });
    expect(kindChange.statusCode).toBe(400);

    const listed = dataOf<LineRow[]>(
      await call('GET', `/plan-lines?projectId=${refs.projectId}&resourceKind=material`),
    );
    expect(listed.find((l) => l.id === line.id)?.stage).toBe('ordered');

    const cleared = await call('PATCH', `/plan-lines/${line.id}`, { rowVersion: 2, stage: null });
    expect(dataOf<LineRow>(cleared)).toMatchObject({ stage: null, status: 'approved' });
  });

  it('the database refuses a stage that does not fit the kind', async () => {
    const line = dataOf<LineRow>(await call('POST', '/plan-lines', lineBody('people')));
    await expect(
      db.pool.query(`UPDATE ${SCHEMA}.core_plan_line SET stage = 'ordered' WHERE id = $1`, [
        line.id,
      ]),
    ).rejects.toThrow(/core_plan_line_stage_kind_check/);
    await expect(
      db.pool.query(`UPDATE ${SCHEMA}.core_plan_line SET stage = 'shipped' WHERE id = $1`, [
        line.id,
      ]),
    ).rejects.toThrow(/core_plan_line_stage/);
  });

  it('keeps the write behind masters.manage', async () => {
    const loginId = uniqueLogin('plan-plain');
    await seedUser(db.pool, SCHEMA, loginId);
    const plain = await signIn(app!, TENANT, loginId);
    const res = await call('POST', '/plan-lines', lineBody('people', { stage: 'planned' }), plain);
    expect(res.statusCode).toBe(403);
    expect((await call('GET', '/plan-lines', undefined, plain)).statusCode).toBe(200);
  });
});
