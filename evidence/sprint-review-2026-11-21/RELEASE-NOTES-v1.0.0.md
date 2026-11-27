# VeloxIQ Core 1.0.0: release notes (release candidate)

Backend `velox-core-backend` 1.0.0 and frontend `veloxiq-core` 1.0.0, built on 2026-11-21. Not yet deployed to staging.

## API v1 locked

- **Contract:** `CORE__BACKEND/docs/api/openapi-v1.json`, 253 operations (10 public). SHA-256 `74db7f9a16115bba32b1b14efdd68bdad976a19e00751722ebf10d55f906129f`.
- **Guard:** the lock test (`tests/regression/api-v1-lock.test.ts`) fails on any added, removed or changed operation, parameter, request body or security rule. Wording is not locked.
- **Change rules:** `CORE__BACKEND/docs/API_V1.md`. Additions need a minor version and a new snapshot. Removals and incompatible changes wait for v2.

## What the release contains

**Data on the server:** every screen reads and writes through the Core API. Records are separated per company (tenant), and the company is picked from the login ID's prefix.

**Sign-in and identity**
- Password sign-in with lockout, and passkey sign-in and registration.
- Device list with sign-out of other devices, and passkey step-up for grants and geo-fence changes.
- No tenant-less login: a login ID that names no company is refused before anything is sent.
- When a session ends, the user sees a plain message and returns to the login page they used.

**Access in the screens**
- Write controls appear only for users who hold the privilege, including the planning, milestone, WBS, chainage and geo-fence controls.
- Menus and routes follow privileges: Users and Audit trail are hidden from, and refused to, users without access administration.

**API**
- Single-record GET for every master resource and for audit entries.
- Request bodies documented in OpenAPI.

**Operations**
- `npm run db:drill` proves a tenant backup restores (row counts, content checksums and audit chain). A restore onto a fresh server now works (D13).

**Regression suites:** `npm run test:regression` in both projects (API lock, masters, identity, frontend).

## Fixed in this release

D1, D2, D7, D8, D9, D11, D12 and D13. D6 is closed (not reproduced). Details are in `DEFECTS.md`.

## Known limits

- **D10:** sign-in events are recorded but no API route shows them. Needs a decision.
- **Password reset:** answers 503 until an email provider is configured.
- **Step-up:** works only for users with a passkey (no authenticator-app codes). The token can be reused for five minutes. Exports prompt for step-up in the screen only.
- **Master-data reads:** company-wide for any signed-in user. Location grants limit writes, not reads.
- **File uploads:** checked for type before the token. Nothing leaks, but the body is read before an anonymous request is refused.
- **Frontend lint:** 9 older warnings remain. No errors.
