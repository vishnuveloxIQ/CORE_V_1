import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idempotencyFor } from '../testing-pass/helpers.js';
import { needsStepUp, stepUpToken } from '../auth/step-up-helper.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { PROJECTS_MANAGE } from '../../src/modules/projects/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Integration tests for Phase 5b. Every record is created by its own test with a unique code, so the tests
// do not depend on each other's order. All names and coordinates are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'projects-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 30_000;

/** A code that no other test uses. */
function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

/** A record as the API returns it. Only the fields the tests read are typed. */
interface Row {
  id: string;
  code: string;
  rowVersion: number;
  [field: string]: unknown;
}

interface AuditRow {
  op: string;
  actor_id: string | null;
  module_name: string | null;
  new_row: Record<string, unknown> | null;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'projects and sites (phase 5b)',
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

    function uniqueLogin(prefix: string): string {
      return `${prefix}-${randomUUID().slice(0, 8)}`;
    }

    async function seedUser(loginId: string): Promise<string> {
      const hash = await hashSecret(PASSWORD);
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, 'Projects User', 'active', $2, 0)
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

    /** A user who holds projects.manage, granted with the bootstrap function that the CLI uses. */
    async function managerUser(): Promise<{ id: string; token: string }> {
      const loginId = uniqueLogin('proj-manager');
      const id = await seedUser(loginId);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: PROJECTS_MANAGE,
      });
      return { id, token: await signIn(loginId) };
    }

    async function plainUser(): Promise<{ id: string; token: string }> {
      const loginId = uniqueLogin('proj-user');
      const id = await seedUser(loginId);
      return { id, token: await signIn(loginId) };
    }

    async function call(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: string,
      token: string | null,
      payload?: object,
    ) {
      // geo-fence zone writes need a passkey step-up (auth/step-up.ts); the helper enrols a test passkey once
      const stepUp =
        token && needsStepUp(method, url) ? { 'x-step-up-token': await stepUpToken(app!, token) } : {};
      return app!.inject({
        method,
        url,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...stepUp,
          ...idempotencyFor(method, url),
        },
        ...(payload !== undefined ? { payload } : {}),
      });
    }

    /** Creates one record and returns it. The create must answer 201. */
    async function createRow(token: string, url: string, payload: object): Promise<Row> {
      const res = await call('POST', url, token, payload);
      expect(res.statusCode, `${url}: ${res.body}`).toBe(201);
      return res.json().data as Row;
    }

    async function newProject(token: string): Promise<Row> {
      return createRow(token, '/projects', { code: uniq('PRJ'), name: 'Fictional Metro Phase 2' });
    }

    async function newLocation(token: string, projectId: string): Promise<Row> {
      return createRow(token, '/locations', {
        code: uniq('LOC'),
        name: 'Fictional Site North',
        projectId,
      });
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

    it('projects: create with dates and value, change only with the current version, close by status, audit both', async () => {
      const manager = await managerUser();
      const code = uniq('PRJ');

      const created = await call('POST', '/projects', manager.token, {
        code,
        name: 'Fictional Metro Phase 2',
        client: 'Example Client Ltd',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        valueAmount: 1250000.5,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().data).toMatchObject({
        code,
        status: 'active',
        rowVersion: 1,
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        valueAmount: 1250000.5,
      });
      const id = created.json().data.id as string;

      const reversed = await call('POST', '/projects', manager.token, {
        code: uniq('PRJ'),
        name: 'Reversed dates',
        startDate: '2026-05-01',
        endDate: '2026-04-30',
      });
      expect(reversed.statusCode).toBe(400);
      expect(reversed.json().error.code).toBe('VALIDATION_ERROR');

      const duplicate = await call('POST', '/projects', manager.token, {
        code: code.toLowerCase(),
        name: 'Same code, other case',
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('PROJECTS_DUPLICATE');

      const noVersion = await call('PATCH', `/projects/${id}`, manager.token, { name: 'Renamed' });
      // The PATCH schema requires rowVersion (as in 5a), so a missing one fails validation with a 400.
      expect(noVersion.statusCode).toBe(400);
      expect(noVersion.json().error.code).toBe('VALIDATION_ERROR');

      const stale = await call('PATCH', `/projects/${id}`, manager.token, {
        name: 'Renamed',
        rowVersion: 9,
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('VERSION_CONFLICT');

      const endBeforeStart = await call('PATCH', `/projects/${id}`, manager.token, {
        endDate: '2026-03-01',
        rowVersion: 1,
      });
      expect(endBeforeStart.statusCode).toBe(400);
      expect(endBeforeStart.json().error.code).toBe('VALIDATION_ERROR');

      const closed = await call('PATCH', `/projects/${id}`, manager.token, {
        status: 'inactive',
        rowVersion: 1,
      });
      expect(closed.statusCode).toBe(200);
      expect(closed.json().data).toMatchObject({ status: 'inactive', rowVersion: 2 });

      // A project is closed by status and never deleted (design point b).
      const noDelete = await call('DELETE', `/projects/${id}`, manager.token);
      expect(noDelete.statusCode).toBe(404);

      const rows = await auditRows('core_project', id);
      expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
      expect(rows.every((r) => r.actor_id === manager.id && r.module_name === 'core')).toBe(true);
    });

    it('locations: coordinates and chainage in pairs, week-off days, project fixed after create, deactivate', async () => {
      const manager = await managerUser();
      const project = await newProject(manager.token);
      const other = await newProject(manager.token);

      const location = await createRow(manager.token, '/locations', {
        code: uniq('LOC'),
        name: 'Fictional Site North',
        projectId: project.id,
        latitude: 12.9716,
        longitude: 77.5946,
        chainageStartKm: 10.5,
        chainageEndKm: 12.25,
        weekOffDays: [7, 6, 7],
      });
      expect(location).toMatchObject({
        projectId: project.id,
        status: 'active',
        weekOffDays: [6, 7],
        rowVersion: 1,
      });
      const id = location.id;

      const halfCoordinates = await call('POST', '/locations', manager.token, {
        code: uniq('LOC'),
        name: 'Latitude only',
        projectId: project.id,
        latitude: 12.9,
      });
      expect(halfCoordinates.statusCode).toBe(400);
      expect(halfCoordinates.json().error.code).toBe('VALIDATION_ERROR');

      const reversedChainage = await call('POST', '/locations', manager.token, {
        code: uniq('LOC'),
        name: 'Reversed chainage',
        projectId: project.id,
        chainageStartKm: 12,
        chainageEndKm: 10.5,
      });
      expect(reversedChainage.statusCode).toBe(400);

      const unknownProject = await call('POST', '/locations', manager.token, {
        code: uniq('LOC'),
        name: 'No such project',
        projectId: randomUUID(),
      });
      expect(unknownProject.statusCode).toBe(400);
      expect(unknownProject.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');

      // projectId is fixed after create: the patch schema refuses it.
      const moved = await call('PATCH', `/locations/${id}`, manager.token, {
        projectId: other.id,
        rowVersion: 1,
      });
      expect(moved.statusCode).toBe(400);
      expect(moved.json().error.code).toBe('VALIDATION_ERROR');

      const deactivated = await call('PATCH', `/locations/${id}`, manager.token, {
        status: 'inactive',
        rowVersion: 1,
      });
      expect(deactivated.statusCode).toBe(200);
      expect(deactivated.json().data).toMatchObject({ status: 'inactive', rowVersion: 2 });

      const listed = await call('GET', `/locations?projectId=${project.id}`, manager.token);
      expect(listed.statusCode).toBe(200);
      const ids = (listed.json().data as Row[]).map((row) => row.id);
      expect(ids).toContain(id);
      expect((listed.json().data as Row[]).every((row) => row.projectId === project.id)).toBe(true);

      const badFilter = await call('GET', '/locations?projectId=not-a-uuid', manager.token);
      expect(badFilter.statusCode).toBe(400);

      const rows = await auditRows('core_location', id);
      expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
    });

    it('stores: the chainage marker must sit on the same project as the location', async () => {
      const manager = await managerUser();
      const projectA = await newProject(manager.token);
      const projectB = await newProject(manager.token);
      const locationA = await newLocation(manager.token, projectA.id);
      const markerA = await createRow(manager.token, '/chainage-markers', {
        code: uniq('CH'),
        projectId: projectA.id,
        chainageKm: 11,
      });
      const markerB = await createRow(manager.token, '/chainage-markers', {
        code: uniq('CH'),
        projectId: projectB.id,
        chainageKm: 11,
      });

      const mismatch = await call('POST', '/stores', manager.token, {
        code: uniq('ST'),
        name: 'Cross-project store',
        projectId: locationA.projectId,
        chainageMarkerId: markerB.id,
      });
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json().error.code).toBe('PROJECTS_REFERENCE_MISMATCH');

      const unknownLocation = await call('POST', '/stores', manager.token, {
        code: uniq('ST'),
        name: 'No such location',
        projectId: randomUUID(),
      });
      expect(unknownLocation.statusCode).toBe(400);
      expect(unknownLocation.json().error.code).toBe('PROJECTS_REFERENCE_NOT_FOUND');

      const store = await createRow(manager.token, '/stores', {
        code: uniq('ST'),
        name: 'Main store',
        projectId: locationA.projectId,
        chainageMarkerId: markerA.id,
      });
      expect(store).toMatchObject({ status: 'active', rowVersion: 1 });

      const moved = await call('PATCH', `/stores/${store.id}`, manager.token, {
        chainageMarkerId: markerB.id,
        rowVersion: 1,
      });
      expect(moved.statusCode).toBe(400);
      expect(moved.json().error.code).toBe('PROJECTS_REFERENCE_MISMATCH');

      const deactivated = await call('PATCH', `/stores/${store.id}`, manager.token, {
        status: 'inactive',
        rowVersion: 1,
      });
      expect(deactivated.statusCode).toBe(200);
      expect(deactivated.json().data).toMatchObject({ status: 'inactive', rowVersion: 2 });
    });

    it('chainage markers: codes per project, km zero or more, delete only when unused, audit the delete', async () => {
      const manager = await managerUser();
      const projectA = await newProject(manager.token);
      const projectB = await newProject(manager.token);
      const locationA = await newLocation(manager.token, projectA.id);
      const code = uniq('CH');

      const markerA = await createRow(manager.token, '/chainage-markers', {
        code,
        label: 'Bridge start',
        projectId: projectA.id,
        chainageKm: 10.5,
      });
      const markerB = await createRow(manager.token, '/chainage-markers', {
        code,
        projectId: projectB.id,
        chainageKm: 10.5,
      });
      expect(markerB.projectId).toBe(projectB.id);

      const duplicate = await call('POST', '/chainage-markers', manager.token, {
        code: code.toLowerCase(),
        projectId: projectA.id,
        chainageKm: 12,
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('PROJECTS_DUPLICATE');

      const negative = await call('POST', '/chainage-markers', manager.token, {
        code: uniq('CH'),
        projectId: projectA.id,
        chainageKm: -1,
      });
      expect(negative.statusCode).toBe(400);
      expect(negative.json().error.code).toBe('VALIDATION_ERROR');

      const store = await call('POST', '/stores', manager.token, {
        code: uniq('ST'),
        name: 'Store at the bridge',
        projectId: locationA.projectId,
        chainageMarkerId: markerA.id,
      });
      expect(store.statusCode).toBe(201);

      const inUse = await call('DELETE', `/chainage-markers/${markerA.id}`, manager.token);
      expect(inUse.statusCode).toBe(409);
      expect(inUse.json().error.code).toBe('PROJECTS_IN_USE');

      const deleted = await call('DELETE', `/chainage-markers/${markerB.id}`, manager.token);
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json().data).toEqual({ deleted: true });

      const rows = await auditRows('core_chainage_marker', markerB.id);
      expect(rows.map((r) => r.op)).toEqual(['INSERT', 'DELETE']);
    });

    it('geo zones: shape fields, version rises only when the fence changes, delete', async () => {
      const manager = await managerUser();
      const project = await newProject(manager.token);

      const zone = await createRow(manager.token, '/geo-zones', {
        projectId: project.id,
        label: 'Gate 1 attendance',
        zoneType: 'attendance',
        shape: 'circle',
        centerLat: 12.9716,
        centerLng: 77.5946,
        radiusM: 150,
      });
      expect(zone).toMatchObject({ shape: 'circle', version: 1, rowVersion: 1 });
      const id = zone.id;

      const noRadius = await call('POST', '/geo-zones', manager.token, {
        projectId: project.id,
        label: 'Circle without radius',
        zoneType: 'attendance',
        shape: 'circle',
        centerLat: 12.9716,
        centerLng: 77.5946,
      });
      expect(noRadius.statusCode).toBe(400);
      expect(noRadius.json().error.code).toBe('VALIDATION_ERROR');

      const shortPolygon = await call('POST', '/geo-zones', manager.token, {
        projectId: project.id,
        label: 'Two-point polygon',
        zoneType: 'equipment',
        shape: 'polygon',
        points: [
          [12.9, 77.6],
          [12.91, 77.61],
        ],
      });
      expect(shortPolygon.statusCode).toBe(400);
      expect(shortPolygon.json().error.code).toBe('VALIDATION_ERROR');

      const polygon = await createRow(manager.token, '/geo-zones', {
        projectId: project.id,
        label: 'Yard boundary',
        zoneType: 'equipment',
        shape: 'polygon',
        points: [
          [12.9, 77.6],
          [12.91, 77.6],
          [12.91, 77.61],
        ],
      });
      expect(polygon).toMatchObject({ version: 1 });

      // A label change keeps the fence, so the version stays.
      const relabelled = await call('PATCH', `/geo-zones/${id}`, manager.token, {
        label: 'Gate 1 (renamed)',
        rowVersion: 1,
      });
      expect(relabelled.statusCode).toBe(200);
      expect(relabelled.json().data).toMatchObject({ version: 1, rowVersion: 2 });

      // A new radius changes the fence, so the version rises by one.
      const wider = await call('PATCH', `/geo-zones/${id}`, manager.token, {
        radiusM: 200,
        rowVersion: 2,
      });
      expect(wider.statusCode).toBe(200);
      expect(wider.json().data).toMatchObject({ radiusM: 200, version: 2, rowVersion: 3 });

      const retyped = await call('PATCH', `/geo-zones/${id}`, manager.token, {
        zoneType: 'equipment',
        rowVersion: 3,
      });
      expect(retyped.statusCode).toBe(200);
      expect(retyped.json().data).toMatchObject({ zoneType: 'equipment', version: 3 });

      const reshaped = await call('PATCH', `/geo-zones/${polygon.id}`, manager.token, {
        points: [
          [12.9, 77.6],
          [12.91, 77.6],
          [12.91, 77.61],
          [12.9, 77.61],
        ],
        rowVersion: 1,
      });
      expect(reshaped.statusCode).toBe(200);
      expect(reshaped.json().data).toMatchObject({ version: 2 });

      const deleted = await call('DELETE', `/geo-zones/${id}`, manager.token);
      expect(deleted.statusCode).toBe(200);

      const listed = await call('GET', `/geo-zones?projectId=${project.id}`, manager.token);
      const ids = (listed.json().data as Row[]).map((row) => row.id);
      expect(ids).not.toContain(id);

      const rows = await auditRows('core_geo_zone', id);
      expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE', 'UPDATE', 'UPDATE', 'DELETE']);
    });

    it('milestones: weights total at most 100 per project, cancelled ones count, the row itself is left out on edit', async () => {
      const manager = await managerUser();
      const project = await newProject(manager.token);
      const other = await newProject(manager.token);

      const foundation = await createRow(manager.token, '/milestones', {
        projectId: project.id,
        name: 'Foundation',
        dueDate: '2026-06-30',
        weight: 60,
      });
      expect(foundation).toMatchObject({ weight: 60, status: 'pending', rowVersion: 1 });

      const over = await call('POST', '/milestones', manager.token, {
        projectId: project.id,
        name: 'Just over',
        weight: 40.01,
      });
      expect(over.statusCode).toBe(400);
      expect(over.json().error.code).toBe('PROJECTS_WEIGHT_EXCEEDED');

      const handover = await createRow(manager.token, '/milestones', {
        projectId: project.id,
        name: 'Handover',
        weight: 40,
      });

      // Another project has its own total.
      await createRow(manager.token, '/milestones', {
        projectId: other.id,
        name: 'Other project',
        weight: 90,
      });

      // Renaming keeps the weight, and the row is not counted against itself.
      const renamed = await call('PATCH', `/milestones/${foundation.id}`, manager.token, {
        name: 'Foundation (revised)',
        rowVersion: 1,
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().data).toMatchObject({ weight: 60, rowVersion: 2 });

      const raised = await call('PATCH', `/milestones/${foundation.id}`, manager.token, {
        weight: 61,
        rowVersion: 2,
      });
      expect(raised.statusCode).toBe(400);
      expect(raised.json().error.code).toBe('PROJECTS_WEIGHT_EXCEEDED');

      // A cancelled milestone still counts toward the total (design point h, a judgement call).
      const cancelled = await call('PATCH', `/milestones/${handover.id}`, manager.token, {
        status: 'cancelled',
        rowVersion: 1,
      });
      expect(cancelled.statusCode).toBe(200);
      const stillCounted = await call('POST', '/milestones', manager.token, {
        projectId: project.id,
        name: 'Tiny addition',
        weight: 0.01,
      });
      expect(stillCounted.statusCode).toBe(400);
      expect(stillCounted.json().error.code).toBe('PROJECTS_WEIGHT_EXCEEDED');

      const removed = await call('DELETE', `/milestones/${handover.id}`, manager.token);
      expect(removed.statusCode).toBe(200);

      const room = await call('POST', '/milestones', manager.token, {
        projectId: project.id,
        name: 'Back in the room',
        weight: 40,
      });
      expect(room.statusCode).toBe(201);

      const badWeight = await call('POST', '/milestones', manager.token, {
        projectId: project.id,
        name: 'Above 100',
        weight: 101,
      });
      expect(badWeight.statusCode).toBe(400);
      expect(badWeight.json().error.code).toBe('VALIDATION_ERROR');

      const rows = await auditRows('core_project_milestone', handover.id);
      expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    });

    it('the migration keys and CHECKs hold when rows are written directly (0010)', async () => {
      const manager = await managerUser();
      const project = await newProject(manager.token);
      const projectCode = project.code;

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_project (code, name, start_date, end_date)
         VALUES ($1, 'Reversed', '2026-06-02', '2026-06-01')`,
          [uniq('DB')],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_project_dates_check' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_project (code, name) VALUES ($1, 'Case clash')`,
          [projectCode.toLowerCase()],
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: 'core_project_code_key' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_location (code, name, project_id, latitude)
         VALUES ($1, 'Latitude only', $2, 12.9)`,
          [uniq('DB'), project.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_location_coordinates_check' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_location (code, name, project_id, chainage_start_km, chainage_end_km)
         VALUES ($1, 'Reversed chainage', $2, 12, 10.5)`,
          [uniq('DB'), project.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_location_chainage_order_check' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_chainage_marker (code, project_id, chainage_km)
         VALUES ($1, $2, -1)`,
          [uniq('DB'), project.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_chainage_marker_km_check' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_geo_zone (project_id, label, zone_type, shape, center_lat, center_lng)
         VALUES ($1, 'Circle without radius', 'attendance', 'circle', 12.9, 77.6)`,
          [project.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_geo_zone_shape_fields_check' });

      await expect(
        db.pool.query(
          `INSERT INTO tenant_acme.core_project_milestone (project_id, name, weight)
         VALUES ($1, 'Too heavy', 100.01)`,
          [project.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'core_project_milestone_weight_check' });
    });

    it('answers 401 without a token and 403 without projects.manage on every write; reads need only a sign-in', async () => {
      const plain = await plainUser();
      const target = randomUUID();
      const writes: Array<{ method: 'POST' | 'PATCH' | 'DELETE'; url: string }> = [
        { method: 'POST', url: '/projects' },
        { method: 'PATCH', url: `/projects/${target}` },
        { method: 'POST', url: '/locations' },
        { method: 'PATCH', url: `/locations/${target}` },
        { method: 'POST', url: '/stores' },
        { method: 'PATCH', url: `/stores/${target}` },
        { method: 'POST', url: '/chainage-markers' },
        { method: 'PATCH', url: `/chainage-markers/${target}` },
        { method: 'DELETE', url: `/chainage-markers/${target}` },
        { method: 'POST', url: '/geo-zones' },
        { method: 'PATCH', url: `/geo-zones/${target}` },
        { method: 'DELETE', url: `/geo-zones/${target}` },
        { method: 'POST', url: '/milestones' },
        { method: 'PATCH', url: `/milestones/${target}` },
        { method: 'DELETE', url: `/milestones/${target}` },
      ];
      for (const route of writes) {
        const anonymous = await call(route.method, route.url, null, {});
        expect(anonymous.statusCode, route.url).toBe(401);
        const denied = await call(route.method, route.url, plain.token, {});
        expect(denied.statusCode, route.url).toBe(403);
        expect(denied.json().error.code).toBe('ACCESS_DENIED');
      }

      for (const url of [
        '/projects',
        '/locations',
        '/stores',
        '/chainage-markers',
        '/geo-zones',
        '/milestones',
      ]) {
        const res = await call('GET', url, plain.token);
        expect(res.statusCode, url).toBe(200);
        // Earlier tests share this database, so the lists are not empty; only the shape is checked.
        expect(Array.isArray(res.json().data), url).toBe(true);
      }
      const anonymousRead = await call('GET', '/projects', null);
      expect(anonymousRead.statusCode).toBe(401);
    });
  },
);
