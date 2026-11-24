import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateDbTypes } from '../../src/db/types-gen.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

// CORE-17-05: the committed database types match a freshly migrated schema. A migration without
// `npm run db:types` fails here, so the types never drift from the database.

describe.skipIf(!TEST_DATABASE_URL)('generated database types', { timeout: 60_000 }, () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('src/db/types.generated.ts is up to date with the migrations', async () => {
    const committed = readFileSync(new URL('../../src/db/types.generated.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(await generateDbTypes(db.pool, 'acme'));
  });

  it('types the key tables, with nullable columns marked', async () => {
    const text = await generateDbTypes(db.pool, 'acme');
    expect(text).toContain('export interface CoreUserRow {');
    expect(text).toContain('export interface SharedUomRow {');
    expect(text).toMatch(/ {2}id: string;/);
    expect(text).toMatch(/ {2}row_version: number;/);
    expect(text).toMatch(/ {2}revoked_reason: string \| null;/);
  });
});
