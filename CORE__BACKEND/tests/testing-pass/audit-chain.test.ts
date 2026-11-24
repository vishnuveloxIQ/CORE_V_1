import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { verifyAuditChain } from '../../src/core/audit.js';
import { loadEnv } from '../../src/config/env.js';
import { withTenant } from '../../src/db/tenant.js';
import { APPROVALS_MANAGE } from '../../src/modules/approvals/routes.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin } from './helpers.js';

// Phase N-1 (c): the audit chain after real HTTP writes across modules. Example data is fictional.

const SLOW_TEST_MS = 60_000;

describe.skipIf(!TEST_DATABASE_URL)(
  'audit chain after HTTP writes (testing pass)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;
    let app: CoreApp;
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
      await db.pool.query(
        `INSERT INTO tenant_acme.core_number_series (series_code, prefix, year_scope, next_value)
       VALUES ('APR', 'APR', $1, 1)`,
        [new Date().getUTCFullYear()],
      );
      app = buildApp({ env, pool: db.pool });
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it('writes across approvals, records and core leave an intact chain with no hash columns in snapshots', async () => {
      const managerLogin = uniqueLogin('audit-manager');
      const approverLogin = uniqueLogin('audit-approver');
      const managerId = await seedUser(db.pool, 'tenant_acme', managerLogin);
      const approverId = await seedUser(db.pool, 'tenant_acme', approverLogin);
      await grant(db.pool, 'acme', managerLogin, APPROVALS_MANAGE);
      await grant(db.pool, 'acme', managerLogin, RECORDS_MANAGE);
      const manager = await signIn(app, 'acme', managerLogin);
      const approver = await signIn(app, 'acme', approverLogin);

      const requestType = `REQ-${randomUUID().slice(0, 8).toUpperCase()}`;
      const chain = await call(app, 'POST', '/approval-chains', manager, {
        scopeType: 'company',
        requestType,
        module: 'projects',
        name: 'Audit chain check',
      });
      expect(chain.statusCode, chain.body).toBe(201);
      const chainId = (chain.json() as { data: { id: string } }).data.id;

      const version = await call(app, 'POST', '/matrix-versions', manager, {
        chainId,
        effectiveFrom: '2026-01-01',
      });
      expect(version.statusCode, version.body).toBe(201);
      const versionData = (version.json() as { data: { id: string; rowVersion: number } }).data;

      const level = await call(app, 'POST', '/matrix-levels', manager, {
        matrixVersionId: versionData.id,
        levelNo: 1,
        approverUserId: approverId,
      });
      expect(level.statusCode, level.body).toBe(201);

      const published = await call(
        app,
        'POST',
        `/matrix-versions/${versionData.id}/publish`,
        manager,
        {
          rowVersion: versionData.rowVersion,
        },
      );
      expect(published.statusCode, published.body).toBe(200);

      const raised = await call(app, 'POST', '/approval-requests', manager, {
        requestType,
        module: 'projects',
        amount: 5000,
        title: 'Audit request',
      });
      expect(raised.statusCode, raised.body).toBe(201);
      const request = (raised.json() as { data: { id: string; rowVersion: number } }).data;

      const acted = await call(app, 'POST', `/approval-requests/${request.id}/actions`, approver, {
        action: 'approve',
        rowVersion: request.rowVersion,
      });
      expect(acted.statusCode, acted.body).toBe(201);

      const notified = await call(app, 'POST', '/notifications', manager, {
        recipientUserId: managerId,
        notificationType: 'approval',
        title: 'Request approved',
      });
      expect(notified.statusCode, notified.body).toBe(201);

      const counted = await call(app, 'POST', '/usage-counters/increment', manager, {
        metric: 'logins',
        scopeKey: 'site-audit',
        weekStart: '2026-11-16',
        by: 2,
      });
      expect(counted.statusCode, counted.body).toBe(200);

      const ticket = await call(app, 'POST', '/tickets', approver, {
        code: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
        subject: 'Audit ticket',
        category: 'test',
      });
      expect(ticket.statusCode, ticket.body).toBe(201);

      const report = await withTenant(db.pool, 'acme', (client) => verifyAuditChain(client));
      expect(report.brokenAt).toBeNull();
      // Every write above is audited: chain, version, level, publish, raise, action, notification, counter, ticket.
      expect(report.rows).toBeGreaterThanOrEqual(9);

      const { rows } = await db.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM tenant_acme.audit_row_change
       WHERE old_row::text ~* '(password|pin|refresh|secret)_hash'
          OR new_row::text ~* '(password|pin|refresh|secret)_hash'`,
      );
      expect(rows[0]?.total).toBe('0');
    });
  },
);
