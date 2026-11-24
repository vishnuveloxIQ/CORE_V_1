# VeloxIQ Core backend

The Core API for VeloxIQ: tenants, users and access, organisation and project masters, approvals, policies, records and audit. Other VeloxIQ modules call this API; this repository covers Core only.

## Stack

- Node.js 24 LTS, TypeScript 5 (strict, ESM)
- Express 5 for HTTP, behind a thin layer in `src/http/app.ts` (route options, hooks, body limits, `inject` for tests); Zod for request validation, pino for logs
- PostgreSQL 18. One schema per tenant (`tenant_<id>`), with a global schema for shared data
- Drizzle ORM on `pg`; tenant queries run in a transaction that sets `search_path`
- JWT access tokens (HS256) and rotating refresh tokens; argon2id for passwords and PINs; OTP and passkeys (WebAuthn)
- Vitest with `app.inject` (light-my-request), ESLint (flat config) and Prettier

## Prerequisites

| Tool       | Version                  | Notes                                                                                   |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------- |
| Node.js    | 24 LTS (24.x)            | `node -v` must print `v24`. `package.json` declares `>=24`; older Node versions are not supported. |
| npm        | 12.x (ships with Node)   | Used with the committed `package-lock.json`.                                            |
| PostgreSQL | 18                       | Local server on `127.0.0.1:5432`. `psql` is useful for the one-time database setup.     |
| Git        | any recent               | Optional. The repository has no remote configured by this guide.                        |

On Windows, if `pg_dump` and `pg_restore` are not on `PATH`, set `PG_BIN` (see the environment table) to the folder that holds them. The database backup commands need them; the API does not.

## 1. Install dependencies

```powershell
cd C:\VELOX_IQ\CORE\CORE__BACKEND
npm install
```

`npm install` uses `package-lock.json`, so every machine gets the same versions.

## 2. Create the database

Run these as a PostgreSQL superuser (for example `postgres`) once per machine. Replace the placeholder values; do not commit real passwords.

```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -c "CREATE ROLE velox_owner LOGIN PASSWORD '<choose-a-password>';"
psql -h 127.0.0.1 -p 5432 -U postgres -c "CREATE DATABASE velox_core OWNER velox_owner;"
```

The owner role runs the migrations, so it needs rights to create schemas and extensions. A local superuser is the simplest choice for development. Production uses a separate, least-privilege `core_app` role; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 3. Configure the environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL=postgres://velox_owner:<choose-a-password>@127.0.0.1:5432/velox_core`
- `JWT_SECRET` to a random string of 32 or more characters (required in production; a local value is fine for development)

`.env` is git-ignored. Never commit it, and never paste its values into tickets or chat. The full list of variable names is in [Environment variables](#environment-variables).

## 4. Apply migrations and create a tenant

```powershell
npm run db:migrate
npm run db:provision -- acme
```

- `db:migrate` applies the global migrations once, then applies the tenant migrations to every existing `tenant_<id>` schema.
- `db:provision -- acme` creates the schema `tenant_acme` and applies the tenant migrations to it. Use a short lowercase id: it starts with a letter, then lowercase letters, digits or underscores, up to 40 characters. The tenant id is sent by clients in the `X-Tenant-Id` header on login.

## 5. Create the first user and grant access

The first user is created with a development command. It is refused when `NODE_ENV` is `production`. The password is read from `SEED_PASSWORD` and is never printed.

```powershell
$env:SEED_PASSWORD = '<choose-a-password-of-at-least-12-characters>'
npm run dev:seed-user -- acme admin.dev access.manage
Remove-Item Env:SEED_PASSWORD
```

Then grant the privileges the rest of the API needs. Each call grants one privilege:

```powershell
npm run access:grant -- acme admin.dev projects.manage
npm run access:grant -- acme admin.dev organisation.manage
npm run access:grant -- acme admin.dev masters.manage
npm run access:grant -- acme admin.dev policies.manage
npm run access:grant -- acme admin.dev approvals.manage
npm run access:grant -- acme admin.dev records.manage
```

Privileges used by the API: `access.manage`, `projects.manage`, `organisation.manage`, `masters.manage`, `policies.manage`, `approvals.manage`, `records.manage`. Read routes need only a signed-in user.

## 6. Start the API

```powershell
npm run dev
```

The API listens on `PORT` (default `3000`) and reloads on file changes. Check it from a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

`/health` answers when the process is up. `/health/ready` also checks the database, so it answers `503` when PostgreSQL is unreachable.

Sign in and call a protected route:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/auth/login `
  -Headers @{ 'X-Tenant-Id' = 'acme' } -ContentType 'application/json' `
  -Body '{"loginId":"admin.dev","password":"<the password you chose in step 5>"}'
Invoke-RestMethod http://127.0.0.1:3000/projects -Headers @{ Authorization = "Bearer $($login.data.accessToken)" }
```

The login response carries `accessToken` and `refreshToken`. Writes need an `Idempotency-Key` header (any unique text, up to 255 characters). PATCH bodies need the `rowVersion` read from the row. The full API description is at `GET /openapi.json`.

## 7. Load demo data (optional, local only)

The demo loader creates a set of master data for one tenant through the running API, so every row passes the real validation: company profile, holiday, shift, department and position, a project with a location, store, WBS node, chainage marker, geo zone and milestone, vendor, material, equipment type, allocations, plan lines, a policy with a version and rule, a leave type, an overtime policy, an approval chain with a level, and a few records. It also adds the dev reference rows for `shared.uom` (NOS, KG, M, LTR, HR).

```powershell
$env:DATABASE_URL = 'postgres://velox_owner:<choose-a-password>@127.0.0.1:5432/velox_core'
$env:DEMO_LOGIN_ID = 'admin.dev'
$env:DEMO_PASSWORD = '<the password you chose in step 5>'
npm run demo:load -- acme http://127.0.0.1:3000
Remove-Item Env:DEMO_PASSWORD
```

- The API must be running and the user needs the privileges from step 5.
- It is safe to re-run. Each row is looked up first and reused when it already exists.
- `shared.uom` belongs to Platform Administration. The loader writes those five rows only because this is a local database; do not run it against a shared environment.
- It does not publish the approval matrix and does not raise approval requests.

## Environment variables

Names only; values belong in `.env` or the platform's secret store.

| Name               | Purpose                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development`, `test` or `production`                                                                                                                             |
| `HOST`, `PORT`     | Listen address (default `0.0.0.0`, `3000`)                                                                                                                        |
| `LOG_LEVEL`        | pino level (default `info`)                                                                                                                                       |
| `DATABASE_URL`     | PostgreSQL connection string. Never logged.                                                                                                                       |
| `JWT_SECRET`       | Signs access tokens. At least 32 characters. Required in production.                                                                                              |
| `WEBAUTHN_RP_ID`   | Passkey relying party (bare domain). Required in production.                                                                                                      |
| `SESSION_DEVICE_LIMIT` | Active sessions per user. Default 1: a new sign-in signs out the user's other session (owner decision). |
| `WEBAUTHN_ORIGINS` | Comma-separated origins for passkeys. Required in production.                                                                                                     |
| `CORS_ORIGINS`     | Comma-separated front-end origins allowed to call the API from a browser (scheme, host and port, no path). No wildcard. Unset means no browser origin is allowed. |
| `TRUST_PROXY`      | Comma-separated load balancer IPs or CIDR ranges allowed to set `X-Forwarded-For`. Unset means off.                                                               |
| `PG_BIN`           | Folder holding `pg_dump` and `pg_restore`, if they are not on PATH (backup only)                                                                                  |

Command-only variables (set them in the shell for one command, never in `.env`): `SEED_PASSWORD`, `DEV_USER_NAME` (optional), `DEMO_LOGIN_ID`, `DEMO_PASSWORD`, `API_BASE` (optional).

## Commands

| Command                                                                       | What it does                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm install`                                                                 | Install the locked dependencies                                                              |
| `npm run dev`                                                                 | Start in watch mode                                                                          |
| `npm run build` then `npm start`                                              | Production build and start                                                                   |
| `npm run db:migrate`                                                          | Apply pending migrations everywhere                                                          |
| `npm run db:provision -- <tenantId>`                                          | Create `tenant_<tenantId>` and apply the tenant migration                                    |
| `npm run db:backup -- <tenantId> <file>`                                      | Dump one tenant schema (custom format)                                                       |
| `npm run db:restore -- <tenantId> <file> --replace`                           | Restore one tenant schema. Replaces its objects.                                             |
| `npm run access:grant -- <tenantId> <loginId> <privilege>`                    | Grant a privilege to a user (operator use)                                                   |
| `SEED_PASSWORD=... npm run dev:seed-user -- <tenantId> <loginId> [privilege]` | Create a local test user, optionally with a privilege. Refused in production.                |
| `DEMO_LOGIN_ID=... DEMO_PASSWORD=... npm run demo:load -- <tenantId> [apiUrl]` | Load demo master data through the API. Local only; safe to re-run.                           |
| `npm test`                                                                    | Run the test suite                                                                           |
| `npm run typecheck`, `npm run lint`, `npm run format:check`                   | Static checks                                                                                |

## Tests

Database tests create a fresh PostgreSQL database for each test file and drop it afterwards. They read `DATABASE_URL` from `.env.test` (git-ignored). Without it, the database tests are skipped and the rest still run. Create `.env.test` with a `DATABASE_URL` for a role that can create databases. The full suite is run with:

```powershell
npx vitest run --maxWorkers=4
```

## Production

1. Set `NODE_ENV=production`, `JWT_SECRET`, `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS`, and `CORS_ORIGINS` for the front ends that call the API.
2. Have an administrator run [scripts/admin/create-core-app-role.sql](scripts/admin/create-core-app-role.sql) and point the application at a login role that is a member of `core_app`.
3. Run `npm run build`, then `npm run db:migrate`, then `npm start`.
4. Probes: `/health` for liveness and `/health/ready` for readiness.

The dev user, access and demo commands refuse production or are not meant for it. The full checklist is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Troubleshooting

| Symptom                                                              | Likely cause and fix                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL is not set` from a db or dev command                   | `.env` is missing or has no `DATABASE_URL`. Copy `.env.example` (step 3).                                                                 |
| `/health/ready` returns 503                                          | PostgreSQL is not running on the address in `DATABASE_URL`, or the password is wrong.                                                      |
| Login returns `AUTH_INVALID_CREDENTIALS`                             | Wrong tenant in `X-Tenant-Id`, wrong login id or password, or the account is suspended or locked after repeated failures.                  |
| Login returns 400 `X-Tenant-Id header is required`                   | Send `X-Tenant-Id: <tenant>` on `/auth/login` and `/auth/refresh`. Other routes read the tenant from the token.                             |
| `403 ACCESS_DENIED` on a write                                       | The user lacks the privilege for that module. Grant it with `npm run access:grant` (step 5).                                               |
| `400 Idempotency-Key header is required`                             | Send an `Idempotency-Key` header on every POST and PATCH.                                                                                  |
| `409 IDEMPOTENCY_KEY_REUSED`                                         | The same key was sent with a different body. Use a new key for a new request.                                                              |
| PATCH returns 400 for `rowVersion`                                   | Read the row first and send its current `rowVersion` in the body.                                                                          |
| `db:provision` or `db:migrate` fails on permissions                  | The owner role cannot create schemas or extensions. Use a role with those rights for local setup.                                          |
| Port 3000 is in use                                                  | Another process holds the port. Set `PORT` in `.env` or stop the other process.                                                            |

## Environment and conventions

- Tables are `core_*`, `integ_*` and `audit_row_change`. Columns are snake_case; the repo layer maps them to camelCase.
- No `tenant_id` on business tables. The tenant comes from the verified token.
- Errors use one envelope: `{ error: { code, message, details? } }`. Success uses `{ data, meta? }`.
- Secrets, password and PIN hashes, tokens and bank or tax identifiers are never logged or returned.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deployment checklist, probes, backups and rollback
- [PROGRESS.md](PROGRESS.md): phase log, design decisions and open points
- `Core_Database_Handoff.md`: the schema source of truth (read by section)
