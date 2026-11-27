# Sprint 1 demo script (CORE-20-03)

About 20 minutes, on the dev frontend (`npm run dev`, http://localhost:5173) and backend (port 3200). Use test accounts only. Each part shows the happy path and then at least one failure.

## 1. Sign-in and company (identity)

1. **Unlisted company:** open "Login as user" and enter a login ID with an unlisted prefix, such as `ZZZ1234`. **Expect:** "This login ID does not belong to a company set up here.", with nothing sent to the server.
2. **Normal sign-in:** sign in as a module user, such as `VELOX1003`. **Expect:** the header chip names the company (hover it to see the company ID).
3. **Wrong password:** sign in with one. **Expect:** the same message as for an unknown login. Five wrong attempts lock the account without saying so.
4. **Account menu:** open Devices and show the signed-in devices. Sign one out.
5. **Session ended elsewhere:** revoke this tab's session from another device, then click any page. **Expect:** "You have been signed out…" once, and the user login page.

## 2. Access (roles and scope)

1. **Menu:** as the module user, show that Users and roles and Audit trail are missing from the menu.
2. **Direct link:** open `#/users` directly. **Expect:** "You do not have access to this page".
3. **Server check:** say that the server refuses the same request with 403 even when called directly. The identity regression suite checks every route.
4. **Admin and step-up:** as an admin, grant a privilege. **Expect:** the passkey step-up dialog, or "Add a passkey first…" for an account without one.

## 3. Master data journey

1. **Project to site:** Projects, then a project, then the Locations tab, then a location, then Chainage.
2. **Duplicate code:** create a project with a duplicate code. **Expect:** a 409 duplicate message.
3. **Version conflict:** edit the same record in two tabs and save both. **Expect:** the second save is refused as stale (409).
4. **No privilege:** as the module user, show that no create or edit buttons appear.

## 4. Approvals

1. **Levels 1 to 4:** Approval matrix, then New approval chain. **Expect:** one level to start. Add levels up to four: **expect** Add level to switch off. Only the last level can be removed.
2. **Request detail:** open a request. **Expect:** "levels as fixed when raised", the site or "Head office / whole company", and "Waiting on".
3. **Snapshot:** say that a matrix change after a request was raised doesn't change it (tested in `tests/approvals/matrix-edges.test.ts`).

## 5. Failure states

1. **Backend down:** stop the backend and reload. **Expect:** "Cannot reach the server…" on sign-in; readiness `/health/ready` answers 503 with no details.
2. **Password reset:** Forgot password currently answers "not available yet" (no email provider; blocker D10).

## 6. Evidence to show

- `SCHEDULE-STATUS.md` (task status and blockers)
- `evidence/schedule-16-21-nov/backend-ci.log` and `frontend-ci.log`
- `evidence/sprint-review-2026-11-21/README.md` (regression 1, restore drill)
