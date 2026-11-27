# Master data: QA smoke, form and permission checks

Checked on 2026-11-21 against the local dev frontend (http://localhost:5173) and the backend on port 3200,
tenant `acme`. No code was changed, and nothing was committed (the project is not a git repository).

## Coverage

| Area | Pages | Result |
|---|---|---|
| Smoke, admin (ACME9999) | Projects, project detail, new project, Locations, location detail, new location, Geofences, Stores, Materials, Equipment register, Organogram, Departments, Users and roles, new user | All load with data. Counts match the API: 6 projects, 7 locations, 7 stores, 23 materials. No error text on any page. |
| Form validation, empty submit | New project, new location, new user | Every required field shows its message. Duplicate codes, negative values and bad formats were not tested in the UI. |
| Permissions, module user (VELOX1003, Kavya Reddy) | The same master-data pages | **Defects D1 and D2.** The server refuses writes and admin reads with 403, but the screens don't reflect that. |
| Backend tests | `tests/masters`, `tests/access`, `tests/projects`, `tests/organisation`, `tests/resources` | 155 of 155 pass. `tests/access/users.test.ts` timed out once under the parallel run and passed alone (see D5). |
| Frontend tests | `npx vitest run` | 86 of 86 pass (last full run). |

## Defects

### D1: Admin write controls are shown to users without the privilege
- **Status:** Fixed (2026-11-21). The create, bulk-upload, edit and delete controls on the listed pages, and on the Project, Location and User detail pages, now appear only when the user holds the matching privilege. The row-code links on Stores, Materials and Departments are inert without it. Regression tests: `src/test/access.test.tsx`. Checked in the browser as VELOX1003: no create or edit buttons remain on these pages.
- **Not yet gated:** the planning pages' Edit and Remove buttons (People, Material and Equipment planning), the Add milestone and Add WBS buttons on the project page, the chainage marker buttons on the location page, and the map editing on geofences. The server still refuses these for users without the privilege.
- **Severity:** High
- **Steps:** Sign in as `VELOX1003` / `VeloxTest@2026` (module user, no `access.manage`). Open Projects, Locations, Stores, Materials, Equipment register, Departments, Users and roles.
- **Actual:** "New project", "New location", "New store", "New material", "Add equipment", "Add equipment type", "New department", "New user", "Add role", "Add zone" and every "Edit" button are shown and clickable. The "New user" page (`#/users/new`) opens with its full form.
- **Server check:** `POST /stores`, `POST /locations` and `POST /users` each return 403 `ACCESS_DENIED` for this user, so no data changes.
- **Expected:** Hide or disable write controls the user can't use, or show that they need the privilege.

### D2: A refused user list looks like an empty list
- **Status:** Fixed (2026-11-21). The Users page now shows a notice when the user list can't be loaded: "You need the access privilege to see users…" for a user without it, or the server's message otherwise. The New user page shows the same kind of notice instead of the form. Checked in the browser as VELOX1003. The zero counts remain beneath the notice.
- **Severity:** High
- **Steps:** As `VELOX1003`, open `#/users`.
- **Actual:** The page shows "Module Administrators 0", "High-Level Approvers 0", "Inactive 0" and "No matching records". `GET /users` returns 403, and no message explains why. The console shows the 403.
- **Expected:** A clear message such as "You don't have permission to see users", not an empty list with zero counts.

### D3: Rendering error during navigation in the dev build (not yet reproduced)
- **Severity:** Medium (dev build only, unconfirmed in the hosted build)
- **Steps:** Run the dev server, then move between pages with the sidebar and the address bar. This was seen once after switching between sign-in sessions.
- **Actual:** The console shows `Invalid hook call` and `Cannot read properties of null (reading 'useRef')` in `HashRouter`. The error boundary catches it, and the page recovers on the next navigation.
- **Likely cause:** two copies of React loaded at once, which often follows a stale Vite dependency cache. Not confirmed.
- **Update (2026-11-21):** a related symptom was reproduced and traced. After source files change under an open dev page, moving between pages by changing only the address hash keeps the old modules, and the page and the store can disagree (the Users page showed 0 users while the store held 10, and a user's page said "User not found"). A true page reload fixed it. This probably explains D3 and D4 too. It affects the dev server only.
- **Expected:** No render error during normal navigation.

### D4: Dashboard counters show 0 for the acme tenant
- **Severity:** Medium (carried over from earlier)
- **Steps:** Sign in as `ACME9999`, open the dashboard.
- **Actual:** "Waiting for approval" and "Active projects" show 0. The API returns 19 pending requests and 5 active projects for acme. `beta` shows its numbers correctly.
- **Status:** Not reproduced in the smoke run on 2026-11-21. With ACME9999 signed in, the dashboard showed 19 waiting for approval and the projects page showed 5 active. The earlier zeros may have been a load timing issue, but the cause was not found. Re-check if it returns.

### D5: Backend access test flakes under the parallel run
- **Severity:** Low
- **Steps:** Run `npx vitest run` for the whole backend suite.
- **Actual:** `tests/access/users.test.ts` times out in its setup sometimes, and passes when run alone (7 of 7). Other database tests have shown the same pattern.
- **Likely cause:** several test databases are created at the same time on a busy machine. Not confirmed.

### D6: 404 from an unknown resource on the Users page
- **Severity:** Low
- **Steps:** As `VELOX1003`, open `#/users`, then check the console.
- **Actual:** "Failed to load resource: 404" appears. The URL wasn't captured.
- **Status:** Closed, not reproduced (2026-11-21). Signed in as VELOX1003, all 25 menu pages were opened and every API response was recorded: no 404 anywhere. The Users page is now blocked by the route gate for this user, so it makes no call. The only errors left were the two 403s from the sign-in load of `/users`, fixed as D12.

### D7: Design question: a refresh after logout ends all sessions
- **Status:** Fixed (2026-11-21), as part of the device-sessions work. A refresh with a token from a session the user signed out or revoked is now only refused (401), and the user's other sessions stay signed in. A refresh with a token from a session that was replaced by an earlier refresh is still treated as theft and ends every session. Migration `0031_session_revoke_reason.sql` records why each session ended. Sessions ended before the migration have no reason, so they are only refused. Tests: `tests/auth/sessions-stepup.test.ts` and the existing reuse test in `tests/auth/auth.test.ts`.
- **Severity:** Needs a decision (from the token review)
- **Actual:** Using a refresh token after its session was logged out is treated as token theft, so all of that user's sessions are revoked. A stale tab can therefore end the user's other sessions.
- **Expected:** Decide whether this is intended, or whether only that session should end.

## Not defects

- `#/projects/P-101` shows "Project not found". This ID is a sample value from the route table, not a real record. Real project pages open correctly, for example `#/projects/48cc447f-d680-4182-93e9-2bd2c966ee6a` (CNL-PH1).
- Geofences shows "No geofence" under most projects. That's the data, not a fault.
- `GET /openapi.json` returns the OpenAPI document, not the `{ data }` envelope. That's by design.

## Smoke run, 2026-11-21 (UI and API, admin ACME9999)

### What was checked
- **API, list endpoints:** all 56 GET list endpoints that don't take an ID return 200 with `{ data }`. No 5xx, no 4xx apart from the expected 403 cases, and none over 1 second.
- **API, detail endpoints:** tested with a real ID from each list. Unknown IDs return 404 on every endpoint.
- **API, auth:** every protected endpoint refuses a request without a token (401), so no endpoint is reachable anonymously.
- **UI, pages:** 41 routes opened as the admin, including detail pages with real IDs. No page shows an error message, and the console shows no errors.

### D8: Single-record GET endpoints are missing for most master-data resources
- **Severity:** Medium
- **Steps:** As the admin, call `GET /projects/{id}` with a real project ID (from `GET /projects`).
- **Actual:** `404 NOT_FOUND`, "Route not found". The same happens for 21 other resources: `/locations`, `/stores`, `/materials`, `/vendors`, `/equipment-types`, `/equipment-units`, `/equipment-assignments`, `/plan-lines`, `/stock-levels`, `/wbs-nodes`, `/chainage-markers`, `/geo-zones`, `/milestones`, `/uoms`, `/audit-log`, `/offer-letter/revisions`, and the `/organisation/*` holidays, shifts, number-series, departments and positions. The response shape is the same for an unknown ID, so the routes are not registered. (Two were checked directly; the rest share the same code.)
- **Why it matters:** the API contract (`api-contract.md`, endpoint 44 and others) lists these GETs. The frontend works around the gap by loading the whole list, but API users and any future deep link can't read one record.
- **Expected:** register `GET /{resource}/:id` for each resource, the same as the users and policy endpoints already do.
- **Status:** Fixed for 21 of 22 resources (2026-11-21). Each now has `GET /{resource}/:id`, which returns the same row as its list item, or a 404 `NOT_FOUND` for an unknown ID. These are the projects, locations, stores, WBS nodes, chainage markers, geo-fence zones and milestones, the vendors, materials, equipment types, equipment assignments and plan lines, the organisation holidays, shifts, number series, departments and positions, equipment units, stock levels, offer-letter revisions and units of measure. Checked against the live backend: each returns 200 with a real ID, and the detail matches its list item.
- **Audit-log detail fixed (2026-11-21):** `GET /audit-log/:id` reads the entry directly by ID, so an older entry beyond the first pages is still found. It returns the same shape as a list item with secrets removed, 404 `NOT_FOUND` for an unknown ID, 400 for a malformed ID, and needs `access.manage`. Test added to `tests/audit-log/audit-log.test.ts`.
- **Design note:** each detail route reads the full list and picks one row. That's fine at master-data sizes, but a direct query by ID would be better once the tables grow.

## Cross-project leakage and invalid relationships (2026-11-21)

Tests: `tests/relationships/cross-project.test.ts`, 6 of 6 pass. Two projects (A and B), each with a location, marker, store, WBS node and milestone.

- **Passed:** filtered lists (`?projectId=`) show only the chosen project's locations, markers, WBS nodes and milestones. A store can't take a location and a marker from different projects, on create or on move. A WBS node can't take a parent from another project. A location, marker, WBS node or milestone can't be moved to another project (PATCH with a `projectId` is refused, and the same PATCH without it succeeds). Records can't be created under an unknown project, and a store can't point at an unknown marker or location.
- **Not covered by these tests:** the geo-fence zone and equipment-assignment list filters (both need more setup than these tests use). The plan-line store check is covered in `tests/masters`.
- **Design question (not a bug in the tests):** master-data reads need only a signed-in user, and writes need the privilege at company scope (route comments in `projects/routes.ts`, `masters/routes.ts`). A location-scoped grant therefore doesn't limit which projects, stores or equipment a user can read. If that's not what you want, the reads need a scope filter.

## Device sessions, revoke and step-up (2026-11-21)

### What was built
- **Device sessions:** `GET /auth/sessions` lists the signed-in user's live sessions (the current one is flagged). `DELETE /auth/sessions/{id}` revokes one of the user's own sessions, and answers 404 for anyone else's. The screen is Account menu > Devices (`/account/devices`).
- **Step-up:** `POST /auth/step-up/options` and `POST /auth/step-up/verify` run a passkey check and return a five-minute step-up token, bound to the user, the session and the tenant, and unusable as an access token. Protected routes read it from the `X-Step-Up-Token` header. Without it they answer 401 `STEP_UP_REQUIRED`. A user with no passkey gets 409 `STEP_UP_NO_PASSKEY`.
- **Enforced on:** granting and revoking access (`/access/users/{id}/grants`, `/access/grants/{id}`) and geo-fence zone writes (`/geo-zones`).
- **UI:** the step-up dialog now runs the real passkey check, instead of accepting any six digits. Grants, revokes and geo-fence changes ask for it.
- **Tests:** `tests/auth/sessions-stepup.test.ts` (12) covers listing, revoking, ownership, missing, borrowed and replayed step-up tokens, and a failed passkey check. The access and projects tests send a step-up token through `tests/auth/step-up-helper.ts`.

### Known limits (open)
- **No TOTP:** there are no authenticator-app codes. Step-up works only for users who have a passkey. A user without one is told to add one.
- **Token reuse:** the step-up token works for several actions in its five minutes. It is not single-use.
- **Exports are not enforced:** the audit and organisation exports prompt for step-up, but they are client-side downloads with no matching server route, so the prompt is not a security boundary.
- **Other privilege paths:** adding privileges through the user form's other fields, and user creation, do not require step-up on the server.
- **Many old sessions:** the admin test account has about 68 live sessions from test and smoke logins. Revoke them from the Devices page if you want a clean list.

## Tenant isolation, 409 conflicts and ownership (2026-11-21)

Tests: `tests/testing-pass/conflicts-and-ownership.test.ts`, 6 of 6 pass. Full backend run: 543 of 543 pass (`--maxWorkers=4`).

### What the tests show
- **Tenant writes:** a beta token cannot PATCH or DELETE an acme vendor. It gets 404, and the acme row is unchanged. A beta session id sent with an acme token gets 404, and the beta session stays live. Reads across tenants were already covered in `tests/testing-pass/tenant-isolation.test.ts`.
- **409 under concurrency:** two PATCHes with the same row version, sent at once, give one 200 and one 409 `VERSION_CONFLICT`. The row moves once, to the winner's value. Two creates with the same code, sent at once, give one 201 and one 409, and only one row exists.
- **Ownership:** one user cannot remove another user's passkey. The answer is 404, and the passkey stays.

### Notes, not defects
- **No Postgres row-level security.** The backend has no `CREATE POLICY` or `ROW LEVEL SECURITY` anywhere. Tenant separation comes from one schema per tenant, with the tenant taken from the verified token (`tid`). Rows are then matched by ID inside that schema. The tests check this behaviour, not RLS policies.
- **The X-Tenant-Id header is ignored on protected routes.** A request with an acme token and `X-Tenant-Id: beta` gets acme's data, with no error. This keeps the data safe, but a client that sends the wrong header gets no warning. Pinned by a test; change it if you want a 400 for a mismatch.
- **Ownership is checked per feature, not in one place.** Passkeys, sessions and approval cancellation each check that the row belongs to the signed-in user, and each has its own test. Records and files have no owner check beyond their tenant and privileges. That is a design question, not a defect found here.

## Pre-login lookups and the audit trail (2026-11-21)

Tests: `tests/auth/lookup-and-audit.test.ts`, 7 of 7 pass. Full backend run: 550 of 550 pass (`--maxWorkers=4`), type check clean.

### D9: An unknown tenant on a pre-login route returned a server error
- **Status:** Fixed (2026-11-21).
- **Severity:** Medium (it let anyone list which tenants exist).
- **Steps:** `POST /auth/login` with `X-Tenant-Id: zeta` (no such tenant), or `POST /auth/passkeys/login/options` with the same header.
- **Actual:** 500 `INTERNAL_ERROR`, because the tenant schema does not exist. A real tenant with an unknown login or a wrong password answers 401 `AUTH_INVALID_CREDENTIALS` (login) or 200 with a decoy credential (passkey options). The status code therefore showed whether a tenant exists.
- **Fix:** `tenantExists` in `src/db/tenant.ts`. Login now answers an unknown tenant with the same 401 as an unknown login, after the same hashing work. Passkey options return the same decoy credential and store nothing. Password-reset request returns its usual silent answer.
- **Not covered by a test:** the password-reset request change. The test app has no email delivery, so that route answers 503 for every tenant there. The change is the same check as in the other two routes.

### What the tests show
- A wrong password and an unknown login give identical answers (401 `AUTH_INVALID_CREDENTIALS`).
- A login with no `X-Tenant-Id` header is refused with 400.
- A failed sign-in for an unknown login is recorded with no user. A known user's failure, and a successful sign-in, are recorded against the user.
- `GET /audit-log` is refused (403) to a user without `access.manage`. The secret-column redaction already had its own test.

### D10: Sign-in events cannot be read through the API
- **Status:** Open. Needs a decision.
- **Severity:** Medium.
- **Actual:** logins, failures, lockouts, refreshes, logouts, passkey and step-up events, and session revokes are written to `core_auth_activity`. `GET /audit-log` reads only `audit_row_change` (data changes), so no endpoint shows these events. An access administrator cannot see failed sign-ins or lockouts without database access.
- **Also:** a failed sign-in for an unknown login is stored with no user and no login ID, so it cannot be tied to an attempt on a particular login. The client IP is not stored either: `ip_address` stays empty by design until the owner sets a retention period.
- **Expected:** decide whether administrators should see these events. If so, add a read-only route, such as `GET /audit-log/auth-events`, behind `access.manage`, and keep `secret_hash` and the challenge out of the output.

### D11: A pre-login call could fall back to the acme company
- **Status:** Fixed (2026-11-21). Decision: there is no tenant-less login.
- **Severity:** High (a login or password reset could reach the wrong company).
- **Actual:** the API client sent `X-Tenant-Id: acme` whenever no company had been chosen. The Forgot password page never chose one from the login ID, so a `BETA…` user who started there sent the reset to acme. The sign-in page itself already refused an unlisted prefix.
- **Fix:** the client has no default company (`src/shared/lib/api.ts`). The company is always set from the login ID's prefix. A pre-login call (login, refresh, password reset, passkey sign-in) with no company chosen is refused with `TENANT_REQUIRED` before anything is sent. A refresh token with no company is dropped. Forgot password now picks the company from the login ID and refuses an unlisted prefix.
- **Server side:** a login with no `X-Tenant-Id` header was already refused with 400 (tested in `tests/auth/lookup-and-audit.test.ts`).
- **Tests:** `src/test/tenant.test.tsx` (3). Frontend run: 91 of 91 pass. Checked in the browser: `ZZZ1234` on Forgot password shows the refusal, stores no company and sends no request.
- **Removed:** the `VITE_TENANT_ID` build setting no longer has any effect.

### Notes, not defects
- `POST /auth/passkeys/login/verify` has no rate limit of its own. A verify needs an unused challenge, and challenges come only from the limited `/options` route, so attempts are bounded in practice. Not tested.
- The pre-login limits are keyed by the tenant and login ID from the header, and by client IP. Varying the header gives a fresh per-login budget, but the per-IP limit still applies.

## Live exercise: auth cases, missing tenant and device revocation (2026-11-21)

Run against the dev backend (port 3200) and the dev frontend (port 5173). Script: `exercise-auth.cjs` in the session scratchpad. API: 38 of 39 checks pass. The one failure was a wrong check, not a defect (see the password-reset note).

### Auth cases (all pass)
- Login returns both tokens and the user, and no hash or secret fields.
- A wrong password and an unknown login give the same status, code and message.
- No bearer, a garbage bearer and an unsigned three-part bearer each get 401.
- Refresh returns a new pair. Reusing the old refresh token gets 401 and also ends the newer session (treated as theft).
- Logout: the access token stops working at once, and the refresh token is refused.
- Five wrong passwords lock the account. The right password is then refused with the same 401, so the answer does not show the lock.

### Missing tenant (all pass)
- API: a login or refresh with no `X-Tenant-Id` gets 400, and a malformed one gets 400. A tenant that does not exist gets the same 401 as an unknown login. Passkey options for an unknown tenant look like an unknown login in a real tenant (200 with a decoy).
- A protected call with a valid token needs no tenant header. A different tenant header does not move it.
- UI: `EXER9002` (prefix not listed) on the sign-in page shows "This login ID does not belong to a company set up here." No company is stored and no sign-in request is sent. A lower-case `acme8801` is accepted and signs in to acme.

### Device revocation (all pass)
- API: the list shows the user's live devices with their labels, exactly one marked current, and no token or hash fields. Revoking another device: 200. That device's access token stops at once, and its refresh token is refused. This device and a third device stay signed in, and the third can still refresh. The revoked device leaves the list. Revoking it again, an unknown ID or another user's device: 404, and the other user stays signed in. No sign-in: 401. A malformed ID: not 500.
- UI, Devices page: three devices listed, Sign out on each except this device. Signing out the laptop removed it from the list, and its access and refresh tokens were then refused.
- UI, revoked from elsewhere: another device revoked the browser's session. On the browser's next API call it was signed out, its refresh token and stored sign-in were cleared, and it went to the login page.

### Findings (minor, open)
- **Password reset is unavailable on this backend.** `POST /auth/password-reset/request` answers 503 `OTP_DELIVERY_UNAVAILABLE` for every tenant and login, because no email delivery is configured. The answers are identical, so nothing is revealed, but Forgot password cannot complete in this environment.
- **A revoked device keeps showing data until its next API call.** Moving between pages by the address hash uses data already in memory and makes no request. The device is signed out when it next calls the API, or when its access token expires (15 minutes).
- **The sign-out message was technical.** Fixed (2026-11-21). When the session cannot be restored, the API client now throws one `SESSION_ENDED` error: "You have been signed out. Your session ended, or this device was signed out from another one. Sign in again." (`src/shared/lib/api.ts`). A toast with the same text now replaces the earlier one instead of stacking (`src/shared/lib/toast.tsx`), so the dev build's double page load no longer shows it twice.
- **The redirect went to the admin login.** Fixed (2026-11-21). The login page remembers which login was used, for this tab (`src/modules/auth/utils/loginRole.ts`), and the guard sends the user back to it. Without a remembered login, it still goes to the admin login.
- **Checks:** `src/test/session.test.tsx` (3). Frontend run: 94 of 94 pass. In the browser, after another device revoked the session, the page showed the new message once and went to `#/login?role=user`.
- **User login and `next`:** fixed (2026-11-21, see below). The user login now returns to the `next` page, as the admin login does.

### Test accounts left in the dev database (acme)
`EXER9001`, `EXER9002`, `EXER9003` and `ACME8801` (names start "Exercise"). They share one random password, kept only in the session scratchpad. `EXER9001` is locked for 15 minutes from the run. They were not deleted; remove or deactivate them when you no longer need them.

## Integration fixes and the restore drill (2026-11-21)

Backend: 556 of 556 pass (`--maxWorkers=4`), type check clean. Frontend: 97 of 97 pass, type check clean.

### D12: Sign-in read the user list for users who cannot read it
- **Status:** Fixed.
- **Actual:** every sign-in called `GET /users`, which needs `access.manage`. A module user got two 403s on each sign-in (one per load in the dev build), shown as console errors.
- **Fix:** the sign-in load reads `/users` only when the user holds `access.manage` (`src/app/App.tsx`). Others keep the sample users, as when the read failed.
- **Checks:** `src/test/integration.test.tsx`: no `/users` call without the privilege, a call with it. In the browser as VELOX1003, a reload made 83 API calls, none to `/users`, and none failed.

### User login now honours `next`
- **Status:** Fixed. "Login as user" returns to the page that sent the user to sign in (only pages inside the app, the same rule as the admin login). Test in `src/test/integration.test.tsx`.

### D13: A restore onto a fresh server failed
- **Status:** Fixed. Found by the first run of the restore drill.
- **Severity:** High (the documented recovery did not work after a total loss).
- **Actual:** `npm run db:restore` runs `pg_restore --schema=tenant_<id>`, which restores the objects in the schema but not the schema itself. Onto a database where the tenant schema did not exist yet, it failed with "schema tenant_acme does not exist". The existing backup test restored over a schema that still existed, so it never saw this.
- **Fix:** `restoreTenant` creates the empty schema first when it is missing (`src/db/backup.ts`). The schema filter stays, so a restore never touches another tenant.

### Restore drill
- **New command:** `npm run db:drill -- <tenantId> [--report <file.md>] [--keep-dump]` (`src/db/restore-drill.ts`). It fingerprints the source tenant (row count and content checksum of every table), checks its audit chain, and dumps the shared data and the tenant schema. Then it creates a scratch database and restores in the real recovery order: global migrations, shared data, tenant. It compares every table and the audit chain, drops the scratch database, and reports each step's time. The source is only read. It exits with 1 on a failure. Documented in `CORE__BACKEND/docs/DEPLOYMENT.md`, "Restore drill".
- **Tests:** `tests/hardening/restore-drill.test.ts` (5): the comparison finds missing tables, changed counts, changed content and extra tables. A full drill passes with a shared unit and a material that references it, leaves the source untouched and drops its scratch database. An unsafe tenant ID is refused, and a failed drill still cleans up.
- **Run on the dev database (2026-11-21):** both passed with no differences. Reports are in `CORE__BACKEND/docs/restore-drills/`.
  - acme: 62 tables, 2,328 rows, 708 audit rows intact, dump 1.2 MiB, restore to verified copy 2.0 s.
  - beta: 1,201 rows, 413 audit rows intact, restore 2.0 s.
- **Fixed in the drill while testing:** a failed drop of the scratch database is now always reported, even after another failure, and the report names the scratch database. One scratch database left by an earlier failing run (a copy of test data) was dropped.

### Still open
- **Password reset needs an email provider.** No OTP delivery is wired into the server, so `/auth/password-reset/request` answers 503 everywhere. This needs a provider choice and credentials. A dev shortcut that logs the code would break the rule against logging secrets, so it was not added.
- **D10: sign-in events are not readable through the API.** This still needs your decision.
- **Leftover test databases:** the test server holds 19 old `velox_test_*` and `velox_migtest_*` databases from earlier test runs that did not finish their clean-up. They may slow the parallel run (D5). They were not deleted; drop them when you are ready.
- **D4 and D3:** not reproduced in this round.

## Regression suites: masters and identity (2026-11-21)

Documented in `CORE__BACKEND/docs/REGRESSION.md`. Commands: `npm run test:regression` (backend, both suites), `test:regression:masters`, `test:regression:identity`, and `npm run test:regression` in the frontend.

- **New contract tests:**
  - `tests/regression/masters-contract.test.ts`: 14 master resources checked against one contract (sign-in, privilege, validation, versioning, detail matches list, unknown or malformed IDs, unique values).
  - `tests/regression/identity-contract.test.ts`: every operation in the OpenAPI document must refuse a missing, garbage or forged token unless it is listed as public. It also checks the access-administration privilege, self-service routes, token claims and lifetime, and temporary passwords.
- **Results:**
  - Backend masters: 256 passed, 2 skipped (18 files).
  - Backend identity: 228 passed (19 files).
  - Frontend: 69 passed (5 files).
  - No defects found. Every protected route refuses requests without a valid token, and every master resource follows the contract.
- **Note, not a defect:** `PUT /files/{id}/content` checks the file type before the token. An anonymous upload with an unsupported type gets 400 instead of 401, and an anonymous upload of an allowed type has its body (up to 2 MB) read before the token is refused. Nothing leaks. Checking the token first would avoid reading the body.

## API v1 lock, release gate and regression run 1 (2026-11-21)

- **API v1 locked:** version 1.0.0, 253 operations in `CORE__BACKEND/docs/api/openapi-v1.json`, guarded by `tests/regression/api-v1-lock.test.ts`. Rules are in `CORE__BACKEND/docs/API_V1.md`.
- **Release gate:** both projects type-check, lint (0 errors) and build. Lint errors fixed on the way:
  - backend: Node globals for three seed scripts, and one unused variable
  - frontend: six layering violations (privilege helpers moved into the auth module; the step-up dialog no longer imports auth; the app imports modules through their entry points)
  - two stale lint directives removed
- **Regression run 1:**
  - API lock: 9 passed.
  - Masters: 256 passed, 2 skipped.
  - Identity: 228 passed.
  - Frontend regression: 69 passed.
  - Full suites: backend 666 passed (66 files), frontend 97 passed.
  - Evidence in `evidence/sprint-review-2026-11-21/`.
- **D5 cause found:** `tests/db/migrate.test.ts` dropped its scratch database without a retry. When a background process was still attached, the clean-up failed, the run failed, and the database was left behind. It now uses the shared retrying `dropDatabase` helper (`tests/db/helpers.ts`).
- **Staging:** not deployed. Waiting for the staging target.

## Schedule catch-up, 16–21 November (2026-11-21)

The task-by-task status is in `SCHEDULE-STATUS.md`. Defects found and fixed while closing the gaps:

- **D14: no database connection timeout.** Fixed. With the database unreachable, a request could hang. The pool now fails after 5 seconds (`src/db/client.ts`). Tests: `tests/core/db-failure.test.ts`.
- **D15: an unused ORM in the backend.** Fixed. Drizzle was installed and wired but never used, and the schedule rules it out. Removed.
- **D16: missing hot-path indexes.** Fixed in migration 0033. Refresh-by-hash scanned every session ever opened. The access history, approval inbox and audit trail first pages needed full sorts. Plans are in `evidence/sprint-review-2026-11-21/sql/`.
- **D17: editing a chain with fewer than 4 levels failed.** Fixed. The server returns only the levels it holds, but the form required exactly 4. Levels are now 1 to 20.
- **D18: the level validator crashed on an empty list.** Fixed (`src/modules/approvals/utils/schema.ts`).
- **D19: dead frontend call to a missing route.** Fixed. `deleteTicket` called `DELETE /tickets/{id}`, which the backend doesn't have. It was unused and is removed; the API contract test now guards every call.
- **D20: the previous user's data stayed in memory after sign-out.** Fixed. A deliberate sign-out or a server-ended session now resets the data store (`onSignedOut`).
- **D21: a repeat raise for the same source record created a second request.** Fixed. The request is idempotent on module and source record (migration 0032).
- **D22: approval levels had no upper limit.** Fixed: 1 to 4 by owner decision (first set to 20 in API 1.1.0, then 4 in API 1.2.0, migration 0034). A new chain starts with one level and can add up to four.
- **D23: database clean-up timed out under load.** Fixed. Hook timeout raised to 60 s in `vitest.config.ts`. Attempt 1 is kept in `evidence/schedule-16-21-nov/backend-ci-attempt1.log`.
- **Environment finding:** the dev PostgreSQL accepts any password on localhost (trust authentication). Staging must use scram-sha-256.
- **Owner decisions, not defects:** amount-band overlap (D5 in the status file), stack and tenancy deviations, the device-limit number, and the refresh token cookie. All are listed in `SCHEDULE-STATUS.md`.

### D24: a new company could not create any of the six policies
- **Status:** Fixed (2026-11-21).
- **Actual:** with no policy versions on the server, every policy page showed "Nothing to show: no version of this policy is loaded yet", and the list said "Not set" with only an Open button. The server would create the policy on the first save, but the screen offered no way to make one.
- **Fix:**
  - An unset policy page now opens its editor on a standard template (`src/modules/company/utils/templates.ts`). The person changes it, or keeps it as it is, and saves it as version 1.
  - The list shows "Set up from template" on each unset policy, and "Set up all / remaining from templates", which saves the templates as they are after a confirmation.
  - Holidays and shift timings write their company rows before the version.
  - Those two need the company profile first, and the page says so with a link.
- **Tests:** `src/test/policy-setup.test.tsx` (6). Frontend run: 113 of 113 pass.
- **Browser check:** on the empty DELTA company, all six showed "Set up". Rules and Holidays opened on their templates, and Holidays showed the company-profile note. Nothing was saved there.
- **Test account:** `DELTA8801` (no privileges) was added for the check, with the same throwaway password as the other "Exercise" accounts.

### Decision: one active session per user (2026-11-21)
- **Owner decision:** a user has one active session.
- **What changed:** `SESSION_DEVICE_LIMIT` now defaults to 1. Signing in on another device or browser signs the earlier session out at once (its access and refresh tokens stop working), and the event is recorded as `session_limit_revoked` in the access history. Refreshing the one session doesn't count as a new sign-in.
- **What users see:** the signed-out device shows "You have been signed out…" on its next action. Two browser tabs signed in as the same user count as two sessions, so the second sign-in ends the first.
- **Tests:** `tests/auth/access-history-device-limit.test.ts`. The device-list and refresh-reuse tests raise the limit, because they need several sessions. Backend run: 687 passed.
- **Live check:** a second sign-in for `ACME8801` signed out the first, leaving one session.
