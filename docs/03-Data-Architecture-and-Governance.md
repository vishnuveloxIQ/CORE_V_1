# VeloxIQ Core: Data Architecture and Governance

| Field | Value |
|---|---|
| Document ID | DOC-03 |
| Title | Data Architecture and Governance |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This document describes how VeloxIQ Core stores and protects data: tenancy and schemas, the table inventory, conventions, migrations, data classification, the personal-data inventory, redaction, retention, backup, data quality controls and audit integrity. It states what the code does today. Where policy is not defined in the repository it says "To be confirmed".

## 2. Scope

In scope: the Core tenant schema, the `shared` schema and the Core-owned platform table `public.core_rate_limit_window`. Out of scope: tables owned by HRMS, P&M, PMS and Stores (Core refers to two of them and 110 of their tables refer to Core; see `CORE__BACKEND/Core_Database_Handoff.md`, sections 5 and 6), and the platform schemas `public` and `control`, which Core code does not use.

Related documents: DOC-02 System Architecture (`docs/02-System-Architecture.md`); `CORE__BACKEND/Core_Database_Handoff.md` (column-level detail, sections 3 and 9); `CORE__FRONTEND/docs/data-model.md`; `CORE__BACKEND/docs/DEPLOYMENT.md`.

## 3. Tenancy and schemas

| Schema | Purpose | Source |
|---|---|---|
| `tenant_<id>` | All business tables of one tenant, plus its audit chain, idempotency keys, outbox and `core_migration` | `src/db/migrate.ts`, `src/db/tenant.ts` |
| `shared` | Read-only reference data (`shared.uom`, units of measure); tenant tables hold foreign keys to it | `migrations/0001_shared_uom.sql`, `0005_uom_references.sql` |
| `public` | `citext` extension; `core_rate_limit_window` (shared rate-limit counters) | `migrations/0000_extensions.sql`, `0002_rate_limit.sql` |
| `control` | Platform super-admin plane; not used by Core code | `Core_Database_Handoff.md` s1 |

Rules: tenant id matches `^[a-z][a-z0-9_]{0,39}$`; no `tenant_id` column on business tables; the tenant is taken from the verified session and applied with `SET LOCAL search_path` per transaction. Cross-schema reads are not blocked at the database level (no per-tenant roles yet); see Open items.

Evidence of scale: the restore drill of 2026-11-21 reports 62 tables and 2,328 rows for a sample tenant (`CORE__BACKEND/docs/restore-drills/2026-11-21-acme.md`).

## 4. Table inventory by domain

Names come from `CREATE TABLE` statements in `CORE__BACKEND/migrations/*.sql`. The handoff counts 52 `core_*` tables and 5 integration/audit tables at design time; later migrations add the tables marked (M). Column detail: handoff section 9.

| Domain | Tables | Notes |
|---|---|---|
| Company and organisation | `core_company_profile`, `core_department`, `core_position`, `core_role`, `core_number_series`, `core_holiday`, `core_shift` | Company settings kept as JSON in `core_company_profile.settings_json` |
| Projects and locations | `core_project`, `core_location`, `core_store`, `core_wbs_node`, `core_chainage_marker`, `core_project_milestone`, `core_geo_zone`, `core_pms_limit_row`, `core_plan_line`, `core_boq_item` (M, 0035) | Chainage in kilometres; BOQ amount stored as quantity x rate |
| Masters and resources | `core_vendor`, `core_material`, `core_major_material_allocation`, `core_equipment_type`, `core_equipment_assignment`, `core_equipment_unit` (M, 0022), `core_maintenance_schedule` (M, 0037), `core_stock_level` (M, 0020), `shared.uom` | Equipment units owned by Core register (0022) |
| Identity and access | `core_user`, `core_user_passkey`, `core_user_access`, `core_user_session`, `core_auth_activity` | Passwords and PINs stored as argon2id hashes only |
| Policies | `core_policy`, `core_policy_version`, `core_policy_rule`, `core_policy_rule_ack`, `core_ot_policy`, `core_ot_policy_rule`, `core_leave_type`, `core_leave_policy`, `core_leave_policy_rule`, `core_custom_policy`, `core_custom_policy_field`, `core_custom_policy_version`, `core_document_template` | Versioned policy bodies |
| Approvals | `core_approval_chain`, `core_matrix_version`, `core_matrix_level`, `core_approval_request`, `core_approval_action` | Up to four levels (0034); reminders column (0038) |
| Records and files | `core_grievance`, `core_notification`, `core_ticket`, `core_record_timeline`, `core_file`, `core_file_content` (M, 0015), `core_offer_letter_revision` (M, 0023), `core_import_batch`, `core_import_row`, `core_usage_counter` | Files stored as bytea in the tenant schema |
| Integration and audit | `integ_event`, `integ_idempotency_key`, `integ_aggregate_sequence`, `integ_offline_operation`, `audit_row_change`, `ref_record` (M, 0040) | Outbox, idempotency, offline operations, audit chain, read models of other modules |
| Platform support | `core_migration` (per tenant schema), `public.core_rate_limit_window` | Migration ledger; rate-limit windows |

Cross-module references: Core refers to `hrms_employee` (via `core_user.employee_id`) and to `shared.uom`. Circular pairs (department/position, user/employee) are resolved by adding one foreign key in a later step (handoff section 8).

## 5. Conventions

| Convention | Rule | Source |
|---|---|---|
| Standard columns | `id` (uuid, default `gen_random_uuid()`), `created_at`, `created_by`, `updated_at`, `updated_by`, `row_version` on every table (`core_file_content` omits `row_version`) | `migrations/0001_core_tenant.sql`, `0015` |
| Naming | `<entity>_id` uuid internal reference; `<name>_key` / `<name>_code` text external key; polymorphic `<x>_module` + `<x>_record_id`; `correlation_id` is text | `Core_Database_Handoff.md` s2, s8 |
| Optimistic locking | `row_version integer NOT NULL DEFAULT 1` with CHECK >= 1; update sets `row_version = row_version + 1` and matches `WHERE id = $ AND row_version = $`; a stale write returns `VERSION_CONFLICT` | `src/core/rows.ts`, `src/core/resource.ts` |
| Delete model | Hard delete (`DELETE FROM`) where a route exists; status and `is_active` columns carry lifecycle state; no `deleted_at` column found in migrations. Foreign keys default to `ON DELETE NO ACTION`; exceptions: passkeys (cascade with user), file content (cascade with file), offer-letter revisions (restrict, no delete route). Every delete is audited. | `src/core/rows.ts`, `migrations/0004`, `0015`, `0023` |
| Money | `numeric(14,2)` (for example `value_amount`); BOQ amount stored | `migrations/0001_core_tenant.sql`, `0035` |
| Coordinates and chainage | `latitude`/`longitude` `numeric(9,6)`; `chainage_*_km` `numeric(12,3)` | `migrations/0001_core_tenant.sql` |
| Timestamps | `timestamptz`; dates that carry no time use `date` (for example `visit_date`) | migrations |
| Case-insensitive keys | `citext` for login ID and email | `migrations/0000_extensions.sql`, handoff |
| Flexible data | `jsonb` for settings, week-off days, snapshots, device info | handoff |
| Status vocabularies | Enforced by CHECK constraints (approved in 0003, 0004, then per phase) | `migrations/0003`, `0004` |
| Types | Generated TypeScript types from the live schema (`npm run db:types`) | `src/db/types-gen.ts` |

## 6. Migration process

| Aspect | Behaviour | Source |
|---|---|---|
| Layout | Global migrations (run once per database): `0000_extensions`, `0001_shared_uom`, `0002_rate_limit`. Tenant migrations (run once per tenant schema): `0001_core_tenant` through `0042_plan_line_capacity_text` (38 files, listed in `TENANT_MIGRATIONS`; numbers 0016-0019 are not used) | `src/db/migrate.ts` |
| Execution | `npm run db:migrate` applies pending migrations to the global schema and every tenant schema; `npm run db:provision -- <tenantId>` creates and migrates a new tenant | `package.json`, `docs/DEPLOYMENT.md` |
| Atomicity | One transaction per file per schema | `src/db/migrate.ts` |
| Concurrency | `pg_advisory_xact_lock` per schema and file | `src/db/migrate.ts` |
| Ledger | `core_migration (version, checksum, ...)`; SHA-256 of the file content | `src/db/migrate.ts` |
| Immutability | A migration whose checksum differs from the recorded one is refused; applied files must not be edited | `src/db/migrate.ts`, `docs/DEPLOYMENT.md` |
| Direction | Forward-only; rollback is redeploy of previous code plus tenant restore | `docs/DEPLOYMENT.md` |
| Roles | An administrator runs `scripts/admin/create-core-app-role.sql`; the application connects as `core_app`; `scripts/admin/grant-core-app-tables.sql` grants table rights | `docs/DEPLOYMENT.md`, `scripts/admin/` |
| Pre-start rule | Run `db:migrate` before every start that includes a new migration | `docs/DEPLOYMENT.md` |

## 7. Data classification scheme

The repository defines no classification policy. The scheme below is proposed for review and applied in section 8; it is not an approved company standard.

| Class | Definition | Examples in Core | Handling in code today |
|---|---|---|---|
| C4 Secret | Credentials and keys; compromise gives access | `password_hash`, `pin_hash`, `refresh_hash`, `secret_hash`, passkey public-key material, JWT signing key | Stored as hashes only (except signing key, held in environment); excluded from audit snapshots; redacted in logs |
| C3 Personal / sensitive | Identifies or contacts a person, or is tax/bank-linked | user name, login ID, email, phone, employee code, IP address, vendor PAN/GSTIN, grievance text, offer letters | Redaction of tax and bank keys in logs and audit; raw IP stored only in `core_auth_activity` (currently not written); access by privilege |
| C2 Confidential business | Business data not for public view | projects, BOQ, vendors, approvals, policies, stock, equipment | Tenant schema isolation, privilege checks, audit |
| C1 Internal | Reference data | units of measure, number series, holidays | Shared or tenant schema |

## 8. Personal and sensitive data inventory

Derived from `CORE__BACKEND/Core_Database_Handoff.md` section 9 and migrations. Sensitivity follows section 7. "Audited" means row snapshots in `audit_row_change` can contain the column unless redacted.

| Table | Columns | Data | Class | Protection in code |
|---|---|---|---|---|
| `core_user` | `name`, `login_id`, `email`, `phone`, `designation` (0024), `last_login_at`, `failed_count`, `locked_until` | Identity, contact | C3 | Privilege-gated routes; audited |
| `core_user` | `password_hash`, `pin_hash` | Credential hashes (argon2id) | C4 | Removed from audit snapshots; log redaction |
| `core_user_session` | `device_label`, `device_info` (jsonb), `refresh_hash` | Device details; refresh token hash | C3 / C4 | `refresh_hash` excluded from audit |
| `core_user_passkey` | credential id, public key, sign count | Passkey data | C4 | Public key only; no private material |
| `core_auth_activity` | `user_id`, `event_type`, `purpose`, `secret_hash`, `ip_address` (inet), `geo_location` (jsonb), `occurred_at` | Login and OTP history | C3 / C4 | OTP stored only as hash with expiry; raw IP not stored until owner sets retention (`src/modules/auth/repo.ts`) |
| `core_vendor` | `gstin`, `pan`, `email`, `phone`, `address`, bank-verification status | Vendor tax IDs and contact | C3 | `gstin` and `pan` are sensitive keys: redacted in logs and audit |
| `core_company_profile` | `gstin`, `pan`, `tan`, `cin`, `contact_name`, `contact_email`, `contact_phone`, addresses | Company identifiers and contacts | C3 / C2 | `gstin`, `pan` redacted in logs and audit |
| `core_location` | `in_charge`, `phone`, `email`, `address_line`, `latitude`, `longitude` | Site contact person and place | C3 | Audited |
| `core_grievance` | `raised_by`, `raised_by_name`, `employee_id`, `employee_code`, `subject`, `message`, `note` (0027), `visit_date` | Complaint content about people | C3 | Audited; free text is not scanned or redacted |
| `core_ticket` | `raised_by_user_id`, `subject`, `description` | Support text | C3 | Audited |
| `core_notification` | `recipient_user_id`, `title`, `body` | Message content | C3 | Audited |
| `core_file`, `core_file_content` | `file_name`, `content_type`, `size_bytes`, `sha256`, `content` (bytea) | Uploaded documents including offer letters | C3 | 2 MB limit and content-type check in service; content hash |
| `core_offer_letter_revision` | `file_id`, `file_name`, `mime_type`, `size_bytes`, `revision` | Offer-letter version history; never deleted | C3 | Restrict delete; no delete route |
| `core_record_timeline` | event text and actor | Activity history | C3 | Audited |
| `core_import_batch`, `core_import_row` | `raw_values`, `validated_values`, `error_messages` (jsonb) | Bulk-import content, may carry personal fields | C3 | To be confirmed whether imported rows are purged |
| `core_approval_request`, `core_approval_action` | requester, approver, comments | Decision trail | C2 / C3 | Audited |
| `ref_record` | Copy of other modules' records (payload) | May include employee data from HRMS | C3 | Source modules `hrms`, `pm`, `pms`, `stores`; content depends on the sender |
| `integ_event`, `integ_offline_operation` | `payload` (jsonb) | Event and offline payloads | C3 | Payload content is business-defined; retention To be confirmed |
| `audit_row_change` | `old_row`, `new_row`, `actor_id`, `ip_hash` | Snapshots of the above | C3 | Redacted snapshots; IP stored as hash only |
| `integ_idempotency_key` | `response` (jsonb) | Stored API responses for 24 h | C3 | One-time secrets (temporary password) removed before storing |
| `public.core_rate_limit_window` | `key` (includes client IP and login ID), hit count | Rate-limit counters | C3 | Windows swept on about one hit in a hundred (`DEPLOYMENT.md`) |

No special-category data (health, biometrics, government ID numbers) was found as a defined column in Core migrations. Passkeys store public credentials only. Government ID of individuals and bank account numbers are not Core columns; `account_no`, `account_number` and `ifsc` are nevertheless treated as sensitive keys by the redaction list in case they appear in payloads.

Data subjects: tenant staff users, site in-charge persons, vendor contacts, grievance raisers and the employees named in grievances.

## 9. Redaction rules

| Where | Rule | Source |
|---|---|---|
| Sensitive key list | `password`, `password_hash`, `pin`, `pin_hash`, `otp`, `otp_secret`, `secret`, `secret_hash`, `token`, `access_token`, `refresh_token`, `refresh_hash`, `pan`, `gstin`, `account_no`, `account_number`, `ifsc`, and camelCase `temporaryPassword`, `currentPassword`, `newPassword` | `src/core/redaction.ts` |
| Suffix rule | Any key ending `_hash`, `_secret` or `_token` (case-insensitive) | `src/core/redaction.ts` |
| Logs | pino `redact` paths generated from the list at top level, one and two levels deep; plus `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`; replacement text `[REDACTED]` | `loggerRedactPaths()`, `src/app.ts` |
| Audit exclusion | `password_hash`, `pin_hash`, `refresh_hash`, `secret_hash` are removed from snapshots at any depth (not replaced); approved 2026-11-19 | `AUDIT_EXCLUDED_KEYS` in `src/core/audit.ts` |
| Audit redaction | Other sensitive keys have their value replaced with `[REDACTED]`, before hashing and storing | `redactSnapshot()` in `src/core/audit.ts` |
| IP addresses | Audit stores a hash (`ip_hash`); raw IP only possible in `core_auth_activity.ip_address`, which is left NULL until the owner sets retention | `src/core/audit.ts`, `src/modules/auth/repo.ts` |
| Idempotency store | `toStored` removes one-time secrets from the stored response | `src/core/idempotency.ts` |
| Error responses | Unhandled errors return a generic 500; internal detail is logged only | `src/core/error-handler.ts` |
| Limitation | Redaction is by key name. Personal data in free-text columns (grievance message, ticket description, notification body) and in names or phone numbers is not redacted in audit snapshots | code review of `redaction.ts` |

## 10. Retention and archival

| Data | What the code does | Policy |
|---|---|---|
| Business records | Kept until a user deletes them where a delete route exists; no scheduled purge or archive job found | Retention period To be confirmed |
| `audit_row_change` | Append-only (trigger blocks UPDATE, DELETE, TRUNCATE; UPDATE/DELETE/TRUNCATE revoked from PUBLIC and the application role); no purge | Retention period To be confirmed |
| `core_auth_activity` | Rows kept; raw IP not stored pending an owner-set retention period | To be confirmed |
| `core_user_session` | Session ends by expiry (refresh token 30 days) or revoke; revoke reason recorded (0031); expired rows not purged by code found | To be confirmed |
| `integ_idempotency_key` | `expires_at` 24 hours after first use; an expired row with the same key is deleted when the key is reused; no general sweep job found | Sweep policy To be confirmed |
| `public.core_rate_limit_window` | Old windows deleted by `sweep()` on about one hit in a hundred | Implemented |
| `core_offer_letter_revision` | Never deleted by the service layer | Retention To be confirmed |
| Backups | No expiry or rotation implemented in the tooling | To be confirmed |
| Data-subject requests (access, erasure) | No dedicated procedure or API found; hard delete exists for some entities, but audit history cannot be changed | To be confirmed |

Note: erasure of personal data conflicts with the append-only audit chain unless snapshots carry no personal data or a legal basis for retention applies. This needs a documented decision (open item).

## 11. Backup and recovery scope

| Item | Scope | Source |
|---|---|---|
| Tenant backup | `npm run db:backup -- <tenantId> <file>`: custom-format dump of `tenant_<id>` only | `src/db/backup.ts`, `docs/DEPLOYMENT.md` |
| Tenant restore | `npm run db:restore -- <tenantId> <file> --replace`; refuses without `--replace`; creates the schema if missing | `docs/DEPLOYMENT.md` |
| Global data | Not in a tenant backup; whole-database `pg_dump --format=custom` on the same schedule; `shared` schema must be restored before tenants (foreign keys to `shared.uom`) | `docs/DEPLOYMENT.md` |
| Files | Inside the tenant schema (bytea), so included in tenant backups | `migrations/0015_file_content.sql` |
| Restore drill | `npm run db:drill`: fingerprint (row counts and content checksums per table), audit chain check, restore into a scratch database, compare, drop; report holds counts and timings only | `src/db/restore-drill.ts`, `docs/DEPLOYMENT.md` |
| Drill evidence | Two reports dated 2026-11-21 (tenants `acme`, `beta`); acme: PASSED, 62 tables, 2,328 rows, restore 2.0 s, audit chain intact (708 rows) | `docs/restore-drills/` |
| Protection | Backup files hold personal and tenant data: encrypt at rest, keep outside repository and build folders, restrict access (operator duty) | `docs/DEPLOYMENT.md` |
| Schedule, RPO, RTO, storage location, encryption mechanism | Not defined in the repository (drill suggested monthly per tenant) | To be confirmed |

## 12. Data quality controls

| Control | Implementation | Source |
|---|---|---|
| Primary keys | uuid on every table | migrations |
| Not-null and defaults | Applied per phase (for example 0010 projects, 0011 masters, 0012 policies, 0013 approvals, 0014 records) | `migrations/0010-0014` |
| Unique keys | Business keys such as login ID (0006), passkey credential id (0007), offer-letter revision, idempotency key (0004), event id per direction (0039) | `migrations/0004`, `0006`, `0007`, `0023`, `0039` |
| CHECK constraints | Status vocabularies, length ranges, `row_version >= 1`, range and sign checks (for example file size 1 byte to 2 MB; sha256 shape) | `migrations/0003-0042` |
| Foreign keys | Declared for internal references; polymorphic references validated in the service layer with CHECK on module values | `Core_Database_Handoff.md` s8 |
| Indexes | Foreign-key indexes and hot-path indexes (0033, 0039 relay, 0038 reminders) | `migrations/0033`, `0038`, `0039` |
| Input validation | Zod schemas per module (`schema.ts`), validated before use | `src/core/validation.ts`, `src/modules/*/schema.ts` |
| Concurrency | `row_version` optimistic lock; advisory locks for numbering, audit chain, idempotency | `src/core/rows.ts`, `src/db/tenant.ts` |
| Numbering | Number series per tenant (`core_number_series`, `numbering.ts`) | `src/modules/organisation/numbering.ts` |
| Event ordering | `integ_aggregate_sequence`; read models kept by sequence | `src/core/events.ts` |
| Bulk import | Batch and row tables hold raw values, validation results and errors | `core_import_batch`, `core_import_row` |
| Verification | Restore drill compares restored data table by table | `src/db/restore-drill.ts` |
| Data ownership | Other modules change Core data only through the Core API | handoff s1 |

## 13. Audit chain integrity

| Aspect | Behaviour | Source |
|---|---|---|
| What is recorded | Table name, record id, operation (INSERT/UPDATE/DELETE), redacted old and new rows, actor id, correlation id (request id), module name, IP hash, `changed_at` | `src/core/audit.ts` |
| When | `appendAuditRow` runs in the same transaction as the change, so both commit or neither | `src/core/audit.ts`, `src/core/resource.ts` |
| Chain | `prev_hash` is the previous row's `row_hash`; `row_hash` = SHA-256 of canonical JSON of all fields including `prev_hash` | `computeRowHash()`, `src/core/canonical-json.ts` |
| Ordering | One chain per tenant; advisory lock serialises writers; `changed_at` strictly increasing at millisecond precision | `appendAuditRow()` |
| Append-only | Trigger raises an error on UPDATE, DELETE and TRUNCATE; rights revoked from PUBLIC and the application role. The table owner or a superuser can disable the trigger | `migrations/0002_audit_append_only.sql`, `0003_approved_constraints.sql` |
| Verification | `verifyAuditChain` walks rows in order and reports the first broken row id; run inside the restore drill for source and restored copy | `src/core/audit.ts`, `src/db/restore-drill.ts` |
| Reading | `GET /audit-log` (read-only, newest first) and auth events; requires `access.manage` at company scope | `src/modules/audit-log/routes.ts` |
| Exclusions | Hash columns removed; sensitive keys redacted (section 9) | `src/core/audit.ts` |
| Not covered | Chain verification is not scheduled by the application; a periodic run and alerting are To be confirmed. Auth events (`core_auth_activity`) are a separate table and are not part of the hash chain | code review |

## 14. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner, data owners and data stewards | To be confirmed |
| 2 | Approval of the classification scheme in section 7 | To be confirmed |
| 3 | Retention periods for business data, audit, auth activity, sessions, idempotency keys, imports, events and backups | To be confirmed |
| 4 | Retention period for raw IP in `core_auth_activity` (owner decision pending in handoff s8) | To be confirmed |
| 5 | Data-subject access and erasure procedure, and how it works with the append-only audit chain | To be confirmed |
| 6 | Backup schedule, storage location, encryption, RPO and RTO | To be confirmed |
| 7 | Scheduled audit-chain verification and alerting | To be confirmed |
| 8 | Redaction of personal data in free-text columns and names/phones in audit snapshots | To be confirmed |
| 9 | Per-tenant database roles to prevent cross-schema queries | To be confirmed |
| 10 | Owner of `shared.uom` (Platform Administration, per handoff s8) | To be confirmed |
| 11 | Legal basis, privacy notice and applicable regulations | To be confirmed |
| 12 | Sweep job for expired idempotency keys and sessions | To be confirmed |

## 15. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | Initial draft from repository analysis |
