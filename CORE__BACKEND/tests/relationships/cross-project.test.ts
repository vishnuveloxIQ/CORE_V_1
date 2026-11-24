import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Cross-project leakage and invalid relationships. Two projects (A and B) each get their own location, chainage
// marker, store, WBS node and milestone. Lists filtered by project must not show the other project's rows, a
// record must not be linked to another project's record, and a record must not be moved to another project.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'relationships-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;

function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface Row {
  id: string;
  code: string;
  [field: string]: unknown;
}

describe.skipIf(!TEST_DATABASE_URL)('cross-project leakage and relationships', { timeout: SLOW_TEST_MS }, () => {
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

  async function manager(): Promise<string> {
    const loginId = `xp-${randomUUID().slice(0, 8)}`;
    const hash = await hashSecret(PASSWORD);
    await db.pool.query(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Relationship Tester', 'active', $2, 0)`,
      [loginId, hash],
    );
    await grantPrivilegeByLogin(db.pool, { tenantId: TENANT, loginId, privilege: PROJECTS_MANAGE });
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.accessToken as string;
  }

  function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, payload?: object) {
    return app!.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': TENANT, ...idempotencyFor(method, url) },
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  async function createRow(token: string, url: string, payload: object): Promise<Row> {
    const res = await call('POST', url, token, payload);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
    return res.json().data as Row;
  }

  /** Two projects, each with one location, marker, store, WBS node and milestone. */
  async function twoProjects(token: string) {
    const make = async (label: string) => {
      const project = await createRow(token, '/projects', { code: uniq('PRJ'), name: `Project ${label}` });
      const location = await createRow(token, '/locations', { code: uniq('LOC'), name: `Site ${label}`, projectId: project.id });
      const marker = await createRow(token, '/chainage-markers', { code: uniq('CH'), projectId: project.id, chainageKm: 11 });
      const store = await createRow(token, '/stores', {
        code: uniq('ST'),
        name: `Store ${label}`,
        locationId: location.id,
        chainageMarkerId: marker.id,
      });
      const wbs = await createRow(token, '/wbs-nodes', { code: uniq('W'), name: `WBS ${label}`, projectId: project.id });
      const milestone = await createRow(token, '/milestones', { projectId: project.id, name: `Milestone ${label}`, weight: 10 });
      return { project, location, marker, store, wbs, milestone };
    };
    return { a: await make('A'), b: await make('B') };
  }

  it('filtered lists show only the chosen project: locations, markers, WBS nodes and milestones', async () => {
    const token = await manager();
    const { a, b } = await twoProjects(token);

    const locations = (await call('GET', `/locations?projectId=${a.project.id}`, token)).json().data as Row[];
    expect(locations.map((r) => r.id)).toContain(a.location.id);
    expect(locations.map((r) => r.id)).not.toContain(b.location.id);

    const markers = (await call('GET', `/chainage-markers?projectId=${b.project.id}`, token)).json().data as Row[];
    expect(markers.map((r) => r.id)).toContain(b.marker.id);
    expect(markers.map((r) => r.id)).not.toContain(a.marker.id);

    const wbs = (await call('GET', `/wbs-nodes?projectId=${a.project.id}`, token)).json().data as Row[];
    expect(wbs.map((r) => r.id)).toContain(a.wbs.id);
    expect(wbs.map((r) => r.id)).not.toContain(b.wbs.id);

    const milestones = (await call('GET', `/milestones?projectId=${a.project.id}`, token)).json().data as Row[];
    expect(milestones.map((r) => r.id)).toContain(a.milestone.id);
    expect(milestones.map((r) => r.id)).not.toContain(b.milestone.id);
  });

  it('a store cannot take a location and a marker from two different projects, on create or on move', async () => {
    const token = await manager();
    const { a, b } = await twoProjects(token);

    const mixedCreate = await call('POST', '/stores', token, {
      code: uniq('ST'),
      name: 'Mixed store',
      locationId: a.location.id,
      chainageMarkerId: b.marker.id,
    });
    expect(mixedCreate.statusCode).toBe(400);
    expect(mixedCreate.json().error.code).toBe('PROJECTS_REFERENCE_MISMATCH');

    // Moving the store's location to project B while its marker stays on project A is refused too.
    const moved = await call('PATCH', `/stores/${a.store.id}`, token, {
      locationId: b.location.id,
      rowVersion: a.store.rowVersion,
    });
    expect(moved.statusCode).toBe(400);
    expect(moved.json().error.code).toBe('PROJECTS_REFERENCE_MISMATCH');
  });

  it('a WBS node cannot have a parent from another project', async () => {
    const token = await manager();
    const { a, b } = await twoProjects(token);

    const crossParent = await call('POST', '/wbs-nodes', token, {
      code: uniq('W'),
      name: 'Parent elsewhere',
      projectId: a.project.id,
      parentWbsNodeId: b.wbs.id,
    });
    expect(crossParent.statusCode).toBe(400);
    expect(crossParent.json().error.code).toBe('PROJECTS_REFERENCE_MISMATCH');
  });

  it('a record cannot be moved to another project: location, marker, WBS node and milestone refuse a projectId change', async () => {
    const token = await manager();
    const { a, b } = await twoProjects(token);

    const moves: Array<[string, string, object]> = [
      [`/locations/${a.location.id}`, 'location', { projectId: b.project.id, rowVersion: a.location.rowVersion }],
      [`/chainage-markers/${a.marker.id}`, 'marker', { projectId: b.project.id, rowVersion: a.marker.rowVersion }],
      [`/wbs-nodes/${a.wbs.id}`, 'WBS node', { projectId: b.project.id, rowVersion: a.wbs.rowVersion }],
      [`/milestones/${a.milestone.id}`, 'milestone', { projectId: b.project.id, rowVersion: a.milestone.rowVersion }],
    ];
    for (const [url, label, body] of moves) {
      const res = await call('PATCH', url, token, body);
      // The PATCH schema has no projectId, and unknown keys are refused (strict), so the move never reaches the database.
      expect(res.statusCode, label).toBe(400);
      expect(res.json().error.code, label).toBe('VALIDATION_ERROR');
    }

    // Control: the same PATCH without the projectId succeeds, so the refusal above is about the move, not the request.
    const control = await call('PATCH', `/locations/${a.location.id}`, token, {
      name: 'Site A, renamed',
      rowVersion: a.location.rowVersion,
    });
    expect(control.statusCode).toBe(200);
    expect(control.json().data).toMatchObject({ name: 'Site A, renamed', projectId: a.project.id });

    // The records stay where they were.
    const stillA = (await call('GET', `/locations?projectId=${a.project.id}`, token)).json().data as Row[];
    expect(stillA.map((r) => r.id)).toContain(a.location.id);
  });

  it('a location, marker or milestone cannot be created under a project that does not exist', async () => {
    const token = await manager();
    const missing = randomUUID();

    const location = await call('POST', '/locations', token, { code: uniq('LOC'), name: 'Orphan', projectId: missing });
    expect(location.statusCode).toBe(400);
    expect(location.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');

    const marker = await call('POST', '/chainage-markers', token, { code: uniq('CH'), projectId: missing, chainageKm: 5 });
    expect(marker.statusCode).toBe(400);
    expect(marker.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');

    const milestone = await call('POST', '/milestones', token, { projectId: missing, name: 'Orphan', weight: 5 });
    expect(milestone.statusCode).toBe(400);
    expect(milestone.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');
  });

  it('a store cannot point at a marker or location that does not exist', async () => {
    const token = await manager();
    const { a } = await twoProjects(token);

    const noMarker = await call('POST', '/stores', token, {
      code: uniq('ST'),
      name: 'No marker',
      locationId: a.location.id,
      chainageMarkerId: randomUUID(),
    });
    expect(noMarker.statusCode).toBe(400);
    expect(noMarker.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');

    const noLocation = await call('POST', '/stores', token, {
      code: uniq('ST'),
      name: 'No location',
      locationId: randomUUID(),
    });
    expect(noLocation.statusCode).toBe(400);
    expect(noLocation.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');
  });
});
