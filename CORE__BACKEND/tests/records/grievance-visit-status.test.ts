import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
import { GRIEVANCE_VISIT_STATUSES } from '../../src/modules/records/schema.js';
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

// Integration tests for migration 0029: the grievance visit status, separate from the grievance status.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface GrievanceRow {
  id: string;
  status: string;
  visitStatus: string | null;
  rowVersion: number;
}

function dataOf<T>(reply: Reply): T {
  return (reply.json() as { data: T }).data;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'grievance visit status (migration 0029)',
  { timeout: 60_000 },
  () => {
    let db: TestDatabase;
    let app: CoreApp | undefined;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
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

    const call = (
      method: 'GET' | 'POST' | 'PATCH',
      url: string,
      token: string | null,
      payload?: object,
    ) => callApp(app!, method, url, token, payload);

    async function tokenWith(privileges: string[]): Promise<string> {
      const loginId = uniqueLogin('grv-visit');
      await seedUser(db.pool, SCHEMA, loginId);
      for (const privilege of privileges) await grant(db.pool, TENANT, loginId, privilege);
      return signIn(app!, TENANT, loginId);
    }

    const code = () => `GRV-${randomUUID().slice(0, 8)}`;

    it('is null by default and does not change status', async () => {
      const token = await tokenWith([RECORDS_MANAGE]);
      const res = await call('POST', '/grievances', token, {
        code: code(),
        subject: 'Water supply',
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(dataOf<GrievanceRow>(res)).toMatchObject({ status: 'open', visitStatus: null });
    });

    it.each(GRIEVANCE_VISIT_STATUSES)(
      'accepts visitStatus %s on create and reads it on GET',
      async (visitStatus) => {
        const token = await tokenWith([RECORDS_MANAGE]);
        const res = await call('POST', '/grievances', token, {
          code: code(),
          subject: 'Site visit',
          visitStatus,
        });
        expect(res.statusCode, res.body).toBe(201);
        const row = dataOf<GrievanceRow>(res);
        expect(row.visitStatus).toBe(visitStatus);

        const plain = await tokenWith([]);
        const got = await call('GET', `/grievances/${row.id}`, plain);
        expect(dataOf<GrievanceRow>(got)).toMatchObject({ visitStatus, status: 'open' });
      },
    );

    it('changes and clears visitStatus on PATCH, independent of status', async () => {
      const token = await tokenWith([RECORDS_MANAGE]);
      const row = dataOf<GrievanceRow>(
        await call('POST', '/grievances', token, {
          code: code(),
          subject: 'Dust',
          visitStatus: 'requested',
        }),
      );
      const moved = await call('PATCH', `/grievances/${row.id}`, token, {
        rowVersion: row.rowVersion,
        visitStatus: 'rescheduled',
      });
      expect(moved.statusCode, moved.body).toBe(200);
      expect(dataOf<GrievanceRow>(moved)).toMatchObject({
        visitStatus: 'rescheduled',
        status: 'open',
      });

      const resolved = await call('PATCH', `/grievances/${row.id}`, token, {
        rowVersion: 2,
        status: 'resolved',
        visitStatus: 'visited',
      });
      expect(dataOf<GrievanceRow>(resolved)).toMatchObject({
        visitStatus: 'visited',
        status: 'resolved',
      });

      const cleared = await call('PATCH', `/grievances/${row.id}`, token, {
        rowVersion: 3,
        visitStatus: null,
      });
      expect(dataOf<GrievanceRow>(cleared)).toMatchObject({
        visitStatus: null,
        status: 'resolved',
      });
    });

    it('refuses a visitStatus outside the list (including UI labels) with 400', async () => {
      const token = await tokenWith([RECORDS_MANAGE]);
      for (const visitStatus of ['Visited', 'Not visited', 'not visited', 'cancelled', '']) {
        const res = await call('POST', '/grievances', token, {
          code: code(),
          subject: 'Bad',
          visitStatus,
        });
        expect(res.statusCode, visitStatus).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      }
      await expect(
        db.pool.query(
          `INSERT INTO ${SCHEMA}.core_grievance (code, subject, status, visit_status) VALUES ($1, 'x', 'open', 'later')`,
          [code()],
        ),
      ).rejects.toThrow(/core_grievance_visit_status_check/);
    });

    it('keeps the write behind records.manage', async () => {
      const plain = await tokenWith([]);
      const res = await call('POST', '/grievances', plain, {
        code: code(),
        subject: 'x',
        visitStatus: 'visited',
      });
      expect(res.statusCode).toBe(403);
    });
  },
);
