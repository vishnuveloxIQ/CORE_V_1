# 04 Forgot password

Source: `src/modules/auth/pages/ForgotPassword.tsx`

## 1. Purpose
Resets a password with a one-time code. The admin receives the OTP by email or phone. A module user's OTP goes to their company administrator.

## 2. Route & access
- Path: `/forgot`
- Query: `role=admin` starts the admin flow. Any other value starts the user flow.
- Access: public. A signed-in user is redirected to `/dashboard`.

## 3. Data displayed
| Item | Source |
|---|---|
| Masked admin email `a•••••@company.com` and phone `+91 •••••• ••210` | hard-coded demo masks |
| Step (`request` or `verify`) | local state |
| Errors | local state |

## 4. User actions
| Control | Effect |
|---|---|
| Channel radio (admin) | Choose email or phone. |
| Send OTP | The user flow checks the login ID first. Makes an OTP in the browser, shows it in a demo toast and moves to the verify step. |
| Reset password | Checks the OTP, the new password and its confirmation. After 5 wrong OTPs it shows "Too many wrong attempts. Request a new OTP." See below for success. |
| Resend OTP | Goes back to the request step. |
| Show or hide password | Switches the input type. |

On success it shows the toast "Password reset request accepted (demo, the stored password is unchanged)." and goes to `/login?role=…`.

## 5. Forms & validation
| Field | Step | Rule and message |
|---|---|---|
| channel | request (admin) | `email` or `phone` |
| loginId | request (user) | `^[A-Za-z0-9]{3,6}\d{4}$`: "Enter your login ID, for example ACME1234." |
| code | verify | 6 digits: "Enter the 6 digit OTP." If wrong: "That OTP is not correct." |
| pw | verify | at least 8 characters: "Use at least 8 characters." |
| pw2 | verify | must equal pw: "Passwords do not match." |

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**POST `/api/v1/auth/password-reset/request`**
```json
{ "role": "admin", "channel": "email" }
```
or
```json
{ "role": "user", "loginId": "ACME1234" }
```
200 `{ "resetId": "pr_77", "sentTo": "a•••••@company.com", "expiresAt": "..." }`. Answer 200 for unknown IDs too, so that accounts cannot be guessed **(inferred)**.

**POST `/api/v1/auth/password-reset/confirm`**
```json
{ "resetId": "pr_77", "code": "123456", "newPassword": "********" }
```
204.

Errors:
- 400 `OTP_INVALID` with `attemptsLeft`;
- 429 `TOO_MANY_ATTEMPTS`;
- 410 `OTP_EXPIRED`;
- 422 `WEAK_PASSWORD`.

## 8. State & side effects
- Sends the OTP by email or SMS.
- For a user reset, notifies their company administrator.

## 9. Navigation
- From: [02 Login](02-login.md).
- To: [02 Login](02-login.md).

## 10. Open questions
- For a user reset, does the admin pass the OTP on to the user, or approve the reset?
- The admin form asks for no login ID. Which identifier selects the admin account?
