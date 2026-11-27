import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Quotation approval (migration 0075): a quotation is sent PENDING and decided once. Example data is fictional.

const SLOW_TEST_MS = 60_000;
const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;

const body = (ref: string) => ({
  ref,
  vendorName: 'Fictional Stone Gallery',
  buyerName: 'Fictional Infra Private Limited',
  projectName: null,
  destination: 'Fictional town',
  quotationDate: '2026-11-27',
  validUntil: null,
  paymentTerms: '100% payment advance',
  amount: 204140,
  document: { lines: [{ no: 1, description: 'Vitrified tile', quantity: 1600, rate: 105, amount: 168000 }] },
});

describe.skipIf(!TEST_DATABASE_URL)('Quotation approval', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let admin: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool });
    const login = uniqueLogin('quotation-admin');
    await seedUser(db.pool, 'tenant_acme', login);
    // every write route currently needs the administrator privilege (userMayAct in access/service.ts)
    await grant(db.pool, 'acme', login, 'access.manage');
    admin = await signIn(app, 'acme', login);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('saves a quotation as PENDING with its document, and lists it by status', async () => {
    const created = await call(app, 'POST', '/quotations', admin, body('Q-T1'));
    expect(created.statusCode, created.body).toBe(201);
    const q = dataOf<{ id: string; status: string; document: { lines: unknown[] }; amount: number }>(created);
    expect(q.status).toBe('PENDING');
    expect(q.document.lines).toHaveLength(1);

    const pending = await call(app, 'GET', '/quotations?status=PENDING', admin);
    expect(dataOf<{ id: string }[]>(pending).some((x) => x.id === q.id)).toBe(true);
  });

  it('approves once and refuses a second decision', async () => {
    const created = dataOf<{ id: string; rowVersion: number }>(await call(app, 'POST', '/quotations', admin, body('Q-T2')));
    const approved = await call(app, 'PATCH', `/quotations/${created.id}`, admin, { status: 'APPROVED', rowVersion: created.rowVersion });
    expect(approved.statusCode, approved.body).toBe(200);
    const row = dataOf<{ status: string; decidedAt: string | null; rowVersion: number }>(approved);
    expect(row.status).toBe('APPROVED');
    expect(row.decidedAt).not.toBeNull();

    const again = await call(app, 'PATCH', `/quotations/${created.id}`, admin, { status: 'REJECTED', reason: 'Too high', rowVersion: row.rowVersion });
    expect(again.statusCode).toBe(400);
  });

  it('keeps the note given with an approval', async () => {
    const created = dataOf<{ id: string; rowVersion: number }>(await call(app, 'POST', '/quotations', admin, body('Q-T4')));
    const approved = await call(app, 'PATCH', `/quotations/${created.id}`, admin, { status: 'APPROVED', reason: 'All vendors ask for advance', rowVersion: created.rowVersion });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(dataOf<{ status: string; reason: string }>(approved)).toMatchObject({ status: 'APPROVED', reason: 'All vendors ask for advance' });
  });

  it('rejects only with a reason, and keeps the reason', async () => {
    const created = dataOf<{ id: string; rowVersion: number }>(await call(app, 'POST', '/quotations', admin, body('Q-T3')));
    const noReason = await call(app, 'PATCH', `/quotations/${created.id}`, admin, { status: 'REJECTED', rowVersion: created.rowVersion });
    expect(noReason.statusCode).toBe(400);

    const rejected = await call(app, 'PATCH', `/quotations/${created.id}`, admin, { status: 'REJECTED', reason: 'Rates too high', rowVersion: created.rowVersion });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(dataOf<{ status: string; reason: string }>(rejected)).toMatchObject({ status: 'REJECTED', reason: 'Rates too high' });
  });
});
