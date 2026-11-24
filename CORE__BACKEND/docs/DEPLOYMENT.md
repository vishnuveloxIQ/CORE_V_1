# Deployment notes

Audience: the operator who deploys and runs the Core API. Example names are fictional.

## Before the first start

1. Build with `npm ci` then `npm run build`. Start with `npm start`, which runs `dist/server.js`.
2. Set the environment variables listed in the [README](../README.md). In production these are required: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (at least 32 random characters, stored in the secret store), `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` (the HTTPS origin the front end is served from).
3. An administrator runs `scripts/admin/create-core-app-role.sql` once, as a superuser. The application's `DATABASE_URL` should use that role, not the owner role. (The role is still an open Phase 2 item; confirm it has been run before go-live.)
4. Run `npm run db:migrate` before every start that includes a new migration. It applies pending migrations to the global schema and to every tenant schema, and records each one with its checksum in `core_migration`. A changed migration file is refused, so do not edit a migration that has run.
5. Provision each new tenant with `npm run db:provision -- <tenantId>`.

## Probes

- Liveness: `GET /health` returns 200 while the process is up.
- Readiness: `GET /health/ready` returns 200 only when every check passes (the database check runs `SELECT 1`). It returns 503 otherwise. Error text from checks is never returned.

Point the load balancer at readiness and the orchestrator's restart check at liveness.

## HTTP behaviour

- Every response carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Cross-Origin-Resource-Policy` and `Cache-Control: no-store`. In production it also sends `Strict-Transport-Security`. TLS must terminate in front of the API.
- Global limit: 600 requests per minute per client address. Login and password reset have tighter limits. The counts are kept in `public.core_rate_limit_window` (migration 0002), so every instance shares them. Probes are exempt. Requests over the limit get 429 with `Retry-After`. Expired windows are swept on about one hit in a hundred.
- The client address is the socket address unless `TRUST_PROXY` is set. Set it to the load balancer's IP addresses or CIDR ranges (comma-separated). Only requests arriving from those addresses have their `X-Forwarded-For` header read. Leave it unset when nothing sits in front of the API. Ranges that would match every client (prefix 0) are refused at startup.
- `GET /openapi.json` describes the API. It needs no token and can be published to front-end developers. It does not expose secrets.
- Browser access: `CORS_ORIGINS` lists the front-end origins allowed to call the API from a browser. Only those origins get `Access-Control-Allow-Origin`, and preflight answers 204 with the allowed methods and headers (`Authorization`, `Content-Type`, `Idempotency-Key`, `X-Request-Id`, `X-Step-Up-Token`, `X-Tenant-Id`). The browser may read `X-Request-Id` and `Retry-After` from responses. Requests carry bearer tokens, not cookies, so credentials are not allowed. Unset means no browser origin is allowed. Restart after changing the list.
- Request IDs: every response carries `X-Request-Id`. A client may send its own (8 to 64 letters, digits, dots, underscores or hyphens); anything else is replaced by the server's. The ID is in every log line of the request, so a reference a user quotes leads to the logs.
- Password reset: until an email provider is chosen (decision D10), a non-production server accepts the fixed sample code in `SAMPLE_OTP_CODE` (123456 in development when unset) and sends nothing. Production refuses to start with `SAMPLE_OTP_CODE` set, and `POST /auth/password-reset/request` answers 503 until a provider is wired in.
- Approval reminders (decision D9): requests are never escalated. Every `APPROVAL_REMINDER_MINUTES` (default 15) the server reminds the person a request waits on once its current level's time has passed since it was raised, last acted on or last reminded. Several instances may run it safely (each request is locked while reminded). Set it to 0 to turn the in-process sweep off and run `npm run approvals:remind` from a scheduler instead.
- Idempotency: every POST and PATCH on the module routes must send an `Idempotency-Key` header (1 to 255 characters, unique per write). A missing or blank key answers 400 `IDEMPOTENCY_KEY_REQUIRED`. A repeat with the same key and the same body replays the first response for 24 hours, without running the write again. The same key with a different body answers 409 `IDEMPOTENCY_KEY_REUSED`. Clients should generate a new key for each new write and reuse the same key only when retrying that write. The auth routes (`/auth/...`) and `POST /offline-operations` take no key; DELETE routes are unchanged.

## Logs

Logs are JSON from pino. Authorization headers, tokens, password and PIN hashes and connection strings are redacted. Do not add request bodies to logs.

## Backups

Each tenant has its own schema, so backups are per tenant.

- Backup: `npm run db:backup -- <tenantId> <file>` writes a custom-format dump of `tenant_<tenantId>` only.
- Restore: `npm run db:restore -- <tenantId> <file> --replace`. This replaces the tenant's objects with the dump's contents. Without `--replace` the command refuses and changes nothing. Restore into a staging database first, check the row counts, then restore into production during a maintenance window. The command creates the tenant schema first when it does not exist, so it also works on a fresh server.
- The global schema is not in a tenant backup. Back it up with a whole-database dump, `pg_dump --format=custom` on the database, on the same schedule. On a fresh server, apply the global migrations (`npm run db:migrate`) and restore the `shared` schema data before any tenant: tenant materials, allocations and plan lines reference `shared.uom`.
- A backup file contains personal and tenant data. Encrypt it at rest, keep it outside the repository and the build folders, and restrict who can read it.
- Test a restore on a schedule. A backup that has not been restored is not known to work.

### Restore drill

`npm run db:drill -- <tenantId> [--report <file.md>] [--keep-dump]` proves that a tenant can be restored, without touching it:

1. It fingerprints the source tenant (every table's row count and a content checksum) and checks its audit hash chain.
2. It dumps the `shared` reference data and the tenant schema, with the same tools as `db:backup`.
3. It creates a scratch database, applies the global migrations, restores the shared data, then the tenant, using `restoreTenant`.
4. It compares the restored copy table by table and checks the restored audit chain.
5. It drops the scratch database and deletes the dump files, then prints the result and the time of each step.

The source database is only read. The database user needs the right to create databases. The command exits with 1 when the drill fails, so a scheduler can alert on it. The report holds counts and timings only, no data and no connection details. Run it monthly for each tenant, and after any change to the schema or the backup tooling, and keep the reports (for example in `docs/restore-drills/`). The restore time it reports is the measured recovery time for that tenant's size.
- `pg_dump` and `pg_restore` must match or exceed the server version (PostgreSQL 18). Set `PG_BIN` if they are not on PATH.

## Rollback

- Code: redeploy the previous build. Migrations are not reversed automatically; the schema is forward-only.
- Data: restore the affected tenant from the backup taken before the change, with `db:restore ... --replace`.
- Do not drop a tenant schema to roll back. Audit rows are append-only and their hash chain is checked with `verifyAuditChain`; deleting a schema removes that evidence.

## Checklist before go-live

- [ ] Production variables set; `JWT_SECRET` not shared with any other system
- [ ] `core_app` role created by an administrator; the application does not use the owner role
- [ ] Migrations applied; `core_migration` checksums match the release
- [ ] Readiness and liveness probes wired; TLS in front of the API
- [ ] `TRUST_PROXY` set to the load balancer addresses, or confirmed unset because nothing is in front of the API (the proxy address range comes from operations)
- [ ] First backup taken and restored once to staging
- [ ] `SAMPLE_OTP_CODE` unset, and an email provider wired in for password reset (or reset accepted as unavailable)
- [ ] `/openapi.json` reviewed for anything that should not be public
- [ ] `CORS_ORIGINS` set to the front-end origins that call the API from a browser (or confirmed unset if no browser client exists)
