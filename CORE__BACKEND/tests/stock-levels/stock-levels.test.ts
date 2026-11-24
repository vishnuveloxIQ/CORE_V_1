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

// Integration tests for migration 0020 and the /stock-levels routes. Every store, material and user is created by
// the test with a unique code. All names are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'stock-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

interface StockRow {
  id: string;
  storeId: string;
  materialId: string;
  qty: number;
  reserved: number;
  rowVersion: number;
}

interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

/** The data of a success envelope, typed by the caller. */
function dataOf<T>(reply: Reply): T {
  return (reply.json() as { data: T }).data;
}

/** The code of an error envelope. */
function errorCodeOf(reply: Reply): string {
  return (reply.json() as { error: { code: string } }).error.code;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'stock levels (migration 0020)',
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

    async function seedUser(loginId: string): Promise<string> {
      const hash = await hashSecret(PASSWORD);
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Stock User', 'active', $2, 0)
       RETURNING id`,
        [loginId, hash],
      );
      return rows[0]!.id;
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

    /** A user who holds masters.manage, granted with the bootstrap function the CLI uses. */
    async function managerToken(): Promise<string> {
      const loginId = uniq('stock-manager');
      await seedUser(loginId);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: MASTERS_MANAGE,
      });
      return signIn(loginId);
    }

    async function plainToken(): Promise<string> {
      const loginId = uniq('stock-plain');
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

    /** A store and a material that exist in the tenant. Inserted directly: their own routes are tested elsewhere. */
    async function seedStoreAndMaterial(): Promise<{ storeId: string; materialId: string }> {
      // A store belongs to a location, and a location to a project (migrations 0009 and 0010).
      const project = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_project (code, name) VALUES ($1, 'Fictional project') RETURNING id`,
        [uniq('PRJ').toUpperCase()],
      );
      const location = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_location (code, name, project_id) VALUES ($1, 'Fictional site', $2) RETURNING id`,
        [uniq('LOC').toUpperCase(), project.rows[0]!.id],
      );
      const store = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_store (code, name, status, location_id)
       VALUES ($1, 'Fictional store', 'active', $2) RETURNING id`,
        [uniq('ST').toUpperCase(), location.rows[0]!.id],
      );
      const uom = await db.owner.query<{ id: string }>(
        `INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, 'Fictional unit') RETURNING id`,
        [uniq('UOM').toUpperCase()],
      );
      const material = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_material (code, name, uom_id, status)
       VALUES ($1, 'Fictional cement', $2, 'active') RETURNING id`,
        [uniq('MAT').toUpperCase(), uom.rows[0]!.id],
      );
      return { storeId: store.rows[0]!.id, materialId: material.rows[0]!.id };
    }

    it('answers a plain signed-in user on GET and refuses writes with 403', async () => {
      const token = await plainToken();
      const { storeId, materialId } = await seedStoreAndMaterial();

      const list = await call('GET', '/stock-levels', token);
      expect(list.statusCode).toBe(200);

      const created = await call('POST', '/stock-levels', token, { storeId, materialId, qty: 5 });
      expect(created.statusCode).toBe(403);
      expect(errorCodeOf(created)).toBe('ACCESS_DENIED');

      const patched = await call('PATCH', `/stock-levels/${randomUUID()}`, token, {
        qty: 5,
        rowVersion: 1,
      });
      expect(patched.statusCode).toBe(403);
    });

    it('refuses a POST without an Idempotency-Key', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();
      const res = await app!.inject({
        method: 'POST',
        url: '/stock-levels',
        headers: { authorization: `Bearer ${token}` },
        payload: { storeId, materialId, qty: 5 },
      });
      expect(res.statusCode).toBe(400);
      expect(errorCodeOf(res)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('creates a row with defaults, reads it back with the filters, and sets an existing row', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();

      const created = await call('POST', '/stock-levels', token, { storeId, materialId });
      expect(created.statusCode).toBe(201);
      const row = dataOf<StockRow>(created);
      expect(row).toMatchObject({ storeId, materialId, qty: 0, reserved: 0, rowVersion: 1 });

      // Setting the same pair again updates the row in place: same id, 200, next version.
      const set = await call('POST', '/stock-levels', token, {
        storeId,
        materialId,
        qty: 12.5,
        reserved: 2,
      });
      expect(set.statusCode).toBe(200);
      expect(dataOf<StockRow>(set)).toMatchObject({
        id: row.id,
        qty: 12.5,
        reserved: 2,
        rowVersion: 2,
      });

      const byStore = await call('GET', `/stock-levels?storeId=${storeId}`, token);
      expect(dataOf<StockRow[]>(byStore)).toHaveLength(1);
      expect(dataOf<StockRow[]>(byStore)[0]).toMatchObject({ id: row.id, qty: 12.5, reserved: 2 });

      const byMaterial = await call('GET', `/stock-levels?materialId=${randomUUID()}`, token);
      expect(dataOf<StockRow[]>(byMaterial)).toEqual([]);

      const badFilter = await call('GET', '/stock-levels?storeId=not-a-uuid', token);
      expect(badFilter.statusCode).toBe(400);
    });

    it('keeps the stored reserved value when a set leaves it out', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();
      await call('POST', '/stock-levels', token, { storeId, materialId, qty: 10, reserved: 4 });

      const set = await call('POST', '/stock-levels', token, { storeId, materialId, qty: 20 });
      expect(dataOf<StockRow>(set)).toMatchObject({ qty: 20, reserved: 4 });
    });

    it('refuses reserved above qty with 422 on create and on patch', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();

      const create = await call('POST', '/stock-levels', token, {
        storeId,
        materialId,
        qty: 3,
        reserved: 4,
      });
      expect(create.statusCode).toBe(422);
      expect(errorCodeOf(create)).toBe('STOCK_RESERVED_EXCEEDS_QTY');

      const made = await call('POST', '/stock-levels', token, { storeId, materialId, qty: 3 });
      const id = dataOf<StockRow>(made).id;
      const patch = await call('PATCH', `/stock-levels/${id}`, token, {
        reserved: 5,
        rowVersion: 1,
      });
      expect(patch.statusCode).toBe(422);
      expect(errorCodeOf(patch)).toBe('STOCK_RESERVED_EXCEEDS_QTY');

      const negative = await call('POST', '/stock-levels', token, {
        storeId: randomUUID(),
        materialId,
        qty: -1,
      });
      expect(negative.statusCode).toBe(400);
    });

    it('answers 404 for an unknown store, an unknown material and an unknown stock row', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();

      const noStore = await call('POST', '/stock-levels', token, {
        storeId: randomUUID(),
        materialId,
        qty: 1,
      });
      expect(noStore.statusCode).toBe(404);
      expect(errorCodeOf(noStore)).toBe('STORE_NOT_FOUND');

      const noMaterial = await call('POST', '/stock-levels', token, {
        storeId,
        materialId: randomUUID(),
        qty: 1,
      });
      expect(noMaterial.statusCode).toBe(404);
      expect(errorCodeOf(noMaterial)).toBe('MATERIAL_NOT_FOUND');

      const noRow = await call('PATCH', `/stock-levels/${randomUUID()}`, token, {
        qty: 1,
        rowVersion: 1,
      });
      expect(noRow.statusCode).toBe(404);
      expect(errorCodeOf(noRow)).toBe('STOCK_LEVEL_NOT_FOUND');
    });

    it('patches qty and reserved under rowVersion, and refuses a stale version with 409', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();
      const made = await call('POST', '/stock-levels', token, { storeId, materialId, qty: 10 });
      const id = dataOf<StockRow>(made).id;

      const first = await call('PATCH', `/stock-levels/${id}`, token, {
        qty: 30,
        reserved: 6,
        rowVersion: 1,
      });
      expect(first.statusCode).toBe(200);
      expect(dataOf<StockRow>(first)).toMatchObject({ id, qty: 30, reserved: 6, rowVersion: 2 });

      // The version 1 the client read before the change is now stale.
      const stale = await call('PATCH', `/stock-levels/${id}`, token, { qty: 40, rowVersion: 1 });
      expect(stale.statusCode).toBe(409);
      expect(errorCodeOf(stale)).toBe('VERSION_CONFLICT');

      const second = await call('PATCH', `/stock-levels/${id}`, token, {
        reserved: 1,
        rowVersion: 2,
      });
      expect(dataOf<StockRow>(second)).toMatchObject({ qty: 30, reserved: 1, rowVersion: 3 });

      const noFields = await call('PATCH', `/stock-levels/${id}`, token, { rowVersion: 3 });
      expect(noFields.statusCode).toBe(400);
    });

    it('writes an audit row for each change', async () => {
      const token = await managerToken();
      const { storeId, materialId } = await seedStoreAndMaterial();
      const made = await call('POST', '/stock-levels', token, { storeId, materialId, qty: 2 });
      const id = dataOf<StockRow>(made).id;
      await call('PATCH', `/stock-levels/${id}`, token, { qty: 3, rowVersion: 1 });

      const { rows } = await db.pool.query<{ op: string }>(
        `SELECT op FROM tenant_acme.audit_row_change
       WHERE table_name = 'core_stock_level' AND record_id = $1`,
        [id],
      );
      expect(rows.map((r) => r.op).sort()).toEqual(['INSERT', 'UPDATE']);
    });

    it('enforces reserved <= qty and the unique (store, material) pair in the database', async () => {
      const { storeId, materialId } = await seedStoreAndMaterial();
      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_stock_level (store_id, material_id, qty, reserved) VALUES ($1, $2, 1, 2)`,
          [storeId, materialId],
        ),
      ).rejects.toThrow(/core_stock_level_reserved_check/);

      await db.pool.query(
        `INSERT INTO tenant_acme.core_stock_level (store_id, material_id, qty) VALUES ($1, $2, 1)`,
        [storeId, materialId],
      );
      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_stock_level (store_id, material_id) VALUES ($1, $2)`,
          [storeId, materialId],
        ),
      ).rejects.toThrow(/core_stock_level_store_material_key/);
    });
  },
);
