import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { RECORDS_MANAGE } from '../../src/modules/records/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// File content storage (migration 0015). Example data is fictional. Each test uses its own file rows.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'file-content-test-secret-with-at-least-32-characters';
const SLOW_TEST_MS = 60_000;
const MAX_BYTES = 2 * 1024 * 1024;
const PNG_TYPE = 'image/png';

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Bytes that start with the PNG signature, then random data, so the content is not text. */
function pngBytes(size: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, randomBytes(Math.max(0, size - signature.length))]);
}

interface Reply {
  statusCode: number;
  body: string;
  headers: Record<string, unknown>;
  rawPayload: Buffer;
  json: () => unknown;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'file content (migration 0015)',
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
       VALUES ($1, 'File User', 'active', $2, 0)
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
    async function userWith(manage: boolean): Promise<{ id: string; token: string; loginId: string }> {
      const loginId = `fc-${randomUUID().slice(0, 8)}`;
      const id = await seedUser(loginId);
      if (manage) {
        await grantPrivilegeByLogin(db.pool, {
          tenantId: TENANT,
          loginId,
          privilege: RECORDS_MANAGE,
        });
      }
      return { id, token: await signIn(loginId), loginId };
    }

    /** Sends a request. POST and PUT carry an Idempotency-Key unless key is null. */
    async function call(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      token: string | null,
      options: { payload?: object | Buffer; contentType?: string; key?: string | null } = {},
    ): Promise<Reply> {
      const headers: Record<string, string> = {};
      if (token) headers['authorization'] = `Bearer ${token}`;
      if (options.contentType) headers['content-type'] = options.contentType;
      if ((method === 'POST' || method === 'PUT') && options.key !== null) {
        headers['idempotency-key'] = options.key ?? randomUUID();
      }
      return app!.inject({
        method,
        url,
        headers,
        ...(options.payload !== undefined ? { payload: options.payload } : {}),
      }) as unknown as Promise<Reply>;
    }

    /** Creates a file row through POST /files, with metadata that the tests can override. */
    async function createFileRow(
      token: string,
      overrides: Record<string, unknown> = {},
    ): Promise<{ id: string; sizeBytes: number }> {
      const res = await call('POST', '/files', token, {
        payload: {
          ownerType: 'company',
          ownerId: randomUUID(),
          fileName: 'logo.png',
          contentType: PNG_TYPE,
          sizeBytes: 1024,
          objectKey: `obj-${randomUUID()}`,
          visibility: 'company',
          ...overrides,
        },
      });
      expect(res.statusCode, res.body).toBe(201);
      return (res.json() as { data: { id: string; sizeBytes: number } }).data;
    }

    function expectError(res: Reply, status: number, code: string): void {
      expect(res.statusCode, res.body).toBe(status);
      expect((res.json() as { error: { code: string } }).error.code).toBe(code);
    }

    it('stores bytes, returns the checksum and streams the same bytes back', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      const bytes = pngBytes(1024);

      const put = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: bytes,
        contentType: PNG_TYPE,
      });
      expect(put.statusCode, put.body).toBe(200);
      expect((put.json() as { data: unknown }).data).toEqual({
        id: file.id,
        sizeBytes: 1024,
        sha256: sha256Hex(bytes),
      });

      const get = await call('GET', `/files/${file.id}/content`, manager.token);
      expect(get.statusCode).toBe(200);
      expect(get.headers['content-type']).toBe(PNG_TYPE);
      expect(get.headers['cache-control']).toBe('private, max-age=0');
      expect(Buffer.compare(get.rawPayload, bytes)).toBe(0);

      const { rows } = await db.pool.query<{ sha256: string }>(
        'SELECT sha256 FROM tenant_acme.core_file WHERE id = $1',
        [file.id],
      );
      expect(rows[0]?.sha256).toBe(sha256Hex(bytes));
    });

    it('replaces existing content, and replays a repeated key without storing twice', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      const first = pngBytes(1024);
      const second = pngBytes(1024);

      const key = randomUUID();
      const one = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: first,
        contentType: PNG_TYPE,
        key,
      });
      expect(one.statusCode, one.body).toBe(200);
      const replay = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: first,
        contentType: PNG_TYPE,
        key,
      });
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.json()).toEqual(one.json());

      const again = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: second,
        contentType: PNG_TYPE,
      });
      expect(again.statusCode, again.body).toBe(200);
      const get = await call('GET', `/files/${file.id}/content`, manager.token);
      expect(Buffer.compare(get.rawPayload, second)).toBe(0);
    });

    it('requires an Idempotency-Key on the write', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      const res = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: pngBytes(512),
        contentType: PNG_TYPE,
        key: null,
      });
      expectError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED');
    });

    it('refuses unsupported media types before the body is read', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      const res = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: Buffer.from('plain text'),
        contentType: 'text/plain',
      });
      expectError(res, 400, 'UNSUPPORTED_FILE_TYPE');
    });

    it('refuses a body over 2 MB with 413, and accepts one just under the limit', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token, { sizeBytes: MAX_BYTES + 1 });
      const tooLarge = await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: pngBytes(MAX_BYTES + 1),
        contentType: PNG_TYPE,
      });
      expect(tooLarge.statusCode).toBe(413);
      expect((tooLarge.json() as { error: { code: string } }).error.code).toBe('FILE_TOO_LARGE');

      const size = 1.5 * 1024 * 1024;
      const big = await createFileRow(manager.token, { sizeBytes: size });
      const ok = await call('PUT', `/files/${big.id}/content`, manager.token, {
        payload: pngBytes(size),
        contentType: PNG_TYPE,
      });
      expect(ok.statusCode, ok.body).toBe(200);
    });

    it('refuses a size or content type that does not match the file row', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token, { sizeBytes: 2000 });
      expectError(
        await call('PUT', `/files/${file.id}/content`, manager.token, {
          payload: pngBytes(1000),
          contentType: PNG_TYPE,
        }),
        400,
        'FILE_SIZE_MISMATCH',
      );

      const pdf = await createFileRow(manager.token, {
        contentType: 'application/pdf',
        sizeBytes: 1000,
      });
      expectError(
        await call('PUT', `/files/${pdf.id}/content`, manager.token, {
          payload: pngBytes(1000),
          contentType: PNG_TYPE,
        }),
        400,
        'FILE_CONTENT_TYPE_MISMATCH',
      );
    });

    it('needs records.manage to write, and a signed-in user to read', async () => {
      const manager = await userWith(true);
      const plain = await userWith(false);
      const file = await createFileRow(manager.token);
      const bytes = pngBytes(1024);

      expectError(
        await call('PUT', `/files/${file.id}/content`, plain.token, {
          payload: bytes,
          contentType: PNG_TYPE,
        }),
        403,
        'ACCESS_DENIED',
      );

      expect((await call('GET', `/files/${file.id}/content`, null)).statusCode).toBe(401);

      await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: bytes,
        contentType: PNG_TYPE,
      });
      expect((await call('GET', `/files/${file.id}/content`, plain.token)).statusCode).toBe(200);
    });

    it('limits a private file to its creator and records.manage', async () => {
      const creator = await userWith(true);
      const other = await userWith(false);
      const file = await createFileRow(creator.token, { visibility: 'private' });
      await call('PUT', `/files/${file.id}/content`, creator.token, {
        payload: pngBytes(1024),
        contentType: PNG_TYPE,
      });

      expectError(
        await call('GET', `/files/${file.id}/content`, other.token),
        403,
        'ACCESS_DENIED',
      );
      expect((await call('GET', `/files/${file.id}/content`, creator.token)).statusCode).toBe(200);

      const manager = await userWith(true);
      expect((await call('GET', `/files/${file.id}/content`, manager.token)).statusCode).toBe(200);
    });

    it('lets any signed-in user read a private company logo, and nothing else private', async () => {
      const manager = await userWith(true);
      const logo = await createFileRow(manager.token, { ownerType: 'company_profile', visibility: 'private' });
      const logoBytes = pngBytes(1024);
      await call('PUT', `/files/${logo.id}/content`, manager.token, { payload: logoBytes, contentType: PNG_TYPE });
      const stray = await createFileRow(manager.token, { visibility: 'private' });
      await call('PUT', `/files/${stray.id}/content`, manager.token, { payload: pngBytes(1024), contentType: PNG_TYPE });

      // the admin needs organisation.manage to link the logo to the company profile
      const admin = await userWith(false);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId: admin.loginId,
        privilege: 'organisation.manage',
      });
      const saved = await call('PUT', '/organisation/company-profile', admin.token, {
        payload: {
          code: 'LOGO-CO',
          legalName: 'Logo Works Private Limited',
          status: 'active',
          tradeName: null,
          cin: null,
          gstin: null,
          pan: null,
          tan: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          pin: null,
          country: 'India',
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          website: null,
          logoFileId: logo.id,
          settings: null,
        },
      });
      // the first save creates the profile, which answers 201
      expect(saved.statusCode, saved.body).toBe(201);

      const reader = await userWith(false);
      const read = await call('GET', `/files/${logo.id}/content`, reader.token);
      expect(read.statusCode).toBe(200);
      expect(read.rawPayload.equals(logoBytes)).toBe(true);
      expectError(
        await call('GET', `/files/${stray.id}/content`, reader.token),
        403,
        'ACCESS_DENIED',
      );
    });

    it('answers 404 when there is no content, and when the file does not exist', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      expectError(
        await call('GET', `/files/${file.id}/content`, manager.token),
        404,
        'RECORD_FILE_CONTENT_NOT_FOUND',
      );
      expectError(
        await call('PUT', `/files/${randomUUID()}/content`, manager.token, {
          payload: pngBytes(1024),
          contentType: PNG_TYPE,
        }),
        404,
        'RECORD_NOT_FOUND',
      );
    });

    it('deletes the content with the file row', async () => {
      const manager = await userWith(true);
      const file = await createFileRow(manager.token);
      await call('PUT', `/files/${file.id}/content`, manager.token, {
        payload: pngBytes(1024),
        contentType: PNG_TYPE,
      });
      const del = await call('DELETE', `/files/${file.id}`, manager.token);
      expect(del.statusCode, del.body).toBe(200);
      const { rows } = await db.pool.query(
        'SELECT 1 FROM tenant_acme.core_file_content WHERE file_id = $1',
        [file.id],
      );
      expect(rows).toHaveLength(0);
    });
  },
);
