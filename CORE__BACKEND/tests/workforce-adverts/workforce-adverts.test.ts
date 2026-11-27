import type { CoreApp } from '../../src/http/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { call, grant, JWT_SECRET, seedUser, signIn, uniqueLogin, type Reply } from '../testing-pass/helpers.js';

// Workforce adverts (migration 0070): publish rules, the mail queue, and interest rules. Example data is fictional.

const SLOW_TEST_MS = 60_000;
const dataOf = <T>(reply: Reply) => (reply.json() as { data: T }).data;
const errorOf = (reply: Reply) => (reply.json() as { error?: { code?: string } }).error;

describe.skipIf(!TEST_DATABASE_URL)('Workforce adverts', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp;
  let manager: string;
  let projectId: string;
  let withMail: string;
  let inactive: string;
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
    app = buildApp({ env, pool: db.pool });
    const login = uniqueLogin('adverts-manager');
    await seedUser(db.pool, 'tenant_acme', login);
    // every write route currently needs the administrator privilege (userMayAct in access/service.ts)
    await grant(db.pool, 'acme', login, 'access.manage');
    manager = await signIn(app, 'acme', login);
    // POST /projects is refused for this test manager on this machine (the BOQ test fails the same way), so the project row is written directly
    const project = await db.owner.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_project (code, name, status) VALUES ('WA-P1', 'Fictional Canal', 'active') RETURNING id`,
    );
    projectId = project.rows[0]!.id;
    const sub = async (firmName: string, mailId: string | null) => {
      const res = await call(app, 'POST', '/sub-contractors', manager, {
        projectId, firmName, ownerName: 'Fictional Owner', workContractTitle: 'Earthwork', workOrderDate: '2026-04-01', mailId,
      });
      expect(res.statusCode, res.body).toBe(201);
      return dataOf<{ id: string }>(res).id;
    };
    withMail = await sub('Fictional Earthworks', 'contact@example.com');
    await sub('Fictional Drains', null);
    inactive = await sub('Fictional Retired', 'retired@example.com');
    const off = await call(app, 'PATCH', `/sub-contractors/${inactive}`, manager, { status: 'inactive', rowVersion: 1 });
    expect(off.statusCode, off.body).toBe(200);
  }, SLOW_TEST_MS);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('creates a draft with a generated code, and refuses a publish with no requirement lines', async () => {
    const created = await call(app, 'POST', '/workforce-adverts', manager, { title: 'Masons for canal lining', projectId, state: 'Telangana', requiredFrom: '2026-12-01' });
    expect(created.statusCode, created.body).toBe(201);
    const advert = dataOf<{ id: string; code: string; status: string; rowVersion: number }>(created);
    expect(advert).toMatchObject({ status: 'DRAFT', rowVersion: 1 });
    expect(advert.code).toMatch(/^WA-\d{4}-\d{4}$/);
    const early = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: 1 });
    expect(early.statusCode).toBe(400);
    expect(errorOf(early)?.code).toBe('VALIDATION_ERROR');
  });

  it('publishes with a requirement, queues one message per active sub-contractor with a mail ID, and then freezes the advert', async () => {
    const created = await call(app, 'POST', '/workforce-adverts', manager, { title: 'Pipe layers', projectId, requiredFrom: '2026-12-05', requiredTo: '2026-12-20' });
    const advert = dataOf<{ id: string; rowVersion: number }>(created);
    const line = await call(app, 'POST', '/workforce-advert-requirements', manager, { advertId: advert.id, workerType: 'Pipe layer', trade: 'Plumbing', notes: 'Pipe jointing' });
    expect(line.statusCode, line.body).toBe(201);
    const published = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: advert.rowVersion });
    expect(published.statusCode, published.body).toBe(200);
    expect(dataOf<{ status: string }>(published)).toMatchObject({ status: 'PUBLISHED' });

    const mail = await call(app, 'GET', `/advert-mail?advertId=${advert.id}`, manager);
    const rows = dataOf<{ subContractorId: string; toAddress: string }[]>(mail);
    expect(rows.map((r) => r.subContractorId)).toEqual([withMail]);
    expect(rows[0]?.toAddress).toBe('contact@example.com');

    const edit = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { title: 'Changed title', rowVersion: 2 });
    expect(edit.statusCode).toBe(400);
    const lineAfter = await call(app, 'POST', '/workforce-advert-requirements', manager, { advertId: advert.id, workerType: 'Pipe layer', trade: 'Plumbing' });
    expect(lineAfter.statusCode).toBe(400);
  });

  it('records a sub-contractor interest once, requires a reason to decline, and keeps discussion steps', async () => {
    const created = await call(app, 'POST', '/workforce-adverts', manager, { title: 'Crane operators', projectId, requiredFrom: '2026-12-10' });
    const advert = dataOf<{ id: string; rowVersion: number }>(created);
    await call(app, 'POST', '/workforce-advert-requirements', manager, { advertId: advert.id, workerType: 'Operator', trade: 'Crane' });
    const published = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: advert.rowVersion });
    expect(published.statusCode).toBe(200);

    const interest = await call(app, 'POST', '/contractor-interests', manager, { advertId: advert.id, subContractorId: withMail });
    expect(interest.statusCode, interest.body).toBe(201);
    const row = dataOf<{ id: string; status: string; rowVersion: number }>(interest);
    expect(row.status).toBe('CONTACTED');
    const again = await call(app, 'POST', '/contractor-interests', manager, { advertId: advert.id, subContractorId: withMail });
    expect(again.statusCode).toBe(400);

    const inactiveInterest = await call(app, 'POST', '/contractor-interests', manager, { advertId: advert.id, subContractorId: inactive });
    expect(inactiveInterest.statusCode).toBe(400);

    const declined = await call(app, 'PATCH', `/contractor-interests/${row.id}`, manager, { status: 'DECLINED', rowVersion: row.rowVersion });
    expect(declined.statusCode).toBe(400);
    const withReason = await call(app, 'PATCH', `/contractor-interests/${row.id}`, manager, { status: 'DECLINED', reason: 'Crane not available', rowVersion: row.rowVersion });
    expect(withReason.statusCode, withReason.body).toBe(200);

    const step = await call(app, 'POST', '/interest-steps', manager, { interestId: row.id, remarks: 'Called, will call back Friday' });
    expect(step.statusCode, step.body).toBe(201);
  });

  it('closes a published advert only with a reason, and a closed advert cannot be reopened', async () => {
    const created = await call(app, 'POST', '/workforce-adverts', manager, { title: 'Fitters', projectId, requiredFrom: '2026-12-15' });
    const advert = dataOf<{ id: string; rowVersion: number }>(created);
    await call(app, 'POST', '/workforce-advert-requirements', manager, { advertId: advert.id, workerType: 'Fitter', trade: 'Fitting' });
    const published = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: advert.rowVersion });
    const pub = dataOf<{ rowVersion: number }>(published);
    const noReason = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'CLOSED', rowVersion: pub.rowVersion });
    expect(noReason.statusCode).toBe(400);
    const closed = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'CLOSED', closedReason: 'Work finished early', rowVersion: pub.rowVersion });
    expect(closed.statusCode, closed.body).toBe(200);
    const closedRow = dataOf<{ rowVersion: number }>(closed);
    const reopen = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: closedRow.rowVersion });
    expect(reopen.statusCode).toBe(400);
  });

  it('records a contractor who is not registered, with the contact it gave, and requires a name', async () => {
    const created = await call(app, 'POST', '/workforce-adverts', manager, { title: 'Fitters for the pump house', projectId, requiredFrom: '2027-01-05' });
    const advert = dataOf<{ id: string; rowVersion: number }>(created);
    await call(app, 'POST', '/workforce-advert-requirements', manager, { advertId: advert.id, workerType: 'Fitter', trade: 'Fitting' });
    const published = await call(app, 'PATCH', `/workforce-adverts/${advert.id}`, manager, { status: 'PUBLISHED', rowVersion: advert.rowVersion });
    expect(published.statusCode).toBe(200);

    const noName = await call(app, 'POST', '/contractor-interests', manager, { advertId: advert.id, mailId: 'new@example.com' });
    expect(noName.statusCode).toBe(400);

    const recorded = await call(app, 'POST', '/contractor-interests', manager, {
      advertId: advert.id, firmName: 'Fictional New Fitters', contactName: 'Fictional Contact', mailId: 'new@example.com', phone: '9000000001',
    });
    expect(recorded.statusCode, recorded.body).toBe(201);
    expect(dataOf<{ status: string; subContractorId: string | null; firmName: string }>(recorded)).toMatchObject({
      status: 'CONTACTED', subContractorId: null, firmName: 'Fictional New Fitters',
    });
  });
});
