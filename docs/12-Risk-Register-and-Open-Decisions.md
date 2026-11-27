# Risk Register and Open Decisions

| Field | Value |
|---|---|
| Document ID | DOC-12 |
| Title | Risk Register and Open Decisions |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

Consolidate the decisions recorded for VeloxIQ Core, the risks that can be verified from the repository, the assumptions and dependencies, and the open items across the documents reviewed.

## 2. Scope

Sources read: `CORE__BACKEND/PROGRESS.md`, `DEFECTS.md`, `SCHEDULE-STATUS.md` (repo root), `CORE__FRONTEND/CHANGES_TODO.md`, `CORE__FRONTEND/docs/non-functional.md`, `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md`, `CORE__BACKEND/docs/API_V1.md`, `CORE__BACKEND/docs/DEPLOYMENT.md`. Likelihood and impact are the author's assessment (labelled **Assessed**), not recorded values. Owners are To be confirmed. `.env` files were not opened.

Identifier conventions: **D1 to D22** are the owner decisions in `SCHEDULE-STATUS.md`. **P-1 to P-11** are the eleven owner answers in `PROGRESS.md` ("Open decisions: owner answers (2026-11-19)"). **DEF-n** are defects in `DEFECTS.md` (written D1 to D24 there; renamed here to avoid clashing with D-numbers). **R-n** are risks in this document.

## 3. Decision log

### 3.1 Decisions in `SCHEDULE-STATUS.md`

| ID | Decision | Status | Date | Impact | Source |
|---|---|---|---|---|---|
| D1 | HTTP stack is Express 5 (Fastify removed) | Decided | 2026-11-21 | Routes and API v1 unchanged | `SCHEDULE-STATUS.md`; `API_V1.md` 1.3.0 |
| D2 | One schema per tenant; tenant from verified token via transaction-local `search_path`; no row-level security | Decided | 2026-11-22 | Isolation relies on application code and schema separation | `SCHEDULE-STATUS.md`; `DEFECTS.md` (tenant isolation notes) |
| D3 | PostgreSQL 18 | Decided | 2026-11-21 | Dev, migrations, CI image | `SCHEDULE-STATUS.md` |
| D4 | Password is the main sign-in; passkeys optional | Decided | 2026-11-21 | Identity design | `SCHEDULE-STATUS.md` |
| D5 | Approval amount bands may overlap; every covering level joins the chain | Decided | 2026-11-22 | Multi-level chains | `SCHEDULE-STATUS.md` |
| D6 | Bill of Quantities added (migration 0035, API 1.3.0) | Decided | 2026-11-21 | New module | `SCHEDULE-STATUS.md`; `API_V1.md` |
| D7 | One active session per user (`SESSION_DEVICE_LIMIT` default 1) | Decided | 2026-11-21 | A second sign-in ends the first | `SCHEDULE-STATUS.md`; `DEFECTS.md` |
| D8 | Bearer tokens stay (access in memory, refresh in session storage); no cookie | Decided | 2026-11-22 | CSRF not applicable; token storage exposure | `SCHEDULE-STATUS.md` |
| D9 | No Escalate action; same approver reminded each interval; a matrix version ends when a newer one starts | Decided | 2026-11-22 | Overdue approvals are reminded, never escalated | `SCHEDULE-STATUS.md` |
| D10 | No email provider until production; sample OTP outside production | Decided | 2026-11-21 | Password reset unusable in production until a provider exists | `SCHEDULE-STATUS.md` |
| D11 | Keep locked API v1 names | Decided | 2026-11-22 | Renames need v2 | `SCHEDULE-STATUS.md`; `API_V1.md` |
| D12 | Current request-type list is the catalogue | Decided | 2026-11-22 | Unblocks approvals tasks | `SCHEDULE-STATUS.md` |
| D13 | Event transport (broker) | **Open** (owner) | 2026-11-22 | No production event delivery | `SCHEDULE-STATUS.md` |
| D14 | Event retry defaults (attempts, backoff, dead-letter) | **Open** (owner) | 2026-11-22 | Relay cannot start without values | `SCHEDULE-STATUS.md` |
| D15 | Module payload fixtures (HRMS, P&M, Stores, PMS) | **Open** (owner) | 2026-11-22 | Read models and contract tests use fictional payloads | `SCHEDULE-STATUS.md` |
| D16 | Read-model freshness threshold | **Open** (owner) | 2026-11-22 | No stale verdict on read models | `SCHEDULE-STATUS.md` |
| D17 | Plan tiers and Stores mapping | **Open** (owner) | 2026-11-22 | Subscription screens show sample plans | `SCHEDULE-STATUS.md`; `RELEASE_NOTES_DRAFT.md` |
| D18 | No cache provider; search on PostgreSQL | Decided (delegated) | 2026-11-22 | Revisit if load tests need it | `SCHEDULE-STATUS.md` |
| D19 | Performance targets: p95 500 ms reads, 1000 ms writes, sign-in 1500 ms, error rate below 1% at 50 users | Decided, provisional | 2026-11-22 | To be confirmed after first staging load run | `SCHEDULE-STATUS.md` |
| D20 | RTO 4 h, RPO 15 min, daily snapshots 35 days, restore rehearsal before each release | Decided, provisional | 2026-11-22 | PITR needs staging | `SCHEDULE-STATUS.md` |
| D21 | Retention: audit and approval requests 8 years; sign-in history 1 year; idempotency 24 h. Confirm with legal. No purge job yet | Decided, provisional | 2026-11-22 | Compliance; nothing is deleted automatically | `SCHEDULE-STATUS.md` |
| D22 | Approval levels 1 to 4, password main sign-in, PostgreSQL 18 override the task guides | Decided (confirmed) | 2026-11-22 | Guide wording is read accordingly | `SCHEDULE-STATUS.md` |

### 3.2 Owner answers recorded in `PROGRESS.md` (2026-11-19)

| ID | Decision | Status | Date | Impact | Source |
|---|---|---|---|---|---|
| P-1 | Idempotency-Key required on every module POST and PATCH (not on `/auth/` routes or offline operations) | Decided, built, sign-off pending | 2026-11-19 | Clients must send the header | `PROGRESS.md` item 1 |
| P-2 | Trust proxy via `TRUST_PROXY` env var; proxy range to come from operations | Decided, built; value open | 2026-11-19 | Client IP and rate limits behind a proxy | `PROGRESS.md` item 2; `DEPLOYMENT.md` |
| P-3 | Shared rate-limit store in PostgreSQL | Decided, built | 2026-11-19 | Limits hold across instances | `PROGRESS.md` item 3 |
| P-4 | Login OTP by email; provider and template open; second-factor requirement open | Partly built, **Open** | 2026-11-19 | Password reset returns 503 until a provider exists | `PROGRESS.md` item 4 |
| P-5 | PIN used for both login and offline/device flows | Decided, recorded only | 2026-11-19 | No PIN code changed | `PROGRESS.md` item 5 |
| P-6 | User status vocabulary: active, inactive, suspended | Decided | 2026-11-19 | | `PROGRESS.md` item 6 |
| P-7 | `core_user.scope` left unused | Decided | 2026-11-19 | Column unexplained | `PROGRESS.md` item 7 |
| P-8 | Approval timeouts and escalation wait for scheduling work | Superseded by D9 | 2026-11-19 | | `PROGRESS.md` item 8 |
| P-9 | `core_auth_activity.ip_address` stays NULL until the owner sets a retention period | Open | 2026-11-19 | No client IP in sign-in history | `PROGRESS.md` item 9 |
| P-10 | Fuel settings keys: owner to supply starting defaults | **Blocked** (no values given) | 2026-11-19 | Keys stay blank | `PROGRESS.md` item 10 |
| P-11 | Keep work uncommitted | Superseded: repository now has 3 commits (2026-11-24) | 2026-11-19 | | `PROGRESS.md`; `git log` |

### 3.3 Design decisions inside `PROGRESS.md` (selected)

| ID | Decision | Status | Date | Impact | Source |
|---|---|---|---|---|---|
| PD-1 | Access tokens HS256 JWT, 15 minutes; refresh tokens rotating, 30 days fixed, SHA-256 hash stored; reuse of a replaced token revokes all sessions | Decided (signed off) | 2026-11-19 | Session security | `PROGRESS.md` Phase 4a |
| PD-2 | Lockout: 5 failures lock 15 minutes | Decided | 2026-11-19 | Brute-force control | `PROGRESS.md` 4a(d) |
| PD-3 | Passkeys passwordless login, user verification required, library pinned at 14.0.3 | Decided | 2026-11-19 | | `PROGRESS.md` 4c |
| PD-4 | Audit chain: append-only trigger plus SHA-256 hash chain; owner role can disable triggers, chain is the detection layer | Decided | 2026-11-19 | Detection, not prevention, against the table owner | `PROGRESS.md` Phase 3 (a) |
| PD-5 | Privilege names (`access.manage`, `organisation.manage`, `projects.manage`, `masters.manage`, `policies.manage`, `approvals.manage`, `records.manage`) have no seed or catalogue | Decided; catalogue absent | 2026-11-19 | First holder via `npm run access:grant` | `PROGRESS.md` 4d, 5a to 5f |
| PD-6 | Approval timeouts, escalation target and `cash_limit_inr` stored but not acted on | Decided; see D9 for timeouts | 2026-11-19 | | `PROGRESS.md` 5e(f) |
| PD-7 | `shared.uom` provisional until `06_Platform_Administration.md` is available | **Open** | 2026-11-19 | A change needs a migration and a check of three foreign keys | `PROGRESS.md` Phase 2 |
| PD-8 | Dev seeds (roles, number series, OT policy, company profile) | **Open** | 2026-11-19 | See R-8 | `PROGRESS.md` |
| PD-9 | Master-data reads need only a signed-in user; scope grants do not limit reads | Design question, not decided | 2026-11-21 | Location-scoped users see all projects | `DEFECTS.md` (cross-project section) |
| PD-10 | Step-up token is not single-use; exports prompt for step-up client-side only | Open (known limit) | 2026-11-21 | Not a security boundary | `DEFECTS.md` (device sessions) |

### 3.4 Defects with a decision attached (`DEFECTS.md`)

| ID | Item | Status as recorded | Date |
|---|---|---|---|
| DEF-10 | Sign-in events not readable through API | Needs decision at the time; later addressed by `GET /audit-log/auth-events` in API 1.1.0 (`API_V1.md`) | 2026-11-21 |
| DEF-11 | Pre-login call defaulted to the acme tenant | Fixed; no tenant-less login | 2026-11-21 |
| DEF-7 | Refresh after logout revoked all sessions | Fixed; only replaced-token reuse revokes all | 2026-11-21 |

## 4. Risk register

Rating scale (Assessed): H high, M medium, L low. Owner for every risk: To be confirmed.

| ID | Risk | Category | Likelihood (Assessed) | Impact (Assessed) | Mitigation in place (cite) | Status |
|---|---|---|---|---|---|---|
| R-1 | Event transport undecided (D13) and retry values undecided (D14): outbound events queue in the outbox and nothing reaches HRMS, P&M, PMS or Stores; the relay starts only when a transport and retry values are configured | Delivery | H | H | Transactional outbox in the same transaction; mock transport; replay and monitor built (`API_V1.md` 1.6.0; `SCHEDULE-STATUS.md` CORE-23-06, 23-07, 24-06) | Open |
| R-2 | Read-model freshness threshold undecided (D16) and module payload fixtures missing (D15): read models fill only through `POST /integration-events/inbound`, with no stale verdict, tested only with fictional payloads | Technical | M | M | Sequence-checked upsert; read APIs; fictional-payload contract tests (`SCHEDULE-STATUS.md` CORE-24-05, 24-08; `RELEASE_NOTES_DRAFT.md`) | Open |
| R-3 | Lint fails in both apps, so `npm run ci` cannot pass. Verified 2026-11-25 by running `npm run lint`: backend 2 errors (unused `_privilege`, `_requested` in `src/modules/access/service.ts`); frontend 5 errors and 8 warnings (restricted cross-module imports in `AuditTrail.tsx`, `PeopleForm.tsx`, `ProjectDetail.tsx`; a set-state-in-effect error in `EquipmentRegister.tsx`; one more error in `CustomPolicyEditor.tsx` or `RolesSection.tsx`, file not identified from output). Earlier records say 0 errors (`SCHEDULE-STATUS.md`, `DEFECTS.md`, 2026-11-21) | Delivery | H (occurring) | M | CI scripts exist in `package.json` and the backend `ci.yml`; fix not made | Open, confirmed |
| R-4 | Password reset cannot complete in production: no email provider (D10, P-4); `POST /auth/password-reset/request` answers 503 `OTP_DELIVERY_UNAVAILABLE` | Operational | H | M | Production refuses a sample OTP code; adapter over a neutral transport exists (`PROGRESS.md` P-4; `DEFECTS.md` "Still open") | Open |
| R-5 | Manual deployment; no deploy pipeline, protected branch or CI service recorded; staging environment does not exist (gates B1, B2) | Operational | H | H | Release checklist and rollback steps (`DEPLOYMENT.md`; DOC-11); backend `ci.yml` exists; CI location in a mono-repo To be confirmed | Open |
| R-6 | Single database holds every tenant (one schema each). A flaw in tenant selection, a query naming another schema, or the shared owner role could expose or damage several tenants; no row-level security | Security | L | H | Tenant taken from the verified token; header ignored on protected routes; cross-tenant tests (`tests/testing-pass/tenant-isolation.test.ts`, `conflicts-and-ownership.test.ts`); `withTenant` excludes `public`. Gap: "a query that names another tenant schema explicitly can still reach it until per-tenant roles exist" (`PROGRESS.md` Phase 3 (b)) | Open |
| R-7 | One database role runs migrations and the app (`core_app` role not created, B3); the owner can disable the audit-append-only trigger. Dev PostgreSQL accepts any password on localhost (trust authentication) | Security | M | H | Hash chain `verifyAuditChain`; `scripts/admin/create-core-app-role.sql` ready; `DEPLOYMENT.md` checklist requires the role; staging must use scram-sha-256 (`SCHEDULE-STATUS.md` environment finding) | Open |
| R-8 | Dev credentials and seed users: `DEFECTS.md` records test sign-ins and a shared test password for accounts such as `VELOX1003`, `ACME9999`, `EXER9001` to `EXER9003`, `ACME8801`, `DELTA8801` in the acme dev tenant; the frontend release notes say a sample OTP exists outside production. Accounts were left in the dev database (not deleted). Dev seeds are undecided (PD-8). Credential values are not reproduced here | Security | M | H if reaching production | Production refuses a sample OTP code (`SCHEDULE-STATUS.md` D10); `.env.test` and `.env` are git-ignored; credentials are not recorded in `PROGRESS.md`. Verified: `DEFECTS.md` (repo root, untracked) contains one dev test password in plain text; remove it before the file is committed or shared | Open |
| R-9 | Sample data in dev tenants and in screens: subscription page uses sample plans (D17); resource and material planning use sample data; policy templates ship as standard text; dashboard counters once showed 0 (DEF-4, not reproduced) | Delivery | M | M | Known-limitations table (`RELEASE_NOTES_DRAFT.md`); screens say "not configured" for tiers (`SCHEDULE-STATUS.md` D17) | Open |
| R-10 | Rollback is forward-only; schema changes cannot be reversed automatically. Recovery depends on a backup taken before release and tested restore | Operational | M | H | `db:backup`, `db:restore`, `db:drill` (restore drill acme: 62 tables, 2,328 rows, no differences, 2026-11-21); DEF-13 restore on a fresh server fixed (`DEFECTS.md`); PITR needs staging | Open |
| R-11 | Client IP and rate limits behind a proxy: `TRUST_PROXY` range not supplied (P-2); raw IP not stored for sign-in history (P-9) | Security | M | M | Env var built; database-backed limits (P-3); `DEPLOYMENT.md` explains setting | Open |
| R-12 | Approval workflow gaps: no escalation (D9), timeouts and `cash_limit_inr` stored not enforced (PD-6), amount bands may overlap (D5); only the current approver may decide | Technical | M | M | Reminder sweep (migration 0038); approver check; version guard (`SCHEDULE-STATUS.md` D9; `PROGRESS.md` 5e) | Accepted by owner decision, residual |
| R-13 | Step-up weaknesses: no TOTP; token not single-use; exports prompt but are client-side; users without a passkey cannot step up (password step-up added in 1.7.0 for geo-zones only) | Security | M | M | Server-enforced step-up on grants and geo-zone writes; password step-up `POST /auth/step-up/password` (`API_V1.md` 1.7.0; `DEFECTS.md`) | Open |
| R-14 | Frontend security items from the audit of `non-functional.md`: `/style-guide` route reachable in production; map tiles load from third-party hosts (CSP must allow; licence terms); uploaded SVG and Office files may carry active content; CSV export injection. `non-functional.md` describes the pre-backend state, so some items may since be fixed | Security | M | M | Server-side checks on write routes (`PROGRESS.md`); bundle secret check `check:bundle` in frontend `ci`. Current status of each item To be confirmed | Open |
| R-15 | Compliance: retention periods are provisional (D21), no purge job; raw IP retention unset (P-9); legal confirmation pending; personal data in audit snapshots (`tan`, `cin`, email and phone are not redacted) | Compliance | M | M | `gstin`, `pan` and secret hashes are redacted (`src/core/redaction.ts`, `PROGRESS.md` 5a(m), 5b(l)); backup files documented as encrypted storage outside the repository (`PROGRESS.md` Phase N (e)) | Open |
| R-16 | Test-suite instability: intermittent teardown errors (`permission denied to terminate process`), hook timeouts under default parallelism, 19 leftover test databases (`DEFECTS.md`); suite passes with `--maxWorkers=4` | Delivery | M | L | Retrying drop helper; hook timeout 60 s; `--maxWorkers=4` in `ci` (`PROGRESS.md`; `DEFECTS.md` D5 and D23). Root cause "not verified" | Open |
| R-17 | Release documentation drift: `RELEASE_NOTES_DRAFT.md` (2026-11-22) states API 1.6.0 and 277 operations; current API is 1.10.0 with 279; `DEFECTS.md` says the project is not a git repository, which is now false; `CHANGES_TODO.md` items remain unticked and unverified | Delivery | H | L | Statuses are dated in each file | Open |
| R-18 | Single-point and capacity limits: relay measured at 489 events/s locally only; performance not measured on staging (D19); no cache (D18) | Technical | M | M | Local baseline within provisional targets (`SCHEDULE-STATUS.md` CORE-27-05) | Open |
| R-19 | Multi-system consistency: the fixed one-session-per-user rule means a second sign-in or second browser tab ends the first session, which may surprise users | Operational | M | L | Message shown on sign-out; recorded as `session_limit_revoked` (`DEFECTS.md`) | Accepted |
| R-20 | Provisional `shared.uom` stand-in may differ from the owner document, requiring a migration later | Technical | M | M | Documented in `PROGRESS.md` Phase 2; foreign keys are the only coupling | Open |

## 5. Assumptions and dependencies

| # | Assumption or dependency | Type | Source |
|---|---|---|---|
| A-1 | The owner supplies D13 to D17 (transport, retry values, payload fixtures, freshness threshold, plan tiers) | Dependency | `SCHEDULE-STATUS.md` |
| A-2 | AWS staging, secrets store, PostgreSQL 18 with PITR, TLS and Cloudflare routing will be provisioned (B1) | Dependency | `RELEASE_NOTES_DRAFT.md` |
| A-3 | A database administrator creates the `core_app` role (B3) | Dependency | `SCHEDULE-STATUS.md`; `DEPLOYMENT.md` |
| A-4 | An email provider is chosen and credentials are issued before production (D10) | Dependency | `SCHEDULE-STATUS.md` |
| A-5 | Other modules (HRMS, P&M, PMS, Stores) send events in the versioned envelope and call the Core API; their contracts are not in this repository | Dependency | `PROGRESS.md` Decisions and notes |
| A-6 | PostgreSQL 18 client tools (`pg_dump`, `pg_restore`) match or exceed the server version | Assumption | `DEPLOYMENT.md` |
| A-7 | Tenant ids follow the rule (1 to 40 lowercase letters, digits or underscores, starting with a letter) | Assumption | `PROGRESS.md` |
| A-8 | The client sends `X-Tenant-Id` for pre-login calls (derived from the login ID prefix); tokens carry the tenant for protected calls | Assumption | `DEFECTS.md` DEF-11 |
| A-9 | Time zone: backend should store UTC; tenant zone assumed IST (inferred in the frontend notes) | Assumption | `non-functional.md` section 12 |
| A-10 | Owner approves provisional targets and objectives (D19, D20, D21) after the first staging run and legal review | Dependency | `SCHEDULE-STATUS.md` |
| A-11 | UAT stakeholders and a go/no-go signer are available | Dependency | `RELEASE_NOTES_DRAFT.md` |
| A-12 | Multi-tenancy by schema is sufficient without row-level security (D2) | Assumption | `SCHEDULE-STATUS.md` |
| A-13 | Map tile providers (OpenStreetMap, Esri) remain acceptable for production use | Assumption | `non-functional.md` section 11 |

## 6. Open items consolidation

Items are drawn from the documents read for this register and from DOC-11. Each is To be confirmed unless a decision is cited.

| # | Open item | Area | Source |
|---|---|---|---|
| 1 | Event transport (D13) | Integration | `SCHEDULE-STATUS.md` |
| 2 | Event retry defaults (D14) | Integration | Same |
| 3 | Module payload fixtures (D15) | Integration | Same |
| 4 | Read-model freshness threshold (D16) | Integration | Same |
| 5 | Plan tiers and Stores mapping (D17) | Product | Same |
| 6 | Email provider, message template, login OTP second-factor requirement (D10, P-4) | Identity | `PROGRESS.md`; `DEFECTS.md` |
| 7 | `TRUST_PROXY` address range | Operations | `PROGRESS.md` P-2 |
| 8 | Raw IP retention period for `core_auth_activity.ip_address` (P-9) | Compliance | `PROGRESS.md` |
| 9 | Fuel settings default values (P-10) | Product | `PROGRESS.md` |
| 10 | `shared.uom` definition from `06_Platform_Administration.md` (PD-7) | Data | `PROGRESS.md` |
| 11 | Dev seeds: roles, number series, OT policy, company profile (PD-8) | Data | `PROGRESS.md` |
| 12 | Meaning of `core_user.scope` (P-7 left unused) | Data | `PROGRESS.md` |
| 13 | Privilege catalogue; module_head grants hold no privileges | Access | `PROGRESS.md` 4d |
| 14 | Custom-policy version immutability once effective is not enforced | Policies | `PROGRESS.md` 5d(f) |
| 15 | Import worker: no file parsed or row validated (`valid_rows`, `error_rows` stay zero) | Records | `PROGRESS.md` 5f(g) |
| 16 | Notification delivery: recorded only, nothing sent | Records | `PROGRESS.md` 5f(e) |
| 17 | Staging environment (B1), protected branch and CI service (B2), `core_app` role (B3) | Release | `SCHEDULE-STATUS.md`; `RELEASE_NOTES_DRAFT.md` |
| 18 | Regression 3 on staging, UAT sign-off, release authorisation | Release | `RELEASE_NOTES_DRAFT.md` |
| 19 | Lint errors in both apps (R-3) | Quality | Verified 2026-11-25 |
| 20 | Not tested in Edge or with a screen reader; performance measured locally only | Quality | `RELEASE_NOTES_DRAFT.md` |
| 21 | Provisional targets and objectives D19 to D21 need confirmation | Governance | `SCHEDULE-STATUS.md` |
| 22 | Scope-limited reads: should location-scoped grants limit master-data reads (PD-9) | Access | `DEFECTS.md` |
| 23 | Step-up: single-use token, TOTP, server-side export enforcement (PD-10) | Security | `DEFECTS.md` |
| 24 | Detail routes read the full list and pick a row; direct query needed as tables grow | Performance | `DEFECTS.md` DEF-8 |
| 25 | `PUT /files/{id}/content` checks file type before the token | Security | `DEFECTS.md` regression section |
| 26 | Retention purge job not built (D21) | Compliance | `SCHEDULE-STATUS.md` |
| 27 | Frontend `CHANGES_TODO.md`: 21 change items unticked and unverified; open: CompanyProfile GSTIN/CIN/TAN hard-lock, PMS limits page and route, dropdown and placeholder CSS sweep, unused `flagOf` | Frontend | `CORE__FRONTEND/CHANGES_TODO.md` |
| 28 | Frontend `non-functional.md` items to re-verify against the integrated build (client-side lockout and step-up, built-in credentials, `/style-guide` route, CSV escaping, SVG sanitising, server paging for requests, audit, stock and units, real-time badges) | Frontend | `CORE__FRONTEND/docs/non-functional.md` |
| 29 | GPS device feed, billing service, PAN lookup provider not chosen | Integration | `non-functional.md` section 11 |
| 30 | Test accounts and leftover test databases in the dev environment to clean up | Operations | `DEFECTS.md` |
| 31 | Owners for all risks and decisions; approver roles in DOC-11 | Governance | This document; DOC-11 |
| 32 | Release notes draft is out of date (API 1.6.0 versus 1.10.0) | Documentation | `RELEASE_NOTES_DRAFT.md`; `API_V1.md` |
| 33 | CI workflow location in the mono-repo; no frontend workflow found | Release | DOC-11 section 10 |

## 7. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | Initial draft from repository contents |
