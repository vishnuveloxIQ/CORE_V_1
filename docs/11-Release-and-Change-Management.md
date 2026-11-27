# Release and Change Management

| Field | Value |
|---|---|
| Document ID | DOC-11 |
| Title | Release and Change Management |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

Describe how VeloxIQ Core is versioned, how changes are classified and approved, how the locked API v1 contract and the database schema are changed, and how a release is cut, checked and rolled back. Where the repository records a practice, this document cites it. Where it does not, the text is marked **Proposed** and needs owner approval.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Backend `CORE__BACKEND` (Express 5, PostgreSQL 18) and frontend `CORE__FRONTEND` (React 19, Vite) | Other modules (HRMS, P&M, PMS, Stores); they call the Core API |
| API v1 contract, migrations, regression gates, release and rollback | Infrastructure provisioning (staging, AWS); see the release gates in section 11 |

Labels used: **Recorded** = stated in a repository file (cited). **Proposed** = not in the repository; for approval.

## 3. Versioning scheme

| Item | Rule | Source |
|---|---|---|
| API version | Semantic versioning on the locked v1 contract. Locked at 1.0.0 on 2026-11-21. Additive changes bump the minor version. Breaking changes wait for v2. Current: 1.10.0 | `CORE__BACKEND/docs/API_V1.md` |
| Where the API version lives | `version` in `CORE__BACKEND/package.json` (1.10.0); read at runtime by `src/version.ts` for the OpenAPI document | `CORE__BACKEND/package.json`, `src/version.ts` |
| Contract authority | `CORE__BACKEND/docs/api/openapi-v1.json` (279 operations, 10 public) with a SHA-256 recorded per version | `API_V1.md` |
| Frontend version | `version` 1.0.0 in `CORE__FRONTEND/package.json`; not bumped per release so far. The release notes draft names the API version it targets | `CORE__FRONTEND/package.json`, `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md` |
| Database schema version | No semantic version. Ordered migration files, tracked per schema in `core_migration` (version, checksum, applied_at) | `CORE__BACKEND/PROGRESS.md` (Decisions and notes) |
| Patch versions | Not used in the recorded history (1.0.0 to 1.10.0 are all minors). **Proposed:** use a patch number for a fix that leaves the snapshot unchanged | Observed in `API_V1.md` |
| Frontend versioning | **Proposed:** bump the frontend minor version when it adopts a new API minor, and record the pair in the release notes |  |

Note: `RELEASE_NOTES_DRAFT.md` (dated 2026-11-22) names API 1.6.0 and 277 operations, while `API_V1.md` is at 1.10.0 with 279 operations. The draft is out of date (see open items).

## 4. API v1 lock rules

Recorded in `CORE__BACKEND/docs/API_V1.md`. The lock covers each operation's method and path, parameters, request body schema, idempotency header, security (public or bearer) and documented responses. Wording of summaries and descriptions is not locked.

| Change | Allowed in v1 | Required action |
|---|---|---|
| Reword a summary or description | Yes | None |
| Add an operation or an optional request field | Yes, minor version | Bump `version`, run `npm run api:snapshot`, review the snapshot diff with the frontend owner |
| Remove or rename an operation, path or parameter | No | Plan for v2 |
| Make an optional field required; change a type, enum or relied-on status code | No | Plan for v2 |
| Change a protected operation to public, or the reverse | No | Needs a decision and a v2 or a security note |

Observed exceptions in the changelog (all recorded as owner decisions): 1.1.0 and 1.2.0 tightened the `levelNo` range, and 1.8.0 removed the 1000-point maximum on geo-zone `points`. These show that "stricter" or "looser" request-limit changes have been made as minor versions with an owner decision. **Proposed:** treat any such change as a Category C change (section 5) with a named approver.

Guard: `CORE__BACKEND/tests/regression/api-v1-lock.test.ts`, run by `npm run test:regression:api` and `npm run test:regression`. The test fails on any added, removed or changed operation, so every contract change is deliberate.

Naming: the names in the contract are fixed by an owner decision of 2026-11-22; renames require a v2 plan (`API_V1.md`).

## 5. Change categories and approval levels

The repository records owner decisions and sign-offs in `CORE__BACKEND/PROGRESS.md` ("signed off 2026-11-19 as built") and owner decisions in `SCHEDULE-STATUS.md`, but it does not define formal change categories. The table below is **Proposed**.

| Cat. | Description | Examples from history | Proposed approver | Evidence required |
|---|---|---|---|---|
| A. Wording or internal | No contract, schema or behaviour change | Description rewrites; refactors | Reviewer | Tests pass |
| B. Additive | New operation, optional field, additive migration | 1.4.0 maintenance schedules; 1.9.0 plan-line `capacity` and `model` | Backend owner and frontend owner | Contract procedure (section 6), regression green |
| C. Contract-limiting or behaviour-changing | Stricter or looser limits, behaviour change with no contract diff | 1.2.0 levels 1 to 4; 1.5.0 custom-policy delete behaviour | Product owner | Recorded owner decision (D-number), changelog entry |
| D. Breaking | Removal, rename, type change, security change | None in v1 | Product owner and security reviewer; schedule v2 | v2 plan; migration of callers |
| E. Security or data | Auth, access, audit, tenancy, retention | 1.7.0 step-up by password; D9 tenant lookup fix | Security reviewer and product owner | Tests for 401/403, tenant isolation, redaction |
| F. Emergency | Production defect needing immediate fix | None recorded | Product owner (after the fact review) | Post-release review |

Roles named above (backend owner, frontend owner, product owner, security reviewer) are To be confirmed; the repository records only "the owner" and "the frontend owner" (`API_V1.md`).

## 6. Contract-change procedure

Steps follow `API_V1.md` and `CORE__BACKEND/package.json` scripts.

| Step | Action | Command or location | Evidence |
|---|---|---|---|
| 1 | Classify the change (section 5); obtain the owner decision for category C or higher | `SCHEDULE-STATUS.md` decision table (D-numbers) | Decision recorded |
| 2 | Implement the route, schema and tests | `src/modules/<name>/` | Unit and integration tests |
| 3 | Bump `version` (minor) | `CORE__BACKEND/package.json` | Version in diff |
| 4 | Regenerate the snapshot | `npm run api:snapshot` (builds the app with the pool from `.env`, writes `docs/api/openapi-v1.json` with sorted keys) | Snapshot diff |
| 5 | Add the new SHA-256 and a changelog section | `docs/API_V1.md`: version, date, "Compared with <previous>", Added, Changed, Behaviour | Changelog entry |
| 6 | Update the lock test expectation and run it | `npm run test:regression:api` | Pass |
| 7 | Frontend review of the snapshot diff with the frontend owner; update the frontend API contract tests | `API_V1.md` step; `CORE__FRONTEND/docs/api-contract.md` is superseded by API v1 | Review noted |
| 8 | Run the full gate | `npm run ci` in the backend (typecheck, lint, tests with `--maxWorkers=4`, build) | Green run |

Behaviour changes that do not alter the snapshot are still recorded in the changelog under "Behaviour (not a contract change)" (for example 1.5.0 and 1.6.0).

## 7. Database migration rules

| Rule | Detail | Source |
|---|---|---|
| Location and naming | `CORE__BACKEND/migrations/NNNN_description.sql`, four-digit sequence. Current files run 0000 to 0042 | `migrations/` |
| Two lists | `src/db/migrate.ts` holds `GLOBAL_MIGRATIONS` (0000_extensions, 0001_shared_uom, 0002_rate_limit; applied once to `public`) and `TENANT_MIGRATIONS` (applied to every `tenant_<id>` schema). A file not in a list is never applied | `src/db/migrate.ts` |
| Numbering note | Tenant and global numbering overlap (two files each start `0001` and `0002`); the sequence skips 0016 to 0019. Neither is documented as a rule | `migrations/` listing |
| Every file must be listed | Each new tenant migration must be added to `TENANT_MIGRATIONS` and described in the header comment of `migrate.ts` | `PROGRESS.md` (0007 "Added to TENANT_MIGRATIONS in src/db/migrate.ts") |
| Atomic and idempotent runs | Each migration runs in one transaction, is recorded in `core_migration` with a checksum; re-running is a no-op | `PROGRESS.md` Phase 2 |
| Tenant rollout | `npm run db:migrate` applies the global step then every existing tenant schema; `npm run db:provision -- <tenantId>` creates a schema and applies all tenant migrations. The runner applies only to schemas that exist | `README.md` section 4; `PROGRESS.md` |
| Role | The owner role runs migrations (needs schema and extension rights); production should use a separate least-privilege `core_app` role. Not yet created in the dev environment | `README.md`; `docs/DEPLOYMENT.md`; `SCHEDULE-STATUS.md` B3 |
| Types | `npm run db:types` regenerates database types (`scripts/db-types.ts`). Recorded as a script; the repository docs reviewed do not state when it must be run. **Proposed:** run it after every migration and commit the result | `package.json` |
| Backfill | Phase notes record "tables are empty, so no backfill is needed"; later migrations add checks on populated tables (for example 0034 states no tenant held a level above 4) | `PROGRESS.md`; `API_V1.md` 1.2.0 |
| Forward-only | Migrations are not reversed automatically; recovery is by restore | `docs/DEPLOYMENT.md` (Rollback) |
| Tests | `tests/db/migrate.test.ts` runs migrations on an empty database and checks re-runs; constraint tests cover a fresh tenant schema | `PROGRESS.md` |

Expand and contract guidance (**Proposed**, consistent with forward-only migrations): (1) expand: add the new column or table as nullable or with a default, deploy code that writes both; (2) migrate data in a separate migration; (3) contract: make the column required or drop the old one in a later release only after no caller depends on it. Never drop or rename in the same release that introduces its replacement. Because schema rollback is by restore, take a per-tenant backup (`npm run db:backup -- <tenantId> <file>`) before any contracting migration.

## 8. Definition of done

Recorded practice in `PROGRESS.md` and `SCHEDULE-STATUS.md` ("nothing blocked is marked done: each item says what is done, what is blocked"). Checklist **Proposed** as a consolidation:

| # | Criterion | Evidence |
|---|---|---|
| 1 | Behaviour implemented against the written decision or spec | Decision ID or phase note |
| 2 | Automated tests added at the right level; no skipped or deleted tests | `npm test` |
| 3 | `npm run ci` passes in the touched app (backend: typecheck, lint, tests, build; frontend: typecheck, lint, tests, build, bundle secret check) | CI log in `evidence/` |
| 4 | Contract changes follow section 6; lock test green | `API_V1.md` |
| 5 | Migration listed in `migrate.ts`; `db:types` regenerated (Proposed) | Diff |
| 6 | Audit, redaction and tenant isolation considered for every write | `PROGRESS.md` design defaults |
| 7 | Defect or change recorded in `DEFECTS.md` or the changelog | File entry |
| 8 | Commit made and linked (see section 10). `SCHEDULE-STATUS.md` notes that commit links were blocked until a repository existed | Commit hash |

## 9. Release checklist

Based on `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md`, `CORE__BACKEND/docs/DEPLOYMENT.md` and `CORE__BACKEND/docs/REGRESSION.md`. The manual steps are as recorded; the release is deployed manually (no deploy pipeline is present).

### 9.1 Pre-release

| # | Check | Command or source |
|---|---|---|
| 1 | Backend `npm run ci` green | `CORE__BACKEND/package.json`. **Note:** `npm run lint` currently reports 2 errors in `src/modules/access/service.ts` (verified 2026-11-25); `npm run ci` would stop at lint |
| 2 | Frontend `npm run ci` green | `CORE__FRONTEND/package.json`. **Note:** lint reports 5 errors, 8 warnings (verified 2026-11-25) |
| 3 | Regression suites green | `npm run test:regression` (backend and frontend); `docs/REGRESSION.md` |
| 4 | API lock test green; version and changelog consistent | Section 6 |
| 5 | Dependency audit 0 known vulnerabilities | `SCHEDULE-STATUS.md` CORE-26-05 (reported 0 at 2026-11-22) |
| 6 | Restore drill clean | `npm run db:drill -- <tenantId>`; reports in `CORE__BACKEND/docs/restore-drills/` |
| 7 | Release notes updated (known limitations, gates) | `RELEASE_NOTES_DRAFT.md` |
| 8 | Release gates cleared (section 11) | Release notes |
| 9 | Per-tenant backup taken before the release | `npm run db:backup -- <tenantId> <file>`; store encrypted, outside the repository (`DEPLOYMENT.md`) |

### 9.2 Release

| # | Step | Source |
|---|---|---|
| 1 | Set production variables (names in `.env.example`; values from the secrets store). Production refuses a sample OTP code | `DEPLOYMENT.md`; `SCHEDULE-STATUS.md` D10 |
| 2 | Backend: `npm ci`, `npm run build`, `npm run db:migrate`, `npm start` | `RELEASE_NOTES_DRAFT.md` Build section |
| 3 | Frontend: `npm ci`, `npm run build`; variables `VITE_API_BASE_URL` (and `VITE_SAMPLE_OTP_CODE` for test builds only) | Same |
| 4 | Confirm `core_migration` checksums match the release | `DEPLOYMENT.md` go-live checklist |
| 5 | Confirm readiness and liveness probes; TLS in front of the API | `DEPLOYMENT.md` |

### 9.3 Post-release

| # | Check | Source |
|---|---|---|
| 1 | `GET /health` and `GET /health/ready` return 200; `/openapi.json` reports the expected version | `PROGRESS.md` Phase 1 and N |
| 2 | Smoke: sign-in, a master-data read, raise and decide an approval | `CORE__FRONTEND/docs/UAT_SCRIPTS.md` |
| 3 | Verify audit chain for each tenant (`verifyAuditChain`) | `PROGRESS.md` 3c |
| 4 | Watch the event monitor for pending or dead-lettered events; outbound events queue until a transport exists | `API_V1.md` 1.6.0 |
| 5 | Record the release outcome and any defect in `DEFECTS.md` | Practice |

### 9.4 Rollback

| Layer | Action | Source |
|---|---|---|
| Code | Redeploy the previous build | `DEPLOYMENT.md`; `RELEASE_NOTES_DRAFT.md` |
| Schema and data | Forward-only. Restore the affected tenant from the pre-release backup: `npm run db:restore -- <tenantId> <file> --replace` | `DEPLOYMENT.md` |
| Never | Drop a tenant schema to roll back; audit rows are append-only and the hash chain is evidence | `DEPLOYMENT.md` |
| Objectives | RTO 4 hours, RPO 15 minutes (provisional, D20) | `SCHEDULE-STATUS.md` |

## 10. Branching and commit conventions

| Item | Observed | Proposed |
|---|---|---|
| Repository | One mono-repo with `CORE__BACKEND` and `CORE__FRONTEND`; remote `origin` on GitHub; single branch `main` (`git branch -a`) | Keep one repository |
| History | 3 commits, 2026-11-24: "initial commit of both frontend and backend files", "Track frontend files instead of a submodule pointer", "latest commit 24-12" | |
| Commit messages | Free text, lowercase, no type prefix, no ticket reference | Conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`) plus work item ID such as `CORE-24-06` used in `SCHEDULE-STATUS.md` |
| Branching | No branch strategy recorded | Short-lived branches from `main` (`feature/<id>`, `fix/<id>`); pull request required; no direct pushes to `main` |
| Protected branch and CI service | Open gate B2 in the release notes. A backend workflow exists at `CORE__BACKEND/.github/workflows/ci.yml` (runs on push and pull request); no frontend workflow was found | Run both CI workflows from the repository root; require them to pass before merge |
| Tags | None | Tag releases `v<API version>` on the release commit |
| Untracked items | `evidence/`, `screenshots/`, `DEFECTS.md`, `SCHEDULE-STATUS.md` and two zip files are untracked | Decide which are committed; keep archives and secrets out |

Note: `CORE__BACKEND/.github/workflows/ci.yml` sits inside the backend folder, so GitHub will not run it from a mono-repo root unless it is moved to the repository root `.github/workflows`. This should be confirmed (open item).

## 11. Release gates (status as recorded)

Source: `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md`, dated 2026-11-22. Not re-verified except where stated.

| Gate | State recorded |
|---|---|
| Git repository, protected branch, CI on a service (B2) | Open. A repository now exists (2026-11-24); protection and CI status To be confirmed |
| AWS staging: secrets store, PostgreSQL 18 with PITR, TLS, Cloudflare routing (B1) | Open |
| `core_app` database role and least-privilege grants (B3) | Open |
| Regression on staging and UAT sign-off | Open |
| Release authorisation: production credentials, change window, go/no-go signer | Open |
| Automated suites green, 0 known vulnerabilities, restore drill clean | Met at 2026-11-22 (`evidence/regression-2-2026-11-22`). Lint currently fails (section 9.1) |

## 12. Change history summary (API v1)

Source: changelog in `CORE__BACKEND/docs/API_V1.md`. SHA-256 values per version are listed there and are not repeated.

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026-11-21 | Contract locked for the scope that existed |
| 1.1.0 | 2026-11-21 | Added `GET /audit-log/auth-events`; optional `sourceRecordId` on raise (repeat raise returns first request); `levelNo` limited to 1 to 20 |
| 1.2.0 | 2026-11-21 | `levelNo` limited to 1 to 4 (owner decision); migration 0034 |
| 1.3.0 | 2026-11-21 | Bill of Quantities `/boq-items` (5 operations, migration 0035). HTTP layer moved from Fastify to Express (not a contract change) |
| 1.4.0 | 2026-11-22 | Equipment maintenance schedules (5 operations, migration 0037); optional `neededBy` on approval requests (migration 0036) |
| 1.5.0 | 2026-11-22 | `/cash-limit-rows` added (new name for PMS limit rows); list filters documented on 15 operations; custom-policy delete now cascades (behaviour) |
| 1.6.0 | 2026-11-22 | Integration events (8 operations) and read models; `GET /search`; outbox events written on approval raises and decisions (relay has no production transport, D13) |
| 1.7.0 | 2026-11-23 | `POST /auth/step-up/password`; step-up token records how it was obtained; access grants still require a passkey token |
| 1.8.0 | 2026-11-24 | Removed the 1000-point maximum on geo-zone `points` |
| 1.9.0 | 2026-11-24 | Optional `capacity` and `model` on plan lines (migrations 0041, 0042) |
| 1.10.0 | 2026-11-24 | `POST /audit-log/external` for other modules' audit entries; `module` filter and field on audit entries; other modules' sign-ins in auth events |

Frontend release notes: see `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md` (draft CORE-30-03, dated 2026-11-22, release decision "no-go" until the gates clear). It is not copied here.

## 13. Open items

| # | Item | Why it matters |
|---|---|---|
| 1 | Owners for approval levels (backend, frontend, product, security) are To be confirmed | Section 5 approvers are roles, not named people |
| 2 | `RELEASE_NOTES_DRAFT.md` names API 1.6.0 and 277 operations; current is 1.10.0 and 279 | Release notes are stale |
| 3 | Lint fails in both apps (backend 2 errors, frontend 5 errors, verified 2026-11-25) although `SCHEDULE-STATUS.md` and `DEFECTS.md` recorded 0 errors on 2026-11-21 | `npm run ci` cannot pass in either app |
| 4 | Whether `.github/workflows/ci.yml` under `CORE__BACKEND` runs on the GitHub repository; no frontend workflow found | Gate B2 |
| 5 | Branch protection, review rules and tagging not recorded | Section 10 is Proposed |
| 6 | When `npm run db:types` must be run is not documented | Section 7 |
| 7 | Rule for tenant versus global migration numbering and the 0016 to 0019 gap is not documented | Section 7 |
| 8 | Frontend version policy (still 1.0.0) | Section 3 |
| 9 | Change windows, go/no-go signer and production credentials | Release authorisation gate |
| 10 | Production deployment is manual; no deploy pipeline recorded | Section 9 |

## 14. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | Initial draft from repository contents |
