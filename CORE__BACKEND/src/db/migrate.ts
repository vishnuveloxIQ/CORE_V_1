import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

/** Folder with the SQL migrations, resolved from this file: src/db -> migrations. */
const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

/**
 * Run once per database, in this order. 0000 creates the citext extension in public; 0001 creates the
 * shared schema and the provisional shared.uom table; 0002 creates the shared rate-limit window table
 * (Phase N decision 3).
 */
export const GLOBAL_MIGRATIONS: readonly string[] = [
  '0000_extensions.sql',
  '0001_shared_uom.sql',
  '0002_rate_limit.sql',
  '0043_registration_global.sql',
  '0044_registration_directory_prefixes.sql',
  '0045_uom_insert_for_core.sql',
];
/**
 * Run once per tenant schema, in this order. 0001 creates the Core tables; 0002 makes the audit
 * table append-only; 0003 applies the approved section 8 constraints and grants; 0004 adds the unique
 * keys, cascade rule, status vocabulary and indexes; 0005 adds the provisional shared.uom foreign keys;
 * 0006 makes core_user.login_id unique (Phase 4a, proposed). 0007 adds the passkey challenge column
 * and makes passkey credential IDs unique (Phase 4c). 0008 adds the access_type and module checks on
 * core_user_access and an index for the access guard (Phase 4d). 0009 adds the unique keys, CHECKs and
 * indexes for the organisation tables (Phase 5a). 0010 adds the unique keys, CHECKs, indexes and NOT NULL
 * constraints for the projects and sites tables (Phase 5b). 0011 adds the unique keys, CHECKs, defaults and NOT NULL
 * constraints for the master data tables (Phase 5c). 0012 adds the unique keys, CHECKs, defaults and NOT NULL
 * constraints for the policy tables (Phase 5d). 0013 does the same for the approval tables (Phase 5e). 0014 does
 * the same for the records and files tables (Phase 5f). 0015 creates the file content table (bytea, one row per file).
 * 0020 creates the stock level table (quantity and reserved per store and material).
 * 0021 adds the optional employee code to grievances (text, at most 60 characters).
 * 0022 creates the equipment unit register (core_equipment_unit: one row per machine, unique asset code).
 * 0023 creates the offer letter revision history (core_offer_letter_revision: one row per upload, unique revision).
 * 0024 adds the user profile fields (designation, UI role, modules, project scope ids) and their CHECKs.
 * 0025 adds the clarification status and actions, the action decision, and job opening publication to approvals.
 * 0026 adds the project chainage range (chainage_start_km, chainage_end_km).
 * 0027 adds the optional grievance note (text, at most 2000 characters).
 * 0028 adds the equipment unit last ping, machine photo (core_file FK) and documents map (document key -> file id).
 * 0029 adds the optional grievance visit status (requested, confirmed, rescheduled, visited, not_visited).
 * 0030 adds the optional plan line stage, checked against the line's resource kind.
 * 0031 records why a device session ended, so a refresh from a session the user revoked does not end every session.
 * 0035 creates the Bill of Quantities (core_boq_item: priced items per project, amount = quantity x rate, stored).
 * 0036 adds the optional date a request is needed by (core_approval_request.needed_by).
 * 0037 creates the equipment maintenance schedules (core_maintenance_schedule: service task every N months or hours).
 * 0041 adds capacity, capacity unit and model to equipment plan lines (all optional); 0042 makes the capacity text and drops the unit.
 * 0040 creates the read models (ref_record: Core's copy of other modules' records, kept from inbound events by sequence).
 * 0039 adds the event relay indexes (unique event id per direction, relay queue, aggregate order, monitor) and replay states.
 * 0038 adds the approval reminder time (core_approval_request.last_reminded_at) and an index for waiting requests.
 */
export const TENANT_MIGRATIONS: readonly string[] = [
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
  '0041_plan_line_equipment_details.sql',
  '0042_plan_line_capacity_text.sql',
  '0046_ticket_answer.sql',
  '0047_user_roles.sql',
  '0048_company_type.sql',
  '0049_project_status.sql',
  '0050_project_consultant.sql',
  '0051_project_state.sql',
  '0052_project_execution_mode.sql',
  '0053_project_department.sql',
  '0054_project_type.sql',
  '0055_store_project.sql',
  '0056_plan_line_department.sql',
  '0057_remove_wbs.sql',
  '0058_access_drop_location.sql',
  '0059_approvals_drop_location.sql',
  '0060_equipment_offline_drop_location.sql',
  '0061_equipment_unit_project.sql',
  '0062_policy_version_project.sql',
  '0063_rate_tables.sql',
  '0064_equipment_unit_more_documents.sql',
  '0065_equipment_unit_approval.sql',
  '0066_equipment_unit_hired_from.sql',
  '0067_equipment_unit_over_plan_reason.sql',
  '0068_sub_contractors.sql',
  '0069_sub_contractor_status.sql',
  '0070_workforce_adverts.sql',
  '0071_workforce_advert_state.sql',
  '0072_interest_status_four.sql',
  '0073_interest_unregistered_contractor.sql',
  '0074_material_store_availability.sql',
  '0075_quotations.sql',
  '0076_quotation_vendor_format.sql',
  '0077_equipment_unit_hire_status.sql',
  '0078_approved_people_and_billing.sql',
];

const TENANT_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const TENANT_SCHEMA_PREFIX = 'tenant_';

/** True for a tenant id that is safe to use in a schema name: 1 to 40 lowercase letters, digits or underscores, starting with a letter. */
export function isValidTenantId(tenantId: string): boolean {
  return TENANT_ID_PATTERN.test(tenantId);
}

export type ApplyResult = 'applied' | 'skipped';

export interface MigrateAllResult {
  global: ApplyResult;
  tenants: Record<string, ApplyResult>;
}

interface Migration {
  file: string;
  sql: string;
  checksum: string;
}

/**
 * Returns the PostgreSQL schema name for a tenant id.
 * Schema names cannot be bound as parameters, so the id is validated before it goes into SQL.
 */
export function tenantSchemaName(tenantId: string): string {
  if (!isValidTenantId(tenantId)) {
    throw new Error(
      'Invalid tenant id: use 1 to 40 lowercase letters, digits or underscores, starting with a letter',
    );
  }
  return `${TENANT_SCHEMA_PREFIX}${tenantId}`;
}

async function loadMigration(file: string): Promise<Migration> {
  const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
  return { file, sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

/** Quotes an identifier. Only pass names that were validated first. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Applies one migration file to one schema in a single transaction and records it in core_migration.
 * Re-running an applied migration is a no-op. An applied file that has since changed fails loudly.
 * An advisory lock serializes concurrent runs for the same schema and file.
 */
async function applyToSchema(
  pool: Pool,
  schema: string,
  migration: Migration,
): Promise<ApplyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${schema}:${migration.file}`,
    ]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    await client.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS core_migration (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const existing = await client.query<{ checksum: string }>(
      'SELECT checksum FROM core_migration WHERE version = $1',
      [migration.file],
    );
    if (existing.rowCount === 1) {
      if (existing.rows[0]?.checksum !== migration.checksum) {
        throw new Error(`Migration ${migration.file} changed after it was applied to ${schema}`);
      }
      await client.query('COMMIT');
      return 'skipped';
    }

    await client.query(migration.sql);
    await client.query('INSERT INTO core_migration (version, checksum) VALUES ($1, $2)', [
      migration.file,
      migration.checksum,
    ]);
    await client.query('COMMIT');
    return 'applied';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Applies the database-wide migrations in order (citext in public, shared.uom). Returns 'applied' if any ran.
 * Safe to run repeatedly.
 */
export async function migrateGlobal(pool: Pool): Promise<ApplyResult> {
  let outcome: ApplyResult = 'skipped';
  for (const file of GLOBAL_MIGRATIONS) {
    const result = await applyToSchema(pool, 'public', await loadMigration(file));
    if (result === 'applied') outcome = 'applied';
  }
  return outcome;
}

/**
 * Applies every tenant migration to one schema, in order. Returns 'applied' if any of them ran,
 * 'skipped' if all were already recorded.
 */
async function applyTenantMigrations(pool: Pool, schema: string): Promise<ApplyResult> {
  let outcome: ApplyResult = 'skipped';
  for (const file of TENANT_MIGRATIONS) {
    const result = await applyToSchema(pool, schema, await loadMigration(file));
    if (result === 'applied') outcome = 'applied';
  }
  return outcome;
}

/** Creates tenant_<id> if needed and applies the tenant migrations to it. */
export async function provisionTenant(pool: Pool, tenantId: string): Promise<ApplyResult> {
  return applyTenantMigrations(pool, tenantSchemaName(tenantId));
}

/**
 * Applies the global migration, then the tenant migrations to every existing tenant_<id> schema.
 * Used by `npm run db:migrate`.
 */
export async function migrateAll(pool: Pool): Promise<MigrateAllResult> {
  const global = await migrateGlobal(pool);

  const { rows } = await pool.query<{ nspname: string }>(
    'SELECT nspname FROM pg_namespace WHERE left(nspname, 7) = $1 ORDER BY nspname',
    [TENANT_SCHEMA_PREFIX],
  );
  const tenants: Record<string, ApplyResult> = {};
  for (const { nspname } of rows) {
    const tenantId = nspname.slice(TENANT_SCHEMA_PREFIX.length);
    if (!isValidTenantId(tenantId)) continue;
    tenants[tenantId] = await applyTenantMigrations(pool, nspname);
  }
  return { global, tenants };
}
