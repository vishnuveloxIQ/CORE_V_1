import { randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { grantPrivilegeByLogin } from '../../src/modules/access/bootstrap.js';
import { ORGANISATION_MANAGE } from '../../src/modules/organisation/routes.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { idempotencyFor } from '../testing-pass/helpers.js';

// Integration tests for migration 0023 and the /offer-letter/revisions routes. Every user and file is created by the
// test with a unique code. The file names are fictional.

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'offer-letter-test-secret-with-at-least-32-characters';
const OWNER_ID = '00000000-0000-4000-8000-00000000f0f1';
const SLOW_TEST_MS = 60_000;

interface RevisionRow {
  id: string;
  revision: number;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string | null;
  hasContent: boolean;
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
  'offer letter revisions (migration 0023)',
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
         VALUES ($1, 'Letter User', 'active', $2, 0)`,
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

    async function adminToken(): Promise<string> {
      const loginId = uniq('letter-admin');
      await seedUser(loginId);
      await grantPrivilegeByLogin(db.pool, {
        tenantId: TENANT,
        loginId,
        privilege: ORGANISATION_MANAGE,
      });
      return signIn(loginId);
    }

    async function plainToken(): Promise<string> {
      const loginId = uniq('letter-plain');
      await seedUser(loginId);
      return signIn(loginId);
    }

    function call(
      method: 'GET' | 'POST',
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

    /** A core_file row owned by the offer letter owner (or another owner when given). Returns its id. */
    async function insertFile(
      fileName: string,
      owner: { ownerType: string; ownerId: string } = {
        ownerType: 'offer_letter',
        ownerId: OWNER_ID,
      },
    ): Promise<string> {
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO tenant_acme.core_file
           (owner_type, owner_id, file_name, content_type, size_bytes, object_key, visibility)
         VALUES ($1, $2, $3, 'application/pdf', 2048, $4, 'company')
         RETURNING id`,
        [owner.ownerType, owner.ownerId, fileName, `offer-letters/${randomUUID()}/${fileName}`],
      );
      return rows[0]!.id;
    }

    function revisionBody(fileId: string, fileName = 'offer-letter.pdf') {
      return { fileId, fileName, mimeType: 'application/pdf', sizeBytes: 2048 };
    }

    it('refuses anonymous reads and writes with 401', async () => {
      const list = await call('GET', '/offer-letter/revisions', null);
      expect(list.statusCode).toBe(401);
      const created = await call(
        'POST',
        '/offer-letter/revisions',
        null,
        revisionBody(randomUUID()),
      );
      expect(created.statusCode).toBe(401);
    });

    it('answers a plain signed-in user with 403 on GET and POST', async () => {
      const token = await plainToken();
      const list = await call('GET', '/offer-letter/revisions', token);
      expect(list.statusCode).toBe(403);
      expect(errorCodeOf(list)).toBe('ACCESS_DENIED');

      const fileId = await insertFile(uniq('plain') + '.pdf');
      const created = await call('POST', '/offer-letter/revisions', token, revisionBody(fileId));
      expect(created.statusCode).toBe(403);
      expect(errorCodeOf(created)).toBe('ACCESS_DENIED');
    });

    it('creates revision 1 for the first letter and lists it with the uploader and no content', async () => {
      const token = await adminToken();
      const fileId = await insertFile(uniq('first') + '.pdf');

      const created = await call(
        'POST',
        '/offer-letter/revisions',
        token,
        revisionBody(fileId, 'first-letter.pdf'),
      );
      expect(created.statusCode).toBe(201);
      const row = dataOf<RevisionRow>(created);
      expect(row.revision).toBe(1);
      expect(row.fileId).toBe(fileId);
      expect(row.fileName).toBe('first-letter.pdf');
      expect(row.sizeBytes).toBe(2048);
      expect(row.hasContent).toBe(false);

      const list = await call('GET', '/offer-letter/revisions', token);
      expect(list.statusCode).toBe(200);
      const rows = dataOf<RevisionRow[]>(list);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.createdBy).toBe('Letter User');
    });

    it('lists revisions newest first and assigns max plus one', async () => {
      const token = await adminToken();
      const numbers: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const fileId = await insertFile(uniq(`rev${i}`) + '.pdf');
        const res = await call('POST', '/offer-letter/revisions', token, revisionBody(fileId));
        expect(res.statusCode).toBe(201);
        numbers.push(dataOf<RevisionRow>(res).revision);
      }
      // Each new upload takes the next number after the highest stored.
      expect(numbers[1]! - numbers[0]!).toBe(1);
      expect(numbers[2]! - numbers[1]!).toBe(1);

      const list = await call('GET', '/offer-letter/revisions', token);
      const revisions = dataOf<RevisionRow[]>(list).map((r) => r.revision);
      const sorted = [...revisions].sort((a, b) => b - a);
      expect(revisions).toEqual(sorted);
      expect(revisions.slice(0, 3)).toEqual([numbers[2], numbers[1], numbers[0]]);
    });

    it('refuses a file that is not an offer letter with 400, and writes no revision', async () => {
      const token = await adminToken();
      const otherType = await insertFile(uniq('other-type') + '.pdf', {
        ownerType: 'document_template',
        ownerId: OWNER_ID,
      });
      const res = await call('POST', '/offer-letter/revisions', token, revisionBody(otherType));
      expect(res.statusCode).toBe(400);
      expect(errorCodeOf(res)).toBe('OFFER_LETTER_FILE_OWNER');

      const otherId = await insertFile(uniq('other-id') + '.pdf', {
        ownerType: 'offer_letter',
        ownerId: randomUUID(),
      });
      const res2 = await call('POST', '/offer-letter/revisions', token, revisionBody(otherId));
      expect(res2.statusCode).toBe(400);
      expect(errorCodeOf(res2)).toBe('OFFER_LETTER_FILE_OWNER');
    });

    it('answers 404 for a file that does not exist', async () => {
      const token = await adminToken();
      const res = await call('POST', '/offer-letter/revisions', token, revisionBody(randomUUID()));
      expect(res.statusCode).toBe(404);
      expect(errorCodeOf(res)).toBe('FILE_NOT_FOUND');
    });

    it('reports hasContent from core_file_content, per file', async () => {
      const token = await adminToken();
      const withBytes = await insertFile(uniq('with-bytes') + '.pdf');
      const withoutBytes = await insertFile(uniq('without-bytes') + '.pdf');
      await db.pool.query(
        `INSERT INTO tenant_acme.core_file_content (file_id, content, sha256)
         VALUES ($1, $2, $3)`,
        [withBytes, Buffer.from('%PDF-1.4 fictional'), 'a'.repeat(64)],
      );

      const a = await call('POST', '/offer-letter/revisions', token, revisionBody(withBytes));
      const b = await call('POST', '/offer-letter/revisions', token, revisionBody(withoutBytes));
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);

      const rows = dataOf<RevisionRow[]>(await call('GET', '/offer-letter/revisions', token));
      const byFile = new Map(rows.map((r) => [r.fileId, r.hasContent]));
      expect(byFile.get(withBytes)).toBe(true);
      expect(byFile.get(withoutBytes)).toBe(false);

      // Once the content row is removed, the same revision reports no content. Nothing is deleted from the revisions.
      await db.pool.query(`DELETE FROM tenant_acme.core_file_content WHERE file_id = $1`, [
        withBytes,
      ]);
      const after = dataOf<RevisionRow[]>(await call('GET', '/offer-letter/revisions', token));
      expect(after.find((r) => r.fileId === withBytes)?.hasContent).toBe(false);
    });

    it('refuses a POST without an Idempotency-Key', async () => {
      const token = await adminToken();
      const fileId = await insertFile(uniq('no-key') + '.pdf');
      const res = await app!.inject({
        method: 'POST',
        url: '/offer-letter/revisions',
        headers: { authorization: `Bearer ${token}` },
        payload: revisionBody(fileId),
      });
      expect(res.statusCode).toBe(400);
      expect(errorCodeOf(res as unknown as Reply)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  },
);
