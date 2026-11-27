# Audit Logging and Observability Specification

| Field | Value |
|---|---|
| Document ID | DOC-07 |
| Title | Audit Logging and Observability Specification |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This document specifies what VeloxIQ Core records about activity (the audit trail), how that record is protected and shown, and what operational visibility exists (application logs, correlation ids, health endpoints). It separates what is implemented from what is absent, and proposes an enterprise logging standard, clearly labelled Proposed.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Audit trail: writers, structure, hash chain, append-only enforcement, redaction | Event and integration contract (see DOC-06) |
| Sign-in and access events | Database backup and restore procedure (see `CORE__BACKEND/docs/DEPLOYMENT.md`) |
| Activity log screen in the frontend | Infrastructure monitoring tooling (not present in the repository) |
| Application logging, correlation ids, health endpoints | |
| Retention and export | |
| Proposed logging standard | |

Sources: `CORE__BACKEND/src/core/{audit,redaction,resource,health,error-handler}.ts`, `src/modules/audit-log/*`, `src/modules/auth/repo.ts`, `src/plugins/auth.ts`, `src/http/app.ts`, `src/app.ts`, `src/server.ts`, `src/config/env.ts`, migrations `0001`, `0002_audit_append_only.sql`, `0003_approved_constraints.sql`, `0033_hot_path_indexes.sql`, `docs/DEPLOYMENT.md`, `docs/API_V1.md`; frontend `CORE__FRONTEND/src/modules/audit/*`, `src/modules/integrations/pages/*`, `src/modules/core-data/api/audit.ts`. Paths are relative to `CORE__V__0.4` unless stated.

## 3. What is audited

| Source of audit entry | Mechanism | Module value | Evidence |
|---|---|---|---|
| Every create, update and delete through the generic resource layer | `auditWrite` called by the create, update and delete functions in `src/core/resource.ts`, in the same transaction as the change | `core` | `resource.ts` (calls at the insert, update and delete paths) |
| Writes in module services that do not use the generic layer: access grants, approvals, equipment units, masters, offer letters, organisation, policies, projects, records, stock levels | Direct use of `auditWrite` or `appendAuditRow` | `core` | Files importing these functions: `src/modules/{access,approvals,equipment-units,masters,offer-letter,organisation,policies,projects,records,stock-levels}/service.ts` |
| Replay of an integration event | `auditWrite` on table `integ_event` (UPDATE, before and after snapshots) | `core` | `src/modules/integration/service.ts` |
| Entries sent by other modules | `POST /audit-log/external` then `appendAuditRow` | `hrms`, `pm`, `pms`, `stores` | `src/modules/audit-log/service.ts` |
| Sign-in and access events | Rows in `core_auth_activity` via `recordAuthEvent` (a separate table, not the hash chain) | `core` | `src/modules/auth/repo.ts` |

Not audited in the chain: read requests (no read audit exists), inbound events applied to `ref_record` (recorded in `integ_event` instead, see DOC-06), and rate-limit hits (counted in `public.core_rate_limit_window`, not audited). Whether read access to sensitive records must be audited is To be confirmed.

Because audit rows are written with the change in one transaction, a rolled-back change leaves no audit row and a committed change always has one.

## 4. Audit record structure

Table `audit_row_change` (migration 0001; `module_name` constraint in 0003). Writer: `appendAuditRow` in `src/core/audit.ts`.

| Column | Meaning |
|---|---|
| `id` | Entry id (UUID) |
| `table_name` | Table changed (for external entries, the module's `entityType`) |
| `record_id` | Id of the record (`-` for external entries without `recordRef`) |
| `op` | `INSERT`, `UPDATE` or `DELETE` |
| `old_row`, `new_row` | Redacted snapshots as JSON (null when not applicable) |
| `actor_id` | Core user (lower-cased UUID); NULL for external entries |
| `correlation_id` | Request id of the originating HTTP call, or the module-supplied id |
| `module_name` | `core`, `hrms`, `pm`, `pms`, `stores` (check constraint) |
| `ip_hash` | Hash of the client IP if the caller provides one. The generic writers do not pass it, so it is NULL for current entries (`auditWrite` omits it) |
| `changed_at` | Time of write, strictly increasing at millisecond precision |
| `prev_hash`, `row_hash` | Hash chain links (section 5) |

## 5. Hash chain and tamper verification

| Step | Behaviour | Code |
|---|---|---|
| Serialise writers | Advisory lock `audit_row_change` per tenant schema | `lockWithinSchema` in `appendAuditRow` |
| Link | `prev_hash` is the `row_hash` of the newest existing row (NULL for the first) | `appendAuditRow` |
| Time | `changed_at = max(now, previous + 1 ms)` so order is unambiguous | `appendAuditRow` |
| Hash | SHA-256 over canonical JSON of: table_name, record_id, op, old_row, new_row, actor_id, correlation_id, module_name, ip_hash, changed_at (UTC ISO with milliseconds), prev_hash | `computeRowHash`, `src/core/canonical-json.ts` |
| Verify | `verifyAuditChain` reads all rows in `changed_at` order, recomputes each hash and checks `prev_hash` equals the previous `row_hash`; returns `{ rows, brokenAt }` where `brokenAt` is the first failing row id or null | `src/core/audit.ts` |

Where verification runs today: `verifyAuditChain` is called from the restore drill (`src/db/restore-drill.ts`, `npm run db:drill`). The repository has no scheduled job, API endpoint or UI that runs it routinely (verified by search). A routine verification schedule is To be confirmed (see section 14 Proposed).

Limits (stated in `0002_audit_append_only.sql`): the chain detects edits made behind the trigger; it does not prevent the table owner or a superuser from disabling the trigger. Deleting the newest rows, or rewriting the whole chain consistently, would not be detected by `verifyAuditChain` alone; an external anchor of the head hash does not exist (To be confirmed).

## 6. Append-only enforcement

| Control | Detail | Source |
|---|---|---|
| Trigger | `audit_row_change_no_update_delete` (BEFORE UPDATE or DELETE, per row) and `audit_row_change_no_truncate` (BEFORE TRUNCATE) raise "audit_row_change is append-only" with error code `insufficient_privilege` | `migrations/0002_audit_append_only.sql` |
| Privileges | UPDATE, DELETE, TRUNCATE revoked from PUBLIC, and from role `core_app` if it exists. The migration owner keeps its rights; the role is created by a database administrator | `migrations/0003_approved_constraints.sql` |
| API | No write endpoint other than `POST /audit-log/external` (insert only); all `/audit-log` reads are GET | `src/modules/audit-log/routes.ts` |
| Residual risk | Owner or superuser can disable the trigger; detection is by chain verification | `0002` header comment |

## 7. What is redacted

Implemented in `src/core/audit.ts` (`redactSnapshot`) and `src/core/redaction.ts`. Redaction happens before hashing and storage, and again when entries are read (`snapshotText` in `src/modules/audit-log/service.ts`).

| Rule | Keys | Result |
|---|---|---|
| Removed at any depth | `password_hash`, `pin_hash`, `refresh_hash`, `secret_hash` | Key omitted (`AUDIT_EXCLUDED_KEYS`) |
| Value replaced with `[REDACTED]` | `password`, `password_hash`, `pin`, `pin_hash`, `otp`, `otp_secret`, `secret`, `secret_hash`, `token`, `access_token`, `refresh_token`, `refresh_hash`, `pan`, `gstin`, `account_no`, `account_number`, `ifsc`, `temporaryPassword`, `currentPassword`, `newPassword`; any key ending `_hash`, `_secret` or `_token` (case-insensitive) | `isSensitiveKey` |
| Also applied to | Details sent by other modules in `POST /audit-log/external` (snapshot redaction runs on `new_row`) | `appendAuditRow` |
| Application log redaction | `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, plus every sensitive key at the top level, one level down and two levels down | `loggerRedactPaths` in `src/core/redaction.ts`; applied in `src/app.ts` |

Not redacted: the free-text `summary` and `actorName` of external entries, and any personal data held in ordinary fields (for example names). Modules must not put secrets in them (DOC-06 consumer checklist). Raw client IP addresses are not stored in sign-in events (`ip_address` stays NULL until the owner sets a retention period; comment in `recordAuthEvent`).

## 8. Sign-in and access events

Stored in `core_auth_activity` (migration 0001, challenge column 0007, index 0033) by `recordAuthEvent`. Listed by `GET /audit-log/auth-events`. Internal rows `otp_issued` and `passkey_challenge` exist in the same table but are excluded from the list because they carry a code hash or challenge.

### 8.1 Event types (`AUTH_EVENT_TYPES`, `src/modules/audit-log/schema.ts`)

| Group | Event types |
|---|---|
| Password sign-in | `login_success`, `login_failure`, `login_locked`, `logout` |
| Tokens and sessions | `refresh`, `refresh_reuse`, `session_revoked`, `session_limit_revoked` |
| One-time code and password | `otp_verified`, `otp_failed`, `password_reset`, `password_admin_reset`, `password_changed`, `password_change_failure` |
| Passkeys | `passkey_login_success`, `passkey_login_failure`, `passkey_registered`, `passkey_removed` |
| Step-up | `step_up_success`, `step_up_failure` |
| Authorisation | `access_denied` (detail is `METHOD route-pattern`, never body or ids; written by `src/plugins/auth.ts`) |

### 8.2 Warning events

The frontend marks these with a warning tone (`AUTH_EVENT_WARNINGS`, `CORE__FRONTEND/src/modules/core-data/api/audit.ts`): `login_failure`, `login_locked`, `refresh_reuse`, `otp_failed`, `password_change_failure`, `passkey_login_failure`, `step_up_failure`, `access_denied`. No automatic alert is raised for them (section 11).

### 8.3 Other modules' sign-ins

External entries with `entityType` `session` are merged into the same list (`AUTH_EVENT_SOURCE` in `src/modules/audit-log/repo.ts`), with `signed_in`, `signed_out`, `login_failed` mapped to `login_success`, `logout`, `login_failure`. The list has a `module` column and filter.

## 9. Activity log screen

Frontend: `CORE__FRONTEND/src/modules/audit/pages/AuditTrail.tsx`. Backend access: all the underlying endpoints need `access.manage` at company scope (no separate audit-reading privilege exists; comment in `src/modules/audit-log/routes.ts`).

| Tab | Backend | Shows | Filters |
|---|---|---|---|
| Activity | `GET /audit-log`, `GET /audit-log/{id}` | Date and time, module, changed by, record, what happened, area; details dialog with changed fields (update) or recorded values (create, delete). Entries from other modules show their own summary | From, To, Module, Area (table), What (created, updated, deleted), Person (name or login) |
| Sign-ins | `GET /audit-log/auth-events` | Date and time, module, person (and login), event, detail | From, To, Module, Event, Person |
| Data exchange log | `GET /integration-events`, `/summary`, replay | Events sent and received with state, attempts, last error; Replay button on dead-lettered events (confirmation dialog; replay is audited). Payload values are not shown, only field names | direction, status, event type, dates |
| Shared records | `GET /ref-records`, `/sync-status` | Latest copy Core holds of module records, sequence, last synced, deleted-at-source flag; no stale verdict (D16 open) | Module, entity type, text search |

Behaviour notes:

| Topic | Fact |
|---|---|
| Paging | 50 rows per page; server limit is at most 200; filters are applied on the server; the search box narrows only the current page |
| Ordering | Newest first |
| Dates | Calendar dates, inclusive, evaluated in UTC |
| Tab addresses | `?view=sign-in`, `?view=messages`, `?view=data` open the matching tab |
| Immutability | Screen is read-only; text states entries cannot be edited or deleted |
| Module labels | CORE, HRMS, P&M, PMS, Stores (`AUDIT_MODULES` in the frontend) |

## 10. How other modules' activity appears

| Aspect | Behaviour |
|---|---|
| Entry point | `POST /audit-log/external` (see DOC-06 section 11) |
| Module column | `module_name` value; shown as the Module column in Activity and Sign-ins |
| Module filter | `module` query parameter on `GET /audit-log` and `GET /audit-log/auth-events` |
| Person | Name and login are carried inside the entry (`actorName`, `actorLogin`), not linked to a Core user; the Person filter also searches these |
| Action and area | The module's `action` and `entityType`, shown with underscores replaced by spaces and the first letter capitalised |
| Time shown | The module's `occurredAt`; the stored `changed_at` is when Core wrote the row |
| Detail | `summary` and `details` appear in the "after" text of the entry |
| Integrity | Same hash chain as Core's own entries |

## 11. Correlation ids

| Item | Behaviour | Source |
|---|---|---|
| Request id | Every response carries `X-Request-Id`. A client may send its own (8 to 64 letters, digits, dots, underscores or hyphens, per `docs/DEPLOYMENT.md`); otherwise the server generates `req-<counter in base 36>`. The counter is per process and restarts at restart | `src/http/app.ts` |
| In logs | The id is bound to the request logger, so every log line of the request carries it | `docs/DEPLOYMENT.md`, `src/http/app.ts` |
| In audit rows | `actor.correlationId = request.id` goes into `audit_row_change.correlation_id` for every Core write | `inTenant` and `auditWrite` in `src/core/resource.ts` |
| In outbound events | `correlation_id` = request id of the change that produced the event | `emitRequestEvent` in `src/modules/approvals/service.ts` |
| Module-supplied | `correlationId` (1 to 100 characters) on inbound events and external audit entries; if absent, the request id is used | `schema.ts` files; `receiveInbound`, `recordExternalAudit` |
| Propagation to other modules | Core does not forward a trace header to other systems; no distributed tracing library is present | Search of `package.json` and `src` |
| Query by correlation id | No API filter or screen search on `correlation_id` exists (the column is stored but not exposed in the audit entry shape) | `AuditEntryRecord` in `src/modules/audit-log/service.ts` |

## 12. Application logging

| Item | Fact | Source |
|---|---|---|
| Library and format | pino, JSON lines to standard output | `src/http/app.ts`, `docs/DEPLOYMENT.md` |
| Level | `LOG_LEVEL` environment variable, one of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`; default `info` | `src/config/env.ts` |
| Redaction | See section 7 | `src/app.ts` |
| Request lines | `incoming request` (method, URL, host, remote address) and `request completed` (status code, response time in ms), both at info | `src/http/app.ts` |
| Errors | Unhandled errors: `unhandled error` at error with the error object, response is a generic 500 (`INTERNAL_ERROR`) | `src/core/error-handler.ts` |
| Other events | Startup warnings (random JWT signing key; sample one-time code), `readiness check failed` (warn), `event dead-lettered` and `event relay failed` (error), `approval reminder sweep failed` (error), `approval reminders sent` (info) | `src/app.ts`, `health.ts`, `relay.ts`, `approvals/reminders.ts` |
| Request bodies | Not logged (`docs/DEPLOYMENT.md`) | |
| Log shipping, storage and retention | Not defined in the repository | To be confirmed |

Note: the log line `incoming request` includes the full original URL. Query strings can contain filter text such as the person name or search terms (for example the `actor` and `q` parameters). Whether URLs are sanitised is To be confirmed.

## 13. Health endpoints, metrics and alerts

### 13.1 Health

`src/core/health.ts`, wired in `src/app.ts` and `src/server.ts`.

| Endpoint | Purpose | Checks | Response |
|---|---|---|---|
| `GET /health` | Liveness | None; returns `{ data: { status: "ok" } }` if the process answers | 200 |
| `GET /health/ready` | Readiness | Every registered check. `src/server.ts` registers one check, `database`, which runs `SELECT 1`. If no database URL is configured no checks are registered | 200 `{ status: "ok", checks }` or 503 `{ status: "fail", checks }`; error text is never returned; failure logged as `readiness check failed` |

Not checked by readiness: relay or outbox lag, dead-lettered events, audit chain integrity, disk, memory, outbound connectivity to modules. Probes are exempt from the global rate limit (`docs/DEPLOYMENT.md`).

### 13.2 Metrics and alerts: present and absent

| Capability | Status | Evidence |
|---|---|---|
| Structured request logs with latency | Present | `src/http/app.ts` |
| Event monitor counts (per direction and status), oldest pending outbound event, dead-lettered count | Present as an API and screen, not as a metric or alert | `eventSummary` in `src/modules/integration/service.ts` |
| Read-model last-sync times | Present as a screen | `syncStatus` |
| Warning-tone display of suspicious sign-in events | Present in the UI only | `AUTH_EVENT_WARNINGS` |
| Restore drill exits with code 1 on failure so a scheduler can alert | Present | `src/db/restore-drill-cli.ts`, `docs/DEPLOYMENT.md` |
| Metrics endpoint (for example Prometheus), counters, histograms | Absent | No metrics library in `package.json`; no metrics route |
| Distributed tracing (OpenTelemetry or similar) | Absent | Search of `package.json` and `src` |
| Error tracking service integration | Absent | Same search |
| Alert rules (login lockouts, dead letters, readiness failure, chain break) | Absent from the repository; any alerting would be configured outside it | To be confirmed |
| Performance targets | Provisional (D19, `SCHEDULE-STATUS.md`): p95 at most 500 ms reads, 1,000 ms writes, sign-in 1,500 ms, error rate below 1%, at 50 concurrent users on staging. Outbox lag has no target until D13 | `SCHEDULE-STATUS.md` |

## 14. Retention

| Data | Retention as coded | Source |
|---|---|---|
| `audit_row_change` | No purge, archive or partitioning code or migration exists; rows are kept indefinitely and cannot be deleted by the application role | Search of `src` and `migrations`; section 6 |
| `core_auth_activity` | No purge code. Raw IP address deliberately not stored until the owner sets a retention period | `recordAuthEvent` comment in `src/modules/auth/repo.ts` |
| `integ_event` | No purge code | Search |
| Idempotency responses | Replayed for 24 hours | `docs/DEPLOYMENT.md` |
| Rate-limit windows | Expired windows swept on about one hit in a hundred | `docs/DEPLOYMENT.md` |
| Application logs | Not defined in the repository | To be confirmed |
| Retention policy (period, legal basis, archive, deletion of personal data) | To be confirmed |

## 15. Export

| Item | Fact | Source |
|---|---|---|
| Activity export | Button "Export all entries" on the Activity tab. It asks for step-up verification ("Export the full audit trail"), then pages through the server in pages of 200 with the applied filters and builds a CSV with date, module, changed by, record, what happened, area | `AuditTrail.tsx` (`exportAll`, `requireStepUp`) |
| Table exports | The Activity table shows the footnote "Export needs step-up verification" (export name `core-audit-trail`). The Sign-ins table has a table export (`core-sign-in-history`); whether it also requires step-up is To be confirmed (no footnote or step-up call found in `SignInHistory.tsx`) | `AuditTrail.tsx`, `SignInHistory.tsx` |
| Server-side enforcement | The audit-log routes do not require a step-up token; step-up is enforced by the frontend flow only. A caller with `access.manage` can page the API directly | `src/modules/audit-log/routes.ts` |
| Step-up mechanism | `POST /auth/step-up/verify` or `POST /auth/step-up/password` returns a token valid for 5 minutes (`docs/API_V1.md` 1.7.0) | `docs/API_V1.md` |
| Export is not itself audited | No audit or sign-in event is written when an export runs (verified in the frontend export code and audit-log service) | |
| Sign-in screen | Same filters; table export | `SignInHistory.tsx` |

## 16. Proposed enterprise logging standard

Status: Proposed. Nothing in this section is implemented unless stated in sections 3 to 15.

### 16.1 Log levels

| Level | Use | Example |
|---|---|---|
| fatal | Process cannot continue | Start-up failure, database unreachable at boot |
| error | An operation failed and needs attention | Unhandled exception, event dead-lettered, relay failure |
| warn | Degraded or suspicious but handled | Readiness check failed, repeated login failure, retry scheduled |
| info | Normal business and request milestones | Request completed, relay started, replay requested |
| debug | Diagnostic detail for non-production | Query timings, retry decisions |
| trace | Very detailed, off by default | Payload shape debugging, never values |

Production default: `info`. Raising to `debug` needs a change record and a time limit.

### 16.2 Mandatory fields on every log line

| Field | Source today | Gap |
|---|---|---|
| Timestamp | pino default | None |
| Level | pino | None |
| Service and version | Not set explicitly | Add (`src/version.ts` exists) |
| Environment | Not set | Add |
| Request id (`reqId`) | Bound to request logger | Present on request logs |
| Tenant id | Not on request logs | Add after authentication |
| User id (never name or login) | Not on request logs | Add after authentication |
| Correlation id of module calls | Stored in audit and events, not in logs | Add when supplied |
| Event id and type (relay and inbox logs) | Present on dead-letter log | Add to all relay and inbox logs |
| Route pattern (not raw URL) | Raw URL logged | Replace or strip query string |

### 16.3 Prohibited content

Passwords, tokens, one-time codes, hashes, connection strings, request or response bodies, payload values of integration events, and personal identifiers beyond ids. Extend the existing redaction list in `src/core/redaction.ts` as new sensitive fields appear.

### 16.4 Events to alert on

| Event | Suggested condition | Severity |
|---|---|---|
| Readiness failing | `GET /health/ready` returns 503 for more than 1 minute | Critical |
| Audit chain broken | `verifyAuditChain` returns a `brokenAt` value | Critical |
| Dead-lettered integration events | Count above 0 (`eventSummary.deadLettered`) | High |
| Outbox lag | Oldest pending outbound event older than a threshold to be set after D13 | High |
| Repeated sign-in failures or lockouts | Threshold to be set; events `login_failure`, `login_locked` | Medium |
| Refresh token reuse | Any `refresh_reuse` event | High |
| Access denied spike | Threshold to be set; `access_denied` | Medium |
| Step-up failures | Threshold to be set; `step_up_failure` | Medium |
| 5xx rate | Above 1% (aligned with provisional D19 error-rate target) | High |
| Restore drill failure | Exit code 1 from `npm run db:drill` | High |
| Read-model staleness | Threshold from D16 once decided | Medium |
| Unexpected change of audit retention or trigger state | Database-level monitoring | Critical |

### 16.5 Audit operations

Run `verifyAuditChain` on a schedule (for example daily per tenant) and record the result; store the head `row_hash` outside the database after each run; audit exports; consider a dedicated audit-reading privilege separate from `access.manage`; enforce step-up for export on the server. All are Proposed and none is decided.

## 17. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner and approval | To be confirmed |
| 2 | Retention policy for audit, sign-in, event and log data; IP retention period | To be confirmed |
| 3 | Routine chain verification schedule and external anchoring of the head hash | To be confirmed |
| 4 | Metrics, tracing, error tracking and alert rules (absent from repository) | To be confirmed |
| 5 | Log shipping, storage and retention; URL query strings in request logs | To be confirmed |
| 6 | Auditing of read access and of exports | To be confirmed |
| 7 | Dedicated audit-reading privilege; server-side step-up for export | To be confirmed |
| 8 | Query or filter by correlation id in API and screen | To be confirmed |
| 9 | Outbox lag target (until D13) and read-model freshness threshold (D16) | Open (owner) per `SCHEDULE-STATUS.md` |
| 10 | `ip_hash` is not populated by current writers | To be confirmed whether intended |
| 11 | Relay is not started by `src/server.ts`, so dead-letter logging and outbox monitoring have no live source until D13 and D14 are decided | Open (owner) |

## 18. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository inspection |
