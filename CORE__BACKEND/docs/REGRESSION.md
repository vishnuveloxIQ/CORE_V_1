# Regression suites: masters and identity

Two backend suites and one frontend suite guard master data and identity (sign-in, tokens, sessions, access). Run them before each release, and after any change to authentication, access control, a master-data module or the shared route helpers (`src/core/resource.ts`, `src/plugins/auth.ts`).

## Commands

Backend (needs `.env.test` with `DATABASE_URL`; each test file makes and drops its own database):

```
npm run test:regression            # both suites
npm run test:regression:masters
npm run test:regression:identity
```

Frontend (in `veloxiq-core`):

```
npm run test:regression
```

Each command exits non-zero when a test fails.

## The two contract tests

The suites run the existing module tests, plus two contract tests that check the same rules across the whole API. A regression in shared code shows up there, whichever module it touches.

### `tests/regression/masters-contract.test.ts`

Every master-data resource in its `RESOURCES` table goes through the same checks:

- Anonymous list, detail, create and change get 401.
- Any signed-in user can read the list. Create and change without the resource's privilege get 403 `ACCESS_DENIED`.
- Create returns `rowVersion` 1. The detail route returns exactly the row the list shows.
- A change without `rowVersion` gets 400 `VALIDATION_ERROR`. A valid change bumps the version to 2. A stale version gets 409 `VERSION_CONFLICT`.
- An unknown ID gets 404, and a malformed ID gets 400 or 404, never 500.
- An empty create gets 400 `VALIDATION_ERROR`.
- A second row with the same unique value (code, or series code) gets 409.

The table currently covers 14 resources:
- projects, locations, stores, WBS nodes, chainage markers and milestones
- vendors, materials and equipment types
- departments, positions, shifts, holidays and number series

**Adding a resource:** add one line to `RESOURCES`, with its path, privilege, a create body built from the fixtures, a valid change and its unique field. If it depends on a row that isn't in `Fixtures` yet, create that row in `beforeAll`.

### `tests/regression/identity-contract.test.ts`

- **Route sweep:** reads the generated `/openapi.json`, which is built from the registered routes, and sends every operation with no token, a garbage token and a forged token. Each must get 401, except the routes listed in `PUBLIC_OPERATIONS` (`src/plugins/openapi.ts`). A new route is covered automatically. If it is meant to be public, add it to that list on purpose.
- **Public routes:** every route in `PUBLIC_OPERATIONS` must exist and must not ask for a token.
- **Access administration:** every route under `/users`, `/access` and `/audit-log` gets 403 for a signed-in user without `access.manage`, and works for one with it.
- **Self service:** `/auth/me`, `/auth/me/access`, `/auth/sessions` and `/auth/passkeys` work for a user with no privileges.
- **Tokens:**
  - The access token carries the user, session and tenant, and lasts 15 minutes.
  - The refresh token is an opaque random value, at least 32 characters.
  - The login response holds no hash or secret.
- **Temporary passwords:** a user created by an administrator signs in with `mustChangePassword: true`. That user is refused elsewhere with 403 `PASSWORD_CHANGE_REQUIRED`, but can still read their own account.

## What else each suite runs

| Suite | Files |
|---|---|
| Masters | the masters contract, `tests/masters`, `tests/projects`, `tests/organisation`, `tests/equipment-units`, `tests/stock-levels`, `tests/offer-letter`, `tests/relationships` (cross-project rules), `tests/permissions` (detail routes), `tests/db/shared-uom.test.ts`, `tests/testing-pass/conflicts-and-ownership.test.ts` (409s under concurrency, tenant writes) |
| Identity | the identity contract, `tests/auth` (login, refresh, logout, lockout, passkeys, password reset, sessions, step-up, tenant lookup), `tests/access`, `tests/audit-log`, `tests/testing-pass/auth-edges.test.ts`, `tenant-isolation.test.ts`, `idempotency-http.test.ts`, `tests/core/password.test.ts`, `tests/core/rate-limit.test.ts`, `tests/hardening/shared-rate-limit.test.ts`, `tests/hardening/cors.test.ts` |
| Frontend | `access.test.tsx` (privilege-gated controls), `tenant.test.tsx` (no tenant-less login), `session.test.tsx` (session end and return to login), `integration.test.tsx` (sign-in loads, `next`), `app.test.tsx` (pages, forms and navigation) |

## Last run (2026-11-21)

| Suite | Files | Result |
|---|---|---|
| Backend masters | 18 | 256 passed, 2 skipped (resources with no unique field) |
| Backend identity | 19 | 228 passed |
| Frontend | 5 | 69 passed |

## Known behaviour the suites rely on

- **Uploads:** `PUT /files/{id}/content` checks the file type and size as the request arrives, before it checks the token. An anonymous upload with an unsupported type gets 400, not 401. With an allowed type it gets 401. The sweep sends an allowed type for this route.
- **Read access:** master-data reads need only a signed-in user (company-wide). If reads are ever limited by location grants, change the "any signed-in user can read" check in the masters contract.
