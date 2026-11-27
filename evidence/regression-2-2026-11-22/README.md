# Regression 2 and security checks: 2026-11-22

Tasks: CORE-26-05 (scan part), 26-06, 26-07 (local parts), 26-08, 27-05, 27-06, 27-07 (query tuning), 27-08 (local parts).
Run on the development machine. **Not staging:** staging does not exist yet (blocker B1). Every staging step is listed under "Not covered" below.

- Build: backend API **1.6.0** (277 operations), frontend 1.0.0.
- Database: PostgreSQL 18.4. Every test file and the load test use a fresh, throwaway database; the dev data is never touched, except that the restore drill reads it.

## 1. Automated regression

| Suite | Result | Evidence |
|---|---|---|
| Backend, full | 77 files, **742 passed**, 2 skipped, 0 failed | `backend-full.log`, `backend-full.junit.xml` |
| Backend regression: API v1 lock | 9 passed | `backend-regression-api.log` |
| Backend regression: masters | 268 passed, 2 skipped | `backend-regression-masters.log` |
| Backend regression: identity | 242 passed | `backend-regression-identity.log` |
| Frontend, full | 23 files, **212 passed** | `frontend-full.log`, `frontend-full.junit.xml` |

The suites cover auth, scope and privilege, master APIs, approvals, tenant ID tampering, stale tokens and revoked devices (identity contract), and the outbox: duplicates, ordering, poison events, dead-letter and replay (`tests/integration/events.test.ts`).

**P0/P1 defects open: none.**

## 2. Defects found and fixed in this round

| # | Defect | Severity | Fix |
|---|---|---|---|
| R2-1 | The outbox relay sent only about 20 events a second. On a table without statistics (any new outbox), PostgreSQL planned the "earlier event still waiting" check as a nested-loop anti-join: 200 ms per event. | P2 | The check is now a correlated `min()` over the aggregate index: 8 ms without statistics, 4 ms with. Four relays: **20 → 489 events a second**. |
| R2-2 | Help page, chain editor rules and revoke-access dialog still said requests escalate. Since decision D9 they never do. | P3 | Wording corrected. The revoke dialog now says requests waiting on the person stay put until the chain is changed. |
| R2-3 | Nine moderate advisories in frontend development tooling (ESLint's `minimatch`, denial of service). They are not in the shipped bundle. | P3 | `npm audit fix` (non-breaking). Both projects now report **0 vulnerabilities**: `frontend-npm-audit-after-fix.json`, `backend-npm-audit.json`. |

## 3. Performance baseline (local)

`npm run load:baseline -- 50 400`. It runs the real HTTP server on localhost with a pool of 4 connections; fictional data includes 300 projects. Results are in `load-baseline.json`.

| Workload | Concurrency | Throughput | p50 | p95 | p99 | Errors | Provisional target (D19) |
|---|---|---|---|---|---|---|---|
| Sign-in (password, Argon2id) | 20 | 18 / s | 1,049 ms | 1,280 ms | 1,562 ms | 1 of 100 | p95 ≤ 1,500 ms: **met** |
| `GET /projects` (300 rows) | 50 | 163 / s | 303 ms | 367 ms | 380 ms | 0 | p95 ≤ 500 ms: **met** |
| `GET /search?q=highway` | 50 | 364 / s | 122 ms | 217 ms | 221 ms | 0 | p95 ≤ 500 ms: **met** |
| `POST /projects` (write) | 50 | 242 / s | 197 ms | 248 ms | 262 ms | 0 | p95 ≤ 1,000 ms: **met** |
| `GET /health/ready` | 50 | 3,739 / s | 13 ms | 19 ms | 19 ms | 0 | — |
| Outbox relay (4 relays, 1,000 events) | — | 489 events / s | — | — | — | 0 | No target until D13 |

- **The one sign-in error is the per-login rate limit doing its job.** The test signs one account in six times, and that limit answers 429.
- **No pool exhaustion:** after the run, 4 connections were idle and none were waiting. Tenant isolation under load is covered by the regression suite, not this run.
- **The figures are a local baseline.** Repeat them on staging (27-05) before comparing them with real targets.

## 4. Security checks

| Check | Result |
|---|---|
| Dependency scan | 0 vulnerabilities in both projects after the fix above |
| Secrets in logs | The evidence logs were searched for `password=`, `secret=`, private keys and `JWT_SECRET=`: none found. Redaction and safe errors are covered by `tests/core/logging`, `tests/core/db-failure` and `tests/hardening` |
| Audit masking | The audit allowlist and masking are covered by `tests/audit-log`. The event monitor never returns payload values, only field names (tested) |
| Restore drill and audit continuity | `restore-drill-acme.md`, `restore-drill-delta.md`: every table matches, the audit hash chain verifies, **no differences** |
| Tenant isolation | Tenant ID tampering and swapped IDs are tested in the identity and masters suites. Search is tested to never return another tenant's rows |
| RLS | Not applicable (decision D2: one schema per tenant) |

## 5. Not covered (blocked; carry forward)

- **Staging:** the HTTPS smoke test, load on staging, AWS security groups and IAM, the secrets store, TLS negotiation, PITR, and staging rollback all need B1.
- **The `core_app` role:** app-role versus migrator-role permission checks need B3.
- **A CI service run:** the workflows exist but can't run without a Git repository (B2).
- **Edge and a screen reader:** neither is available here.
