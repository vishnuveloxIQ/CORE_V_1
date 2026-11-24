import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from './helpers.js';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

// Provisional shared.uom (migrations 0001_shared_uom and 0005_uom_references).
describe.skipIf(!TEST_DATABASE_URL)('provisional shared.uom', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, ['acme']);
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('keeps one row per unit code', async () => {
    await db.pool.query(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ('KG-TEST', 'Kilogram')`,
    );
    await expect(
      db.pool.query(`INSERT INTO shared.uom (uom_code, uom_name) VALUES ('KG-TEST', 'Kilogram 2')`),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  // Each insert below carries the columns that migration 0011 requires, so the only thing a test can fail on is
  // the unit reference.
  it('rejects a material that points to a unit that does not exist', async () => {
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_material (code, name, uom_id) VALUES ('MAT-MISSING-UOM', 'Fictional', $1)`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('accepts a material, allocation and plan line that point to a known unit', async () => {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO shared.uom (uom_code, uom_name) VALUES ('M-TEST', 'Metre') RETURNING id`,
    );
    const uomId = rows[0]!.id;
    const project = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_project (code, name, status) VALUES ('PRJ-UOM-TEST', 'Fictional Project', 'active')
       RETURNING id`,
    );
    const projectId = project.rows[0]!.id;
    const material = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_material (code, name, uom_id) VALUES ('MAT-UOM-TEST', 'Fictional Metre', $1)
       RETURNING id`,
      [uomId],
    );
    const materialId = material.rows[0]!.id;
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_major_material_allocation (project_id, material_id, uom_id, quantity)
         VALUES ($1, $2, $3, 1)`,
        [projectId, materialId, uomId],
      ),
    ).resolves.toBeDefined();
    await expect(
      db.pool.query(
        `INSERT INTO tenant_acme.core_plan_line (project_id, resource_kind, material_id, uom_id)
         VALUES ($1, 'material', $2, $3)`,
        [projectId, materialId, uomId],
      ),
    ).resolves.toBeDefined();
  });

  it('creates an index on each unit foreign-key column', async () => {
    const { rows } = await db.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'tenant_acme'
         AND indexname IN ('ix_core_material_uom_id', 'ix_core_major_material_allocation_uom_id', 'ix_core_plan_line_uom_id')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'ix_core_major_material_allocation_uom_id',
      'ix_core_material_uom_id',
      'ix_core_plan_line_uom_id',
    ]);
  });
});
