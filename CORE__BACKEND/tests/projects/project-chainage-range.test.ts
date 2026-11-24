import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import {
  call,
  grant,
  JWT_SECRET,
  type Reply,
  seedUser,
  signIn,
  uniqueLogin,
} from '../testing-pass/helpers.js';

// Project chainage range (0026) and grievance note (0027). Data is fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

function data<T>(res: Reply): T {
  return (res.json() as { data: T }).data;
}

function expectError(res: Reply, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect((res.json() as { error: { code: string } }).error.code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)(
  'project chainage range and grievance note',
  { timeout: 60_000 },
  () => {
    let db: TestDatabase;
    let app: CoreApp;
    let manager = '';
    let plain = '';
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
      app = buildApp({ env, pool: db.pool });
      const m = uniqueLogin('pcr-manager');
      await seedUser(db.pool, SCHEMA, m);
      await grant(db.pool, TENANT, m, PROJECTS_MANAGE);
      await grant(db.pool, TENANT, m, RECORDS_MANAGE);
      manager = await signIn(app, TENANT, m);
      const p = uniqueLogin('pcr-plain');
      await seedUser(db.pool, SCHEMA, p);
      plain = await signIn(app, TENANT, p);
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    async function project(code: string): Promise<Row> {
      const res = await call(app, 'POST', '/projects', manager, { code, name: `Project ${code}` });
      expect(res.statusCode, res.body).toBe(201);
      return data<Row>(res);
    }

    it('patches and returns the range, and allows markers outside it', async () => {
      const p = await project('PCR-1');
      expect(p).toMatchObject({ chainageStartKm: null, chainageEndKm: null });
      const marker = await call(app, 'POST', '/chainage-markers', manager, {
        code: 'CH-1',
        projectId: p.id,
        chainageKm: 50,
      });
      expect(marker.statusCode, marker.body).toBe(201);

      const res = await call(app, 'PATCH', `/projects/${p.id}`, manager, {
        chainageStartKm: 1.25,
        chainageEndKm: 12.5,
        rowVersion: p.rowVersion,
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(data<Row>(res)).toMatchObject({ chainageStartKm: 1.25, chainageEndKm: 12.5 });

      const list = data<Row[]>(await call(app, 'GET', '/projects', plain));
      expect(list.find((r) => r.id === p.id)).toMatchObject({
        chainageStartKm: 1.25,
        chainageEndKm: 12.5,
      });
    });

    it('validates the range and the row version', async () => {
      const p = await project('PCR-2');
      const patch = (body: object) =>
        call(app, 'PATCH', `/projects/${p.id}`, manager, { ...body, rowVersion: p.rowVersion });
      expectError(await patch({ chainageStartKm: 5, chainageEndKm: 2 }), 400, 'VALIDATION_ERROR');
      expectError(await patch({ chainageStartKm: -1, chainageEndKm: 2 }), 400, 'VALIDATION_ERROR');
      expectError(await patch({ chainageStartKm: 1 }), 400, 'VALIDATION_ERROR');
      expectError(
        await patch({ chainageStartKm: 'one', chainageEndKm: 2 }),
        400,
        'VALIDATION_ERROR',
      );
      expect((await patch({ chainageStartKm: 3, chainageEndKm: 3 })).statusCode).toBe(200);
      expectError(await patch({ chainageStartKm: 0, chainageEndKm: 4 }), 409, 'VERSION_CONFLICT');
      expect(
        (
          await call(app, 'PATCH', `/projects/${p.id}`, plain, {
            chainageStartKm: 0,
            chainageEndKm: 1,
            rowVersion: p.rowVersion + 1,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await call(app, 'PATCH', `/projects/${p.id}`, null, { rowVersion: 1 })).statusCode,
      ).toBe(401);
    });

    it('stores the grievance note on PATCH and returns it', async () => {
      const created = await call(app, 'POST', '/grievances', manager, {
        code: 'G-PCR-1',
        subject: 'Visit request',
      });
      expect(created.statusCode, created.body).toBe(201);
      const g = data<Row>(created);
      expect(g.note).toBeNull();

      const res = await call(app, 'PATCH', `/grievances/${g.id}`, manager, {
        note: '  Visit moved to Friday  ',
        rowVersion: g.rowVersion,
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(data<Row>(res).note).toBe('Visit moved to Friday');
      const read = data<Row>(await call(app, 'GET', `/grievances/${g.id}`, plain));
      expect(read.note).toBe('Visit moved to Friday');

      expectError(
        await call(app, 'PATCH', `/grievances/${g.id}`, manager, {
          note: 'x'.repeat(2001),
          rowVersion: g.rowVersion + 1,
        }),
        400,
        'VALIDATION_ERROR',
      );
      expectError(
        await call(app, 'PATCH', `/grievances/${g.id}`, manager, {
          note: 'Stale',
          rowVersion: g.rowVersion,
        }),
        409,
        'VERSION_CONFLICT',
      );
      expect(
        (
          await call(app, 'PATCH', `/grievances/${g.id}`, plain, {
            note: 'No access',
            rowVersion: g.rowVersion + 1,
          })
        ).statusCode,
      ).toBe(403);

      const cleared = await call(app, 'PATCH', `/grievances/${g.id}`, manager, {
        note: null,
        rowVersion: g.rowVersion + 1,
      });
      expect(cleared.statusCode, cleared.body).toBe(200);
      expect(data<Row>(cleared).note).toBeNull();
    });
  },
);
