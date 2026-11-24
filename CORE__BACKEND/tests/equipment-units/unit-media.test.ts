import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { MASTERS_MANAGE } from '../../src/modules/masters/routes.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
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

// Integration tests for migration 0028: last ping, machine photo and the documents map on equipment units. Files are
// created through POST /files with owner type equipment_unit. All names and codes are fictional.

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

interface UnitRow {
  id: string;
  assetCode: string;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  photoFileId: string | null;
  documents: Record<string, string> | null;
  rowVersion: number;
}

function dataOf<T>(reply: Reply): T {
  return (reply.json() as { data: T }).data;
}

function errorOf(reply: Reply): { code: string; details?: { issues?: { path: string }[] } } {
  return (reply.json() as { error: { code: string; details?: { issues?: { path: string }[] } } })
    .error;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'equipment unit media (migration 0028)',
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
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      token: string | null,
      payload?: object,
    ) => callApp(app!, method, url, token, payload);

    async function tokenWith(privileges: string[]): Promise<string> {
      const loginId = uniqueLogin('unit-media');
      await seedUser(db.pool, SCHEMA, loginId);
      for (const privilege of privileges) await grant(db.pool, TENANT, loginId, privilege);
      return signIn(app!, TENANT, loginId);
    }

    async function newUnit(token: string, extra: object = {}): Promise<UnitRow> {
      const type = await call('POST', '/equipment-types', token, {
        code: `ET_${randomUUID().slice(0, 8)}`,
        name: 'Fictional Loader type',
      });
      expect(type.statusCode, type.body).toBe(201);
      const res = await call('POST', '/equipment-units', token, {
        assetCode: `MEDIA-${randomUUID().slice(0, 8).toUpperCase()}`,
        equipmentTypeId: dataOf<{ id: string }>(type).id,
        ...extra,
      });
      expect(res.statusCode, res.body).toBe(201);
      return dataOf<UnitRow>(res);
    }

    /** A file metadata row owned by the unit (owner type equipment_unit, a free-text owner type). */
    async function newFile(token: string, unitId: string, fileName: string): Promise<string> {
      const res = await call('POST', '/files', token, {
        ownerType: 'equipment_unit',
        ownerId: unitId,
        fileName,
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        objectKey: `units/${unitId}/${fileName}`,
      });
      expect(res.statusCode, res.body).toBe(201);
      return dataOf<{ id: string }>(res).id;
    }

    it('returns the new fields as null on a unit that has none', async () => {
      const token = await tokenWith([MASTERS_MANAGE]);
      const unit = await newUnit(token);
      expect(unit).toMatchObject({
        lat: null,
        lng: null,
        lastPingAt: null,
        photoFileId: null,
        documents: null,
      });
    });

    it('sets lat, lng and lastPingAt on create and PATCH, and refuses out-of-range values', async () => {
      const token = await tokenWith([MASTERS_MANAGE]);
      const unit = await newUnit(token, {
        lat: 17.385,
        lng: 78.4867,
        lastPingAt: '2026-11-01T08:30:00Z',
      });
      expect(unit.lat).toBe(17.385);
      expect(unit.lng).toBe(78.4867);
      expect(new Date(unit.lastPingAt!).toISOString()).toBe('2026-11-01T08:30:00.000Z');

      const patched = await call('PATCH', `/equipment-units/${unit.id}`, token, {
        rowVersion: unit.rowVersion,
        lat: -12.5,
        lng: 130.25,
        lastPingAt: null,
      });
      expect(patched.statusCode, patched.body).toBe(200);
      expect(dataOf<UnitRow>(patched)).toMatchObject({ lat: -12.5, lng: 130.25, lastPingAt: null });

      for (const bad of [
        { lat: 90.5 },
        { lat: -91 },
        { lng: 180.1 },
        { lng: -181 },
        { lastPingAt: 'yesterday' },
      ]) {
        const res = await call('PATCH', `/equipment-units/${unit.id}`, token, {
          rowVersion: 2,
          ...bad,
        });
        expect(res.statusCode, JSON.stringify(bad)).toBe(400);
        expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      }
    });

    it('links a machine photo and documents by file id, reads them back, and clears them with null', async () => {
      const token = await tokenWith([MASTERS_MANAGE, RECORDS_MANAGE]);
      const unit = await newUnit(token);
      const photo = await newFile(token, unit.id, 'machine.jpg');
      const meter = await newFile(token, unit.id, 'meter.jpg');
      const invoice = await newFile(token, unit.id, 'invoice.pdf');

      const patched = await call('PATCH', `/equipment-units/${unit.id}`, token, {
        rowVersion: unit.rowVersion,
        photoFileId: photo,
        documents: { meterPhoto: meter, invoiceDoc: invoice },
      });
      expect(patched.statusCode, patched.body).toBe(200);
      expect(dataOf<UnitRow>(patched)).toMatchObject({
        photoFileId: photo,
        documents: { meterPhoto: meter, invoiceDoc: invoice },
      });

      const listed = dataOf<UnitRow[]>(
        await call('GET', `/equipment-units?search=${unit.assetCode}`, token),
      );
      expect(listed[0]).toMatchObject({ photoFileId: photo, documents: { meterPhoto: meter } });

      const cleared = await call('PATCH', `/equipment-units/${unit.id}`, token, {
        rowVersion: 2,
        photoFileId: null,
        documents: null,
      });
      expect(dataOf<UnitRow>(cleared)).toMatchObject({ photoFileId: null, documents: null });
    });

    it('accepts files linked on POST', async () => {
      const token = await tokenWith([MASTERS_MANAGE, RECORDS_MANAGE]);
      const holder = await newUnit(token);
      const photo = await newFile(token, holder.id, 'chassis.jpg');
      const unit = await newUnit(token, { photoFileId: photo, documents: { chasisPhoto: photo } });
      expect(unit).toMatchObject({ photoFileId: photo, documents: { chasisPhoto: photo } });
    });

    it('refuses an unknown file id with 400 EQUIPMENT_UNIT_FILE_NOT_FOUND, on POST and PATCH', async () => {
      const token = await tokenWith([MASTERS_MANAGE, RECORDS_MANAGE]);
      const unit = await newUnit(token);
      const real = await newFile(token, unit.id, 'puc.pdf');

      const badPhoto = await call('PATCH', `/equipment-units/${unit.id}`, token, {
        rowVersion: unit.rowVersion,
        photoFileId: randomUUID(),
      });
      expect(badPhoto.statusCode).toBe(400);
      expect(errorOf(badPhoto).code).toBe('EQUIPMENT_UNIT_FILE_NOT_FOUND');
      expect(errorOf(badPhoto).details?.issues?.[0]?.path).toBe('photoFileId');

      const badDoc = await call('PATCH', `/equipment-units/${unit.id}`, token, {
        rowVersion: unit.rowVersion,
        documents: { pucDoc: real, insuranceDoc: randomUUID() },
      });
      expect(badDoc.statusCode).toBe(400);
      expect(errorOf(badDoc).code).toBe('EQUIPMENT_UNIT_FILE_NOT_FOUND');
      expect(errorOf(badDoc).details?.issues?.[0]?.path).toBe('documents.insuranceDoc');

      const type = await call('POST', '/equipment-types', token, {
        code: `ET_${randomUUID().slice(0, 8)}`,
        name: 'Fictional Paver type',
      });
      const badCreate = await call('POST', '/equipment-units', token, {
        assetCode: `MEDIA-${randomUUID().slice(0, 8).toUpperCase()}`,
        equipmentTypeId: dataOf<{ id: string }>(type).id,
        documents: { meterPhoto: randomUUID() },
      });
      expect(badCreate.statusCode).toBe(400);
      expect(errorOf(badCreate).code).toBe('EQUIPMENT_UNIT_FILE_NOT_FOUND');

      // Nothing was written by the refused PATCHes.
      const current = dataOf<UnitRow[]>(
        await call('GET', `/equipment-units?search=${unit.assetCode}`, token),
      )[0]!;
      expect(current).toMatchObject({ rowVersion: 1, photoFileId: null, documents: null });
    });

    it('refuses a document key outside the allowed list and a value that is not a uuid', async () => {
      const token = await tokenWith([MASTERS_MANAGE, RECORDS_MANAGE]);
      const unit = await newUnit(token);
      const file = await newFile(token, unit.id, 'other.pdf');

      for (const documents of [{ rcBook: file }, { meterPhoto: 'not-a-uuid' }, ['x'], 'x']) {
        const res = await call('PATCH', `/equipment-units/${unit.id}`, token, {
          rowVersion: unit.rowVersion,
          documents,
        });
        expect(res.statusCode, JSON.stringify(documents)).toBe(400);
        expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      }
      await expect(
        db.pool.query(
          `UPDATE ${SCHEMA}.core_equipment_unit SET documents = jsonb_build_object('rcBook', $2::text) WHERE id = $1`,
          [unit.id, file],
        ),
      ).rejects.toThrow(/core_equipment_unit_documents_check/);
    });

    it('keeps the photo write behind masters.manage', async () => {
      const manager = await tokenWith([MASTERS_MANAGE]);
      const unit = await newUnit(manager);
      const plain = await tokenWith([]);
      const res = await call('PATCH', `/equipment-units/${unit.id}`, plain, {
        rowVersion: unit.rowVersion,
        photoFileId: randomUUID(),
      });
      expect(res.statusCode).toBe(403);
      expect(
        (await call('PATCH', `/equipment-units/${unit.id}`, null, { rowVersion: 1 })).statusCode,
      ).toBe(401);
    });
  },
);
