# VeloxIQ Core backend: working notes

## Stack (approved; see PROGRESS.md)
- Node.js 24 LTS (installed: 24.21.0), npm 12.2.0, TypeScript 5.x strict, ESM
- Fastify 5 (HTTP), Zod (validation), pino (logging)
- PostgreSQL 18 (psql 18.4 installed), Drizzle ORM on `pg`, SQL migrations applied per tenant schema
- Auth: argon2id for passwords and PINs; short-lived JWT access tokens; rotating opaque refresh tokens (hash in core_user_session); OTP; WebAuthn passkeys (@simplewebauthn/server)
- Tests: Vitest, Fastify inject, Testcontainers (PostgreSQL 18)
- Lint and format: ESLint flat config with typescript-eslint, Prettier
- Exact versions are pinned in package.json during Phase 1

## Source of truth
- Schema: Core_Database_Handoff.md. Read it by section (grep the headings first); never load it whole.
- Phase 2 is blocked until the DDL open items are signed off (see PROGRESS.md).

## Folder structure (planned)
- src/config/: env parsing with Zod, constants
- src/db/: Drizzle client, tenant context (SET LOCAL search_path), migration runner, seeds
- src/core/: AppError, response helpers, logger, idempotency, outbox
- src/modules/<name>/: routes.ts, controller.ts, service.ts, schema.ts (Zod), repo.ts, tests
- src/plugins/: auth, security headers, rate limit, swagger
- src/app.ts builds the app without listening; src/server.ts starts it
- migrations/: SQL, one folder per version, applied to every tenant_<id> schema
- tests/: integration tests and shared helpers

## Conventions
- Tables: core_*, integ_*, audit_row_change. Columns: snake_case.
- Internal reference: <entity>_id (uuid). External key: <name>_key or <name>_code (text).
- Every table has: id, created_at, created_by, updated_at, updated_by, row_version.
- No tenant_id on business tables. The tenant comes from the verified session; set search_path per transaction with SET LOCAL.
- Map snake_case to camelCase only in the repo layer.
- Errors: throw AppError(code, status, message, details?). One global handler. Never return stack traces or SQL.
- Success response: { data, meta? }. Error response: { error: { code, message, details? } }.
- Validate every request with a Zod schema at the route boundary.
- Money: numeric. Instants: timestamptz. Calendar dates: date. Chainage: numeric(12,3), in km.
- Never log secrets, password or PIN hashes, tokens, PAN, GSTIN or bank details.

## Commands (Phase 1 done)
- Run: npm run dev (watch mode) ; production: npm run build then npm start
- Test: npm test
- Typecheck and lint: npm run typecheck ; npm run lint
- Format: npm run format ; npm run format:check
- Not yet created: npm run test:int and npm run db:migrate (Phase 2)
