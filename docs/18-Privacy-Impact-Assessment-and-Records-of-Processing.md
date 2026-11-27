# Privacy Impact Assessment and Records of Processing

| Field | Value |
|---|---|
| Document ID | DOC-18 |
| Title | Privacy Impact Assessment and Records of Processing |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Confidential |

## 1. Purpose

This document gives (a) a DPIA-style assessment of the personal-data processing performed by the VeloxIQ Core application and (b) a records-of-processing register (RoPA-style) derived from the repository. It is a factual baseline for the Data Protection Officer (DPO) or privacy lead to review. It does not assert a lawful basis, a legal conclusion or a certification (see DOC-20 for the readiness view).

Every statement is grounded in repository files. Where the repository cannot answer a question (legal basis, hosting location, retention policy, owners), it is marked **To be confirmed** and collected in section 14.

## 2. Scope

| Item | Detail |
|---|---|
| Application | VeloxIQ Core: multi-tenant company-control back end (Node 24, TypeScript, Express, PostgreSQL 18) and React 19 front end |
| In scope | Tenant schema tables created by `CORE__BACKEND/migrations/*.sql` (0001 to 0042), the global/public tables, the API in `CORE__BACKEND/docs/api/openapi-v1.json` (156 paths), event relay and inbound endpoint, backups and restore drills |
| Out of scope | Processing inside the consuming modules (HRMS, P&M, PMS, Stores), the hosting provider, the e-mail/SMS provider (not yet wired in), the front-end device/browser |
| Method | Review of migrations, `CORE__BACKEND/src/db/types.generated.ts`, `src/modules/*`, `src/core/*`, `docs/DEPLOYMENT.md`. Column **names** only are listed; no data was read, and no `.env` file was opened |
| Related documents | Security: [DOC-04](04-Security-Architecture-and-Controls.md). Data: [DOC-03](03-Data-Architecture-and-Governance.md). Third parties: [DOC-13](13-Third-Party-Software-Inventory.md). Readiness: [DOC-20](20-Compliance-Readiness-Matrix.md). Supplier and test scope: [DOC-21](21-Supplier-Assessment-and-Security-Test-Scope.md) |

## 3. System description (processing context)

| Aspect | Finding | Evidence |
|---|---|---|
| Tenancy | One PostgreSQL schema per tenant (`tenant_<id>`); every request runs inside one transaction with `SET LOCAL search_path` to that schema only | `CORE__BACKEND/src/db/tenant.ts` |
| Roles | The company (tenant) is the customer. The tenant decides purposes; Core processes on the tenant's behalf. Controller/processor roles: **To be confirmed** | Repository cannot determine |
| Identity | Users sign in with login ID and password, optional passkey (WebAuthn), password reset by one-time code, step-up for sensitive actions | `src/modules/auth/*`, `migrations/0007_passkeys.sql` |
| Sessions | Access token 15 minutes; refresh token 30 days; refresh token stored only as a hash | `src/modules/auth/tokens.ts`, `core_user_session.refresh_hash` |
| Audit | Append-only, hash-chained row-change log; `ip_hash` instead of raw IP | `migrations/0002_audit_append_only.sql`, `src/core/audit.ts` |
| Integration | Outbound events via an outbox relay; inbound events from `hrms`, `pm`, `pms`, `stores` | `src/core/relay.ts`, `src/modules/integration/schema.ts` |
| Hosting | Not determined by the repository | **To be confirmed** |

## 4. Data subject categories

| # | Category | Where they appear (tables) | Verified from | Notes |
|---|---|---|---|---|
| DS-1 | Application users and employees | `core_user`, `core_user_access`, `core_user_passkey`, `core_user_session`, `core_auth_activity`, `core_notification`, `core_ticket`, `core_policy_rule_ack` | `migrations/0001_core_tenant.sql`, `0007`, `0008`, `0024`, `0031` | `core_user.employee_id` links a user to an HR employee identifier held outside Core |
| DS-2 | Employees referenced by a grievance | `core_grievance` (`employee_id`, `employee_code`, `raised_by_name`, `message`, `note`) | `0001`, `0021`, `0027`, `0029` | Free-text fields can hold any personal data the author types |
| DS-3 | Approval requesters and approvers | `core_approval_request` (`raised_by_id`, `raised_by_name`, `assigned_actor_id`), `core_approval_action` (`actor_id`, `by_name`, `comment`) | `0001`, `0013`, `0025`, `0032` | Names are copied into the row as text |
| DS-4 | Vendor contacts | `core_vendor` (`name`, `email`, `phone`, `address`, `pan`, `gstin`) | `0001`, `0011` | Vendor may be an individual or a sole proprietor; to be confirmed per tenant |
| DS-5 | Store keepers and site in-charges | `core_store` (`keeper`, `phone`), `core_location` (`in_charge`, `phone`, `email`, `address_line`, `latitude`, `longitude`) | `0001`, `0026` | Names held as free text, not as user links |
| DS-6 | Company contacts | `core_company_profile` (`contact_name`, `contact_email`, `contact_phone`, address, `pan`, `gstin`, `cin`, `tan`) | `0001`, `0009` | Business identifiers mostly relate to the legal entity |
| DS-7 | Job opening subjects (job openings, offer letters) | Job openings are approval requests whose payload is `core_approval_request.payload_json`, published with `published_at`, `published_location_id` (migration 0025). Offer-letter template revisions in `core_offer_letter_revision` and `core_file` | `0023`, `0025`, `src/modules/approvals/service.ts` (`publishJobOpening`), `src/modules/offer-letter/*` | **No applicant or candidate table exists.** Core stores the opening and the offer-letter template, not applicant records. Applicants are therefore not a data subject category inside Core today; they may exist in the HRMS (To be confirmed) |
| DS-8 | Equipment operators and owners | `core_equipment_unit` (`owner`, `reg_no`, `chassis_no`, `engine_no`, `lat`, `lng`, `last_ping_at`, `photo_file_id`) | `0022`, `0028` | `owner` can name an individual; location tracking is by vehicle |
| DS-9 | Offline-capture users | `integ_offline_operation` (`user_id`, `client_device_key`, `payload`, `captured_at`) | `0001`, `src/modules/offline/*` | Payload content depends on the operation type |
| DS-10 | Reference copies of other modules' people | `ref_record` (`data` JSON, `source_module`, `entity_type`) | `0040_ref_records.sql`, `src/modules/integration/service.ts` | Content depends on what HRMS/P&M/PMS/Stores send; Core does not define its fields |

## 5. Personal data inventory (column names per table)

Column names only. "Sensitivity" is an **Assessed** rating by this review: High (credentials, biometric-adjacent keys, government/tax identifiers, location), Medium (direct identifiers and contact data), Low (indirect identifiers, operational data).

| Table | Personal-data columns | Sensitivity (Assessed) | Source |
|---|---|---|---|
| `core_user` | `login_id`, `email`, `name`, `phone`, `employee_id`, `designation`, `position_id`, `user_role`, `scope`, `scope_ids`, `modules`, `status`, `last_login_at`, `failed_count`, `locked_until`, `must_change_password`, `password_hash`, `password_set_at`, `pin_hash`, `pin_set_at` | High (credential hashes), Medium | `migrations/0001_core_tenant.sql`, `0006_user_login_unique.sql`, `0024_user_profile.sql`, `types.generated.ts` |
| `core_user_passkey` | `user_id`, `credential_key`, `public_key`, `label`, `sign_count` | High | `0007_passkeys.sql` |
| `core_user_session` | `user_id`, `refresh_hash`, `device_label`, `device_info`, `issued_at`, `expires_at`, `revoked_at`, `revoked_reason` | Medium (hashed token, device data) | `0001`, `0031_session_revoke_reason.sql` |
| `core_auth_activity` | `user_id`, `event_type`, `ip_address`, `geo_location`, `occurred_at`, `purpose`, `challenge`, `secret_hash`, `attempts`, `used_at`, `expires_at` | Medium to High. `ip_address` is written as NULL (see section 9) | `0001`; `src/modules/auth/repo.ts` (`recordAuthEvent`) |
| `core_user_access` | `user_id`, `role_id`, `module`, `privilege`, `project_id`, `location_id`, `store_id`, `access_type`, `reason`, `restored_at` | Low to Medium (access history) | `0008_access.sql` |
| `core_vendor` | `name`, `email`, `phone`, `address`, `pan`, `gstin`, `registered_by`, `verified_at`, `status` | Medium; High for `pan` | `0001`, `0011_masters.sql` |
| `core_company_profile` | `contact_name`, `contact_email`, `contact_phone`, `address_line1`, `address_line2`, `city`, `state`, `pin`, `pan`, `gstin`, `cin`, `tan`, `website`, `logo_file_id` | Low to Medium | `0001`, `0009_organisation.sql` |
| `core_location` | `in_charge`, `phone`, `email`, `address_line`, `city`, `state`, `pin`, `latitude`, `longitude` | Medium | `0001`, `0010_projects.sql` |
| `core_store` | `keeper`, `phone`, `location_text` | Medium | `0001`, `0011_masters.sql` |
| `core_grievance` | `employee_id`, `employee_code`, `raised_by`, `raised_by_name`, `subject`, `message`, `note`, `visit_date`, `visit_status`, `status`, `source_module`, `source_record_id` | High (sensitive free text, Assessed) | `0001`, `0021_grievance_employee_code.sql`, `0027_grievance_note.sql`, `0029_grievance_visit_status.sql` |
| `core_ticket` | `raised_by_user_id`, `subject`, `description`, `category`, `priority`, `status` | Medium (free text) | `0001`, `0014_records.sql` |
| `core_notification` | `recipient_user_id`, `title`, `body`, `notification_type`, `delivery_status`, `read_at`, `source_type`, `source_id` | Low to Medium | `0001`, `0014` |
| `core_approval_request` | `raised_by_id`, `raised_by_name`, `assigned_actor_id`, `title`, `amount`, `payload_json`, `levels_snapshot`, `source_record_id`, `published_location_id` | Medium (payload free-form) | `0013_approvals.sql`, `0025`, `0032` |
| `core_approval_action` | `actor_id`, `by_name`, `comment`, `decision`, `amount_approved`, `line_changes`, `acted_at` | Medium | `0013`, `0025` |
| `core_record_timeline` | `actor_id`, `action`, `remarks`, `details`, `entity_type`, `entity_id`, `old_status`, `new_status`, `occurred_at` | Medium (free text) | `0014_records.sql` |
| `core_file` | `file_name`, `content_type`, `size_bytes`, `sha256`, `owner_type`, `owner_id`, `visibility`, `object_key`, `captured_at` | Medium (file names can identify people) | `0001`, `0014` |
| `core_file_content` | `file_id`, `content` (bytes), `sha256` | Medium to High (document content is not inspected by the application) | `0015_file_content.sql` |
| `core_offer_letter_revision` | `file_id`, `file_name`, `mime_type`, `revision`, `size_bytes` | Low to Medium (template file) | `0023_offer_letter_revisions.sql` |
| `core_document_template` | `file_id`, `file_name`, `mime_type`, `name`, `revision` | Low | `0001` |
| `core_equipment_unit` | `owner`, `vendor_id`, `reg_no`, `chassis_no`, `engine_no`, `lat`, `lng`, `last_ping_at`, `photo_file_id`, `insurance_no`, `fitness_cert`, `puc_no` | Medium (location) | `0022_equipment_units.sql`, `0028_equipment_unit_media.sql` |
| `core_policy_rule_ack` | acknowledging user and time of acknowledgement | Low | `0012_policies.sql` |
| `integ_event` | `actor_id`, `payload`, `correlation_id`, `source_module`, `last_error` | Medium (payload content depends on event type) | `0001`, `0039_event_relay.sql` |
| `integ_offline_operation` | `user_id`, `client_device_key`, `payload`, `store_id`, `location_id` | Medium | `0001` |
| `ref_record` | `data`, `source_module`, `source_id`, `entity_type`, `deleted` | Medium (content defined by the sending module) | `0040_ref_records.sql` |
| `audit_row_change` | `actor_id`, `ip_hash`, `old_row`, `new_row`, `table_name`, `record_id`, `module_name`, `correlation_id`, `prev_hash`, `row_hash` | Medium (row snapshots; sensitive keys removed, see section 8) | `0001`, `0002_audit_append_only.sql` |
| `core_rate_limit_window` (public) | rate-limit key (derived from client address or login ID), counters | Low | `0002_rate_limit.sql` |
| `core_*` audit columns on every table | `created_by`, `updated_by` | Low | `0001` |

No columns for national ID, date of birth, gender, bank account, biometric templates, health data or applicant details were found in the migrations. Redaction code lists `account_no`, `account_number` and `ifsc` as keys to protect, but no such column exists in the schema (verified by reading `types.generated.ts`).

## 6. Records of processing register

| ID | Processing activity | Purpose | Data subjects | Data categories | Source of data | Lawful basis | Recipients | Transfers | Retention (as coded) |
|---|---|---|---|---|---|---|---|---|---|
| RP-01 | Authentication and session management | Verify identity, protect accounts, support passkeys and password reset | DS-1 | Identity, contact, credential hashes, device data, auth events | The user and the tenant administrator | To be confirmed by the DPO | Tenant administrators; none external. E-mail provider for OTP: To be confirmed (not wired in) | To be confirmed | Sessions expire (30 days); OTP rows expire (5 minutes); rows are not deleted by code. Policy To be confirmed |
| RP-02 | User and access administration | Create users, assign role, module, project, location and store scope | DS-1 | Identity, role, scope, access history | Tenant administrator; HRMS reference | To be confirmed by the DPO | Tenant administrators | To be confirmed | Access grants can be deleted (`src/modules/access/repo.ts`); suspensions are recorded with `restored_at`. Policy To be confirmed |
| RP-03 | Organisation and project master data | Maintain company profile, departments, positions, locations, projects, stores, WBS | DS-5, DS-6 | Contact names, phones, e-mails, addresses, coordinates | Tenant administrators | To be confirmed by the DPO | Modules via events (section 10) | To be confirmed | Retained until deleted by an authorised user; policy To be confirmed |
| RP-04 | Vendor management | Register and verify vendors, link to equipment and approvals | DS-4 | Name, contact, address, PAN, GSTIN | Vendor, tenant staff | To be confirmed by the DPO | Approvers; modules via events | To be confirmed | Retained; no delete route for vendors in the API (only GET, POST, PATCH, verify) |
| RP-05 | Approvals and workflow | Route requests through approval levels, record decisions and clarifications, publish approved job openings | DS-3, DS-7 | Requester and approver names, comments, amounts, request payload | Requesters and approvers | To be confirmed by the DPO | Assigned approvers; modules via events | To be confirmed | Retained as a business record. Policy To be confirmed |
| RP-06 | Grievances | Capture and track employee grievances and site visits | DS-2 | Employee identifiers, free-text message and note | Employees, HR staff, HRMS (`source_module`) | To be confirmed by the DPO | Staff with the grievance permission | To be confirmed | Grievance rows can be deleted by an authorised user (`DELETE /grievances/{id}`); policy To be confirmed |
| RP-07 | Tickets and notifications | Internal support requests and in-app notices | DS-1 | Subject, description, recipient | Users | To be confirmed by the DPO | Support staff | To be confirmed | Not deleted by code. Policy To be confirmed |
| RP-08 | File and document storage | Store images, PDFs and Word documents against records (profile photo, equipment photo, offer-letter template, attachments) | DS-1, DS-8 | File name, bytes, hash, owner link | Users | To be confirmed by the DPO | Users with access to the owning record | To be confirmed | Stored in `core_file_content` inside PostgreSQL; file rows can be deleted. Policy To be confirmed |
| RP-09 | Job openings and offer-letter template | Approve and publish openings, hold the offer-letter template revisions | DS-7 | Opening details in `payload_json`; template file | HR staff | To be confirmed by the DPO | Publishing location users | To be confirmed | Template revisions are numbered and kept (`core_offer_letter_revision`). Policy To be confirmed |
| RP-10 | Equipment and maintenance | Track units, documents, expiries, location pings, schedules | DS-8 | Owner, registration, chassis, engine, coordinates | Tenant staff, P&M | To be confirmed by the DPO | P&M via events | To be confirmed | Retained; no delete route for equipment units |
| RP-11 | Audit logging | Provide an evidence trail of changes and sign-ins | DS-1 to DS-10 | Actor, row snapshots (sensitive keys redacted), `ip_hash` | The application | To be confirmed by the DPO | Auditors with `access.manage`; external audit writers | To be confirmed | **Append-only by database trigger; rows cannot be updated, deleted or truncated** (`migrations/0002_audit_append_only.sql`) |
| RP-12 | Integration event relay | Publish Core changes to modules and receive module events | DS-1 to DS-10 (payload dependent) | Event envelope and payload | The application, modules | To be confirmed by the DPO | HRMS, P&M, PMS, Stores | To be confirmed (transport not chosen; D13 in `src/core/relay.ts`) | `integ_event` rows kept; dead-lettered rows stay until replayed. Idempotency keys 24 hours (`src/core/idempotency.ts`) |
| RP-13 | Offline capture sync | Accept operations recorded offline at sites | DS-9 | User, device key, payload, location | Site users | To be confirmed by the DPO | Core processing only | To be confirmed | Retained. Policy To be confirmed |
| RP-14 | Backup and restore | Business continuity, per-tenant dumps, restore drills | All | Entire tenant schema | The database | To be confirmed by the DPO | Operator staff; backup storage provider To be confirmed | To be confirmed | Backup retention not defined in the repository. Drill evidence in `CORE__BACKEND/docs/restore-drills/` |
| RP-15 | Rate limiting and request logging | Abuse protection and diagnostics | DS-1 | Client address (as limiter key), request ID, log lines | The network | To be confirmed by the DPO | Operator staff; log platform To be confirmed | To be confirmed | Rate windows are swept (`src/core/rate-limit-store.ts`); log retention To be confirmed |

## 7. Lawful basis options

The repository cannot determine the lawful basis. The table lists the options the DPO may weigh. **None is asserted.**

| Processing group | Options for the DPO to consider | Decision |
|---|---|---|
| Workforce identity, access, approvals (RP-01, RP-02, RP-05) | Contract, legal obligation, legitimate interests, consent (where permitted), other basis available under the applicable law | To be confirmed by the DPO |
| Grievances (RP-06) | Legal obligation, legitimate interests, consent | To be confirmed by the DPO |
| Vendor data (RP-04) | Contract, legitimate interests, legal obligation (tax) | To be confirmed by the DPO |
| Location data (RP-03, RP-10) | Legitimate interests, consent | To be confirmed by the DPO |
| Audit and security logging (RP-11, RP-15) | Legal obligation, legitimate interests | To be confirmed by the DPO |
| Jurisdiction and applicable law (GDPR, India DPDP, other) | Not stated in the repository | To be confirmed by the DPO |

## 8. Security measures (summary)

Full detail is in [DOC-04](04-Security-Architecture-and-Controls.md). This table summarises what the code provides.

| Measure | Implementation | Evidence |
|---|---|---|
| Tenant isolation | Schema-per-tenant, `SET LOCAL search_path`; a token for one tenant cannot read another; the `X-Tenant-Id` header cannot move a protected request | `src/db/tenant.ts`, `tests/testing-pass/tenant-isolation.test.ts` |
| Password storage | Argon2id | `src/core/password.ts` |
| Credential redaction | Keys such as `password`, `pin`, `otp`, `token`, `pan`, `gstin` and any key ending in `_hash`, `_secret`, `_token` are redacted from logs and audit snapshots | `src/core/redaction.ts` |
| Brute-force control | Lockout for 15 minutes, per-IP and per-login rate limits (for example 10 login attempts per login ID per 15 minutes), shared limiter table | `src/modules/auth/service.ts`, `src/modules/auth/routes.ts`, `migrations/0002_rate_limit.sql` |
| Strong authentication | Passkeys (WebAuthn), step-up token valid 5 minutes for sensitive actions | `src/modules/auth/passkey.ts`, `step-up.ts` |
| Access control | Privilege-based permissions, role scope by project, location and store | `src/modules/access/*`, `tests/permissions` |
| Audit integrity | Append-only trigger; hash chain; `verifyAuditChain` | `migrations/0002_audit_append_only.sql`, `src/core/audit.ts` |
| Transport and headers | TLS terminated in front of the API; HSTS in production; CSP, X-Frame-Options, `Cache-Control: no-store` | `docs/DEPLOYMENT.md`, `src/plugins/security-headers.ts` |
| File upload limits | 2 MB maximum; allow-list of six media types | `src/modules/records/rules.ts` |
| IP minimisation | Audit stores `ip_hash`; `core_auth_activity.ip_address` is not written | `src/core/audit.ts`, `src/modules/auth/repo.ts` |
| Backup | Per-tenant custom-format dump and restore drill with chain check | `src/db/backup.ts`, `src/db/restore-drill.ts`, `docs/restore-drills/2026-11-21-acme.md` |

Gaps relevant to privacy (Assessed): no field-level encryption of columns such as `pan` or file bytes was found in the repository; encryption at rest is a database or storage-layer decision (To be confirmed). Backup files are described as containing personal data and must be encrypted by the operator (`docs/DEPLOYMENT.md`).

## 9. Retention (as coded)

| Data | Coded behaviour | Evidence | Policy |
|---|---|---|---|
| Access token | 15 minutes | `src/modules/auth/tokens.ts` | n/a |
| Refresh token and session | 30 days; revoked sessions keep `revoked_at` and `revoked_reason`; rows are not purged | `tokens.ts`, `migrations/0031_session_revoke_reason.sql` | To be confirmed |
| Password-reset and passkey challenge | 5 minutes | `src/modules/auth/password-reset.ts`, `passkey.ts` | To be confirmed |
| Step-up token | 5 minutes | `src/modules/auth/step-up.ts` | n/a |
| Idempotency keys | 24 hours; expired row with the same key replaced on reuse | `src/core/idempotency.ts` | To be confirmed |
| Rate-limit windows | Expired windows swept on about one hit in a hundred | `src/core/rate-limit-store.ts`, `docs/DEPLOYMENT.md` | n/a |
| Auth events (`core_auth_activity`) | Kept; the code comment states the raw IP is not stored until the owner sets the retention period | `src/modules/auth/repo.ts` (`recordAuthEvent`) | To be confirmed |
| Audit log | Immutable; cannot be deleted by the application or by the application role | `migrations/0002_audit_append_only.sql` | To be confirmed |
| Business records | Kept until a delete route is called by an authorised user (where a route exists) | `src/core/rows.ts` (`deleteRow`) | To be confirmed |
| Events | Outbox rows kept with status; dead-lettered rows held until replayed | `src/core/relay.ts` | To be confirmed |
| Backups | No retention rule in the repository | `docs/DEPLOYMENT.md` | To be confirmed |

There is no scheduled job in the repository that purges personal data after a retention period. Retention periods are therefore an open item for the DPO (section 14).

## 10. Recipients and transfers

| Recipient | Mechanism | Data shared | Evidence | Status |
|---|---|---|---|---|
| HRMS | Outbound events through the relay; inbound events to `POST /integration-events/inbound` (`sourceModule` value `hrms`) | Event envelope and payload; payload fields are defined by the event type | `src/modules/integration/schema.ts`, `src/core/relay.ts` | Transport not chosen (D13); recipients To be confirmed |
| P&M (plant and machinery) | Same, `sourceModule` value `pm` | As above | same | To be confirmed |
| PMS | Same, `sourceModule` value `pms` | As above | same | To be confirmed |
| Stores | Same, `sourceModule` value `stores` | As above | same | To be confirmed |
| E-mail provider (password-reset OTP) | Not wired in. The message text carries the code and expiry only, no tenant and no user details | Recipient e-mail, code | `src/modules/auth/email-otp.ts`, `docs/DEPLOYMENT.md` (decision D10) | Provider To be confirmed |
| Hosting and backup provider | Not determinable | Entire database | n/a | To be confirmed |
| Open-source libraries | Run in-process, no data sent | None | [DOC-13](13-Third-Party-Software-Inventory.md) | n/a |
| Cross-border transfer | Not determinable from the repository | n/a | n/a | To be confirmed |

The inbound endpoint is restricted to the tenant administrator permission (`admin(...)` guard in `src/modules/integration/routes.ts`). The monitor endpoints never return payload values (route comment in the same file).

## 11. Data subject rights: what the system supports today

Findings are factual. "Not in application" means no feature was found in the repository.

| Right | Support in application | Evidence | Manual process needed |
|---|---|---|---|
| Information (notice) | Not in application (no privacy notice screen or endpoint found) | Searched `src` and `migrations` | To be confirmed |
| Access / copy | Partial. Users read their own profile (`GET /auth/me`, `GET /auth/me/access`, `GET /auth/sessions`). Administrators list and read records through the API. **No single "export all my data" feature exists** | `docs/api/openapi-v1.json` | Operator extracts via API or database query; process To be confirmed |
| Rectification | Yes for most records through PATCH routes (users, vendors, locations, grievances, and so on). Audit rows are immutable by design | OpenAPI paths; `0002_audit_append_only.sql` | None for current data |
| Erasure | **Not in application.** There is no user delete route (`/users` has GET, POST, PATCH only; no `DELETE /users/{id}`). Users are deactivated by status or suspension. Grievances, files, policies and other lookups have DELETE routes; vendors, equipment units, stores and projects do not. The audit log and the approval history cannot be erased. A search for erase, anonymise, GDPR and DSAR in `src` found no erasure or anonymisation function | OpenAPI paths; `src/core/audit.ts`; repository search | Controlled database procedure, if the DPO decides one is lawful; To be confirmed |
| Restriction | Partial. Access can be suspended (`POST /access/users/{userId}/suspensions`) and restored; user status can be changed. Not a data-level restriction flag | `src/modules/access/*` | To be confirmed |
| Portability | Not in application (no machine-readable export of a person's data) | Repository search | To be confirmed |
| Objection | Not in application | Repository search | To be confirmed |
| Automated decision-making | None found. Approvals are rule-routed but decided by people | `src/modules/approvals/*` | DPO to confirm |
| Withdrawal of consent | No consent records or consent capture found | Repository search | To be confirmed |
| Breach notification support | Partial: audit chain, auth events, request IDs in logs. No incident workflow in the application | `src/core/audit.ts`, `docs/DEPLOYMENT.md` | Incident process To be confirmed |

## 12. Risk assessment

Scale: Likelihood and Impact are each Low, Medium or High. Ratings are **Assessed** by this review from repository evidence, before any operational controls that sit outside the code. The DPO may re-rate.

| ID | Risk | Likelihood | Impact | Rating | Mitigation in application | Residual action | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Cross-tenant disclosure of personal data | Low | High | Medium | Schema-per-tenant, `SET LOCAL search_path`, token tenant claim enforced, isolation tests | Independent isolation test (DOC-21); least-privilege DB role (`scripts/admin/create-core-app-role.sql`) confirmed in production | Assessed |
| R-02 | Credential compromise (password guessing, reuse) | Medium | High | High | Argon2id, lockout, rate limits, passkeys, step-up, session revoke | Enforce passkeys or MFA by policy; password-reset provider hardening | Assessed |
| R-03 | Password-reset code delivery through an unmanaged channel | Medium | Medium | Medium | Reset returns 503 in production until a provider exists; fixed sample code refused in production | Choose and assess provider (DOC-21 questionnaire) | Assessed |
| R-04 | Excess retention (no purge) | High | Medium | High | None beyond token and key expiry | Define retention schedule and purge jobs | Assessed |
| R-05 | No erasure or portability capability, so rights requests need manual work | Medium | Medium | Medium | Rectification routes; audit and history | Decide approach with DPO; build or document manual procedure | Assessed |
| R-06 | Sensitive free text in grievances, tickets, remarks, approval payloads | Medium | High | High | Access privileges on routes; audit logging with redaction of listed keys only | Restrict viewers, add notice to authors, consider field review | Assessed |
| R-07 | Personal data in file bytes (photos, PDFs) not inspected or encrypted at field level | Medium | Medium | Medium | 2 MB cap; six-type allow-list; `Cache-Control: private` on download; visibility column | Storage-layer encryption (To be confirmed); content-sniffing and malware scan not found | Assessed |
| R-08 | Personal data in audit snapshots | Medium | Medium | Medium | Redaction of sensitive keys; `ip_hash`; access limited to `access.manage` | DPO to review snapshot content against purpose; audit log is not erasable | Assessed |
| R-09 | Personal data leaving through event payloads to modules | Medium | Medium | Medium | Admin-only inbound; payload not shown in monitor; per-aggregate order and idempotency | Data-sharing agreements and payload field minimisation with module owners | Assessed |
| R-10 | Backup files with personal data stored or transferred unprotected | Medium | High | High | Documented requirement to encrypt; per-tenant dumps; drills | Backup encryption, location, access, retention (To be confirmed) | Assessed |
| R-11 | Location data (coordinates for locations and equipment) used beyond purpose | Low | Medium | Low | Stored by asset, not by person | DPO to confirm purpose limitation | Assessed |
| R-12 | International transfer without safeguards | Not assessable | Not assessable | Not assessable | Not determinable from the repository | Hosting and provider locations (To be confirmed) | Assessed |
| R-13 | Data subject unaware of processing (no notice) | Medium | Medium | Medium | None in the application | Privacy notice process (To be confirmed) | Assessed |
| R-14 | Logs capture personal data | Low | Medium | Low | Pino redaction of headers and sensitive keys; request bodies not logged | Confirm log platform retention and access | Assessed |

## 13. Necessity and proportionality (review prompts)

| Principle | Observation from repository | DPO decision |
|---|---|---|
| Data minimisation | Schema carries no government ID, date of birth, bank account or health data. Free-text fields and JSON payloads are unrestricted | To be confirmed |
| Purpose limitation | Purposes inferred from module design; not recorded as policy | To be confirmed |
| Accuracy | PATCH routes and `row_version` optimistic concurrency support correction | Acceptable, to be confirmed |
| Storage limitation | No purge | See R-04 |
| Integrity and confidentiality | See section 8 and DOC-04 | To be confirmed |
| Accountability | Immutable audit chain, restore drills, tests | Owners To be confirmed |

## 14. Open items for the DPO

| # | Item | Owner |
|---|---|---|
| 1 | Name the DPO or privacy lead and the document owner | To be confirmed |
| 2 | Decide controller or processor roles between VeloxIQ and each tenant | To be confirmed |
| 3 | Decide the lawful basis per processing group (section 7) and applicable law (GDPR, DPDP, other) | To be confirmed |
| 4 | Confirm hosting provider, region and sub-processors; cross-border transfer mechanism | To be confirmed |
| 5 | Choose the e-mail/SMS/OTP provider (decision D10) and assess it with the DOC-21 questionnaire | To be confirmed |
| 6 | Choose the event transport (decision D13) and agree data-sharing terms with HRMS, P&M, PMS and Stores owners | To be confirmed |
| 7 | Define retention periods per data class and, if required, a purge job; set the retention period that allows `core_auth_activity.ip_address` to be written | To be confirmed |
| 8 | Decide the erasure, anonymisation, export and portability approach (none exists in the application today) | To be confirmed |
| 9 | Confirm whether applicants for job openings are processed in the HRMS and whether Core should ever hold applicant data (none today) | To be confirmed |
| 10 | Confirm encryption at rest for database, file content and backups, and key custody | To be confirmed |
| 11 | Provide a privacy notice and consent approach where relied upon | To be confirmed |
| 12 | Confirm whether a formal DPIA sign-off or supervisory consultation is required | To be confirmed |
| 13 | Define the personal-data breach procedure and notification clock | To be confirmed |
| 14 | Confirm that `scripts/admin/create-core-app-role.sql` has been applied in production (noted as an open item in `docs/DEPLOYMENT.md`) | To be confirmed |

## 15. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review, for DPO review |
