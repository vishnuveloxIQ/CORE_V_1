import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/client.js';
import {
  migrateAll,
  migrateGlobal,
  provisionTenant,
  tenantSchemaName,
} from '../../src/db/migrate.js';
import { dropDatabase } from './helpers.js';

// Load the local test connection string when present. Real environment variables take precedence.
try {
  process.loadEnvFile('.env.test');
} catch {
  // No .env.test: the database tests are skipped below.
}

// Migrations are DDL, so these tests use the owner account, not the application login.
const baseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

// Expected shape of the Core tenant schema (handoff sections 3, 4 and 9).
// 58 after the handoff tables and core_file_content (0015); core_stock_level (0020) makes 59; core_equipment_unit (0022) makes 60;
// core_offer_letter_revision (0023) makes 61, core_boq_item (0035) makes 62, core_maintenance_schedule (0037) makes 63, and ref_record (0040) makes 64.
const DOMAIN_TABLES = 64;
// 76 handoff foreign keys, plus 3 provisional shared.uom references (migration 0005), plus 1 for core_file_content (0015),
// plus 2 for core_stock_level (0020: store and material), plus 3 for core_equipment_unit (0022: equipment type, location, vendor),
// plus 1 for core_offer_letter_revision (0023: file), plus 1 for core_approval_request (0025: published location).
// plus 1 for core_equipment_unit (0028: photo file), plus 3 for core_boq_item (0035: project, WBS node, shared.uom), plus 1 for core_maintenance_schedule (0037: unit).
// 0024, 0026, 0027, 0029 and 0030 add columns and CHECKs only, so they add no tables.
const FOREIGN_KEYS = 92;

describe('tenant schema names', () => {
  it('builds tenant_<id> from a valid id', () => {
    expect(tenantSchemaName('acme')).toBe('tenant_acme');
    expect(tenantSchemaName('site_01')).toBe('tenant_site_01');
  });

  it.each(['', 'Acme', '1acme', 'a; DROP SCHEMA public', 'a-b', 'a'.repeat(41)])(
    'rejects the unsafe id %j',
    (id) => {
      expect(() => tenantSchemaName(id)).toThrow(/Invalid tenant id/);
    },
  );
});

describe.skipIf(!baseUrl)('migrations on an empty database', () => {
  let admin: Pool;
  let pool: Pool;
  let dbName: string;

  beforeAll(async () => {
    // A fresh database per run: the shared test database is never modified by these tests.
    dbName = `velox_migtest_${randomBytes(6).toString('hex')}`;
    admin = createPool(baseUrl!, 1);
    await admin.query(`CREATE DATABASE "${dbName}"`);

    const url = new URL(baseUrl!);
    url.pathname = `/${dbName}`;
    pool = createPool(url.toString(), 4);
    // a connection still closing when the database is dropped reports 57P01; that is expected, not a failure
    pool.on('error', (err) => {
      if ((err as { code?: string }).code !== '57P01') throw err;
    });
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      // retries while a superuser background process is still attached to the new database
      await dropDatabase(admin, dbName);
      await admin.end();
    }
  });

  it('applies the global migration once and skips it on re-run', async () => {
    expect(await migrateGlobal(pool)).toBe('applied');
    expect(await migrateGlobal(pool)).toBe('skipped');

    const { rows } = await pool.query<{ version: string }>(
      'SELECT version FROM public.core_migration ORDER BY version',
    );
    expect(rows.map((r) => r.version)).toEqual([
      '0000_extensions.sql',
      '0001_shared_uom.sql',
      '0002_rate_limit.sql',
    ]);
  });

  it('provisions a tenant schema with the Core tables, foreign keys and CHECK constraint', async () => {
    expect(await provisionTenant(pool, 'acme')).toBe('applied');

    const tables = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.tables
       WHERE table_schema = 'tenant_acme' AND table_type = 'BASE TABLE' AND table_name <> 'core_migration'`,
    );
    expect(Number(tables.rows[0]?.n)).toBe(DOMAIN_TABLES);

    const fks = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.table_constraints
       WHERE table_schema = 'tenant_acme' AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(Number(fks.rows[0]?.n)).toBe(FOREIGN_KEYS);

    const recorded = await pool.query<{ version: string }>(
      'SELECT version FROM tenant_acme.core_migration ORDER BY version',
    );
    expect(recorded.rows.map((r) => r.version)).toEqual([
      '0001_core_tenant.sql',
      '0002_audit_append_only.sql',
      '0003_approved_constraints.sql',
      '0004_approved_keys_indexes.sql',
      '0005_uom_references.sql',
      '0006_user_login_unique.sql',
      '0007_passkeys.sql',
      '0008_access.sql',
      '0009_organisation.sql',
      '0010_projects.sql',
      '0011_masters.sql',
      '0012_policies.sql',
      '0013_approvals.sql',
      '0014_records.sql',
      '0015_file_content.sql',
      '0020_stock_levels.sql',
      '0021_grievance_employee_code.sql',
      '0022_equipment_units.sql',
      '0023_offer_letter_revisions.sql',
      '0024_user_profile.sql',
      '0025_approval_clarify_publish.sql',
      '0026_project_chainage.sql',
      '0027_grievance_note.sql',
      '0028_equipment_unit_media.sql',
      '0029_grievance_visit_status.sql',
      '0030_plan_line_stage.sql',
      '0031_session_revoke_reason.sql',
      '0032_approval_source_and_levels.sql',
      '0033_hot_path_indexes.sql',
      '0034_approval_levels_max_four.sql',
      '0035_boq_items.sql',
      '0036_request_needed_by.sql',
      '0037_maintenance_schedules.sql',
      '0038_approval_reminders.sql',
      '0039_event_relay.sql',
      '0040_ref_records.sql',
    ]);

    await expect(
      pool.query(`INSERT INTO tenant_acme.integ_event (direction) VALUES ('sideways')`),
    ).rejects.toThrow(/integ_event_direction_check/);
  });

  it('re-provisioning an existing tenant is a no-op', async () => {
    expect(await provisionTenant(pool, 'acme')).toBe('skipped');
  });

  it('migrateAll applies the global step and every existing tenant schema', async () => {
    expect(await provisionTenant(pool, 'beta')).toBe('applied');

    const result = await migrateAll(pool);
    expect(result).toEqual({ global: 'skipped', tenants: { acme: 'skipped', beta: 'skipped' } });
  });

  it('keeps each tenant in its own schema', async () => {
    const { rows } = await pool.query<{ table_schema: string; n: string }>(
      `SELECT table_schema, count(*) AS n FROM information_schema.tables
       WHERE table_schema IN ('tenant_acme', 'tenant_beta') AND table_name = 'core_user'
       GROUP BY table_schema ORDER BY table_schema`,
    );
    expect(rows).toEqual([
      { table_schema: 'tenant_acme', n: '1' },
      { table_schema: 'tenant_beta', n: '1' },
    ]);
  });
});
