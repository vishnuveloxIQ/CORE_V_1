# VeloxIQ Core: schedule status, 16–21 November 2026

All 48 tasks due by 21 November, from the backend and frontend task guides. Following the guides' rule, nothing blocked is marked done: each item says what is done, what is blocked, and what it waits for.

**Status key**
- **Done:** every checklist item is met, with evidence.
- **Done, deviation:** met, but on a different approved-stack choice that the owner must confirm.
- **Partial:** some items are met; the rest are listed.
- **Blocked:** waits on access or a decision outside the code.

Evidence folders (paths from this folder):
- `evidence/schedule-16-21-nov/`: CI logs and JUnit reports from today's run
- `evidence/sprint-review-2026-11-21/`: regression 1, restore drill, release gate and SQL plans

Other key records:
- defects: `DEFECTS.md`
- API contract: `../CORE__BACKEND/docs/API_V1.md`
- regression suites: `../CORE__BACKEND/docs/REGRESSION.md`

## Summary

| | Done | Done, deviation | Partial | Blocked |
|---|---|---|---|---|
| Backend (24) | 16 | 0 | 8 | 0 |
| Frontend (24) | 20 | 0 | 4 | 0 |

**Final checks (21 November)**
- **Backend:** `npm run ci` passed. That covers type check, lint, 709 tests in 72 files (2 skipped) and the build, on Express.
- **Frontend:** `npm run ci` passed. That covers type check, lint (0 errors, 9 older warnings), 164 tests in 18 files, the build and the bundle secret check.
- **Live dev backend:** runs on Express, serves the BOQ routes, and readiness is OK. Restart it once so it reports version 1.3.0 (`node --watch` does not reload `package.json`).
- **Browser:** the company chip, the 1–4 level editor and request detail (snapshot, site, next approver) were checked.

## Blockers and owner decisions (these stop the remaining items)

| # | Blocker | Affects | Needs |
|---|---|---|---|
| B1 | No AWS staging environment, secrets store or Cloudflare API routing | 20-06, 20-07, 20-08 (staged run), 20-04 (staging retest) | AWS staging access, staging PostgreSQL, DNS and TLS |
| B2 | No Git repository | 16-01, 16-05 (protected branch), 17-07 (CI run on a service), commit links in every Definition of Done | A repository; then the two `.github/workflows/ci.yml` files run as written |
| B3 | The `core_app` database role does not exist on the server. `velox_core` cannot create roles, so one role runs both migrations and the app. | 16-07, 17-07, 17-08, 19-05, 19-07 (role separation, least-privilege grants) | A database administrator runs `CORE__BACKEND/scripts/admin/create-core-app-role.sql` and creates the app login role |
| D1 | Stack | 16-05 | **Decided (2026-11-21): Express.** The backend now runs on Express 5 (`src/http/app.ts`); Fastify is removed. All routes, hooks, body limits and the API v1 contract are unchanged. |
| D2 | Tenancy | 17-06, 18-06, 26-05, 26-07, 30-07 | **Decided (2026-11-22): one schema per tenant.** A transaction-local `search_path` selects the tenant from the verified token; tenant isolation is proven by the cross-tenant tests. The guide's RLS / `app.tenant_id` / FORCE RLS steps are not applicable and are recorded as such in those tasks. |
| D3 | Database | 16-07, 17-05, CI image | **Decided (2026-11-21): PostgreSQL 18.** Development, migrations and the CI image (`postgres:18`) use it. |
| D4 | Password sign-in | 18-05 | **Decided (2026-11-21): password is the main way to sign in.** Argon2id-hashed passwords stay the primary path; passkeys remain an option. |
| D5 | Amount bands | 21-01, 21-06, 21-08 | **Decided (2026-11-22): bands may overlap.** Every level whose band covers the amount joins the chain, which is how a request gets several levels. Overlap rejection (the guide's 21-06 step) and the overlap warning (21-01) are not applicable. |
| D6 | BOQ | 17-02, 17-06 | **Decided (2026-11-21): Bill of Quantities added.** Per-project items (code unique in the project, description, unit, optional WBS node, quantity, rate, status draft or approved); the amount is quantity x rate, stored by the database. Migration 0035, `/boq-items` (API 1.3.0), and a BOQ tab on the project page. |
| D7 | Device limit | 18-07 | **Decided (2026-11-21): one active session per user.** `SESSION_DEVICE_LIMIT` defaults to 1, so signing in again signs the other device out. |
| D8 | Session tokens | 18-07, 26-03 | **Decided (2026-11-22): bearer tokens stay.** The access token is held in memory and the refresh token in session storage, rotated on every refresh; no session cookie is set, so CSRF protection is not applicable (26-03 records this). |
| D9 | Timeouts and version end | 21-02, 21-06, 23-05 | **Decided (2026-11-22): no Escalate action.** When a level's time runs out, the same approver is reminded, and reminded again after each further interval (migration 0038, sweep every `APPROVAL_REMINDER_MINUTES`, default 15, or `npm run approvals:remind`). **A matrix version ends automatically when a newer published version starts** (no `effective_to`); a future-dated version waits for its date. Both tested in `tests/approvals/reminders.test.ts`. |
| D10 | Password reset email | Identity | **Decided (2026-11-21): no email provider until production.** Outside production, password reset uses a fixed sample code (`SAMPLE_OTP_CODE`, default 123456 in development) and sends nothing; the reset screen names the code. Production refuses to start with a sample code and answers 503 until a provider is set up. |
| D11 | API names | API v1 | **Decided (2026-11-22): keep the locked API v1 names.** The early proposed contract (`api-contract.md`) is superseded; renames would need a v2. Recorded in `CORE__BACKEND/docs/API_V1.md`. |
| D12 | Request type catalogue | 21-05, 21-08, 23-05 | **Decided (2026-11-22): the current list is the catalogue** (the request types the screens offer today, with their modules). The 21-08 "unapproved catalogue" blocker is closed. |
| D13 | Event transport (broker) | 23-06, 23-07, 24-06, 24-07, 24-08, 23-02, 23-03, 24-01, 24-02 | **Open (owner, 2026-11-22).** Tasks that need it stay Pending. |
| D14 | Event retry defaults (attempts, backoff, dead-letter) | 24-07, 23-03 | **Open (owner, 2026-11-22).** |
| D15 | Module payload fixtures (HRMS, P&M, Stores, PMS) | 24-05, 24-08 | **Open (owner, 2026-11-22).** |
| D16 | Read-model freshness threshold | 24-03, 24-02 | **Open (owner, 2026-11-22).** |
| D17 | Plan tiers and Stores mapping | 25-05, 25-01, 25-04, 25-08 | **Open (owner, 2026-11-22).** Screens show "not configured" until it is decided. |
| D18 | Cache | 25-06, 25-07, 25-03 | **Decided (2026-11-22, delegated by the owner): no cache provider.** Search and lookups run on PostgreSQL only (allowed by 25-06); the cache adapter interface is kept with no provider, so cache invalidation (25-07) has nothing to invalidate and is recorded as not applicable. Revisit if load tests show a need. |
| D19 | Performance targets | 27-05, 27-06, 27-08 | **Decided (2026-11-22, delegated by the owner; provisional):** at 50 concurrent users on staging, p95 latency at most 500 ms for reads and 1,000 ms for writes, sign-in at most 1,500 ms, error rate below 1%, no pool exhaustion. Outbox lag has no target until D13 is decided. To be confirmed after the first load run. |
| D20 | Recovery objectives and backups | 20-07, 26-07, 28-07 | **Decided (2026-11-22, delegated by the owner; provisional):** RTO 4 hours, RPO 15 minutes (point-in-time recovery on), daily snapshots kept 35 days, and a restore rehearsal before each release. |
| D21 | Retention | 19-06, 26-07, 30-07 | **Decided (2026-11-22, delegated by the owner; provisional, confirm with legal):** audit trail and approval requests kept 8 years (the Companies Act period for books of account); sign-in and access history 1 year; idempotency records 24 hours (as today). Nothing is deleted automatically yet; a purge job is a later task. |
| D22 | Guide versus decisions | 18-05, 21-01, 21-03, 21-05, 21-08, 16-07, 17-05, 17-07 | **Confirmed (2026-11-22):** approval levels are 1 to 4 (not 1 to 20), password is the main sign-in (D4), and the database is PostgreSQL 18 (D3). The guides' "20 levels", "passkey-first" and "PostgreSQL 16" steps are read accordingly. |

## 23–30 November (updated 2026-11-22)

The schedule's 23–30 November tasks, worked ahead of their dates. Code and local testing are complete wherever no blocker or open decision stops them.

- **Pending** = held by a decision the owner is keeping open (D13–D17).
- **Blocked** = needs staging (B1), a Git repository (B2), the `core_app` role (B3), UAT stakeholders or release authorisation.
- **Partial** = the code or local part is done; the rest is blocked as stated.

Evidence: `evidence/regression-2-2026-11-22/` (QA report, JUnit, load baseline, audits, restore drills), plus `veloxiq-core/docs/SCREEN_INVENTORY.md`, `UAT_SCRIPTS.md` and `RELEASE_NOTES_DRAFT.md`.

**The event transport (D13) no longer blocks the event code.** The outbox, publisher interface, relay, retries and replay are built against a mock transport. Only the production transport stays open, so those tasks are no longer listed as held by D13.

### Summary for 23–30 November

| | Done | Partial | Pending (open decision) | Blocked |
|---|---|---|---|---|
| Backend (28) | 9 | 7 | 4 | 8 |
| Frontend (28) | 12 | 5 | 4 | 7 |

### Backend, 23–30 November

| ID | Task | Status | Evidence and notes |
|---|---|---|---|
| CORE-23-05 | Request decision state machine and audit | Done | Transitions approve, reject, return, clarify, respond and cancel; approver-only; version-guarded; audited. Every raise and decision writes an outbox event in the same transaction, with no comments or decision text in the payload. ESCALATED is not applicable (D9). `tests/integration/events.test.ts` |
| CORE-23-06 | Outbox, inbox, idempotency and dead-letter schema | Done | `integ_event` (outbound and inbound), `integ_idempotency_key`, `integ_aggregate_sequence`; migration 0039 adds the unique event ID per direction, relay and monitor indexes, and replay states. Deduplication tested. |
| CORE-23-07 | Publisher interface and mock transport | Done | `src/core/relay.ts`: Publisher, MockPublisher, envelope with version, correlation and causation, per-aggregate order. Failure and recovery tested. Production transport open (D13). |
| CORE-23-08 | Snapshots, duplicates, rejected events, ordering | Done | Snapshot after matrix edits, duplicate inbound, out-of-order and stale events, publisher failure through retry to dead-letter, and refused decisions leave no event. Tested. |
| CORE-24-05 | Ref models with sequence checks | Pending (D15) | Built: `ref_record` (migration 0040), newer-sequence-wins upsert, deletes, soft references, unknown fields kept, read APIs. Real module payload schemas await the fixtures (D15). |
| CORE-24-06 | Outbox relay: LISTEN/NOTIFY plus polling | Done | The commit-time signal wakes the relay; polling is the fallback; locking means no concurrent duplicate sends; delivered only on success. Wakeup and concurrency tested. **Tuned:** 20 → 489 events/s (R2-1). The relay starts in a server only once a transport (D13) and retry values (D14) are configured. |
| CORE-24-07 | Retry, backoff, dead-letter and replay | Pending (D14) | Built: exponential backoff with a cap, maximum attempts, dead-letter with an error summary (logged), and audited replay in aggregate order (tested). The values themselves are open: no defaults, by decision. |
| CORE-24-08 | Contract tests with module fixtures | Pending (D15) | Envelope, unknown-field, duplicate, out-of-order and stale tests run with fictional payloads. Module-approved fixtures are needed. |
| CORE-25-05 | Plan entitlement and policy version APIs | Pending (D17) | Policy version APIs exist and are tested. Plan entitlement waits for the tiers and Stores mapping. |
| CORE-25-06 | Tenant-scoped search; cache adapter | Done | `GET /search`: bounded, wildcards escaped, parameterised, tenant-only. Tested for injection, bad input and cross-tenant reads. No cache provider (D18). |
| CORE-25-07 | Cache invalidation and isolation tests | Done | Not applicable: there is no cache (D18). Reads are always fresh; recorded. |
| CORE-25-08 | Entitlement, policy, history and search tests | Partial | Search, policy version history and compare are tested. Entitlement tests need D17. |
| CORE-26-05 | Staging deployment security review | Partial | Dependency scan: 0 vulnerabilities in both projects. Rate limits, input validation and strict CORS are tested. Security groups, IAM and secrets injection need B1. |
| CORE-26-06 | Regression 2, auth and tenancy security cases | Done | Backend 742 and frontend 212 passed; regression suites green; tenant tampering, stale tokens, revoked devices, and outbox duplicate, reorder and poison cases. `evidence/regression-2-2026-11-22/README.md` |
| CORE-26-07 | RLS, roles, secrets, masking, TLS, restore | Partial | Masking of logs, audit and the event monitor checked; restore drill with audit continuity: no differences. RLS not applicable (D2). TLS and the secrets store need B1; role grants need B3. |
| CORE-26-08 | Run suites; publish results and defects | Done | QA report with counts, defects R2-1 to R2-3 and their fixes, and coverage gaps. |
| CORE-27-05 | Load test auth, approvals, relay and lookups | Partial | Local baseline (`npm run load:baseline`): all within the provisional D19 targets. A staging run needs B1. |
| CORE-27-06 | Load, penetration checklist and CI smoke | Partial | Load, dependency scan and CI suite done locally. Memory, CPU and a staging run need B1. |
| CORE-27-07 | Tune query plans; AWS and Cloudflare alerts | Partial | Relay plan tuned and pool behaviour checked. Alerts and edge routing need B1. |
| CORE-27-08 | Run suites; publish results | Partial | Re-run after tuning (relay 489/s). Staging comparison needs B1. |
| CORE-28-05 | UAT bug fixes and data reconciliation | Blocked | Needs staging and UAT. UAT scripts are ready. |
| CORE-28-06 | UAT scripts, regression 3, sign-off | Blocked | Scripts ready (`UAT_SCRIPTS.md`). Execution needs stakeholders and staging. |
| CORE-28-07 | PITR, snapshot recovery, migrator rehearsal | Blocked | Local restore drill passes. PITR needs B1; the migrator versus app role needs B3. |
| CORE-28-08 | Run suites after UAT | Blocked | Follows 28-06. |
| CORE-30-05 | Deploy via AWS CI/CD if gates clear | Blocked | Gates open (`RELEASE_NOTES_DRAFT.md`). |
| CORE-30-06 | Production smoke and release checklist | Blocked | Follows 30-05. |
| CORE-30-07 | Production migrations and control checks | Blocked | Follows 30-05. |
| CORE-30-08 | Final suites and handover | Blocked | Follows 30-05. |

### Frontend, 23–30 November

| ID | Task | Status | Evidence and notes |
|---|---|---|---|
| CORE-23-01 | Approval actions, history and filters | Done | Live decision API; history refreshed after success; filters by module, date, current level and decision state; 409 handled without rewriting history. |
| CORE-23-02 | Event health and outbox monitor | Done | `/integrations/events`: access.manage, server filters and paging, attempts, last error, field names only. |
| CORE-23-03 | Pending, failed and replay states | Done | Queued, Retrying, Sent, Received, Processed, Dead-letter; next-try time and last error; replay only after confirming and only on the server's answer; out-of-date notice when a refresh fails. |
| CORE-23-04 | Approvals and integration checks | Done | `src/test/tasks-23-30.test.tsx`, `approval-workflow.test.tsx`, accessibility audit of the new screens. |
| CORE-24-01 | Master event and read-model admin screens | Done | `/integrations/read-models`: per-module sync overview, sequence and last sync, access.manage, no raw payloads beyond field previews. |
| CORE-24-02 | Search, pagination, sync timestamps | Done | Server search and paging; local time with a UTC tooltip; filters kept in the address; past-the-end page handled. |
| CORE-24-03 | Stale and read-model warnings on the dashboard | Pending (D16) | The dashboard shows when each module last synced, with no stale verdict until the threshold is decided. |
| CORE-24-04 | Data synchronisation checks | Pending (D15) | Screens tested with fictional data. Live module data needs D15. |
| CORE-25-01 | Plan, entitlement and policy screens | Pending (D17) | Policy screens are ready. Plans show sample data until D17. |
| CORE-25-02 | Version compare and effective state | Done | Compare on built-in and custom policies; in-force, scheduled or superseded; read-only history. |
| CORE-25-03 | Lookup search, server pagination, cache refresh | Done | Header search finds records on the server as you type (debounced, newest reply wins); policies reload after saves; data is cleared on sign-out; a failed lookup says so. |
| CORE-25-04 | Plans, policies and cache checks | Pending (D17) | Policy and search checks done; plan checks need D17. |
| CORE-26-01 | Close accessibility and validation defects | Partial | Accessibility audit and three fixes (earlier), plus help and wording fixes. Edge and a screen reader are not available. |
| CORE-26-02 | Integrate slices; finalise navigation | Done | `docs/SCREEN_INVENTORY.md`: ready, gated and deferred screens; no dead links. |
| CORE-26-03 | Secure error states, CSRF and session UX | Done | Session-ended message, safe errors with a reference, step-up only on protected actions, double-click guard. CSRF not applicable (D8, bearer tokens). |
| CORE-26-04 | End-to-end and browser compatibility | Blocked | Needs staging and Edge. |
| CORE-27-01 | Large tables, lazy routes, search UX | Partial | Routes lazy-loaded; search debounced; server paging on the audit, events and read models. A large-dataset profile needs staging data. |
| CORE-27-02 | UAT instructions, screenshots, help text | Partial | `UAT_SCRIPTS.md` and help troubleshooting entries. Screenshots wait for staging. |
| CORE-27-03 | Fix highest-priority frontend issues | Done | R2-2 wording and earlier defects fixed with tests. |
| CORE-27-04 | Performance and release prep checks | Blocked | Needs the staging build and Edge. |
| CORE-28-01 | Stakeholder UAT; fix P0/P1 | Blocked | Needs UAT sessions. |
| CORE-28-02 | Final responsive, browser and accessibility checks | Partial | Automated accessibility (WCAG A/AA) on every screen. Edge and a screen reader are not available. |
| CORE-28-03 | Rollback and recovery user messages | Done | Outage and maintenance banner with retry steps; no false success; tested. |
| CORE-28-04 | UAT and pre-production checks | Blocked | Follows 28-01. |
| CORE-30-01 | Fix release-blocking bugs; public routes | Blocked | Gates open. |
| CORE-30-02 | Frontend smoke on the production candidate | Blocked | Gates open. |
| CORE-30-03 | Release notes, support and handover | Partial | `RELEASE_NOTES_DRAFT.md` (no-go until gates clear). Signed handover follows the release. |
| CORE-30-04 | Final release smoke and acceptance | Blocked | Gates open. |

## Backend tasks (Ms. Saraswathi)

| ID | Task | Status | Evidence and notes |
|---|---|---|---|
| CORE-16-05 | Node + TypeScript backend, scripts, folders, protected branch | Done | Express 5 + TypeScript (D1 decided). Scripts for dev, typecheck, build, test, start and ci. Modules are split into routes, service and repo. `.env` is git-ignored. **Blocked:** protected branch (B2). |
| CORE-16-06 | Env validation, logging, CORS, request IDs, errors, /health | Done | Zod env schema (`src/config/env.ts`), pino with redaction, request IDs, JSON errors, CORS allowlist, `/health` and `/health/ready`. Tests: `config`, `core/logging`, `core/errors`, `hardening/cors`, `health`. |
| CORE-16-07 | pg pool, timeouts, TLS, roles, test DB | Partial | One `pg` pool per process. **Fixed today:** a 5-second connect timeout and an idle timeout (there were none). TLS follows `sslmode` in the URL. Each test file gets its own database. **Removed today:** the unused Drizzle client, which the guide rules out. **Blocked:** role separation and the "app role cannot run DDL" check (B3). PostgreSQL 18 (D3 decided). |
| CORE-16-08 | Setup test cases: health, bad config, DB failure, secrets | Done | **New today:** `tests/core/db-failure.test.ts` covers database down, an unreachable host (fails within the timeout) and refused credentials: 503 ready, a generic 500 and no connection details in responses or logs. **Finding:** the dev PostgreSQL accepts any password on localhost (trust authentication). Staging must use scram-sha-256. |
| CORE-17-05 | Migrations and generated DB types | Done | SQL migrations up to 0035, re-runnable and forward-only (rollback by restore, see `DEPLOYMENT.md`). **New today:** `npm run db:types` writes `src/db/types.generated.ts` (63 tables, no ORM), and `tests/db/types-gen.test.ts` fails if they drift from the migrations. |
| CORE-17-06 | Tenant isolation and first master endpoints | Done | Schema per tenant; `SET LOCAL search_path` keeps pooled connections from leaking a tenant. Projects, sites (locations), WBS, markers and milestones have validation and `row_version`. Cross-tenant tests: `testing-pass/tenant-isolation`, `conflicts-and-ownership`, `relationships/cross-project`. Schema per tenant accepted (D2); the RLS steps are not applicable. **New today:** Bill of Quantities (`/boq-items`, D6), with tests in `tests/boq` and a row in the masters regression contract. |
| CORE-17-07 | CI, migration tests, API smoke, indexes | Partial | `.github/workflows/ci.yml` uses an ephemeral PostgreSQL. `npm run ci` passes locally (log in `evidence/schedule-16-21-nov/backend-ci.log`). FK and lookup indexes (0004); **hot-path indexes added today** (0033). **Blocked:** running it on a CI service (B2), and running tests as the scoped app role (B3). |
| CORE-17-08 | Migration, tenant, role and master CRUD tests | Partial | Clean-database migration test, tenant A/B isolation, and master CRUD with duplicates and 409 (masters contract, 14 resources). **Blocked:** app role versus migrator role permissions (B3). |
| CORE-18-05 | WebAuthn sign-in and session, Argon2id | Done | Passkey registration and sign-in, challenge expiry and replay protection, device sessions, 27 passkey tests. Argon2id hashes. Password stays the main way to sign in (D4 decided). Not tested with a real authenticator (no device). |
| CORE-18-06 | Tenant-less limited login lookup and audit logs | Done | No tenant-less login: no header gives 400, an unknown tenant answers like an unknown login (D9 fix), and no enumeration. Sign-in events are recorded. **New today:** `GET /audit-log/auth-events` (access history). SECURITY DEFINER is not applicable (no RLS, D2). |
| CORE-18-07 | Secure tokens, revocation, device limit, step-up, server RBAC | Done | Rotating refresh with reuse detection, session revoke, passkey step-up on grants and geo-zones, and server privilege checks on every write. **New today:** a device limit, `SESSION_DEVICE_LIMIT`, set to one active session per user by owner decision (tests in `tests/auth/access-history-device-limit.test.ts`). Owner decision still open: D8. |
| CORE-18-08 | Exercise auth cases, missing tenant, revocation | Done | Live exercise: 38 of 39 checks passed (the 39th was a wrong check), plus browser checks. Results are in `DEFECTS.md`. Cancel, expired-challenge and wrong-origin passkey cases are in the passkey tests. |
| CORE-19-05 | RBAC and scope, admin read/write separation, step-up | Partial | Privilege and location-scope checks, step-up on role grants and revokes, and direct API bypass tests (identity contract sweep). Master reads are company-wide by design (noted). **Blocked:** database-level separation of admin and app roles (B3). |
| CORE-19-06 | Audit allowlist/denylist and access history | Done | Append-only audit with a hash chain, a secret denylist, and actor, correlation ID and UTC time. **New today:** refused privilege checks are recorded as `access_denied` (method and route only), and the access history endpoint. App-role REVOKE needs B3; an append-only trigger protects the audit now. |
| CORE-19-07 | Cross-tenant attempts and step-up | Partial | Swapped IDs, forged headers and tokens, and step-up tests; safe 401 and 403 answers across every route (identity contract). **Blocked:** least-privilege database grants (B3). |
| CORE-19-08 | Regression suite for masters and identity | Done | `npm run test:regression` (API lock, masters, identity), two-tenant fixtures, multiple roles, 409, denied scope and invalid challenge. CI workflow ready. Documented in `docs/REGRESSION.md`. |
| CORE-20-05 | Refine migrations, indexes, fixtures, EXPLAIN | Done | **Today:** EXPLAIN on 11 hot queries (`sql/explain-master-queries.txt`). Migration 0033 adds indexes for refresh-by-hash, access history, the approval inbox and the audit trail. Each serves its query without a sort (`sql/index-check.txt`). Fictional seed scripts exist; seeding staging waits for B1. |
| CORE-20-06 | AWS staging, Cloudflare routing, freeze API v1 | Partial | **API v1 frozen** (1.3.0, 259 operations, lock test). **Blocked:** AWS staging, ALB/TLS and Cloudflare routing (B1). |
| CORE-20-07 | Secrets, restore rehearsal, logs, rollback | Partial | Restore drill (`npm run db:drill`) passed for acme and beta. Structured logs and correlation IDs. The restore onto a fresh server is fixed (D13). **Blocked:** managed secrets, PITR and staging rollback (B1). |
| CORE-20-08 | Regression 1 and sprint review evidence | Partial | Regression 1 and the evidence pack (`evidence/sprint-review-2026-11-21/`). **Blocked:** a run against a staged frontend and API (B1). |
| CORE-21-05 | Approval DDL | Done | Chain, matrix version, matrix level and request with `levels_snapshot`, optional site and source references. **Today:** levels 1–4 enforced in the database and API (owner decision, migration 0034; 0032 first set 20), and a unique `(module, source_record_id)` index. Tests: `tests/approvals/matrix-edges.test.ts`. |
| CORE-21-06 | Amount band overlap enforcement, snapshots | Done | The snapshot is taken at raise and kept after matrix changes. Deterministic codes and 409 on version conflict. **New:** a version ends when a newer published one starts, and a future-dated version waits for its date (D9, tested). Bands may overlap by decision (D5), so overlap rejection is not applicable. |
| CORE-21-07 | Idempotency on (tenant, module, source_ref) | Done | **Today:** a second raise for the same source record returns the first request (200). Concurrent raises give one row, other modules don't collide, and a replay writes no second audit row. Tenants are separate schemas. Approval events to the outbox are scheduled for 23 November (CORE-23-05). |
| CORE-21-08 | Matrix edge cases and acceptance smoke | Done | **Today:** 1-level and 4-level chains, level 5 refused, a missing site, no matching level, and the snapshot kept after a matrix change. Unauthorized edits and the raise/act flows are in the existing tests. **Published blocker:** the canonical request-type catalogue is not approved (owner list). |

## Frontend tasks (Mr. Vishnu)

| ID | Task | Status | Evidence and notes |
|---|---|---|---|
| CORE-16-01 | React + TypeScript project, branch, environment | Partial | Vite + React 19 + strict TypeScript, lint, tests, and run commands in the README. **Blocked:** Git branch and commit (B2). |
| CORE-16-02 | Navigation, reusable forms, mocks | Done | Sidebar, header and breadcrumbs, shared form and table components. Sample data is used only when a read fails; screens are wired to the API. |
| CORE-16-03 | API client, env, errors, test baseline | Done | One client with the base URL from `VITE_API_BASE_URL`, auth refresh, and typed errors for 400, 401, 403, 404, 409 and 500, plus offline. **New today:** every call sends a fresh `X-Request-Id`, which the server echoes and logs (an unsafe value is replaced); a call is abandoned after 30 seconds (2 minutes for file content); a server fault or timeout shows the request ID as a reference for support. CORS now allows `X-Request-Id` and `X-Step-Up-Token` and exposes `X-Request-Id` and `Retry-After`. Tests: `src/test/api-client.test.ts`, backend `tests/core/http-app.test.ts` and `tests/hardening/cors.test.ts`. |
| CORE-16-04 | Setup smoke, connectivity, secrets in bundle | Partial | Build and route smoke, console checks. **New today:** `npm run check:bundle` passes (no secrets or connection strings in `dist/`). **Not done:** Edge (only Chromium is available here). |
| CORE-17-01 | Project and site forms on the API | Done | Create, edit and detail against live endpoints, with uniqueness and access-denied handling (QA run, D1). |
| CORE-17-02 | WBS, BOQ and work-plan screens | Done | WBS tree and planning screens. **New today:** the project BOQ tab lists items with unit, WBS code, server amounts and the total; add, edit and remove are shown only with `projects.manage` (`src/test/boq.test.tsx`, browser check). |
| CORE-17-03 | Integrated forms, errors, dependent selections | Done | Project-to-site-to-store-to-marker selections, 403 notices, 409 version handling, and edits kept after a recoverable error (cross-project tests and UI checks). |
| CORE-17-04 | UI/API smoke, accessibility, small screens, browsers | Partial | Smoke and permission QA (`DEFECTS.md`), plus a mobile-width check of the shell. **New today:** accessibility audit (`veloxiq-core/docs/ACCESSIBILITY_AUDIT.md`): axe-core WCAG 2.1 A/AA checks on 27 screens in the test suite and 15 in Chromium (light and dark), plus a keyboard pass. Three defects fixed: sidebar text contrast, a scrollable table keyboard users could not reach, and focus lost after closing a dialog. **Not done:** a pass with a real screen reader, and Edge (neither is available here). |
| CORE-18-01 | Passkey registration and sign-in screens | Done | Sign-in, registration, unsupported-browser and cancel states. A real-device prompt was not tested (no authenticator). |
| CORE-18-02 | Device sessions, revoke and step-up UI | Done | Devices page, revoke after a confirmed response, passkey step-up dialog, and a revoked current session handled (browser checks). |
| CORE-18-03 | Role-aware navigation and error handling | Done | Privilege-filtered menu and routes, a no-access page, and a plain session-ended message with return to the right login. **Fixed today:** sign-out clears the previous user's data from memory (`src/test/signout-cache.test.tsx`). |
| CORE-18-04 | Identity integration, smoke and defect log | Done | Live and browser exercise; network checks show no credentials in URLs. A screen-reader check was not done. |
| CORE-19-01 | Roles, privileges and scoped assignment UI | Done | Grant and revoke with location scope, behind step-up; effective privileges shown. |
| CORE-19-02 | Decision inbox and audit explorer shell | Done | Approvals inbox and detail, and the audit trail with filters and masked values. **New today:** a Sign-in history tab in the audit trail (`/audit?view=sign-in`, `access.manage`; the old `/audit/access` address opens it) over the access history endpoint: every sign-in and access event with readable labels, failures marked, server-side filters by date, event and person, and paging (`src/test/access-history.test.tsx`). |
| CORE-19-03 | Tenant, project and site scope indicators | Done | A company (tenant) chip in the header. **New today:** action dialogs and the approval decision show what the action applies to: company, project (or company-wide) and site (or head office). Used in the new-request, decision and publish-job dialogs and the milestone, WBS and BOQ forms (`ActionScope`). |
| CORE-19-04 | Access and governance smoke, defect log | Done | Least-privilege account checks, 403 handling, and gating tests (`src/test/access.test.tsx`). A walkthrough recording was not produced. |
| CORE-20-01 | Master-data views and UX defects | Done | D1, D2, D6 and D12 closed; the remaining planning, milestone, WBS, chainage and geo-fence controls are gated. |
| CORE-20-02 | Full frontend-to-API contract, dashboard counts | Done | **New today:** `src/test/api-contract.test.ts` checks every frontend API call against frozen API v1. One dead call to a route that doesn't exist (`DELETE /tickets/{id}`) was removed. Dashboard counts reconcile (D4 not reproduced). |
| CORE-20-03 | Sprint demo and error walkthrough | Done | **New today:** `evidence/schedule-16-21-nov/DEMO-SCRIPT.md` (happy paths and failure paths). Screenshots are in the browser checks; no recording. |
| CORE-20-04 | First-cycle UI regression and evidence | Partial | Frontend regression 69/69 and the full suite. **Blocked:** a retest on the staging API (B1). |
| CORE-21-01 | Approval matrix designer and chain viewer | Done | **Today:** a new chain starts with one level and adds up to four (it always showed four rows). Editing a chain whose server version had fewer than 4 levels no longer fails. Version timeline. Bands may overlap by decision (D5), so no overlap warning is needed. **New:** the level editor offers a reminder interval only; requests are never escalated (D9). |
| CORE-21-02 | Request inbox, detail, decision, comments | Done | Detail shows the site, the next approver and the server snapshot. **New today:** module and raised-date filters in the inbox; approve and reject ask for confirmation first; only the current level's approver can decide (a level that also names a role is left to the server); one action is sent however often a button is clicked (`src/test/approval-workflow.test.tsx`). There is no Escalate action by decision (D9): the approver is reminded instead. |
| CORE-21-03 | Site-null and levels UI | Done | **Today:** a missing site shows as "Head office / whole company" and a missing project as "Company-wide". 1 to 4 levels render, starting from one (`src/test/approval-levels.test.tsx`). |
| CORE-21-04 | Approval workflow checks and defects | Done | Tests for 1 to 4 levels, the last-level rule, the editor limit and snapshot mapping. **New today:** UI tests for editing a chain into a new version (levels, reason, last-level rule, version conflict) and for double submit. **Defect fixed:** a fast double click could send a save twice, and a chain version (several requests) could be created twice; saves now run one at a time (`useRemoteSave`). |

## What changed today (21 November)

**Backend:** access history endpoint and `access_denied` events, a configurable device limit, request idempotency by source record, a cap of 4 levels (owner decision), migrations 0032, 0033 and 0034 (applied to all five dev tenants), pool timeouts, Drizzle removed, generated DB types, database-failure tests, CI workflow, `npm run ci` and `npm run db:types`, and API 1.2.0. **Later:** the HTTP layer moved from Fastify to Express (D1), PostgreSQL 18 confirmed (D3), and the Bill of Quantities added (D6: migration 0035, `/boq-items`, API 1.3.0).

**Frontend:** contract test against API v1, bundle secret check, company scope chip, data cleared on sign-out, approval levels 1 to 4 (start with one, add up to four), and request detail showing snapshot, site and next approver. **Later:** the project BOQ tab (D6), client request IDs and timeouts, the sign-in history screen, scope chips in action dialogs, inbox filters, decision confirmation and approver-only decisions, one save at a time, and the accessibility audit with three fixes. The frontend CI workflow and `npm run ci` were also added.

Nothing is committed: there is no Git repository (B2).
