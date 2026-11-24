import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashRequest, runIdempotent } from '../../src/core/idempotency.js';
import { withTenant } from '../../src/db/tenant.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';

// Phase N-1 (d): the idempotency primitive under concurrency. Example data is fictional.

const SLOW_TEST_MS = 60_000;

describe.skipIf(!TEST_DATABASE_URL)(
  'idempotency under concurrency (testing pass)',
  { timeout: SLOW_TEST_MS },
  () => {
    let db: TestDatabase;

    beforeAll(async () => {
      db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await db?.drop();
    });

    it('two concurrent calls with one key run the work once and return the same value', async () => {
      const key = `race-${randomUUID()}`;
      const requestHash = hashRequest({
        method: 'POST',
        path: '/usage-counters/increment',
        body: { by: 1 },
      });
      let runs = 0;
      const work = async () => {
        runs += 1;
        // Hold the transaction open briefly so the second call arrives while the first is running.
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { counted: runs };
      };

      const [first, second] = await Promise.all([
        withTenant(db.pool, 'acme', (client) => runIdempotent(client, { key, requestHash }, work)),
        withTenant(db.pool, 'acme', (client) => runIdempotent(client, { key, requestHash }, work)),
      ]);

      expect(runs).toBe(1);
      expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
      expect(first.value).toEqual(second.value);
    });
  },
);
