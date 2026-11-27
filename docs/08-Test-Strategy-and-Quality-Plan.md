# Test Strategy and Quality Plan

| Field | Value |
|---|---|
| Document ID | DOC-08 |
| Title | Test Strategy and Quality Plan |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This document describes how VeloxIQ Core is tested, what each automated suite covers, which gates a change must clear, what quality issues are known today, and what is not yet tested. It is derived from the repository as it stands on the date above. Items marked **Proposed** are recommendations and are not adopted policy.

## 2. Scope

| In scope | Out of scope (not covered by this repository) |
|---|---|
| Backend API (`CORE__BACKEND`: Node 24, TypeScript, Express 5, PostgreSQL 18, Vitest) | Other VeloxIQ modules that call the Core API |
| Frontend (`CORE__FRONTEND`: React 19, Vite, Vitest) | Staging and production environments (not yet available, blocker B1 in `SCHEDULE-STATUS.md`) |
| API v1 contract, schema-per-tenant isolation, backup and restore | Independent penetration test (To be confirmed) |
| Manual UAT and accessibility checks | Real screen-reader and Microsoft Edge passes (`CORE__FRONTEND/docs/ACCESSIBILITY_AUDIT.md`, "Not covered") |

## 3. Test levels and tooling

| Level | Tool | Where | Notes |
|---|---|---|---|
| Static checks | `tsc --noEmit`, ESLint (flat config), Prettier | both projects | Backend: `typecheck`, `lint`, `format:check`. Frontend: `typecheck` (`tsc -b --noEmit`), `lint`, and `deps` (dependency-cruiser layering rules). |
| Unit and component | Vitest (`vitest run`) | backend `tests/core`, `tests/policies`, others; frontend `src/test` | Frontend uses a setup file, `src/test/setup.ts`. |
| API / integration | Vitest with in-process HTTP (`app.inject`, per `CORE__BACKEND/README.md`) against a real PostgreSQL | backend `tests/<module>` | Module tests use a real database, not a mock. |
| Database | Vitest plus a throwaway PostgreSQL database per test file | backend `tests/db`, `tests/hardening/backup.test.ts`, `restore-drill.test.ts` | See section 7. |
| Contract (regression) | Vitest | backend `tests/regression`, `tests/hardening/openapi.test.ts`; frontend `src/test/api-contract.test.ts` | See sections 5 and 6. |
| Security / hardening | Vitest | backend `tests/hardening`, `tests/testing-pass` | CORS, headers and limits, rate limit, trust proxy, tenant isolation, idempotency, audit chain. |
| Performance baseline | `npm run load:baseline` (`scripts/load-baseline.ts`) | backend | Local only, on a fresh throwaway database; not a staging load test. |
| Bundle secret scan | `npm run check:bundle` (`scripts/check-bundle.mjs`) | frontend | Fails if `dist/` contains connection strings, private keys or server-only setting names. |
| Accessibility | Automated (`src/test/a11y-audit.test.tsx`, `modal-focus.test.tsx`) plus a manual audit | frontend | See section 8. |
| UAT | Manual scripts (`CORE__FRONTEND/docs/UAT_SCRIPTS.md`) | frontend docs | Not yet executed (blocked on staging and stakeholders). |
| Dependency scan | `npm audit` | both | `evidence/regression-2-2026-11-22/README.md` reports 0 vulnerabilities in both projects. |

Runner configuration:

| Item | Setting | Source |
|---|---|---|
| Backend Vitest | `hookTimeout: 60_000` (database create and drop under load) | `CORE__BACKEND/vitest.config.ts` |
| Backend parallelism | `--maxWorkers=4` in `ci` and the regression scripts | `CORE__BACKEND/package.json` |
| Frontend Vitest | `test` block of `vite.config.ts`; setup file `src/test/setup.ts` | `CORE__FRONTEND/vite.config.ts` |

## 4. Suites and what they cover

### 4.1 Backend test file counts

Shell listing of `CORE__BACKEND/tests`, 2026-11-25. No test was executed. Total: **77** `*.test.ts` files, equal to the 77 files recorded in `evidence/regression-2-2026-11-22/README.md`.

| Folder | Files | Covers (from file names and `docs/REGRESSION.md`) |
|---|---|---|
| `tests/` (root) | 2 | Configuration parsing, health and readiness |
| `tests/access` | 3 | Users, privileges, grants |
| `tests/approvals` | 5 | Chains, requests, decision state machine, reminders |
| `tests/audit-log` | 1 | Audit trail read, allowlist and masking |
| `tests/auth` | 9 | Login, refresh, logout, lockout, passkeys, password reset, sessions, step-up, tenant lookup, access history and device limit |
| `tests/boq` | 1 | Bill of Quantities items |
| `tests/core` | 6 | Errors, HTTP app, logging redaction, password hashing, rate limit, database failure |
| `tests/db` | 8 | Migrations, constraints, tenant schemas, audit triggers, dev user, shared UoM, generated types |
| `tests/equipment-units` | 2 | Equipment units |
| `tests/hardening` | 8 | API docs, backup, CORS, headers and limits, OpenAPI, restore drill, shared rate limit, trust proxy |
| `tests/integration` | 1 | Outbox, inbox, relay, dead-letter, replay (`events.test.ts`) |
| `tests/maintenance` | 1 | Maintenance |
| `tests/masters` | 4 | Master-data resources |
| `tests/modules` | 1 | Offline operations routes |
| `tests/offer-letter` | 1 | Offer letters |
| `tests/organisation` | 2 | Organisation structure |
| `tests/permissions` | 1 | Detail-route permissions |
| `tests/policies` | 2 | Policies, versions, rules |
| `tests/projects` | 3 | Projects, locations, stores, WBS |
| `tests/records` | 4 | Records, rules, file content, grievance visit status |
| `tests/regression` | 3 | API v1 lock, identity contract, masters contract |
| `tests/relationships` | 1 | Cross-project relationship rules |
| `tests/search` | 1 | Tenant-scoped search |
| `tests/stock-levels` | 1 | Stock levels |
| `tests/testing-pass` | 6 (plus `helpers.ts`) | Audit chain, auth edge cases, conflicts and ownership (409), idempotency (unit and HTTP), tenant isolation |

### 4.2 Frontend test file counts

Shell listing of `CORE__FRONTEND/src`, 2026-11-25. Total: **25** test files (24 in `src/test`, 1 in `src/modules/core-data/data`). Earlier recorded runs: 164 tests in 18 files (`SCHEDULE-STATUS.md`, 2026-11-21) and 212 tests in 23 files (`evidence/regression-2-2026-11-22/README.md`). The file count has grown since.

| Area | Test files (`src/test/`) |
|---|---|
| Access and session | `access`, `access-history`, `session`, `signout-cache`, `tenant`, `integration` |
| API client and contract | `api-client`, `api-contract` |
| Approvals | `approval-levels`, `approval-workflow`, `raiseRequest` |
| Policies and company | `policy-setup`, `customPolicies`, `company-tax-ids`, `tax-ids` |
| Resources and BOQ | `available-equipment`, `boq` |
| UI quality | `a11y-audit`, `modal-focus`, `date-format` |
| App and change batches | `app`, `change-batch`, `change-batch-2`, `tasks-23-30` |
| Data | one file under `src/modules/core-data/data/` |

## 5. Regression suites

Source: `CORE__BACKEND/docs/REGRESSION.md`. Run before each release, and after any change to authentication, access control, a master-data module, or the shared route helpers (`src/core/resource.ts`, `src/plugins/auth.ts`).

| Command | Contents |
|---|---|
| Backend `npm run test:regression` | `test:regression:api`, then `:masters`, then `:identity` |
| `test:regression:api` | `tests/regression/api-v1-lock.test.ts`, `tests/hardening/openapi.test.ts` |
| `test:regression:masters` | `masters-contract.test.ts` plus `tests/masters`, `projects`, `organisation`, `equipment-units`, `stock-levels`, `offer-letter`, `relationships`, `permissions`, `db/shared-uom.test.ts`, `testing-pass/conflicts-and-ownership.test.ts` |
| `test:regression:identity` | `identity-contract.test.ts` plus `tests/auth`, `access`, `audit-log`, `testing-pass/auth-edges`, `tenant-isolation`, `idempotency-http`, `core/password`, `core/rate-limit`, `hardening/shared-rate-limit`, `hardening/cors` |
| Frontend `npm run test:regression` | `access`, `tenant`, `session`, `integration`, `app` test files in `src/test` |

Contract rules checked (`docs/REGRESSION.md`):

| Contract test | Rule |
|---|---|
| Masters contract (14 resources) | Anonymous 401; write without privilege 403 `ACCESS_DENIED`; create returns `rowVersion` 1; change without `rowVersion` 400 `VALIDATION_ERROR`; stale version 409 `VERSION_CONFLICT`; unknown id 404; duplicate unique value 409 |
| Identity contract | Every operation in the generated `/openapi.json` returns 401 with no, garbage or forged token (except `PUBLIC_OPERATIONS`); `/users`, `/access`, `/audit-log` need `access.manage`; access token lasts 15 minutes; refresh token is opaque; a `mustChangePassword` user gets 403 `PASSWORD_CHANGE_REQUIRED` elsewhere |

Last recorded runs (quoted, not re-measured):

| Date | Suite | Result | Source |
|---|---|---|---|
| 2026-11-21 | Backend masters, identity; frontend regression | 256 passed and 2 skipped; 228 passed; 69 passed | `docs/REGRESSION.md` |
| 2026-11-21 | Backend `npm run ci` | 709 tests in 72 files (2 skipped) passed | `SCHEDULE-STATUS.md` |
| 2026-11-22 | Backend full | 77 files, 742 passed, 2 skipped, 0 failed | `evidence/regression-2-2026-11-22/README.md` |
| 2026-11-22 | Frontend full | 23 files, 212 passed | same |

## 6. API contract lock policy

Source: `CORE__BACKEND/docs/API_V1.md`, `tests/regression/api-v1-lock.test.ts`.

| Item | Policy |
|---|---|
| Authority | `CORE__BACKEND/docs/api/openapi-v1.json` is the locked snapshot; the generated OpenAPI document must match it |
| Locked | Method and path, parameters, request body schema, idempotency header, security (public or bearer), documented responses |
| Not locked | Summaries and descriptions (wording) |
| Allowed change | Add an operation or an optional request field as a minor version: bump `version` in `package.json`, run `npm run api:snapshot`, review the snapshot diff with the frontend owner |
| Not allowed in v1 | Removing or changing an operation (needs a v2) |
| Enforcement | The lock test fails on any added, removed or changed operation, including allowed additions, so every change is a deliberate step |
| Current version | Backend `package.json` 1.10.0; `API_V1.md` states "Current version: 1.10.0" |
| Frontend guard | `src/test/api-contract.test.ts` checks frontend calls against the contract (added after a dead call to a missing route, defect D19 in `DEFECTS.md`) |

## 7. Database test approach

Source: `CORE__BACKEND/tests/db/helpers.ts`.

| Aspect | Approach |
|---|---|
| Real database | PostgreSQL 18; there is no in-memory substitute. Testcontainers is **not** used: the tests connect to a PostgreSQL server supplied through environment variables (a `postgres:18` service in CI). |
| Provisioning | `createTestDatabase(baseUrl, tenants)` creates a database named `velox_test_<random hex>`, applies the global migration and the requested tenant schemas, and returns an application pool, an owner pool and a `drop()` function. Each test file gets its own database. |
| Shared database | Never modified by tests (comment in `helpers.ts`). |
| Cleanup | `dropDatabase` runs `DROP DATABASE IF EXISTS ... WITH (FORCE)` and retries up to 10 times when a background process is still attached. `migrate.test.ts` was changed to use it (D5 cause, `DEFECTS.md`). |
| Owner and app role | When `APP_TEST_DATABASE_URL` is set, tests use the application login with the grants from `scripts/admin/grant-core-app-tables.sql`, so permissions are exercised; otherwise the owner account is used. |
| Skipping | `helpers.ts` tries to load `.env.test`; with no connection string, database tests are skipped and the rest run (`README.md`, "Tests"). |

Environment variable names used by the test harness (values are never recorded):

| Name | Purpose | Required |
|---|---|---|
| `MIGRATION_DATABASE_URL` | Owner connection that creates and drops test databases and runs migrations; preferred | Optional |
| `DATABASE_URL` | Fallback when `MIGRATION_DATABASE_URL` is unset | One of the two is needed for database tests |
| `APP_TEST_DATABASE_URL` | Application login (`core_app_login`) to exercise real grants | Optional |
| `PG_BIN` | Folder holding `pg_dump` and `pg_restore` for the backup and drill tests | Optional (needed if not on PATH) |

Backup and restore are tested by `tests/hardening/backup.test.ts` and `restore-drill.test.ts`. `DEFECTS.md` lists five drill tests: the comparison finds missing tables, changed counts, changed content and extra tables; a full drill passes and drops its scratch database; an unsafe tenant id is refused; a failed drill still cleans up.

## 8. UAT and accessibility

| Item | Source | Status |
|---|---|---|
| UAT scripts U1 to U7 (sign-in and session, master data, access, approvals, policies, equipment/inventory/events, resilience) | `CORE__FRONTEND/docs/UAT_SCRIPTS.md` | Scripts ready; execution blocked on staging and stakeholders (`SCHEDULE-STATUS.md`, CORE-28-06) |
| UAT record keeping | `UAT_SCRIPTS.md`: per step record tester, date, Pass, Fail or Blocked, and a screenshot for each Fail; a Fail becomes a defect | Defined |
| UAT accounts | An administrator, an approver for levels 1 and 2, a plain module user; fictional data | Defined |
| Accessibility audit (CORE-17-04, 2026-11-21) | `CORE__FRONTEND/docs/ACCESSIBILITY_AUDIT.md` | Three defects found and fixed: sidebar role-line contrast 4.45:1 (AA needs 4.5:1), keyboard access to scrollable tables, focus return after a dialog closes |
| Not covered | same document | Real screen reader (NVDA, JAWS, VoiceOver); Microsoft Edge |

## 9. CI pipeline (`npm run ci`)

| Project | Stages in order | Source |
|---|---|---|
| Backend | 1. `npm run typecheck` 2. `npm run lint` 3. `vitest run --maxWorkers=4` 4. `npm run build` (`tsc -p tsconfig.build.json`) | `CORE__BACKEND/package.json` |
| Frontend | 1. `npm run typecheck` 2. `npm run lint` 3. `vitest run` 4. `npm run build` (`tsc -b && vite build`) 5. `npm run check:bundle` | `CORE__FRONTEND/package.json` |

| Item | Detail |
|---|---|
| Hosted workflow | `CORE__BACKEND/.github/workflows/` defines `backend-ci`: Ubuntu, `postgres:18` service, Node 24, installs `postgresql-client-18`, runs typecheck, lint, tests with JUnit output, build, and uploads `test-results/`. Triggers: push and pull request. |
| Frontend workflow | No `.github/workflows` folder exists in `CORE__FRONTEND` (listing 2026-11-25), although `SCHEDULE-STATUS.md` (B2) mentions two workflow files. To be confirmed. |
| Workflow location | The workflow sits inside `CORE__BACKEND/.github`. The repository root (`CORE__V__0.4`) has a git remote but no root `.github` folder, so a hosted service reading the repository root would not find it. Observation only; confirm with the repository owner. |
| Test database | CI uses an ephemeral PostgreSQL and `DATABASE_URL`; each file creates and drops its own database. |

## 10. Known quality issues

| Ref | Issue | Severity as recorded | Status (source) |
|---|---|---|---|
| Lint, `EquipmentRegister.tsx` | In `AddUnitForm`, the `useEffect` keyed on `[step]` (lines 238 to 243) calls `setCamFor(null)` and `setCamError(null)` synchronously inside the effect, next to the camera-release logic. This is the code pattern behind the known lint error. The lint run itself was not repeated (instructed not to run checks), so the exact rule and error count are **unverified**. | To be confirmed | Pattern still present in the file on 2026-11-25; confirm with `npm run lint` |
| Frontend lint warnings | Lint 0 errors, 9 older warnings on 2026-11-21 (`SCHEDULE-STATUS.md`) | Low | Recorded |
| D3 | `Invalid hook call` in `HashRouter` in the dev build; related to stale modules under an open dev page | Medium (dev build only) | Not reproduced; probable cause found (`DEFECTS.md`) |
| D4 | Dashboard counters show 0 for tenant acme | Medium | Not reproduced on 2026-11-21 |
| D5 | Backend tests flake under parallel load (database create or drop) | Low | Cause found and fixed in `migrate.test.ts`; hook timeout raised to 60 s (D23) |
| D10 | Sign-in events not readable through the API | Medium | `DEFECTS.md` says Open; code now registers `GET /audit-log/auth-events` (`src/modules/audit-log/routes.ts`). Status To be confirmed. |
| Password reset | `POST /auth/password-reset/request` answers 503 `OTP_DELIVERY_UNAVAILABLE` until an email provider is chosen | Medium | Open (decision D10 in `SCHEDULE-STATUS.md`) |
| Step-up limits | No TOTP; step-up token not single-use; exports prompt for step-up but are client-side; other privilege paths not step-up protected | Medium | Open ("Known limits", `DEFECTS.md`) |
| Residue | Test accounts `EXER9001` to `EXER9003`, `ACME8801`, `DELTA8801` in the dev database; about 19 leftover `velox_test_*` and `velox_migtest_*` databases (as recorded 2026-11-21) | Low | Open housekeeping |
| Blockers | B1 no staging; B2 no Git repository (earlier statement; a remote now exists); B3 `core_app` role not created, so migrations and the app share one role | High for release | Open (`SCHEDULE-STATUS.md`) |
| Open owner decisions | D13 event transport, D14 retry defaults, D15 module payload fixtures, D16 freshness threshold, D17 plan tiers | n/a | Open |
| P0 / P1 defects | None open at 2026-11-22 | n/a | `evidence/regression-2-2026-11-22/README.md` |

## 11. Entry and exit criteria

Derived from `SCHEDULE-STATUS.md`, `RELEASE_NOTES_DRAFT.md` and `docs/REGRESSION.md`. Rows marked Proposed are not adopted.

| Stage | Entry criteria | Exit criteria |
|---|---|---|
| Commit or merge (Proposed) | Branch builds locally | `npm run ci` passes in both projects; no new lint suppressions; API lock test passes or the snapshot change is reviewed |
| Regression | Release candidate built; test database available | All backend regression scripts and the frontend regression script pass |
| UAT | Staging exists; UAT accounts created; scripts U1 to U7 available | Every step Pass, or each Fail logged as a defect and accepted; stakeholder sign-off (names To be confirmed) |
| Release (Proposed) | Regression green; no open P0 or P1 defect; restore drill passed; release authorisation (signer To be confirmed) | Production smoke test and migration checks recorded |

## 12. Defect severity and priority (Proposed)

The repository uses P0 to P3 (`evidence/regression-2-2026-11-22/README.md`) and High, Medium, Low (`DEFECTS.md`) without a written definition. The tables below are **Proposed**.

| Severity | Definition | Example from the repository |
|---|---|---|
| S1 Critical | Data loss, security breach, tenant isolation failure, or recovery does not work | D13: restore onto a fresh server failed |
| S2 High | Major function unusable, no workaround | Password reset unavailable without an email provider |
| S3 Medium | Function impaired, workaround exists | D1: write controls shown to users without the privilege |
| S4 Low | Cosmetic or wording | R2-2: help text said requests escalate |

| Priority | Meaning |
|---|---|
| P0 | Fix immediately; blocks release |
| P1 | Fix before release |
| P2 | Fix in the next planned release |
| P3 | Backlog |

Response and fix time targets for each level are To be confirmed.

## 13. Test environments

| Environment | Purpose | Status |
|---|---|---|
| Developer machine | Development, unit and integration tests, local load baseline, restore drill on dev data | Available. Dev PostgreSQL accepts any password on localhost (trust authentication, `DEFECTS.md`) |
| CI | Automated gate with a `postgres:18` service | Defined for the backend; hosted run To be confirmed |
| Staging | HTTPS smoke, load, UAT, PITR, security groups | Not available (B1) |
| Production | Live | Not deployed |

## 14. Test data policy

| Rule | Source |
|---|---|
| Example and fixture data is fictional | `docs/DEPLOYMENT.md`, `UAT_SCRIPTS.md`, test comments |
| Each database test file creates its own database; the shared database is never modified | `tests/db/helpers.ts` |
| No real passwords or secrets in tests or documents; connection strings are never printed | `helpers.ts`, `src/db/backup.ts` (`scrub`) |
| Demo loaders (`demo:load`, `seed:frontend`) are local only; do not load `shared.uom` rows into a shared environment | `README.md` section 7 |
| The dev user command refuses production | `src/db/dev-user.ts` |
| Backup and drill dump files hold personal data; the drill deletes them unless `--keep-dump` is given | `docs/DEPLOYMENT.md` |
| Test accounts are removed or deactivated when no longer needed | `DEFECTS.md` |
| Staging data masking and refresh rules | To be confirmed |

## 15. Traceability approach

Task and requirement identifiers take the form `CORE-<phase>-<item>`, for example `CORE-19-06`.

| Where the ID appears | Example (verified by search, 2026-11-25) |
|---|---|
| Test file header comments | `tests/auth/access-history-device-limit.test.ts` (CORE-19-06, CORE-18-07); `tests/core/db-failure.test.ts` (CORE-16-07, CORE-16-08); `tests/db/types-gen.test.ts` (CORE-17-05) |
| Source comments | `src/db/client.ts` (CORE-16-07); `src/db/types-gen.ts` (CORE-17-05); `scripts/check-bundle.mjs` (CORE-16-04); `scripts/load-baseline.ts` (CORE-27-05, 27-06) |
| Status register | `SCHEDULE-STATUS.md`: ID, task, status, evidence |
| Documents | `UAT_SCRIPTS.md` header (CORE-27-02, 28-06); `ACCESSIBILITY_AUDIT.md` (CORE-17-04) |

About 27 distinct IDs appear in code and test comments. `CORE__BACKEND/PROGRESS.md` returned no `CORE-nn-nn` matches in the search, so it does not use this convention.

Proposed practice: each test file header names the task IDs it verifies; the evidence column of `SCHEDULE-STATUS.md` names the test file; a requirement-to-test matrix is generated by searching for the ID pattern. No formal requirements-to-test matrix exists today.

## 16. Coverage gaps

Folder listing compared with `src/modules` in each project. Neither `package.json` has a coverage script, so no coverage figures exist. Gaps are by folder and file name only.

| Area | Gap observed |
|---|---|
| Coverage measurement | No coverage report or threshold in either project (Proposed: add a coverage script and a floor) |
| Backend `uoms` | No `tests/uoms` folder; only `tests/db/shared-uom.test.ts` |
| Backend `offline` | One routes test (`tests/modules/offline.routes.test.ts`) |
| Backend `maintenance`, `boq`, `search`, `stock-levels`, `offer-letter` | One test file each |
| Frontend `support` module | No test file mentions it |
| Frontend module folders | Tests sit in `src/test`; none beside module code except `core-data/data` |
| Frontend `grievances`, `integrations` | Mentioned in only 2 test files each |
| Event relay in a running server | `src/server.ts` does not start the relay (`SCHEDULE-STATUS.md`, CORE-24-06: it starts only once transport and retry values are configured); the production transport is untested |
| End-to-end browser tests | No Playwright or Cypress configuration found; browser checks were manual (`DEFECTS.md`) |
| Staging-only checks | HTTPS, TLS, security groups, IAM, secrets store, PITR, staging load (B1) |
| `core_app` role | App-role versus migrator-role checks need the role (B3); the optional `APP_TEST_DATABASE_URL` path exists |
| Browsers and assistive technology | Edge and a real screen reader not tested |
| Load | Local baseline only (`evidence/regression-2-2026-11-22/load-baseline.json`); met the provisional D19 targets; staging run pending |
| Security testing | Dependency scan only; no independent penetration test recorded |

## 17. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner, QA lead, sign-off authority | To be confirmed |
| 2 | Run `npm run lint` to confirm the `EquipmentRegister.tsx` finding, its rule and the error count | To be confirmed |
| 3 | Whether a frontend CI workflow exists, and whether backend CI runs on a hosted service from the current repository layout | To be confirmed |
| 4 | Current test counts (last recorded counts predate this document) | To be confirmed by a run |
| 5 | D10 status (`GET /audit-log/auth-events` exists; `DEFECTS.md` says Open) | To be confirmed |
| 6 | Defect response and fix time targets; adoption of the proposed severity and priority scheme | To be confirmed |
| 7 | UAT stakeholders and sign-off signer | To be confirmed |
| 8 | Staging environment and data masking policy | To be confirmed |
| 9 | Coverage tooling and thresholds | Proposed |

## 18. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review |
