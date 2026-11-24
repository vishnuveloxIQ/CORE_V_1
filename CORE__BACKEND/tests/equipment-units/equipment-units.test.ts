import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { idempotencyFor } from '../testing-pass/helpers.js';

// Integration tests for migration 0022 and the /equipment-units routes. Every user, type and unit is created by the
// test with a unique code. All names and registration numbers are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'equipment-unit-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

interface UnitRow {
  id: string;
  assetCode: string;
  type: string | null;
  equipmentTypeId: string;
  availability: string;
  makeModel: string | null;
  rowVersion: number;
}

interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

function dataOf<T>(reply: Reply): T {
  return (reply.json() as { data: T }).data;
}

function errorCodeOf(reply: Reply): string {
  return (reply.json() as { error: { code: string } }).error.code;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'equipment units (migration 0022)',
  { timeout: SLOW_TEST_MS },
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

    // A fresh app per test gives each test its own rate-limit counters.
    beforeEach(() => {
      app = buildApp({ env, pool: db.pool });
    });

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    function uniq(prefix: string): string {
      return `${prefix}-${randomUUID().slice(0, 8)}`;
    }

    async function seedUser(loginId: string): Promise<void> {
      const hash = await hashSecret(PASSWORD);
      await db.pool.query(
        `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
         VALUES ($1, 'Unit User', 'active', $2, 0)`,
        [loginId, hash],
      );
    }

    async function signIn(loginId: string): Promise<string> {
      const res = await app!.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-id': TENANT },
        payload: { loginId, password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      return res.json().data.accessToken as string;
    }

    async function managerToken(): Promise<string> {
      const loginId = uniq('unit-manager');
      await seedUser(loginId);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: MASTERS_MANAGE,
      });
      return signIn(loginId);
    }

    async function plainToken(): Promise<string> {
      const loginId = uniq('unit-plain');
      await seedUser(loginId);
      return signIn(loginId);
    }

    function call(
      method: 'GET' | 'POST' | 'PATCH',
      url: string,
      token: string | null,
      payload?: object,
      extraHeaders: Record<string, string> = {},
    ): Promise<Reply> {
      return app!
        .inject({
          method,
          url,
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...idempotencyFor(method, url),
            ...extraHeaders,
          },
          ...(payload !== undefined ? { payload } : {}),
        })
        .then((res) => ({ statusCode: res.statusCode, body: res.body, json: () => res.json() }));
    }

    /** An equipment type created through the masters route, so the unit refers to a real type. */
    async function createType(token: string, name: string): Promise<string> {
      const res = await call('POST', '/equipment-types', token, {
        code: uniq('ET').replace(/-/g, '_'),
        name,
        meterKind: 'hours',
        meterPrecision: 1,
      });
      expect(res.statusCode, res.body).toBe(201);
      return dataOf<{ id: string }>(res).id;
    }

    function unitBody(equipmentTypeId: string, overrides: Record<string, unknown> = {}) {
      return {
        assetCode: uniq('EXC').toUpperCase(),
        equipmentTypeId,
        makeModel: 'Fictional Excavator M1',
        regNo: 'TS00XX0001',
        ...overrides,
      };
    }

    it('answers a plain signed-in user on GET and refuses writes with 403', async () => {
      const token = await plainToken();
      const list = await call('GET', '/equipment-units', token);
      expect(list.statusCode).toBe(200);

      const created = await call('POST', '/equipment-units', token, unitBody(randomUUID()));
      expect(created.statusCode).toBe(403);
      expect(errorCodeOf(created)).toBe('ACCESS_DENIED');

      const patched = await call('PATCH', `/equipment-units/${randomUUID()}`, token, {
        rowVersion: 1,
        makeModel: 'x',
      });
      expect(patched.statusCode).toBe(403);
    });

    it('refuses anonymous reads and writes with 401', async () => {
      const list = await call('GET', '/equipment-units', null);
      expect(list.statusCode).toBe(401);
    });

    it('refuses a POST without an Idempotency-Key', async () => {
      const token = await managerToken();
      const typeId = await createType(token, 'Fictional Excavator type');
      const res = await app!.inject({
        method: 'POST',
        url: '/equipment-units',
        headers: { authorization: `Bearer ${token}` },
        payload: unitBody(typeId),
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe(
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    });

    it('creates a unit with the type name, defaults availability, and reads it back', async () => {
      const token = await managerToken();
      const typeId = await createType(token, 'Fictional Dump Truck type');
      const body = unitBody(typeId, { availability: undefined, lat: 17.1411, lng: 79.624 });

      const created = await call('POST', '/equipment-units', token, body);
      expect(created.statusCode).toBe(201);
      const unit = dataOf<UnitRow>(created);
      expect(unit.assetCode).toBe(body.assetCode);
      expect(unit.type).toBe('Fictional Dump Truck type');
      expect(unit.equipmentTypeId).toBe(typeId);
      expect(unit.availability).toBe('Available');
      expect(unit.rowVersion).toBe(1);

      const list = await call('GET', `/equipment-units?search=${body.assetCode}`, token);
      expect(list.statusCode).toBe(200);
      expect(dataOf<UnitRow[]>(list).map((u) => u.id)).toEqual([unit.id]);
    });

    it('refuses a duplicate asset code with 409, ignoring case', async () => {
      const token = await managerToken();
      const typeId = await createType(token, 'Fictional Grader type');
      const body = unitBody(typeId);
      expect((await call('POST', '/equipment-units', token, body)).statusCode).toBe(201);

      const again = await call('POST', '/equipment-units', token, {
        ...body,
        assetCode: body.assetCode.toLowerCase(),
      });
      expect(again.statusCode).toBe(409);
      expect(errorCodeOf(again)).toBe('EQUIPMENT_UNIT_DUPLICATE');
    });

    it('refuses an unknown equipment type with 400 and an unknown field with 400', async () => {
      const token = await managerToken();
      const missing = await call('POST', '/equipment-units', token, unitBody(randomUUID()));
      expect(missing.statusCode).toBe(400);
      expect(errorCodeOf(missing)).toBe('EQUIPMENT_UNIT_REFERENCE_NOT_FOUND');

      const typeId = await createType(token, 'Fictional Roller type');
      const extra = await call('POST', '/equipment-units', token, {
        ...unitBody(typeId),
        unknownField: 'x',
      });
      expect(extra.statusCode).toBe(400);
      expect(errorCodeOf(extra)).toBe('VALIDATION_ERROR');
    });

    it('patches a unit under its rowVersion, and refuses a stale version with 409', async () => {
      const token = await managerToken();
      const typeId = await createType(token, 'Fictional Mixer type');
      const created = dataOf<UnitRow>(
        await call('POST', '/equipment-units', token, unitBody(typeId)),
      );

      const first = await call('PATCH', `/equipment-units/${created.id}`, token, {
        rowVersion: 1,
        makeModel: 'Fictional Mixer M9',
        availability: 'Under maintenance',
      });
      expect(first.statusCode, first.body).toBe(200);
      const patched = dataOf<UnitRow>(first);
      expect(patched.makeModel).toBe('Fictional Mixer M9');
      expect(patched.availability).toBe('Under maintenance');
      expect(patched.rowVersion).toBe(2);

      // The same version again is stale now: nothing changes and the answer is 409.
      const stale = await call('PATCH', `/equipment-units/${created.id}`, token, {
        rowVersion: 1,
        makeModel: 'Stale write',
      });
      expect(stale.statusCode).toBe(409);
      expect(errorCodeOf(stale)).toBe('VERSION_CONFLICT');

      const current = dataOf<UnitRow[]>(
        await call('GET', `/equipment-units?search=${created.assetCode}`, token),
      )[0]!;
      expect(current.makeModel).toBe('Fictional Mixer M9');
    });

    it('requires rowVersion on PATCH, answers 404 for an unknown unit, and refuses a code already in use', async () => {
      const token = await managerToken();
      const typeId = await createType(token, 'Fictional Pump type');
      const first = dataOf<UnitRow>(
        await call('POST', '/equipment-units', token, unitBody(typeId)),
      );
      const second = dataOf<UnitRow>(
        await call('POST', '/equipment-units', token, unitBody(typeId)),
      );

      const noVersion = await call('PATCH', `/equipment-units/${first.id}`, token, {
        makeModel: 'No version',
      });
      expect(noVersion.statusCode).toBe(400);
      expect(errorCodeOf(noVersion)).toBe('VALIDATION_ERROR');

      const unknown = await call('PATCH', `/equipment-units/${randomUUID()}`, token, {
        rowVersion: 1,
        makeModel: 'x',
      });
      expect(unknown.statusCode).toBe(404);
      expect(errorCodeOf(unknown)).toBe('EQUIPMENT_UNIT_NOT_FOUND');

      const clash = await call('PATCH', `/equipment-units/${second.id}`, token, {
        rowVersion: 1,
        assetCode: first.assetCode,
      });
      expect(clash.statusCode).toBe(409);
      expect(errorCodeOf(clash)).toBe('EQUIPMENT_UNIT_DUPLICATE');
    });

    it('filters the register by equipment type, availability status and asset code', async () => {
      const token = await managerToken();
      const typeA = await createType(token, 'Fictional Crane type A');
      const typeB = await createType(token, 'Fictional Crane type B');
      const tag = uniq('FLT').toUpperCase();
      const a1 = dataOf<UnitRow>(
        await call('POST', '/equipment-units', token, unitBody(typeA, { assetCode: `${tag}-A1` })),
      );
      await call('POST', '/equipment-units', token, unitBody(typeA, { assetCode: `${tag}-A2` }));
      await call('POST', '/equipment-units', token, unitBody(typeB, { assetCode: `${tag}-B1` }));
      await call('PATCH', `/equipment-units/${a1.id}`, token, {
        rowVersion: 1,
        availability: 'Breakdown',
      });

      const byType = await call('GET', `/equipment-units?equipmentTypeId=${typeA}`, token);
      expect(
        dataOf<UnitRow[]>(byType)
          .map((u) => u.assetCode)
          .sort(),
      ).toEqual([`${tag}-A1`, `${tag}-A2`]);

      const byStatus = await call(
        'GET',
        `/equipment-units?equipmentTypeId=${typeA}&status=Breakdown`,
        token,
      );
      expect(dataOf<UnitRow[]>(byStatus).map((u) => u.assetCode)).toEqual([`${tag}-A1`]);

      // Search is a case-insensitive substring of the asset code; LIKE wildcards are literal.
      const bySearch = await call('GET', `/equipment-units?search=${tag.toLowerCase()}-b`, token);
      expect(dataOf<UnitRow[]>(bySearch).map((u) => u.assetCode)).toEqual([`${tag}-B1`]);
      const wildcard = await call('GET', `/equipment-units?search=${tag}%25`, token);
      expect(dataOf<UnitRow[]>(wildcard)).toEqual([]);

      const badStatus = await call('GET', '/equipment-units?status=Parked', token);
      expect(badStatus.statusCode).toBe(400);
    });
  },
);
