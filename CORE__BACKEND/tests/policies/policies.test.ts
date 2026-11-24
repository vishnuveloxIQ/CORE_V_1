import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { POLICIES_MANAGE } from '../../src/modules/policies/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5d. Every record is created by its own test with a unique code. All names and
// text are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'policies-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

interface AuditRow {
  op: string;
  actor_id: string | null;
  module_name: string | null;
  new_row: Record<string, unknown> | null;
}

describe.skipIf(!TEST_DATABASE_URL)('policies (phase 5d)', { timeout: SLOW_TEST_MS }, () => {
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

  async function seedUser(loginId: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Policy User', 'active', $2, 0)
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

  async function managerUser(): Promise<string> {
    const loginId = `pol-manager-${randomUUID().slice(0, 8)}`;
    await seedUser(loginId);
    await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege: POLICIES_MANAGE });
    return signIn(loginId);
  }

  async function plainUser(): Promise<{ id: string; token: string }> {
    const loginId = `pol-user-${randomUUID().slice(0, 8)}`;
    const id = await seedUser(loginId);
    return { id, token: await signIn(loginId) };
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string | null,
    payload?: object,
  ) {
    return app!.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...idempotencyFor(method, url),
      },
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  async function createRow(token: string, url: string, payload: object): Promise<Row> {
    const res = await call('POST', url, token, payload);
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data as Row;
  }

  function expectError(res: { statusCode: number; body: string }, status: number, code: string) {
    expect(res.statusCode, res.body).toBe(status);
    expect(JSON.parse(res.body).error.code).toBe(code);
  }

  async function newPolicy(token: string): Promise<Row> {
    return createRow(token, '/policies', { kind: 'conduct', code: uniq('POL'), name: 'Conduct' });
  }

  async function newVersion(token: string, policyId: string): Promise<Row> {
    return createRow(token, '/policy-versions', {
      policyId,
      body: { summary: 'Fictional summary' },
      effectiveFrom: '2026-04-01',
    });
  }

  async function newRule(token: string, versionId: string): Promise<Row> {
    return createRow(token, '/policy-rules', {
      policyVersionId: versionId,
      title: 'Keep the site tidy',
      category: 'safety',
      body: 'Fictional rule text.',
      ackRequired: true,
    });
  }

  async function publish(token: string, version: Row): Promise<Row> {
    const res = await call('POST', `/policy-versions/${version.id}/publish`, token, {
      rowVersion: version.rowVersion,
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().data as Row;
  }

  async function auditRows(table: string, recordId: string): Promise<AuditRow[]> {
    const { rows } = await db.pool.query<AuditRow>(
      `SELECT op, actor_id, module_name, new_row
       FROM tenant_acme.audit_row_change
       WHERE table_name = $1 AND record_id = $2
       ORDER BY changed_at`,
      [table, recordId],
    );
    return rows;
  }

  // Policies and versions

  it('creates a policy, numbers its versions from 1, and answers a duplicate code with POLICY_DUPLICATE', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    expect(policy.kind).toBe('conduct');

    const v1 = await newVersion(token, policy.id);
    const v2 = await newVersion(token, policy.id);
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);

    const dup = await call('POST', '/policies', token, {
      kind: 'general',
      code: policy.code,
      name: 'Again',
    });
    expectError(dup, 409, 'POLICY_DUPLICATE');
  });

  it('refuses an unknown policy kind with VALIDATION_ERROR', async () => {
    const token = await managerUser();
    const res = await call('POST', '/policies', token, {
      kind: 'magic',
      code: uniq('POL'),
      name: 'Bad kind',
    });
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('answers a stale PATCH with VERSION_CONFLICT and an unknown policy with POLICY_NOT_FOUND', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const ok = await call('PATCH', `/policies/${policy.id}`, token, {
      rowVersion: 1,
      name: 'Renamed',
    });
    expect(ok.statusCode).toBe(200);
    expectError(
      await call('PATCH', `/policies/${policy.id}`, token, { rowVersion: 1, name: 'Stale' }),
      409,
      'VERSION_CONFLICT',
    );
    expectError(await call('GET', `/policies/${randomUUID()}`, token), 404, 'POLICY_NOT_FOUND');
  });

  it('publishes a version; a published version refuses PATCH, publish and delete (POLICY_VERSION_PUBLISHED)', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const published = await publish(token, version);
    expect(published.publishedAt).not.toBeNull();

    expectError(
      await call('PATCH', `/policy-versions/${version.id}`, token, {
        rowVersion: published.rowVersion,
        reason: 'Too late',
      }),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
    expectError(
      await call('POST', `/policy-versions/${version.id}/publish`, token, {
        rowVersion: published.rowVersion,
      }),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
    expectError(
      await call('DELETE', `/policy-versions/${version.id}`, token),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
    const audit = await auditRows('core_policy_version', version.id);
    expect(audit.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
  });

  it('a policy with any version cannot be deleted (POLICY_IN_USE); an unpublished version can be', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    expectError(await call('DELETE', `/policies/${policy.id}`, token), 409, 'POLICY_IN_USE');

    const del = await call('DELETE', `/policy-versions/${version.id}`, token);
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toEqual({ deleted: true });
    expect((await call('DELETE', `/policies/${policy.id}`, token)).statusCode).toBe(200);
  });

  // Policy rules and acknowledgement

  it('writes rules only while the version is unpublished; a rule under a published version is refused', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);

    await publish(token, version);
    expectError(
      await call('POST', '/policy-rules', token, {
        policyVersionId: version.id,
        title: 'Late rule',
        category: 'safety',
        body: 'Refused',
      }),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
    expectError(
      await call('PATCH', `/policy-rules/${rule.id}`, token, { rowVersion: 1, title: 'Changed' }),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
    expectError(
      await call('DELETE', `/policy-rules/${rule.id}`, token),
      409,
      'POLICY_VERSION_PUBLISHED',
    );
  });

  it('a rule under an unknown version answers POLICY_REFERENCE_NOT_FOUND', async () => {
    const token = await managerUser();
    expectError(
      await call('POST', '/policy-rules', token, {
        policyVersionId: randomUUID(),
        title: 'Orphan',
        category: 'safety',
        body: 'No version',
      }),
      400,
      'POLICY_REFERENCE_NOT_FOUND',
    );
  });

  it('acknowledges a published rule once per user; a second call returns the same row', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);
    await publish(token, version);

    const employee = await plainUser();
    const first = await call('POST', `/policy-rules/${rule.id}/acknowledge`, employee.token);
    expect(first.statusCode).toBe(201);
    const second = await call('POST', `/policy-rules/${rule.id}/acknowledge`, employee.token);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.ackedAt).toBe(first.json().data.ackedAt);

    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM tenant_acme.core_policy_rule_ack WHERE rule_id = $1 AND user_id = $2',
      [rule.id, employee.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("lists only the signed-in user's own acknowledgements, and refuses an anonymous read", async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);
    await publish(token, version);

    const reader = await plainUser();
    const other = await plainUser();
    expect((await call('GET', '/policy-rules/acknowledgements', reader.token)).json().data).toEqual([]);

    const acked = await call('POST', `/policy-rules/${rule.id}/acknowledge`, reader.token);
    const mine = await call('GET', '/policy-rules/acknowledgements', reader.token);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().data).toEqual([{ ruleId: rule.id, ackedAt: acked.json().data.ackedAt }]);

    expect((await call('GET', '/policy-rules/acknowledgements', other.token)).json().data).toEqual([]);
    expect((await call('GET', '/policy-rules/acknowledgements', null)).statusCode).toBe(401);
  });

  it('refuses acknowledgement of an unpublished rule (POLICY_VERSION_NOT_PUBLISHED) and of a missing rule', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);
    const employee = await plainUser();

    expectError(
      await call('POST', `/policy-rules/${rule.id}/acknowledge`, employee.token),
      409,
      'POLICY_VERSION_NOT_PUBLISHED',
    );
    expectError(
      await call('POST', `/policy-rules/${randomUUID()}/acknowledge`, employee.token),
      404,
      'POLICY_NOT_FOUND',
    );
  });

  it('records an audit row for the acknowledgement, with the actor and module core', async () => {
    const token = await managerUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);
    await publish(token, version);
    const employee = await plainUser();
    await call('POST', `/policy-rules/${rule.id}/acknowledge`, employee.token);

    const { rows } = await db.pool.query<{ id: string }>(
      'SELECT id FROM tenant_acme.core_policy_rule_ack WHERE rule_id = $1 AND user_id = $2',
      [rule.id, employee.id],
    );
    const audit = await auditRows('core_policy_rule_ack', rows[0]!.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ op: 'INSERT', actor_id: employee.id, module_name: 'core' });
  });

  // OT policies, leave types, custom policies and templates

  it('refuses an OT policy above the daily hour cap with VALIDATION_ERROR', async () => {
    const token = await managerUser();
    const res = await call('POST', '/ot-policies', token, {
      code: uniq('OT'),
      name: 'Fictional OT',
      settlementMode: 'comp_off',
      maxHoursPerDay: 25,
    });
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('refuses a leave type delete while a leave policy rule refers to it (POLICY_IN_USE)', async () => {
    const token = await managerUser();
    const leaveType = await createRow(token, '/leave-types', {
      code: uniq('LT'),
      name: 'Fictional casual leave',
      isPaid: true,
      annualDays: 8,
    });
    const leavePolicy = await createRow(token, '/leave-policies', {
      code: uniq('LP'),
      name: 'Fictional leave policy',
      effectiveFrom: '2026-04-01',
    });
    await createRow(token, '/leave-policy-rules', {
      leavePolicyId: leavePolicy.id,
      leaveTypeId: leaveType.id,
      ruleJson: { accrual: 'monthly' },
      effectiveFrom: '2026-04-01',
    });
    expectError(await call('DELETE', `/leave-types/${leaveType.id}`, token), 409, 'POLICY_IN_USE');
  });

  it('numbers custom policy versions per policy and records the field order', async () => {
    const token = await managerUser();
    const custom = await createRow(token, '/custom-policies', { name: 'Fictional custom policy' });
    const v1 = await createRow(token, '/custom-policy-versions', {
      customPolicyId: custom.id,
      effectiveFrom: '2026-04-01',
      valuesJson: { shift: 'day' },
    });
    const v2 = await createRow(token, '/custom-policy-versions', {
      customPolicyId: custom.id,
      effectiveFrom: '2026-05-01',
      valuesJson: { shift: 'night' },
    });
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);

    const field = await createRow(token, '/custom-policy-fields', {
      customPolicyId: custom.id,
      label: 'Shift',
      fieldType: 'select',
      optionsJson: ['day', 'night'],
      sortOrder: 0,
    });
    expect(field.fieldType).toBe('select');
    expectError(
      await call('POST', '/custom-policy-fields', token, {
        customPolicyId: custom.id,
        label: 'Shift',
        fieldType: 'text',
        sortOrder: 1,
      }),
      409,
      'POLICY_DUPLICATE',
    );
  });

  it('deletes a custom policy with its fields and versions in one go, and audits each removal', async () => {
    const token = await managerUser();
    const custom = await createRow(token, '/custom-policies', { name: 'Fictional policy to remove' });
    const version = await createRow(token, '/custom-policy-versions', { customPolicyId: custom.id, effectiveFrom: '2026-04-01', valuesJson: { a: 1 } });
    const field = await createRow(token, '/custom-policy-fields', { customPolicyId: custom.id, label: 'Limit', fieldType: 'number', sortOrder: 0 });

    const res = await call('DELETE', `/custom-policies/${custom.id}`, token);
    expect(res.statusCode, res.body).toBe(200);
    expect((await call('GET', `/custom-policies/${custom.id}`, token)).statusCode).toBe(404);
    for (const [path, id] of [['/custom-policy-versions', version.id], ['/custom-policy-fields', field.id]] as const) {
      expect((await call('GET', `${path}/${id}`, token)).statusCode).toBe(404);
    }
    const audit = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM tenant_acme.audit_row_change WHERE op = 'DELETE' AND record_id = ANY($1::text[])`,
      [[custom.id, version.id, field.id]],
    );
    expect(audit.rows.map((r) => r.table_name).sort()).toEqual(['core_custom_policy', 'core_custom_policy_field', 'core_custom_policy_version']);
  });

  it('refuses a document template with a non-positive revision and reads it back', async () => {
    const token = await managerUser();
    expectError(
      await call('POST', '/document-templates', token, {
        code: uniq('DT'),
        name: 'Fictional letter',
        templateVersion: 'v1',
        revision: 0,
      }),
      400,
      'VALIDATION_ERROR',
    );
    const template = await createRow(token, '/document-templates', {
      code: uniq('DT'),
      name: 'Fictional letter',
      templateVersion: 'v1',
      status: 'draft',
    });
    const list = await call('GET', '/document-templates?status=draft', token);
    expect(list.json().data.map((t: Row) => t.id)).toContain(template.id);
  });

  // Access

  it('reads need a signed-in user; every write needs a token (401) and policies.manage (403)', async () => {
    const token = await managerUser();
    const plain = await plainUser();
    const policy = await newPolicy(token);
    const version = await newVersion(token, policy.id);
    const rule = await newRule(token, version.id);

    expectError(await call('GET', '/policies', null), 401, 'AUTH_REQUIRED');
    expect((await call('GET', '/policies', plain.token)).statusCode).toBe(200);

    const writes: Array<[string, string, object]> = [
      ['POST', '/policies', { kind: 'general', code: uniq('POL'), name: 'Denied' }],
      ['PATCH', `/policies/${policy.id}`, { rowVersion: 1, name: 'Denied' }],
      ['POST', `/policy-versions/${version.id}/publish`, { rowVersion: 1 }],
      ['PATCH', `/policy-rules/${rule.id}`, { rowVersion: 1, title: 'Denied' }],
      ['DELETE', `/policy-rules/${rule.id}`, {}],
    ];
    for (const [method, url, payload] of writes) {
      const m = method as 'POST' | 'PATCH' | 'DELETE';
      expectError(await call(m, url, null, payload), 401, 'AUTH_REQUIRED');
      expectError(await call(m, url, plain.token, payload), 403, 'ACCESS_DENIED');
    }
  });

  // Database rules: the constraints hold without the API.

  it('the database refuses a second OT policy with the same code and a leave type with a negative day count', async () => {
    const code = uniq('OTD');
    await db.pool.query(
      `INSERT INTO tenant_acme.core_ot_policy (code, name, settlement_mode)
       VALUES ($1, 'Fictional', 'payout')`,
      [code],
    );
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_ot_policy (code, name, settlement_mode)
         VALUES ($1, 'Second', 'payout')`,
        [code],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_leave_type (code, name, is_paid, annual_days)
         VALUES ($1, 'Negative', true, -1)`,
        [uniq('LTD')],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
