# Sprint review evidence: 2026-11-21

Release candidate **1.0.0** (backend and frontend), with **API v1 locked**. Regression run 1 is complete. Staging deployment is **not done yet**: it is waiting for the staging target to be confirmed (see the end of this page).

## 1. API v1 lock

| Item | Value |
|---|---|
| Version | 1.0.0 (`CORE__BACKEND/package.json`, published in `/openapi.json`) |
| Contract | `CORE__BACKEND/docs/api/openapi-v1.json`, 253 operations, 10 public |
| SHA-256 | `74db7f9a16115bba32b1b14efdd68bdad976a19e00751722ebf10d55f906129f` |
| Guard | `tests/regression/api-v1-lock.test.ts`, which fails on any added, removed or changed operation |
| Rules | `CORE__BACKEND/docs/API_V1.md` |

## 2. Release gate

| Check | Backend | Frontend |
|---|---|---|
| Type check | pass | pass |
| Lint | pass, 0 problems | pass, 0 errors, 9 older warnings |
| Build | pass, `dist/` 214 files, 0.90 MiB | pass, `dist/` 100 files, 2.37 MiB |

The lint errors found during the gate were fixed before this run:
- **Backend:** Node globals were missing for three older seed scripts, and there was one unused variable.
- **Frontend:** six layering violations, where shared code imported a module or the app imported module internals. The privilege helpers moved into the auth module, and the step-up dialog no longer depends on it.

The logs are in `release-gate/`.

## 3. Regression run 1

JUnit XML and console logs are in `regression-1/`.

| Suite | Command | Files | Result | Time |
|---|---|---|---|---|
| Backend API lock | `npm run test:regression:api` | 2 | 9 passed | 9 s |
| Backend masters | `npm run test:regression:masters` | 18 | 256 passed, 2 skipped | 40 s |
| Backend identity | `npm run test:regression:identity` | 19 | 228 passed | 39 s |
| Frontend regression | `npm run test:regression` | 5 | 69 passed | 53 s |
| Backend full suite | `npm test` | 66 | 666 passed, 2 skipped | 118 s |
| Frontend full suite | `npm test` | 8 | 97 passed | 59 s |

The 2 skipped checks are the "unique value" check for milestones and holidays, which have no unique field.

**Attempt 1 of the full backend run** (`backend-full-attempt1.log`): all 666 tests passed, but one file failed in its clean-up. `migrate.test.ts` could not drop its scratch database ("permission denied to terminate process"), because a background database process was still attached. This is a test-infrastructure fault, and the cause of the leftover test databases and the flaky parallel runs (D5). The clean-up now retries through the shared `dropDatabase` helper, and the second run passed cleanly.

## 4. Backup and restore drill

Reports are in `restore-drill/`. Both runs passed with no differences:

| Tenant | Tables | Rows | Audit chain | Restore to verified copy |
|---|---|---|---|---|
| acme | 62 | 2,328 | 708 rows, intact | 2.2 s |
| beta | 62 | 1,201 | 413 rows, intact | 2.9 s |

## 5. Delivered this sprint

- **Data:** the frontend reads and writes all data through the backend. There are multiple tenants, and the company comes from the login prefix. A login ID that names no company is refused.
- **Sign-in:** passkey sign-in and registration. Device sessions with remote sign-out. Passkey step-up for grants and geo-fence changes.
- **Access:** controls and routes follow privileges, including the planning, milestone, WBS, chainage and geo-fence controls. Navigation follows privileges too.
- **API:** single-record GET for all master resources and audit entries, request bodies in OpenAPI, and API v1 locked.
- **Operations:** a restore drill. A restore onto a fresh server now works.
- **Quality:** regression suites for masters and identity, including a sweep of every route for sign-in. Contract tests for 14 master resources. Tests for tenant isolation, concurrency (409), ownership and pre-login lookups.

**Defects:**
- **Fixed:** D1, D2, D7, D8, D9, D11, D12 and D13.
- **Closed, not reproduced:** D6.
- **D5:** cause found and fixed (test clean-up).

Details are in `DEFECTS.md`, and the release notes are in `RELEASE-NOTES-v1.0.0.md`.

## 6. Open items for the review

| Item | Needs |
|---|---|
| **Staging deployment** | The staging target: where the backend runs and the frontend's API address |
| D10: sign-in events not readable through the API | A decision |
| Password reset (503) | An email provider and credentials |
| 19 leftover test databases on the test server | Approval to drop them |
| Passkey step-up not tested with a real authenticator | A device with a passkey, on staging |
| D3 and D4 (dev-only rendering error, dashboard zeros) | Not reproduced; watch on staging |

## 7. Not in this evidence

- No staging smoke run: there is no staging environment yet.
- Nothing is committed: the project is not a git repository.
