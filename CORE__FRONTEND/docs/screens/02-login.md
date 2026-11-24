# 02 Login (admin and user)

Source: `src/modules/auth/pages/Login.tsx`, `src/modules/auth/store/useAuth.ts`

## 1. Purpose
Signs a person in. One route holds two forms:
- the **Tenant Admin login**, which is the only login that works today;
- the **user login** for module users, which never succeeds in the demo.

## 2. Route & access
- Path: `/login`
- Query params:
  - `role=admin` shows the admin form. Any other value, or no value, shows the user form.
  - `next=<path>` (admin only) is where to go after sign-in. Only paths inside the app are accepted: they must start with `/`, not with `//`, and must not be `/login`. Anything else falls back to `/dashboard`.
- Access: public. A signed-in user is redirected to `next` (admin) or `/dashboard` (user).
- The route guard sends a signed-out user here as `/login?role=admin&next=<original path>`.

## 3. Data displayed
| Item | Type | Source |
|---|---|---|
| Error banner | string | local state |
| Lock countdown (seconds) | number | `useAuth.lockedUntil` |
| Hero text | — | component |

## 4. User actions
| Control | Effect |
|---|---|
| Sign in (admin) | Calls `useAuth.login(loginId, password)`. See the results below this table. |
| Sign in (user) | Checks the form, then always shows "We could not find an approved account for these details…". |
| Show or hide password | Switches the input type. |
| Forgot password link | Goes to `/forgot?role=admin` or `/forgot?role=user`. |
| Register link (user form) | Goes to `/register`. |

What the admin sign-in returns:
- `ok`: shows the toast "Signed in" and goes to `next`.
- `invalid`: shows an error with the number of attempts left.
- `locked`: shows the lock message.
- `insecure`: says sign-in needs https or localhost.

## 5. Forms & validation
**Admin form**
| Field | Type | Rule | Message |
|---|---|---|---|
| loginId | text | required (trimmed) | "Enter your login ID." |
| password | password | required | "Enter your password." |

**User form**
| Field | Type | Rule | Message |
|---|---|---|---|
| loginId | text | `^[A-Za-z0-9]{3,6}\d{4}$` | "Enter your login ID, for example ACME1234." |
| password | password | required | "Enter your password." |

Lockout: after 5 failed admin attempts (`MAX_ATTEMPTS`), sign-in is locked for 30 seconds (`LOCK_MS`). The message is "Login ID or password is wrong. N attempts left before a 30-second lock."

## 6. Existing API calls
None. The admin check compares the login ID with `admin`, and the password's SHA-256 hash with a hash built into the bundle (`checkCredentials`). The code marks this as demo only.

## 7. Backend requirements (inferred)
**POST `/api/v1/auth/login`**
```json
{ "loginId": "VELOX1021", "password": "********" }
```
200:
```json
{
  "user": { "id": "U-600", "loginId": "VELOX1000", "name": "Anil Mehta", "role": "Tenant Admin", "mustChangePassword": false },
  "signedInAt": "2026-11-19T09:15:00",
  "mfaRequired": false
}
```
The session token is set in an HttpOnly cookie **(inferred)**.

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Wrong ID or password. Include `attemptsLeft`. |
| 423 | `LOCKED` | Too many attempts. Include `lockedUntil` (ISO). |
| 403 | `NOT_APPROVED` | A user login for an account still awaiting approval. |
| 403 | `MUST_CHANGE_PASSWORD` | The first login after an admin reset (see [24 User detail](24-user-detail.md)) **(inferred)**. |

The attempt counter and the lock must move to the server. Today they live in session storage, where the user can clear them.

**GET `/api/v1/auth/session`** returns the same `user` object, or 401. The app calls it on page load to restore the session.

## 8. State & side effects
- `useAuth` keeps `{ user, signedInAt, failed, lockedUntil, signedOut }` in `sessionStorage` under the key `veloxiq-core-auth:v1`. The session ends when the tab closes.
- After a deliberate sign-out, `signedOut` stops the guard from adding `?next=` once.
- While sign-in is locked, a 1-second timer updates the countdown.
- Sets the document title.

## 9. Navigation
- From:
  - [01 Home](01-home.md);
  - the route guard;
  - [03 Register](03-register.md), after submit, with `role=user`;
  - [04 Forgot password](04-forgot-password.md).
- To: `next` or [06 Dashboard](06-dashboard.md), [04 Forgot password](04-forgot-password.md), [03 Register](03-register.md).

## 10. Open questions
- How do module users sign in, and where do they land? The user form exists, but this app has no user area.
- PRD §4 asks for MFA and one active session per user. Is MFA asked at login, or only at step-up?
- Is the admin login ID `admin`, or a generated ID such as `VELOX1000` like other users?
