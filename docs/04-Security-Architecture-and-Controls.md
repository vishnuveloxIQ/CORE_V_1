# Security Architecture and Controls

| Field | Value |
|---|---|
| Document ID | DOC-04 |
| Title | Security Architecture and Controls (VeloxIQ Core) |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Confidential |

## 1. Purpose

Describe the security architecture of VeloxIQ Core as implemented in the repository, catalogue each implemented control with a file reference, record a STRIDE threat model, give an indicative mapping to OWASP ASVS and ISO/IEC 27001, and list enterprise-level controls that the code does not show.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Backend `CORE__BACKEND` (Node 24, TypeScript, Express 5, PostgreSQL 18, schema-per-tenant) | Hosting, network, TLS termination, WAF, load balancer (not in repository) |
| Frontend `CORE__FRONTEND` (React 19) | Other VeloxIQ modules (HRMS, PMS, Stores, Plant and Machinery) |
| Migrations and `scripts/admin/*.sql` | Organisational policies, named owners, certifications |

Evidence basis: source code, migrations, `docs/DEPLOYMENT.md`, `README.md`, `CI` workflow. Nothing here was verified at runtime. No environment values were read; only variable names appear.

## 3. Architecture overview

| Layer | Design | Reference |
|---|---|---|
| Client | Single-page app. Access token held in memory; refresh token in `sessionStorage` | `CORE__FRONTEND/src/shared/lib/api.ts` |
| HTTP | Express 5 wrapped by an in-house layer (`CoreApp`), 1 MiB default body limit | `src/http/app.ts` |
| Request pipeline | Security headers, then CORS, then global per-IP rate limit, then route preHandlers (auth, access, step-up), then Zod validation, then service | `src/app.ts`, `src/plugins/*` |
| Tenancy | One PostgreSQL schema per tenant (`tenant_<id>`); `withTenant` sets `SET LOCAL search_path` per transaction; tenant id comes from the verified token | `src/db/tenant.ts` |
| Data | PostgreSQL; shared tables in `public` (`core_rate_limit_window`, `core_migration`) and `shared` (`shared.uom`) | `migrations/0002_rate_limit.sql`, `0001_shared_uom.sql` |
| Audit | Hash-chained append-only `audit_row_change` per tenant plus `core_auth_activity` for authentication events | `src/core/audit.ts`, `migrations/0002_audit_append_only.sql` |

## 4. Control catalogue

Status key: Implemented (code present), Partial (limits noted), Dev-only.

### 4.1 Authentication

| ID | Control | Implementation detail | File | Status |
|---|---|---|---|---|
| AUTH-01 | Password and PIN hashing | argon2id (hash-wasm), memory 19456 KiB, 2 iterations, parallelism 1, 16-byte random salt; parameters embedded in each hash | `src/core/password.ts` | Implemented |
| AUTH-02 | Password policy | 12 to 128 characters; must differ from login id. PIN: 4 to 6 digits | `src/core/password.ts` | Implemented (no breach-list or complexity check) |
| AUTH-03 | Temporary passwords | 16 characters from `crypto.randomInt`, all four classes, look-alikes removed; shown once; stripped from the idempotency store; `must_change_password` forces change | `src/core/password.ts`, `src/modules/access/service.ts`, `src/plugins/auth.ts` | Implemented |
| AUTH-04 | Access token | JWT HS256 via `jose`; claims `sub`, `sid`, `tid`; issuer and audience `velox-core`; lifetime 15 minutes; algorithm pinned on verify | `src/modules/auth/tokens.ts` | Implemented |
| AUTH-05 | Session-bound tokens | On every protected request the session row is read: revoked, expired, inactive user or suspension denies at once, not at token expiry | `src/plugins/auth.ts` | Implemented |
| AUTH-06 | Refresh tokens | 256-bit random opaque token; only SHA-256 stored (`core_user_session.refresh_hash`); fixed 30-day life from login; rotated on every use | `src/modules/auth/tokens.ts`, `service.ts` | Implemented |
| AUTH-07 | Refresh-reuse detection | Presenting a token from a session revoked as `rotated` revokes all sessions of that user and logs `refresh_reuse`. Manual sign-out or revoke only refuses | `src/modules/auth/service.ts` (`refresh`) | Implemented |
| AUTH-08 | Session limit and SESSION_REPLACED | `SESSION_DEVICE_LIMIT` (default 1, range 1 to 100). A new sign-in revokes the oldest sessions beyond the limit with reason `device_limit`; the displaced session's next refresh answers 401 `SESSION_REPLACED`; the frontend shows a notice | `src/config/env.ts`, `service.ts` (`openSession`, `refresh`), `CORE__FRONTEND/src/modules/auth/store/useAuth.ts` | Implemented |
| AUTH-09 | Account lockout | 5 failed passwords lock the account for 15 minutes (counter reset on lock); failures committed before the 401 is thrown | `src/modules/auth/service.ts` | Implemented |
| AUTH-10 | Uniform failure and timing | Unknown tenant, unknown login id, locked, inactive and wrong password all return the same 401 `AUTH_INVALID_CREDENTIALS`; dummy argon2 hash equalises timing | `service.ts`, `src/core/password.ts` | Implemented |
| AUTH-11 | Change password | Needs current password; revokes all other sessions; rate limited per user; failure logged | `service.ts` (`changePassword`) | Implemented |
| AUTH-12 | Password reset by OTP | Six-digit code, hashed with argon2id, 5-minute life, 5 attempts then burned, single use; request always answers 202; code never logged | `src/modules/auth/password-reset.ts`, `email-otp.ts` | Partial: no email provider chosen (see 4.1 note) |
| AUTH-13 | WebAuthn passkeys | `@simplewebauthn/server`; attestation `none`; `userVerification: required`; 5-minute challenges, single use; sign-count rewind refused (cloned authenticator signal) | `src/modules/auth/passkey.ts` | Implemented |
| AUTH-14 | Step-up verification | Short-lived (5 min) JWT with `scp=step-up`, bound to user, session and tenant, carried in `X-Step-Up-Token`; `amr` records `passkey` or `password` | `src/modules/auth/step-up.ts` | Implemented |
| AUTH-15 | Passkey-only step-up for grants | Grant and revoke routes accept passkey step-up only; password step-up is accepted only for geo-zone writes | `src/modules/access/routes.ts`, `src/modules/projects/routes.ts` | Implemented |
| AUTH-16 | Password step-up | Re-enter password; same 401 for wrong, inactive or no password; 10 attempts per 15 minutes per user | `step-up.ts`, `routes.ts` | Implemented |
| AUTH-17 | Session self-management | User lists own live sessions and revokes one; foreign session answers 404 | `src/modules/auth/sessions.ts` | Implemented |

Note on AUTH-12: outside production the fixed sample code `SAMPLE_OTP_CODE` (default `123456` in development) is used and nothing is sent; the environment schema refuses `SAMPLE_OTP_CODE` when `NODE_ENV=production` (`src/config/env.ts`). In production, reset answers 503 until an `OtpDelivery` is wired (`src/app.ts`).

Authentication rate limits (fixed 15-minute windows, shared through PostgreSQL, `src/modules/auth/routes.ts`):

| Key | Limit |
|---|---|
| Login per IP | 100 |
| Login per tenant and login id | 10 |
| Reset request per IP / per login id | 20 / 3 |
| Reset confirm per login id | 10 |
| Change password per user | 10 |
| Password step-up per user | 10 |
| Passkey login options (shares login limits) | as login |

### 4.2 Rate limiting and abuse control

| ID | Control | Detail | File |
|---|---|---|---|
| RL-01 | Global per-IP limit | 600 requests per minute; `429 RATE_LIMITED` with `Retry-After`; `/health` and `/health/ready` exempt | `src/plugins/rate-limit.ts` |
| RL-02 | Shared limiter | `PostgresRateLimiter`: atomic upsert on `public.core_rate_limit_window`, database clock, 1-in-100 sweep of windows older than 1 day | `src/core/rate-limit-store.ts`, `migrations/0002_rate_limit.sql` |
| RL-03 | In-process fallback | `FixedWindowLimiter` (per process) used where no limiter is supplied | `src/core/rate-limit.ts` |
| RL-04 | Client address integrity | `TRUST_PROXY` accepts only IPs or CIDRs with prefix 1 or longer; `/0` refused; unset means off | `src/config/trust-proxy.ts` |

### 4.3 Authorisation (summary; full detail in DOC-05)

| ID | Control | Detail | File |
|---|---|---|---|
| AZ-01 | Route guard | `guardRoute(options, privilege, docs)` returns preHandlers: `requireAuth`, plus `requireAccess` when a privilege is named. `null` means any signed-in user | `src/core/resource.ts` |
| AZ-02 | Access check | `requireAccess` reads live grants on every request; failure is 403 `ACCESS_DENIED` without naming the privilege; refusal is recorded as `access_denied` with the route pattern only | `src/plugins/auth.ts` |
| AZ-03 | Suspension | An active suspension denies every protected route from the next request (403 `ACCESS_SUSPENDED`); sessions are not revoked | `src/plugins/auth.ts`, `src/modules/access/service.ts` |
| AZ-04 | Effective rule (observation) | `userMayAct` ignores the privilege name and scope it is given: the decision is "not suspended and holds `access.manage`". All privilege-named routes therefore reduce to `access.manage` | `src/modules/access/service.ts` lines 137-151 |
| AZ-05 | Object-level checks | Approval actions: raiser-only for cancel/respond; approver of the current level (user or held role) for decisions; suspended users refused. Private files: creator or manage-privilege holder; company logo readable by any signed-in user | `src/modules/approvals/service.ts`, `src/modules/records/service.ts` |
| AZ-06 | Privilege change controls | Grants and revokes need `access.manage` plus passkey step-up; each writes a hash-chained audit row with actor and correlation id; first holder created by CLI `npm run access:grant` (audit row with no actor) | `access/routes.ts`, `access/service.ts`, `access/bootstrap.ts` |

### 4.4 Tenant isolation and database roles

| ID | Control | Detail | File |
|---|---|---|---|
| TI-01 | Schema per tenant | Every query runs inside `withTenant`: `BEGIN`, `SET LOCAL search_path` to one schema, then `COMMIT` or `ROLLBACK`; pooled connections never keep a path | `src/db/tenant.ts` |
| TI-02 | Tenant id source | Authenticated routes take the tenant from the verified JWT (`tid`, validated by `isValidTenantId`); only pre-login routes read `X-Tenant-Id` | `tokens.ts`, `auth/schema.ts` |
| TI-03 | Unknown tenant | `tenantExists` check so unknown tenant gets the same 401 as unknown login | `src/db/tenant.ts`, `service.ts` |
| TI-04 | Owner vs runtime role | Migrations run as the owner role; the application runs as a login role that is a member of group role `core_app` (the test harness names the owner `velox_core` and the app login `core_app_login`; `README.md` shows an owner named `velox_owner`, see Open items) | `scripts/admin/create-core-app-role.sql`, `grant-core-app-tables.sql`, `tests/db/helpers.ts` |
| TI-05 | Least privilege for `core_app` | SELECT/INSERT/UPDATE/DELETE on tenant tables; no schema changes, no `CREATE` on `public`; `core_migration` read-only; `shared.uom` read-only; default privileges for future tables | `scripts/admin/grant-core-app-tables.sql` |
| TI-06 | Append-only audit | Migration 0002: triggers raise on UPDATE, DELETE and TRUNCATE of `audit_row_change`. Migration 0003: REVOKE from PUBLIC and from `core_app`. Admin scripts repeat the REVOKE for every tenant schema. Owner or superuser can still disable the trigger | `migrations/0002_audit_append_only.sql`, `0003_approved_constraints.sql` |
| TI-07 | Documented limitation | A tenant-scoped connection can still name another tenant's table with a schema prefix; stopping that needs per-tenant database roles (not implemented) | `src/db/tenant.ts` header comment |
| TI-08 | Go-live check | Deployment checklist requires that the application does not use the owner role | `docs/DEPLOYMENT.md` |

### 4.5 Input validation, idempotency, errors

| ID | Control | Detail | File |
|---|---|---|---|
| IV-01 | Zod at the boundary | `parseInput(schema, input)` on bodies, queries and params; failure is 400 `VALIDATION_ERROR` listing paths and messages, never the rejected values | `src/core/validation.ts` |
| IV-02 | Strict schemas | User create/patch use `.strict()`; UUID params; list `limit` capped (users: 200) | `src/modules/access/schema.ts` |
| IV-03 | Parameterised SQL | Queries use `$n` placeholders; tenant schema name passed through `quoteIdent` | `src/db/tenant.ts`, `src/db/migrate.ts` |
| IV-04 | Idempotency | POST and PATCH require `Idempotency-Key` (1 to 255 chars); same key with different request hash is 409 `IDEMPOTENCY_KEY_REUSED`; 24-hour TTL; advisory lock per key; stored in the same transaction | `src/core/idempotency.ts`, `src/core/resource.ts` |
| IV-05 | Optimistic concurrency | `rowVersion` on patches; conflict is a defined error | `src/core/resource.ts` |
| ER-01 | Error handling | Single handler: `AppError` and framework 4xx messages are returned; anything else is a generic 500 `INTERNAL_ERROR` with the real error logged server-side only. No stack traces to clients | `src/core/error-handler.ts` |
| ER-02 | Not found | Generic 404 `NOT_FOUND`; session of another user 404 | `error-handler.ts`, `sessions.ts` |

### 4.6 Secrets, transport, headers, CORS

| ID | Control | Detail | File |
|---|---|---|---|
| SE-01 | Secrets by environment | Variable names: `DATABASE_URL`, `JWT_SECRET` (min 32 chars, required when `NODE_ENV=production`), `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS` (both required in production), `CORS_ORIGINS`, `SAMPLE_OTP_CODE`, `TRUST_PROXY`, `SESSION_DEVICE_LIMIT`, `APPROVAL_REMINDER_MINUTES`, `LOG_LEVEL`, `NODE_ENV`, `HOST`, `PORT` | `src/config/env.ts` |
| SE-02 | Fail-fast config | Invalid environment throws at start; without `JWT_SECRET` outside production a random ephemeral key is used and tokens die on restart | `env.ts`, `tokens.ts` |
| SE-03 | One signing key | The same HS256 key signs access and step-up tokens; step-up tokens carry `scp=step-up` and cannot pass as access tokens | `step-up.ts` |
| SE-04 | Secrets not stored in clear | Passwords, PINs, OTPs: argon2id; refresh tokens: SHA-256; temporary password removed from idempotency store | `password.ts`, `tokens.ts`, `access/service.ts` |
| TR-01 | Security headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`; `X-Powered-By` removed; `Strict-Transport-Security: max-age=31536000` in production only | `src/plugins/security-headers.ts` |
| TR-02 | CORS | Allow-list from `CORS_ORIGINS` (full origins, no wildcard); none configured means no browser origin allowed; no credentials; methods GET, POST, PATCH, DELETE, OPTIONS; headers include `Authorization`, `Idempotency-Key`, `X-Step-Up-Token`, `X-Tenant-Id` | `src/plugins/cors.ts` |
| TR-03 | TLS | Not terminated by the app. Deployment checklist requires TLS in front of the API | `docs/DEPLOYMENT.md` |
| TR-04 | API docs | `/docs` (Swagger UI from a pinned CDN version) is registered only when not production | `src/plugins/api-docs.ts` |

### 4.7 Logging, redaction, audit integrity

| ID | Control | Detail | File |
|---|---|---|---|
| LG-01 | Log redaction | pino `redact` paths generated from `SENSITIVE_KEYS` (password, pin, otp, secret, token, access/refresh token, hash columns, `pan`, `gstin`, account numbers, `ifsc`, camelCase password fields) at depth 0, 1 and 2, plus `Authorization`, `Cookie`, `Set-Cookie` headers; censor text `[REDACTED]`; keys ending `_hash`, `_secret`, `_token` also treated as sensitive | `src/core/redaction.ts`, `src/app.ts` |
| LG-02 | Request correlation | `X-Request-Id` echoed and used as audit `correlation_id` | `src/plugins/cors.ts` (exposed header), `src/core/resource.ts` |
| AU-01 | Hash chain | Each row stores `prev_hash` and `row_hash` = SHA-256 of canonical JSON of all fields; advisory lock serialises writers; strictly increasing millisecond timestamps | `src/core/audit.ts` |
| AU-02 | Chain verification | `verifyAuditChain` recomputes and reports first broken row; used by the restore drill. No scheduled or API-exposed verification found | `src/core/audit.ts`, `src/db/restore-drill.ts` |
| AU-03 | Snapshot hygiene | Hash columns (`password_hash`, `pin_hash`, `refresh_hash`, `secret_hash`) are removed from snapshots at any depth; other sensitive keys replaced by `[REDACTED]` | `src/core/audit.ts` |
| AU-04 | Authentication events | `core_auth_activity` records login success and failure, lock, refresh, refresh reuse, logout, password change and reset, OTP, step-up, `access_denied`, session revoke | `src/modules/auth/repo.ts` |
| AU-05 | Audit access | Read-only routes under `/audit-log` need `access.manage`; `POST /audit-log/external` accepts entries from other modules under the same privilege | `src/modules/audit-log/routes.ts` |
| AU-06 | IP handling | `ip_hash` column exists; the raw address is never stored. No caller in `src/` populates it | `src/core/audit.ts` |

### 4.8 File uploads (records module)

| ID | Control | Detail | File |
|---|---|---|---|
| FU-01 | Size limit | 2 MiB (`FILE_CONTENT_MAX_BYTES`); declared `Content-Length` over limit refused 413 before body read; parser `bodyLimit` second guard; stored size must match the file record | `src/modules/records/rules.ts`, `routes.ts`, `service.ts` |
| FU-02 | Type allow-list | `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `application/msword`, DOCX media type; others 400 `UNSUPPORTED_FILE_TYPE`. Check is on the declared Content-Type only (no content sniffing found) | `rules.ts`, `routes.ts` |
| FU-03 | Access | Upload needs `records.manage`; download enforces visibility (private: creator or manage holder); idempotent upload; SHA-256 recorded | `records/routes.ts`, `records/service.ts` |
| FU-04 | Storage | Bytes stored in PostgreSQL (`core_file_content`), not on disk; no malware scanning found | migration `0015_file_content.sql` |

### 4.9 Frontend controls

| ID | Control | Detail | File |
|---|---|---|---|
| FE-01 | Token storage | Access token in a module variable (memory only); refresh token in `sessionStorage` key `veloxiq-core-refresh:v1`; step-up token memory only; tenant id in `sessionStorage`. Persisted auth store keeps user, profile, privileges, `signedInAt`, lock timer in `sessionStorage`. No `localStorage` use for credentials (localStorage is used by the shell store) | `CORE__FRONTEND/src/shared/lib/api.ts`, `useAuth.ts`, `useShell.ts` |
| FE-02 | Request hygiene | Each call sends `X-Tenant-Id`, fresh `X-Request-Id`, timeout; one refresh and one retry on 401; Idempotency-Key per POST/PATCH | `api.ts` |
| FE-03 | Route guard | `Protected` redirects unauthenticated users to `/login`, forces `/change-password` while a temporary password is pending, shows only `ModuleHome` to users without `access.manage` | `CORE__FRONTEND/src/app/App.tsx` |
| FE-04 | Page gate | `Gate` shows `NoAccess` when `privilegeFor(path)` is not held; nav hides items by `needs` | `App.tsx`, `src/modules/shell/config/nav.ts` |
| FE-05 | Step-up prompt | `StepUpHost`; `hasStepUp()` requires at least 15 s of life left and passkey method unless password allowed; route pattern list for grants and geo-zones | `App.tsx`, `api.ts` |
| FE-06 | Unsaved-changes guard | `UnsavedChangesGuard` with data router `useBlocker` | `src/shared/ui/UnsavedChangesGuard.tsx`, `App.tsx` |
| FE-07 | XSS surface | No `dangerouslySetInnerHTML` in `src` (count 0) | grep of `CORE__FRONTEND/src` |
| FE-08 | Client lockout display | `lockedUntil` stored client-side; server lockout is authoritative | `useAuth.ts` |

Client-side guards are usability controls. Every protected action is re-checked by the server (AZ-01 to AZ-05).

## 5. STRIDE threat model

Assets: A1 credentials and sessions; A2 tenant business data; A3 audit trail; A4 privilege grants; A5 signing key and DB credentials; A6 uploaded files; A7 service availability.

| # | Asset | STRIDE | Threat | Mitigation implemented (file) | Residual risk | Status |
|---|---|---|---|---|---|---|
| T1 | A1 | Spoofing | Credential guessing or stuffing | argon2id, lockout 5/15 min, per-IP and per-login rate limits, uniform 401 (`service.ts`, `routes.ts`, `password.ts`) | Distributed attack across many IPs and login ids; no breach-password check; no MFA at login except passkey login | Mitigated, residual Medium |
| T2 | A1 | Spoofing | Stolen refresh token replay | Rotation, hash-only storage, reuse revokes all sessions (`service.ts`) | Token in `sessionStorage` readable by any XSS in the origin | Mitigated, residual Medium |
| T3 | A1 | Spoofing | Forged or alg-confused JWT | HS256 pinned, issuer, audience, expiry, `sid` bound to live session (`tokens.ts`, `plugins/auth.ts`) | Single symmetric key, no key id or rotation procedure | Mitigated, residual Medium |
| T4 | A1 | Spoofing | Cloned passkey authenticator | Sign-count rewind refused, user verification required (`passkey.ts`) | Authenticators reporting counter 0 cannot be checked | Mitigated, residual Low |
| T5 | A4 | Spoofing | Hijacked session used to grant privileges | Passkey-only step-up, 5-minute token bound to user, session, tenant (`step-up.ts`, `access/routes.ts`) | Users without a passkey cannot be granted by that admin (409 `STEP_UP_NO_PASSKEY`); acceptable | Mitigated, residual Low |
| T6 | A2, A3 | Tampering | Edit audit history via application | Triggers block UPDATE/DELETE/TRUNCATE, REVOKE for `core_app`, hash chain (`migrations/0002`, `0003`, `audit.ts`) | Owner or superuser can drop the trigger; detection depends on someone running chain verification (no schedule found) | Partially mitigated, residual Medium |
| T7 | A2 | Tampering | Mass assignment or malformed input | Zod schemas, `.strict()` on user routes, parameterised SQL (`validation.ts`, `access/schema.ts`) | Coverage per route not re-audited here | Mitigated, residual Low |
| T8 | A2 | Tampering | Duplicate or replayed writes | Idempotency-Key with request hash, optimistic `rowVersion` (`idempotency.ts`, `resource.ts`) | 24-hour window only | Mitigated, residual Low |
| T9 | A1 | Repudiation | User denies an action | Audit rows with actor and correlation id; `core_auth_activity`; step-up events logged (`audit.ts`, `auth/repo.ts`) | `ip_hash` never populated; CLI bootstrap grants have no actor | Partially mitigated, residual Medium |
| T10 | A2 | Information disclosure | Cross-tenant read | Per-request `search_path` from verified token; tenant id validated (`tenant.ts`, `tokens.ts`) | Schema-qualified names not blocked (no per-tenant DB roles); a SQL injection or code defect could cross tenants | Partially mitigated, residual Medium |
| T11 | A1 | Information disclosure | Account enumeration | Uniform 401, 202 on reset request, dummy hashing, same answer for unknown tenant (`service.ts`, `password-reset.ts`) | Rate-limit responses and timing at network level | Mitigated, residual Low |
| T12 | A5 | Information disclosure | Secrets in logs or audit | pino redaction, audit snapshot stripping, error handler hides internals (`redaction.ts`, `audit.ts`, `error-handler.ts`) | Free-text fields (reasons, notes) not scanned | Mitigated, residual Low |
| T13 | A2 | Information disclosure | Over-broad privileged reads | `access.manage` gate for users, audit, integration; auth required for others (`guardRoute`) | Most read routes need only sign-in; scope not enforced (AZ-04); non-admin UI blocked client-side only | Partially mitigated, residual Medium |
| T14 | A6 | Information disclosure | Unauthorised file download | Visibility check in `readFileContent` (`records/service.ts`) | Team and company visibility readable by every signed-in user of the tenant | Mitigated by design, residual Low |
| T15 | A7 | Denial of service | Request flooding | Global per-IP limit 600/min, body limit 1 MiB, file limit 2 MiB (`plugins/rate-limit.ts`, `http/app.ts`) | Per-IP only; behind proxy relies on correct `TRUST_PROXY`; no upstream WAF in repo | Partially mitigated, residual Medium |
| T16 | A7 | Denial of service | Account lockout abuse | Lock is per account for 15 min; per-login rate limit | Attacker can keep a known login id locked | Accepted trade-off, residual Medium |
| T17 | A4 | Elevation of privilege | Privilege check bypass | Server-side guard on every route; suspension check; grants via step-up (`plugins/auth.ts`) | `userMayAct` ignores privilege name and scope (AZ-04): every named privilege equals `access.manage`; finer privileges in code have no separate effect | Known limitation, residual Medium |
| T18 | A4 | Elevation of privilege | Self-grant by compromised admin | Grant needs `access.manage` plus passkey step-up; audited | No second-person approval for grants (segregation of duties, DOC-05) | Open, residual Medium |
| T19 | A1 | Elevation of privilege | Browser XSS reading tokens | No `dangerouslySetInnerHTML`; React escaping; API CSP `default-src 'none'` | Frontend response headers and CSP are not in the repository (To be confirmed) | Open, residual Medium |
| T20 | A5 | Information disclosure | Weak or leaked `JWT_SECRET` | Minimum 32 chars; required in production; not logged (`env.ts`) | Strength not enforced beyond length; no rotation procedure | Partially mitigated, residual Medium |
| T21 | A6 | Tampering | Malicious file content with allowed type | Type allow-list, size cap, `nosniff` header | Declared type only; no content inspection or antivirus | Open, residual Medium |

## 6. Control matrix (indicative mapping, not a certification)

The mapping below is a suggestion for reviewers. It does not assert compliance with OWASP ASVS or ISO/IEC 27001 and has not been assessed by an auditor.

| Control IDs | OWASP ASVS chapter heading (suggested) | ISO/IEC 27001:2022 Annex A theme (suggested) |
|---|---|---|
| AUTH-01, 02, 03, 11, 12 | V2 Authentication | A.5 Organizational controls (access control, authentication information); A.8 Technological controls |
| AUTH-04 to 08, 17 | V3 Session Management | A.8 Technological controls (secure authentication) |
| AUTH-09, 10, RL-01 to 04 | V2 Authentication; V11 Business Logic (anti-automation) | A.8 Technological controls |
| AUTH-13 to 16 | V2 Authentication (multi-factor and cryptographic authenticators) | A.8 Technological controls |
| AZ-01 to AZ-06 | V4 Access Control | A.5 Organizational controls (access control, segregation of duties, privileged access) |
| TI-01 to TI-08 | V4 Access Control; V14 Configuration | A.8 Technological controls (segregation of environments, data separation) |
| IV-01 to IV-05 | V5 Validation, Sanitization and Encoding; V13 API and Web Service | A.8 Technological controls (secure coding) |
| ER-01, ER-02, LG-01 | V7 Error Handling and Logging | A.8 Technological controls (logging) |
| SE-01 to SE-04 | V6 Stored Cryptography; V14 Configuration | A.8 Technological controls (cryptography, configuration management) |
| TR-01 to TR-04 | V9 Communication; V14 Configuration | A.8 Technological controls (network security) |
| AU-01 to AU-06 | V7 Error Handling and Logging | A.8 Technological controls (logging, monitoring) |
| FU-01 to FU-04 | V12 Files and Resources | A.8 Technological controls |
| FE-01 to FE-08 | V3 Session Management; V5 Validation; V14 Configuration | A.8 Technological controls |
| CI pipeline (typecheck, lint, tests, build) | V14 Configuration (build) | A.8 Technological controls (secure development life cycle) |
| Backup, restore drill (`docs/DEPLOYMENT.md`, `src/db/restore-drill.ts`) | V14 Configuration | A.8 Technological controls (backup); A.5 Organizational controls (continuity) |

Themes of ISO/IEC 27001 Annex A (A.6 People, A.7 Physical) are organisational and outside the repository.

## 7. Gap list (verified absent in the repository)

Search basis: `CORE__BACKEND/src`, `docs`, `.github`, `README.md`, `CORE__FRONTEND/src`, `docs`, `README.md`, `package.json`. Absence means "not found there", not "absent from the organisation".

| # | Expected enterprise control | Evidence of absence | Suggested priority |
|---|---|---|---|
| G1 | Dependency vulnerability scanning and update automation | `ci.yml` runs typecheck, lint, tests, build only; no audit step, no Dependabot or Renovate config; no frontend CI directory | High |
| G2 | Static or secret scanning in CI (SAST, CodeQL, secret scan) | Not present in `ci.yml` | High |
| G3 | SIEM or log export / alert rules | No exporter, no alerting config; only pino logs and DB tables. (`/audit-log/external` is inbound only) | Medium |
| G4 | JWT key rotation procedure or key id (`kid`) support | Single `JWT_SECRET`; no rotation text in `docs/DEPLOYMENT.md` or code | High |
| G5 | Penetration-test or security-assessment evidence | No report or reference in docs | High |
| G6 | Scheduled audit-chain verification and alerting | `verifyAuditChain` is called only by the restore drill | Medium |
| G7 | Multi-factor at password login (second factor after password) | Password login issues a session directly; passkey is a separate sign-in path | Medium |
| G8 | Breached-password check and complexity rules | Policy is length plus not equal to login id | Low |
| G9 | Malware scanning and content-type sniffing for uploads | Declared Content-Type only; bytes stored as-is | Medium |
| G10 | Per-tenant database roles | Stated as not implemented in `src/db/tenant.ts` | Medium |
| G11 | Second-person approval for privilege grants | Grant needs one admin and one passkey check | Medium |
| G12 | Frontend security headers and CSP definition | No `_headers`, server config or CSP meta in `CORE__FRONTEND` source (hosting config may exist elsewhere) | Medium |
| G13 | Data-at-rest encryption and backup encryption automation | `DEPLOYMENT.md` instructs operators to encrypt backups; no tooling | Medium |
| G14 | Data retention and deletion schedule for personal data | No retention job or policy document in repository (idempotency and rate-limit rows only are swept) | Medium |
| G15 | Email provider for OTP in production | `EmailTransport` interface only; no provider | High (blocks reset in production) |

## 8. Open items

| # | Item | Status |
|---|---|---|
| O1 | Named owner of this document and of each control | To be confirmed |
| O2 | Owner role name: tests and default-privilege script use `velox_core`; `README.md` shows `velox_owner`; runtime login role `core_app_login` appears in tests only | To be confirmed |
| O3 | Production TLS termination, WAF, network segmentation, secret store | To be confirmed |
| O4 | Frontend hosting headers and CSP | To be confirmed |
| O5 | Security, privacy and retention policies; incident response plan | To be confirmed |
| O6 | Any certification or audit status (ISO/IEC 27001, SOC 2, ASVS assessment) | To be confirmed |
| O7 | Intended behaviour of `userMayAct` ignoring privilege and scope (design decision or interim) | To be confirmed |
| O8 | Whether `ip_hash` is meant to be populated | To be confirmed |
| O9 | Runtime verification of controls (this draft is code review only) | To be confirmed |

## 9. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | Initial draft from repository review |
