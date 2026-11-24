import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { appendAuditRow } from '../../src/core/audit.js';
import { hashSecret } from '../../src/core/password.js';
import { withTenant } from '../../src/db/tenant.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { ACCESS_MANAGE } from '../../src/modules/access/roles.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { idempotencyFor } from '../testing-pass/helpers.js';

// Integration tests for GET /audit-log. Users, vendors and probe rows are created by the test with unique codes.
// All names are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'audit-log-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;
const WRITER_NAME = 'Audit Writer';

interface AuditEntry {
  id: string;
  at: string | null;
  user: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: string;
  after: string;
}

interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('audit log (GET /audit-log)', { timeout: SLOW_TEST_MS }, () => {
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

  function uniq(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  async function seedUser(loginId: string, name: string): Promise<void> {
    const hash = await hashSecret(PASSWORD);
    await db.pool.query(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
         VALUES ($1, $2, 'active', $3, 0)`,
      [loginId, name, hash],
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

  /** A user with the given privileges, signed in. */
  async function tokenWith(name: string, privileges: string[]): Promise<string> {
    const loginId = uniq('audit-user');
    await seedUser(loginId, name);
    for (const privilege of privileges) {
      await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege });
    }
    return signIn(loginId);
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    token: string | null,
    payload?: object,
  ): Promise<Reply> {
    return app!
      .inject({
        method,
        url,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...idempotencyFor(method, url),
        },
        ...(payload !== undefined ? { payload } : {}),
      })
      .then((res) => ({ statusCode: res.statusCode, body: res.body, json: () => res.json() }));
  }

  function dataOf<T>(reply: Reply): T {
    return (reply.json() as { data: T }).data;
  }

  function metaOf(reply: Reply): { limit: number; offset: number; total: number } {
    return (reply.json() as { meta: { limit: number; offset: number; total: number } }).meta;
  }

  it('refuses a plain signed-in user with 403 and an anonymous caller with 401', async () => {
    const plain = await tokenWith('Plain Reader', []);
    const denied = await call('GET', '/audit-log', plain);
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe('ACCESS_DENIED');

    expect((await call('GET', '/audit-log', null)).statusCode).toBe(401);
  });

  it('lists audited changes with the frontend fields and the paging meta', async () => {
    const writer = await tokenWith(WRITER_NAME, [MASTERS_MANAGE]);
    const reader = await tokenWith('Audit Reader', [ACCESS_MANAGE]);

    const vendorCodes = [uniq('V'), uniq('V'), uniq('V')];
    const vendorIds: string[] = [];
    for (const code of vendorCodes) {
      const res = await call('POST', '/vendors', writer, { code, name: 'Fictional vendor' });
      expect(res.statusCode).toBe(201);
      vendorIds.push(dataOf<{ id: string }>(res).id);
    }
    const patched = await call('PATCH', `/vendors/${vendorIds[0]}`, writer, {
      rowVersion: 1,
      name: 'Renamed fictional vendor',
    });
    expect(patched.statusCode).toBe(200);

    const res = await call('GET', '/audit-log?entityType=core_vendor&limit=200', reader);
    expect(res.statusCode).toBe(200);
    expect(metaOf(res)).toMatchObject({ limit: 200, offset: 0 });
    const entries = dataOf<AuditEntry[]>(res);
    const created = entries.find((e) => e.entityId === vendorIds[1]);
    expect(created).toMatchObject({
      action: 'Created',
      entity: 'Vendor',
      user: WRITER_NAME,
    });
    expect(created!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(created!.before).toBe('');
    expect(JSON.parse(created!.after)).toMatchObject({
      code: vendorCodes[1],
      name: 'Fictional vendor',
    });

    const updated = entries.find((e) => e.entityId === vendorIds[0] && e.action === 'Updated');
    expect(updated).toBeDefined();
    expect(JSON.parse(updated!.before)).toMatchObject({ name: 'Fictional vendor' });
    expect(JSON.parse(updated!.after)).toMatchObject({ name: 'Renamed fictional vendor' });

    // Default paging: 50 rows at most, offset 0.
    const defaults = await call('GET', '/audit-log', reader);
    expect(metaOf(defaults)).toMatchObject({ limit: 50, offset: 0 });
    expect(dataOf<AuditEntry[]>(defaults).length).toBeLessThanOrEqual(50);
  });

  it('pages with limit and offset, and the total does not depend on the page', async () => {
    const reader = await tokenWith('Page Reader', [ACCESS_MANAGE]);
    const all = await call('GET', '/audit-log?limit=200', reader);
    const total = metaOf(all).total;
    expect(total).toBeGreaterThanOrEqual(4);

    const first = await call('GET', '/audit-log?entityType=core_vendor&limit=2&offset=0', reader);
    const second = await call('GET', '/audit-log?entityType=core_vendor&limit=2&offset=2', reader);
    const firstIds = dataOf<AuditEntry[]>(first).map((e) => e.id);
    const secondIds = dataOf<AuditEntry[]>(second).map((e) => e.id);
    expect(firstIds).toHaveLength(2);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    expect(metaOf(first).total).toBe(metaOf(second).total);
    expect(metaOf(first).total).toBeLessThan(total);

    const pastEnd = await call('GET', '/audit-log?entityType=core_vendor&offset=100000', reader);
    expect(dataOf<AuditEntry[]>(pastEnd)).toEqual([]);
  });

  it('refuses out-of-range paging values with 400', async () => {
    const reader = await tokenWith('Range Reader', [ACCESS_MANAGE]);
    for (const query of ['limit=0', 'limit=201', 'limit=abc', 'offset=-1']) {
      const res = await call('GET', `/audit-log?${query}`, reader);
      expect(res.statusCode, query).toBe(400);
    }
  });

  it('filters by entity type, action, actor and date, and refuses a reversed date range', async () => {
    const writer = await tokenWith('Filter Writer', [MASTERS_MANAGE]);
    const reader = await tokenWith('Filter Reader', [ACCESS_MANAGE]);
    const code = uniq('F');
    const made = await call('POST', '/vendors', writer, { code, name: 'Filter vendor' });
    const vendorId = dataOf<{ id: string }>(made).id;
    await call('PATCH', `/vendors/${vendorId}`, writer, { rowVersion: 1, name: 'Filter vendor 2' });

    const byType = dataOf<AuditEntry[]>(
      await call('GET', '/audit-log?entityType=core_vendor&limit=200', reader),
    );
    expect(byType.length).toBeGreaterThan(0);
    expect(byType.every((e) => e.entity === 'Vendor')).toBe(true);

    const updates = dataOf<AuditEntry[]>(
      await call('GET', '/audit-log?entityType=core_vendor&action=updated&limit=200', reader),
    );
    expect(updates.some((e) => e.entityId === vendorId)).toBe(true);
    expect(updates.every((e) => e.action === 'Updated')).toBe(true);

    const byActor = dataOf<AuditEntry[]>(
      await call('GET', '/audit-log?actor=filter%20writer&limit=200', reader),
    );
    expect(byActor.length).toBeGreaterThanOrEqual(2);
    expect(byActor.every((e) => e.user === 'Filter Writer')).toBe(true);
    expect(
      dataOf<AuditEntry[]>(await call('GET', '/audit-log?actor=no-such-person-zz', reader)),
    ).toEqual([]);

    const today = new Date().toISOString().slice(0, 10);
    const todays = await call(
      'GET',
      `/audit-log?entityType=core_vendor&from=${today}&to=${today}&limit=200`,
      reader,
    );
    expect(dataOf<AuditEntry[]>(todays).some((e) => e.entityId === vendorId)).toBe(true);

    const past = await call('GET', '/audit-log?from=2000-01-01&to=2000-01-02', reader);
    expect(metaOf(past).total).toBe(0);
    const future = await call('GET', '/audit-log?from=2100-01-01', reader);
    expect(metaOf(future).total).toBe(0);

    const reversed = await call('GET', '/audit-log?from=2026-06-01&to=2026-05-01', reader);
    expect(reversed.statusCode).toBe(400);

    const badAction = await call('GET', '/audit-log?action=Created', reader);
    expect(badAction.statusCode).toBe(400);
    const badEntity = await call('GET', '/audit-log?entityType=Core-Vendor', reader);
    expect(badEntity.statusCode).toBe(400);
  });

  it('never returns password, PIN, refresh or secret columns in the audit output', async () => {
    const reader = await tokenWith('Secret Reader', [ACCESS_MANAGE]);
    const probeTable = 'core_secret_probe';
    const hashValue = `$argon2id$probe-${randomUUID()}`;
    const tokenValue = `tok-${randomUUID()}`;

    // The writer redacts snapshots before they are stored. This row carries secret keys on purpose.
    await withTenant(db.pool, TENANT, (client) =>
      appendAuditRow(client, {
        tableName: probeTable,
        recordId: randomUUID(),
        op: 'UPDATE',
        oldRow: { id: randomUUID(), name: 'Probe', password_hash: hashValue },
        newRow: {
          id: randomUUID(),
          name: 'Probe 2',
          pin_hash: hashValue,
          refresh_hash: hashValue,
          secret_hash: hashValue,
          access_token: tokenValue,
          nested: { password_hash: hashValue },
        },
        actorId: null,
        moduleName: 'core',
      }),
    );

    const res = await call('GET', `/audit-log?entityType=${probeTable}&limit=200`, reader);
    expect(res.statusCode).toBe(200);
    const entries = dataOf<AuditEntry[]>(res);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entity).toBe('Secret probe');
    expect(JSON.parse(entries[0]!.after)).toMatchObject({ name: 'Probe 2' });

    expect(res.body).not.toContain(hashValue);
    expect(res.body).not.toContain(tokenValue);
    expect(res.body).not.toContain('password_hash');
    expect(res.body).not.toContain('pin_hash');
    expect(res.body).not.toContain('refresh_hash');
    expect(res.body).not.toContain('$argon2');
  });

  it('reads one entry by id, the same as its list item, with secrets removed; unknown is 404', async () => {
    const reader = await tokenWith('Detail Reader', [ACCESS_MANAGE]);
    const plain = await tokenWith('Detail Plain', []);
    const probeTable = 'core_detail_probe';
    const hashValue = `$argon2id$detail-${randomUUID()}`;
    await withTenant(db.pool, TENANT, (client) =>
      appendAuditRow(client, {
        tableName: probeTable,
        recordId: randomUUID(),
        op: 'UPDATE',
        oldRow: { id: randomUUID(), name: 'Before' },
        newRow: { id: randomUUID(), name: 'After', password_hash: hashValue },
        actorId: null,
        moduleName: 'core',
      }),
    );
    const listed = dataOf<AuditEntry[]>(await call('GET', `/audit-log?entityType=${probeTable}`, reader))[0]!;

    const one = await call('GET', `/audit-log/${listed.id}`, reader);
    expect(one.statusCode).toBe(200);
    expect(dataOf<AuditEntry>(one)).toEqual(listed);
    expect(one.body).not.toContain(hashValue);
    expect(one.body).not.toContain('password_hash');

    const unknown = await call('GET', `/audit-log/${randomUUID()}`, reader);
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect((await call('GET', '/audit-log/not-a-uuid', reader)).statusCode).toBe(400);
    expect((await call('GET', `/audit-log/${listed.id}`, plain)).statusCode).toBe(403);
    expect((await call('GET', `/audit-log/${listed.id}`, null)).statusCode).toBe(401);
  });
});
