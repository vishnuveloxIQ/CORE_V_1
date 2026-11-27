# Operations Runbook and Support Model

| Field | Value |
|---|---|
| Document ID | DOC-09 |
| Title | Operations Runbook and Support Model |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This runbook tells an operator how to configure, start, check, maintain and troubleshoot the VeloxIQ Core API and how support and incidents are organised. It extends `CORE__BACKEND/docs/DEPLOYMENT.md` and `CORE__BACKEND/README.md` and does not replace them. Where this document and those two disagree, they win and this document needs correction.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Core backend (Node 24, Express 5, PostgreSQL 18) and the static frontend build | Other VeloxIQ modules |
| Environment configuration, migrations, tenants, first admin, backups, drills | Cloud infrastructure design (no staging or production environment exists yet, blocker B1 in `SCHEDULE-STATUS.md`) |
| Troubleshooting from real error codes | Business continuity and disaster recovery strategy (see DOC-10) |

Example names in this document (tenant `acme`, login `admin.dev`) are fictional, as in the source documents.

## 3. Environments and configuration

### 3.1 Environments

| Environment | Status (from repository) | Notes |
|---|---|---|
| Development | Available | `npm run dev` (watch mode). Dev PostgreSQL accepts any password on localhost (trust authentication, `DEFECTS.md`). |
| CI | Defined | `CORE__BACKEND/.github/workflows`, `postgres:18` service |
| Staging | Not available | Blocker B1 |
| Production | Not deployed | Release authorisation open (`RELEASE_NOTES_DRAFT.md`) |

### 3.2 Backend environment variables

Source: `CORE__BACKEND/src/config/env.ts`. Names and purposes only. The `.env` file was not opened. Values live in `.env` (git-ignored) or the platform secret store. The process refuses to start on an invalid value (`loadEnv` throws "Invalid environment: ...").

| Name | Purpose | Required | Default and rules |
|---|---|---|---|
| `NODE_ENV` | `development`, `test` or `production` | Optional (set `production` in production) | `development` |
| `HOST` | Listen address | Optional | `0.0.0.0` |
| `PORT` | Listen port | Optional | `3000` (1 to 65535) |
| `LOG_LEVEL` | pino level: fatal, error, warn, info, debug, trace, silent | Optional | `info` |
| `DATABASE_URL` | PostgreSQL connection string (`postgres://` or `postgresql://`). Never logged. | Optional in the schema, **needed in practice**: all database commands exit 1 without it | none |
| `JWT_SECRET` | Signs access tokens (HS256), at least 32 characters | **Required when `NODE_ENV=production`** | none |
| `WEBAUTHN_RP_ID` | Passkey relying-party domain | **Required in production** | localhost outside production |
| `WEBAUTHN_ORIGINS` | Comma-separated full origins for passkeys | **Required in production** | localhost outside production |
| `CORS_ORIGINS` | Comma-separated front-end origins (scheme, host, port; no path, no wildcard) allowed to call from a browser | Optional (required if a browser client calls the API directly) | Unset means no browser origin allowed. Restart after a change. |
| `SESSION_DEVICE_LIMIT` | Active sessions per user | Optional | `1` (1 to 100). A new sign-in ends the user's other session. |
| `APPROVAL_REMINDER_MINUTES` | Interval of the in-process approval reminder sweep; `0` turns it off | Optional | `15` (0 to 1440) |
| `SAMPLE_OTP_CODE` | Fixed six-digit password-reset code for non-production | Optional, **must not be set in production** (startup refuses) | `123456` in development when unset |
| `TRUST_PROXY` | Load-balancer IPs or CIDR ranges allowed to set `X-Forwarded-For` | Optional | Unset means off. A range matching every client (prefix 0) is refused. |
| `PG_BIN` | Folder with `pg_dump` and `pg_restore` (read in `src/db/backup.ts`, not in `env.ts`) | Optional | Used when the tools are not on PATH |

Command-only variables (set in the shell for one command, never in `.env`; `README.md`): `SEED_PASSWORD`, `DEV_USER_NAME`, `DEMO_LOGIN_ID`, `DEMO_PASSWORD`, `API_BASE`. Test-only: `MIGRATION_DATABASE_URL`, `APP_TEST_DATABASE_URL` (see section 5.3).

### 3.3 Frontend configuration

| Name | Purpose | Source |
|---|---|---|
| `VITE_API_BASE_URL` | API address used by the built frontend | `CORE__FRONTEND/src` (usage found by search; default behaviour To be confirmed) |
| `VITE_API_PROXY_TARGET` | Dev and preview proxy target for `/api` | `CORE__FRONTEND/vite.config.ts`; default `http://127.0.0.1:3200` |
| `VITE_SAMPLE_OTP_CODE` | Shows the sample reset code on the reset screen (testing only) | `CORE__FRONTEND/src` |

`npm run check:bundle` fails the frontend build if `dist/` contains connection strings, private keys or server-only setting names (`scripts/check-bundle.mjs`).

## 4. Build and start

| Task | Command (in `CORE__BACKEND`) | Notes |
|---|---|---|
| Install | `npm ci` (or `npm install`) | Uses the lockfile |
| Build | `npm run build` | `tsc -p tsconfig.build.json`, output `dist/` |
| Start (production) | `npm start` | `node --env-file-if-exists=.env dist/server.js` |
| Start (development) | `npm run dev` | Watch mode |
| Frontend build | `npm run build` (in `CORE__FRONTEND`) | `tsc -b && vite build`; static output in `dist/`, base `./` so it works from any sub-path |

Server behaviour (`src/server.ts`):

| Behaviour | Detail |
|---|---|
| Pool | One PostgreSQL pool from `DATABASE_URL`; connection timeout 5 seconds (`src/db/client.ts`) so an unreachable database fails requests instead of hanging |
| Reminders | Starts the approval reminder schedule when `APPROVAL_REMINDER_MINUTES` is above 0 |
| Shutdown | On SIGINT or SIGTERM: stops reminders, closes the app, ends the pool, exits 0 (exit 1 on failure) |
| Startup failure | Logs the error and exits 1 |
| Event relay | **Not started** by `server.ts`. `SCHEDULE-STATUS.md` (CORE-24-06): the relay starts only once the transport (D13) and retry values (D14) are configured; both are open. |

Production checklist: see `CORE__BACKEND/docs/DEPLOYMENT.md`, "Checklist before go-live". Key items: production variables set, `core_app` role created, migrations applied, probes wired, TLS in front of the API, `TRUST_PROXY` set or confirmed unset, first backup restored once to staging, `SAMPLE_OTP_CODE` unset.

## 5. Database provisioning and migrations

### 5.1 Commands

| Task | Command | Behaviour |
|---|---|---|
| Migrate | `npm run db:migrate` | Applies pending migrations to the global schema, then to every `tenant_<id>` schema; records each with a checksum in `core_migration`. A changed migration file is refused: never edit a migration that has run. |
| Provision a tenant | `npm run db:provision -- <tenantId>` | Creates `tenant_<tenantId>` and applies the tenant migrations. Tenant id: starts with a letter, then lowercase letters, digits or underscore, at most 40 characters. |
| Generate DB types | `npm run db:types` | Regenerates `src/db/types.generated.ts`; a test checks it matches a fresh migration |
| Refresh API snapshot | `npm run api:snapshot` | Only for a deliberate API change (DOC-08, section 6) |

Run `db:migrate` before every start that includes a new migration. The schema is forward-only: migrations are not reversed automatically (`DEPLOYMENT.md`, "Rollback").

### 5.2 Database roles

| Role | Purpose | Source |
|---|---|---|
| Owner role (example `velox_owner` in `README.md`; `velox_core` in `SCHEDULE-STATUS.md`) | Runs migrations; creates schemas and extensions | `README.md` step 2 |
| `core_app` (NOLOGIN group role) | Application least privilege: read and write rows in tenant tables; no schema or privilege changes; no UPDATE, DELETE or TRUNCATE on `audit_row_change`; read on `shared.uom` | `scripts/admin/create-core-app-role.sql`, `grant-core-app-tables.sql` |
| Application login role | A login that is a member of `core_app` (`GRANT core_app TO <login_role>`) | `create-core-app-role.sql` header |

Administrator procedure, once per environment, as a superuser (never the migration owner):

| Step | Action |
|---|---|
| 1 | Run `scripts/admin/create-core-app-role.sql` (safe to repeat) |
| 2 | Grant `core_app` to the application login role |
| 3 | Run `scripts/admin/grant-core-app-tables.sql` (safe to repeat; fails with a clear message if `core_app` does not exist). Review the lines marked DECIDE before go-live. |
| 4 | Point the application's `DATABASE_URL` at the application login role |
| 5 | Re-run step 3 after provisioning new tenants so their tables get grants (the script also sets default privileges for tables the owner creates later) |

Status: the role does not yet exist on the development server (blocker B3). Until then one role runs both migrations and the application.

### 5.3 MIGRATION_DATABASE_URL versus DATABASE_URL

| Variable | Used by | Finding |
|---|---|---|
| `DATABASE_URL` | The API, `db:migrate`, `db:provision`, `db:backup`, `db:restore`, `db:drill`, `access:grant`, `approvals:remind` (each CLI reads `env.DATABASE_URL`) | In production this is the application login (`core_app` member) per `DEPLOYMENT.md` |
| `MIGRATION_DATABASE_URL` | Test harness only (`tests/db/helpers.ts`, `tests/db/migrate.test.ts`): preferred owner connection with `DATABASE_URL` as fallback | The `db:migrate` CLI (`src/db/cli.ts`) reads only `DATABASE_URL`. It is not in `env.ts`. |

Consequence to confirm: with the least-privilege model, `db:migrate`, `db:provision`, `db:backup`, `db:restore` and `db:drill` need the owner role (schema changes, `CREATE DATABASE` for the drill), so the operator must run those commands with `DATABASE_URL` pointing at the owner, and run the API with `DATABASE_URL` pointing at the application login. Whether a separate migrator variable should be added to the CLI is To be confirmed (the migrator-versus-app role rehearsal, CORE-28-07, is blocked on B3).

## 6. Tenant onboarding

| Step | Action | Notes |
|---|---|---|
| 1 | Choose a tenant id (lowercase, start with a letter, at most 40 characters) | The id is sent as `X-Tenant-Id` on `/auth/login` and `/auth/refresh`; other routes read the tenant from the token |
| 2 | `npm run db:provision -- <tenantId>` (owner role) | Creates `tenant_<tenantId>` |
| 3 | Grant `core_app` table rights if the role exists: re-run `grant-core-app-tables.sql` | Section 5.2 |
| 4 | Bootstrap the first administrator (section 7) | |
| 5 | Sign in and create the company profile; set up policies, using the standard templates the screen offers | A new company can create all six policies from templates (D24, `DEFECTS.md`) |
| 6 | Create users: login id is the company prefix plus 4 digits; a temporary password is shown once and `mustChangePassword` applies | `UAT_SCRIPTS.md` U3.1; `docs/REGRESSION.md` |
| 7 | Take a first backup and run a drill (section 10) | |
| 8 | Reference data: `shared.uom` belongs to Platform Administration; do not load demo rows into a shared environment | `README.md` section 7 |

## 7. First-administrator bootstrap

| Command | Environment | Behaviour |
|---|---|---|
| `SEED_PASSWORD=... npm run dev:seed-user -- <tenantId> <loginId> [privilege]` | **Development only** | Refused when `NODE_ENV=production` (`src/db/dev-user.ts`). The password is read from `SEED_PASSWORD` (at least 12 characters per `README.md`) and never printed. Unset the variable afterwards. |
| `npm run access:grant -- <tenantId> <loginId> <privilege>` | Operator use, any environment | Grants one privilege and writes an audit row. Used once to create the first `access.manage` holder. |

Privileges used by the API (`README.md`): `access.manage`, `projects.manage`, `organisation.manage`, `masters.manage`, `policies.manage`, `approvals.manage`, `records.manage`. Read routes need only a signed-in user.

How the first production administrator is created, given that `dev:seed-user` is refused there, is To be confirmed (Open item 3).

## 8. Health checks and monitoring

| Check | Request | Healthy | Unhealthy |
|---|---|---|---|
| Liveness | `GET /health` | 200 `{status: ok}` | Process down |
| Readiness | `GET /health/ready` | 200 when every check passes (database check runs `SELECT 1`) | 503; error text is never returned; a warning with the check name is logged |
| Logs | pino JSON on stdout | Each line carries the request id | Authorization headers, tokens, password and PIN hashes, connection strings are redacted |
| Request trace | `X-Request-Id` response header | Present on every response; a client may send its own (8 to 64 letters, digits, dots, underscores, hyphens) | A user-quoted id leads to the logs |
| Event monitor | `GET /integration-events`, `/integration-events/summary` (needs `access.manage`) | Counts by status | Dead-lettered events logged as "event dead-lettered" (`src/core/relay.ts`) |
| Audit integrity | `verifyAuditChain` (`src/core/audit.ts`), run inside the restore drill | `brokenAt: null` | `brokenAt` holds the first bad row id |

Point the load balancer at readiness and the orchestrator restart check at liveness (`DEPLOYMENT.md`). Probes are exempt from the rate limit. Alert thresholds, dashboards and the monitoring tool are To be confirmed (alerts need staging, CORE-27-07).

Local performance baseline (`evidence/regression-2-2026-11-22/README.md`, not staging): readiness 3,739 requests per second, p95 19 ms at concurrency 50.

## 9. Scheduled jobs

| Job | Command or mechanism | Frequency | Notes |
|---|---|---|---|
| Approval reminders (in process) | Started by `server.ts` | Every `APPROVAL_REMINDER_MINUTES` (default 15) | Several instances are safe: each request is locked (`SKIP LOCKED`) while reminded. Requests are reminded, never escalated (decision D9). |
| Approval reminders (external) | `npm run approvals:remind` | From a scheduler such as cron; set `APPROVAL_REMINDER_MINUTES=0` so the in-process sweep is off | One sweep across every tenant; prints `<tenant>: <n> reminder(s)` |
| Rate-limit window sweep | Automatic | About one hit in a hundred | Expired windows in `public.core_rate_limit_window` |
| Idempotency record expiry | Records replay for 24 hours | n/a | `DEPLOYMENT.md` |
| Tenant backups | `npm run db:backup` from a scheduler | Daily proposed in decision D20 (provisional) | Scheduler not defined in the repository: To be confirmed |
| Global-schema backup | `pg_dump --format=custom` of the database | Same schedule | `DEPLOYMENT.md` |
| Restore drill | `npm run db:drill -- <tenantId>` | Monthly per tenant and after schema or tooling changes (`DEPLOYMENT.md`) | Exits 1 on failure so a scheduler can alert |
| Outbox relay | Not scheduled | n/a | See section 4 |

## 10. Backup and restore commands

Full design and results are in DOC-10. Summary of commands:

| Task | Command | Notes |
|---|---|---|
| Backup one tenant | `npm run db:backup -- <tenantId> <file>` | `pg_dump --format=custom --schema=tenant_<id>`. Password travels in `PGPASSWORD`, not on the command line. |
| Restore one tenant | `npm run db:restore -- <tenantId> <file> --replace` | Without `--replace` it refuses and changes nothing. Creates the schema first if missing, so it works on a fresh server. Uses `pg_restore --clean --schema=...`. |
| Backup global data | `pg_dump --format=custom` of the whole database | Needed because a tenant dump excludes `shared` data (tenant rows reference `shared.uom`) |
| Drill | `npm run db:drill -- <tenantId> [--report <file.md>] [--keep-dump]` | Source is only read; needs the right to create databases |

Handling rules: backup files contain personal and tenant data; encrypt at rest, keep outside the repository and build folders, restrict access. `pg_dump` and `pg_restore` must match or exceed the server version (PostgreSQL 18); set `PG_BIN` if they are not on PATH.

## 11. Routine tasks

| Frequency | Task | Source |
|---|---|---|
| Per release | `npm run ci` in both projects; regression scripts; `db:migrate`; drill on the release schema | `package.json`, `REGRESSION.md` |
| Per release | Check `core_migration` checksums match the release | `DEPLOYMENT.md` |
| Daily (proposed by D20, provisional) | Tenant and global backups | `SCHEDULE-STATUS.md` D20 |
| Monthly | Restore drill per tenant; keep reports in `CORE__BACKEND/docs/restore-drills/` | `DEPLOYMENT.md` |
| After adding a tenant | Re-apply table grants to `core_app` | Section 5.2 |
| After changing `CORS_ORIGINS`, `TRUST_PROXY` or other settings | Restart the API (settings are read at startup) | `DEPLOYMENT.md` |
| Periodically | Review and revoke old sessions on the Devices page; remove test accounts and leftover `velox_test_*` databases in non-production | `DEFECTS.md` |
| Periodically | `npm audit` in both projects | `evidence/regression-2-2026-11-22` |
| Retention | Audit and approval requests 8 years; sign-in and access history 1 year; idempotency 24 hours (provisional, confirm with legal, D21) | `SCHEDULE-STATUS.md` |

## 12. Troubleshooting

Codes are taken from `src/**` (`AppError(...)`) and `CORE__FRONTEND/src/shared/lib/api.ts`. Rate-limit values are from `src/plugins/rate-limit.ts` and `src/modules/auth/routes.ts`.

| Symptom | Likely cause | Check | Fix |
|---|---|---|---|
| `/health/ready` returns 503 | PostgreSQL unreachable or wrong credentials; 5-second connect timeout | Logs for "readiness check failed"; connect with `psql` using the same host | Restore database access; correct `DATABASE_URL` |
| Process exits at start with "Invalid environment" | Missing or malformed variable | Message names the variable (for example `JWT_SECRET: is required when NODE_ENV is production`) | Fix the variable. Production also needs `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS`, and must not set `SAMPLE_OTP_CODE`. |
| `DATABASE_URL is not set` from a CLI | `.env` missing | `.env` present beside `package.json` | Copy `.env.example`, set the variable |
| 429 `RATE_LIMITED` with `Retry-After` | Over 600 requests per minute per client address; or login limits: 100 per IP and 10 per login id per window; password reset request 20 per IP and 3 per login id | `Retry-After` header; whether many users share one address behind a proxy | Wait. If all users appear as one address, set `TRUST_PROXY` to the load-balancer addresses. |
| Login `AUTH_INVALID_CREDENTIALS` | Wrong tenant, login id or password; or account locked after 5 failed sign-ins for 15 minutes (`MAX_FAILED_LOGINS`, `LOCKOUT_MS`) | `X-Tenant-Id`; access history | Correct input; wait out the lock |
| 400 on login: `X-Tenant-Id` required | Header missing on `/auth/login` or `/auth/refresh` | Client request | Send `X-Tenant-Id` |
| User kicked out: `SESSION_REPLACED` (401 on refresh) | The same user signed in elsewhere; `SESSION_DEVICE_LIMIT` is 1 so the earlier session ended (`session_limit_revoked` in access history) | Access history; `SESSION_DEVICE_LIMIT` | Expected behaviour. Sign in again. Raise the limit only by a recorded decision. |
| "You have been signed out" (`SESSION_ENDED`, frontend) | Session ended or was revoked from another device | Devices page | Sign in again |
| Refresh token reuse: all of a user's sessions end | A rotated refresh token was presented again, treated as theft | Access history | User signs in again; investigate if unexpected |
| 409 `VERSION_CONFLICT` | Another user changed the record; stale `rowVersion` | Re-read the row | Reload, reapply the change with the new `rowVersion` |
| 400 `VERSION_REQUIRED` or `VALIDATION_ERROR` on PATCH | `rowVersion` missing, or invalid body | Request body | Send the current `rowVersion` |
| 400 `IDEMPOTENCY_KEY_REQUIRED` | POST or PATCH without `Idempotency-Key` | Request headers | Send a unique key per write |
| 409 `IDEMPOTENCY_KEY_REUSED` | Same key with a different body | Client key generation | New key for a new write; reuse only when retrying the same write |
| 403 `ACCESS_DENIED` | User lacks the privilege | User's privileges | Grant via the Users screen or `npm run access:grant` |
| 403 `PASSWORD_CHANGE_REQUIRED` | Temporary password not yet changed | `mustChangePassword` | User changes password |
| 401 `STEP_UP_REQUIRED`, 409 `STEP_UP_NO_PASSKEY`, 401 `STEP_UP_FAILED` | Sensitive action needs step-up; user has no passkey or failed the check | Passkeys of the user | User adds a passkey or retries |
| 503 `OTP_DELIVERY_UNAVAILABLE` on password reset | No email provider (decision D10) | Environment is production or no sample code | Administrator resets the password; provider To be confirmed |
| Frontend shows `NETWORK_ERROR` ("Cannot reach the server") | Browser cannot reach the API: API down, TLS or DNS fault, or CORS | Browser network tab; `/health`; `CORS_ORIGINS` contains the front-end origin | Restore the API; fix `CORS_ORIGINS` and restart |
| Browser blocks calls with a CORS error | Origin not listed | `CORS_ORIGINS` | Add the exact origin (no path or trailing slash); restart |
| Upload refused (`UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`) | File type and size are checked as the request arrives, before the token (`docs/REGRESSION.md`) | File type and size | Use an allowed type and size |
| 500 `INTERNAL_ERROR` | Unhandled error (`src/core/error-handler.ts`) | Logs by `X-Request-Id` | Escalate with the request id |
| `db:provision` or `db:migrate` fails on permissions | Role cannot create schemas or extensions | Role in use | Use the owner role |
| Migration refused | A migration file changed after it ran (checksum mismatch) | `core_migration` | Restore the original file; add a new migration instead |
| `pg_dump` or `pg_restore` was not found | Not on PATH | `PG_BIN` | Set `PG_BIN` or install version 18 client tools |
| Restore says tenant schema missing | Old behaviour (D13), fixed | Version of `src/db/backup.ts` | Use the current code |
| Drill reports differences | Source changed during the drill, or a restore problem | Report "Differences" section | Re-run; if it persists, treat as a backup fault and escalate (DOC-10) |
| Tests or CI database cleanup times out | A background process still attached | `tests/db/helpers.ts` retries drop | Re-run; see D5 and D23 |
| Dashboard counters show 0 | Stale dev modules (D3, D4 not reproduced) | Hard reload | Reload the page |

## 13. Incident severity matrix and escalation model (Proposed)

Nothing in the repository defines incident severities, response times, on-call, or contacts. The model below is **Proposed**; all times, names and channels are To be confirmed.

| Severity | Definition | Examples | Response target | Update cadence |
|---|---|---|---|---|
| SEV1 | Core unavailable for all tenants, confirmed data loss or corruption, tenant isolation breach, credential compromise | Database down; audit chain broken; leaked `JWT_SECRET` | To be confirmed | To be confirmed |
| SEV2 | Major function unavailable for one tenant or degraded for all | One tenant schema failing; approvals not decided; login failing for a tenant | To be confirmed | To be confirmed |
| SEV3 | Function impaired with a workaround | Reminders not sent; event monitor unavailable; slow pages | To be confirmed | To be confirmed |
| SEV4 | Minor, cosmetic or a question | Wording, one user's access | To be confirmed | To be confirmed |

| Level | Role | Holder |
|---|---|---|
| L1 | Service desk: logs the ticket, checks section 12, collects `X-Request-Id`, tenant, user, time | To be confirmed |
| L2 | Operations: health checks, logs, restarts, restore from backup, tenant provisioning | To be confirmed |
| L3 | Engineering: code defects, migrations, data repair | To be confirmed |
| Incident commander (SEV1, SEV2) | Coordinates and decides | To be confirmed |
| Communications lead | Notifies stakeholders and tenants (see DOC-10, section 10) | To be confirmed |
| Business owner | Approves recovery decisions and downtime | To be confirmed |

Escalation: L1 to L2 when section 12 does not resolve it or severity is SEV2 or higher; L2 to L3 for code, migration or data faults; SEV1 pages the incident commander at once. Security incidents: contact point To be confirmed.

## 14. Support model outline (Proposed)

| Element | Outline | Status |
|---|---|---|
| Channels | Ticketing system, email, phone | To be confirmed |
| Hours of cover | Business hours or 24x7 | To be confirmed |
| Service levels | Availability target, response and resolution times | To be confirmed. The only figures in the repository are provisional performance targets (D19: p95 reads 500 ms, writes 1,000 ms, sign-in 1,500 ms, error rate below 1%) and recovery objectives (D20: RTO 4 hours, RPO 15 minutes), both provisional and not agreed |
| Ticket data | Tenant id, login id, time, `X-Request-Id`, screenshot, steps | Proposed. Never request passwords, tokens or connection strings. |
| Self-service | Devices page (revoke sessions), password change, passkeys | Exists in the application |
| Admin support tasks | Unlock waits 15 minutes; grant or suspend access; revoke sessions; password reset by administrator | Exists (`access.manage`) |
| Change management | Release notes, migrations, API changes through the lock process | See DOC-11 for release and change management |
| Knowledge base | This runbook, `DEPLOYMENT.md`, `README.md`, `UAT_SCRIPTS.md` | Exists |
| Vendor and third-party support | Hosting, email provider, database vendor | To be confirmed |

## 15. Open items

| # | Item | Status |
|---|---|---|
| 1 | Runbook owner, L1, L2, L3, incident commander, on-call roster, contacts | To be confirmed |
| 2 | Hosting platform, orchestrator, load balancer, secret store, monitoring tool | To be confirmed (blocker B1) |
| 3 | How the first production administrator is created (`dev:seed-user` is refused in production; `access:grant` needs an existing user) | To be confirmed |
| 4 | Whether the migration CLI should read a separate owner variable; which role runs each CLI | To be confirmed (B3) |
| 5 | Backup scheduler, retention, encryption and storage location | To be confirmed |
| 6 | Email provider for password reset (decision D10) | To be confirmed |
| 7 | Event transport, retry values and when the relay starts (D13, D14) | To be confirmed |
| 8 | Incident severity times, support hours, service levels | To be confirmed |
| 9 | Alert thresholds and dashboards | To be confirmed |
| 10 | Frontend hosting and the default value of `VITE_API_BASE_URL` | To be confirmed |

## 16. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft from repository review |
