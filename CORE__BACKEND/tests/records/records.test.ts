import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5f. Example data is fictional. Each test uses its own codes, so the tests are independent.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'records-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;
const SHA = 'b'.repeat(64);

function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface Row {
  id: string;
  rowVersion: number;
  [field: string]: unknown;
}

interface Reply {
  statusCode: number;
  body: string;
  json: () => unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('records (phase 5f)', { timeout: SLOW_TEST_MS }, () => {
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
       VALUES ($1, 'Records User', 'active', $2, 0)
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

  /** A user with a token; optionally granted records.manage. */
  async function userWith(manage: boolean): Promise<{ id: string; token: string }> {
    const loginId = `rec-${randomUUID().slice(0, 8)}`;
    const id = await seedUser(loginId);
    if (manage) {
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: RECORDS_MANAGE,
      });
    }
    return { id, token: await signIn(loginId) };
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string | null,
    payload?: object,
  ): Promise<Reply> {
    return app!.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...idempotencyFor(method, url),
      },
      ...(payload !== undefined ? { payload } : {}),
    }) as Promise<Reply>;
  }

  async function createRow(token: string, url: string, payload: object): Promise<Row> {
    const res = await call('POST', url, token, payload);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
    return (res.json() as { data: Row }).data;
  }

  function expectError(res: Reply, status: number, code: string): void {
    expect(res.statusCode, res.body).toBe(status);
    expect((res.json() as { error: { code: string } }).error.code).toBe(code);
  }

  async function auditOps(table: string, recordId: string): Promise<string[]> {
    const { rows } = await db.pool.query<{ op: string }>(
      `SELECT op FROM tenant_acme.audit_row_change
        WHERE table_name = $1 AND record_id = $2 ORDER BY changed_at, id`,
      [table, recordId],
    );
    return rows.map((r) => r.op);
  }

  it('creates a file with a checksum and refuses a malformed one', async () => {
    const manager = await userWith(true);
    const file = await createRow(manager.token, '/files', {
      ownerType: 'employee',
      ownerId: randomUUID(),
      fileName: 'offer.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: SHA,
      objectKey: uniq('obj'),
      visibility: 'team',
    });
    expect(file.visibility).toBe('team');
    expect(file.sha256).toBe(SHA);
    expect(await auditOps('core_file', file.id)).toEqual(['INSERT']);

    const bad = await call('POST', '/files', manager.token, {
      ownerType: 'employee',
      ownerId: randomUUID(),
      fileName: 'offer.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'NOT-A-HASH',
      objectKey: uniq('obj'),
    });
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a second file with the same object key', async () => {
    const manager = await userWith(true);
    const objectKey = uniq('dup-obj');
    const body = {
      ownerType: 'employee',
      ownerId: randomUUID(),
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      objectKey,
    };
    await createRow(manager.token, '/files', body);
    expectError(await call('POST', '/files', manager.token, body), 409, 'RECORD_DUPLICATE');
  });

  it('the timeline is append-only: entries are added and listed, never changed', async () => {
    const plain = await userWith(false);
    const entityId = randomUUID();
    const entry = await createRow(plain.token, '/record-timeline', {
      entityType: 'grievance',
      entityId,
      action: 'status_changed',
      oldStatus: 'open',
      newStatus: 'in_review',
    });
    expect(entry.actorId).toBe(plain.id);

    const listed = await call(
      'GET',
      `/record-timeline?entityType=grievance&entityId=${entityId}`,
      plain.token,
    );
    expect((listed.json() as { data: Row[] }).data.map((r) => r.action)).toEqual([
      'status_changed',
    ]);

    expect(
      (
        await call('PATCH', `/record-timeline/${entry.id}`, plain.token, {
          rowVersion: 1,
          remarks: 'x',
        })
      ).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/record-timeline/${entry.id}`, plain.token)).statusCode).toBe(
      404,
    );
  });

  it('a grievance closes on resolve, keeps its time while closed, and clears it on reopen', async () => {
    const manager = await userWith(true);
    const grievance = await createRow(manager.token, '/grievances', {
      code: uniq('GRV'),
      subject: 'Late pay',
    });
    expect(grievance.status).toBe('open');
    expect(grievance.closedAt).toBeNull();

    const resolved = await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
      rowVersion: grievance.rowVersion,
      status: 'resolved',
    });
    const resolvedRow = (resolved.json() as { data: Row }).data;
    expect(resolvedRow.closedAt).not.toBeNull();
    const firstClosed = String(resolvedRow.closedAt);

    const closed = await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
      rowVersion: resolvedRow.rowVersion,
      status: 'closed',
    });
    expect(String((closed.json() as { data: Row }).data.closedAt)).toBe(firstClosed);

    const reopened = await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
      rowVersion: (closed.json() as { data: Row }).data.rowVersion,
      status: 'open',
    });
    expect((reopened.json() as { data: Row }).data.closedAt).toBeNull();
  });

  it('a grievance keeps its employee code: set on create, read back, changed on patch, cleared with null', async () => {
    const manager = await userWith(true);
    const grievance = await createRow(manager.token, '/grievances', {
      code: uniq('GRV'),
      subject: 'Overtime',
      employeeCode: '  EMP-1021  ',
    });
    expect(grievance.employeeCode).toBe('EMP-1021');

    const read = await call('GET', `/grievances/${grievance.id}`, manager.token);
    expect((read.json() as { data: Row }).data.employeeCode).toBe('EMP-1021');

    const patched = await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
      rowVersion: grievance.rowVersion,
      employeeCode: 'EMP-2118',
    });
    expect((patched.json() as { data: Row }).data.employeeCode).toBe('EMP-2118');

    const cleared = await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
      rowVersion: (patched.json() as { data: Row }).data.rowVersion,
      employeeCode: null,
    });
    expect((cleared.json() as { data: Row }).data.employeeCode).toBeNull();
  });

  it('a grievance employee code is at most 60 characters and never blank', async () => {
    const manager = await userWith(true);
    const tooLong = await call('POST', '/grievances', manager.token, {
      code: uniq('GRV'),
      subject: 'Long',
      employeeCode: 'E'.repeat(61),
    });
    expect(tooLong.statusCode).toBe(400);
    const blank = await call('POST', '/grievances', manager.token, {
      code: uniq('GRV'),
      subject: 'Blank',
      employeeCode: '   ',
    });
    expect(blank.statusCode).toBe(400);
  });

  it('a grievance code is unique and a stale PATCH is a version conflict', async () => {
    const manager = await userWith(true);
    const code = uniq('GRV');
    const grievance = await createRow(manager.token, '/grievances', { code, subject: 'Noise' });
    expectError(
      await call('POST', '/grievances', manager.token, { code, subject: 'Again' }),
      409,
      'RECORD_DUPLICATE',
    );
    expectError(
      await call('PATCH', `/grievances/${grievance.id}`, manager.token, {
        rowVersion: grievance.rowVersion + 4,
        subject: 'Stale',
      }),
      409,
      'VERSION_CONFLICT',
    );
  });

  it('a notification is listed and read only by its recipient', async () => {
    const manager = await userWith(true);
    const recipient = await userWith(false);
    const stranger = await userWith(false);
    const note = await createRow(manager.token, '/notifications', {
      recipientUserId: recipient.id,
      notificationType: 'approval_due',
      title: 'Approval waiting',
    });
    expect(note.deliveryStatus).toBe('pending');

    const mine = await call('GET', '/notifications', recipient.token);
    expect((mine.json() as { data: Row[] }).data.map((r) => r.id)).toContain(note.id);
    const theirs = await call('GET', '/notifications', stranger.token);
    expect((theirs.json() as { data: Row[] }).data.map((r) => r.id)).not.toContain(note.id);

    expectError(
      await call('GET', `/notifications/${note.id}`, stranger.token),
      404,
      'RECORD_NOT_FOUND',
    );
    expectError(
      await call('POST', `/notifications/${note.id}/read`, stranger.token),
      404,
      'RECORD_NOT_FOUND',
    );

    const first = await call('POST', `/notifications/${note.id}/read`, recipient.token);
    const readAt = String((first.json() as { data: Row }).data.readAt);
    expect(readAt).not.toBe('null');
    const second = await call('POST', `/notifications/${note.id}/read`, recipient.token);
    expect(String((second.json() as { data: Row }).data.readAt)).toBe(readAt);
  });

  it('anyone raises a ticket as themselves; only records.manage changes its priority or status', async () => {
    const manager = await userWith(true);
    const plain = await userWith(false);
    const ticket = await createRow(plain.token, '/tickets', {
      code: uniq('TKT'),
      subject: 'Badge reader offline',
      category: 'access',
    });
    expect(ticket.raisedByUserId).toBe(plain.id);
    expect(ticket.priority).toBe('medium');
    expect(ticket.status).toBe('open');

    expectError(
      await call('PATCH', `/tickets/${ticket.id}`, plain.token, {
        rowVersion: ticket.rowVersion,
        priority: 'critical',
      }),
      403,
      'ACCESS_DENIED',
    );

    const raised = await call('PATCH', `/tickets/${ticket.id}`, manager.token, {
      rowVersion: ticket.rowVersion,
      priority: 'high',
      status: 'in_progress',
    });
    expect((raised.json() as { data: Row }).data.priority).toBe('high');
  });

  it('a batch takes rows while draft, submits with its row count, then refuses more rows', async () => {
    const manager = await userWith(true);
    const batch = await createRow(manager.token, '/import-batches', {
      batchCode: uniq('IMP'),
      importType: 'employees',
      templateVersion: 'v1',
    });
    expect(batch.status).toBe('draft');
    expect(batch.uploadedBy).toBe(manager.id);

    await createRow(manager.token, `/import-batches/${batch.id}/rows`, {
      rowNumber: 1,
      rawValues: { name: 'A' },
    });
    await createRow(manager.token, `/import-batches/${batch.id}/rows`, {
      rowNumber: 2,
      rawValues: { name: 'B' },
    });
    expectError(
      await call('POST', `/import-batches/${batch.id}/rows`, manager.token, {
        rowNumber: 2,
        rawValues: { name: 'Again' },
      }),
      409,
      'RECORD_DUPLICATE',
    );

    const submitted = await call('POST', `/import-batches/${batch.id}/submit`, manager.token, {
      rowVersion: batch.rowVersion,
    });
    const submittedRow = (submitted.json() as { data: Row }).data;
    expect(submittedRow.status).toBe('submitted');
    expect(submittedRow.totalRows).toBe(2);

    expectError(
      await call('POST', `/import-batches/${batch.id}/rows`, manager.token, {
        rowNumber: 3,
        rawValues: { name: 'Late' },
      }),
      409,
      'RECORD_BATCH_NOT_DRAFT',
    );
    expectError(
      await call('POST', `/import-batches/${batch.id}/submit`, manager.token, {
        rowVersion: submittedRow.rowVersion,
      }),
      409,
      'RECORD_BATCH_NOT_DRAFT',
    );

    const rows = await call('GET', `/import-rows?batchId=${batch.id}`, manager.token);
    expect((rows.json() as { data: Row[] }).data).toHaveLength(2);
  });

  it('an increment creates the counter, then adds to it', async () => {
    const manager = await userWith(true);
    const scopeKey = uniq('site');
    const base = { metric: 'exports', scopeKey, weekStart: '2026-11-16' };

    const first = await call('POST', '/usage-counters/increment', manager.token, {
      ...base,
      by: 2,
    });
    expect(first.statusCode).toBe(200);
    expect(Number((first.json() as { data: Row }).data.counterValue)).toBe(2);

    const second = await call('POST', '/usage-counters/increment', manager.token, {
      ...base,
      by: 3,
    });
    const counter = (second.json() as { data: Row }).data;
    expect(Number(counter.counterValue)).toBe(5);
    expect(await auditOps('core_usage_counter', counter.id)).toEqual(['INSERT', 'UPDATE']);
  });

  it('keeps every record write behind records.manage, and lets a signed-in user read', async () => {
    const plain = await userWith(false);
    expectError(
      await call('POST', '/files', plain.token, {
        ownerType: 'employee',
        ownerId: randomUUID(),
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        objectKey: uniq('obj'),
      }),
      403,
      'ACCESS_DENIED',
    );
    expectError(
      await call('POST', '/notifications', plain.token, {
        recipientUserId: plain.id,
        notificationType: 'x',
        title: 'x',
      }),
      403,
      'ACCESS_DENIED',
    );
    expectError(
      await call('POST', '/usage-counters/increment', plain.token, {
        metric: 'x',
        scopeKey: 'x',
        weekStart: '2026-11-16',
        by: 1,
      }),
      403,
      'ACCESS_DENIED',
    );
    expect((await call('GET', '/grievances', plain.token)).statusCode).toBe(200);
    expect((await call('GET', '/files', null)).statusCode).toBe(401);
  });
});
