# 03 Register (company sign-up)

Source: `src/modules/auth/pages/Register.tsx`

## 1. Purpose
A new company registers for VeloxIQ. The email and the mobile number are each verified with an OTP. Access is enabled only after approval.

## 2. Route & access
- Path: `/register`
- Access: public. A signed-in user is redirected to `/dashboard`.

## 3. Data displayed
| Item | Type | Source |
|---|---|---|
| Generated login ID | string | built from the company name plus 4 random digits |
| OTP status messages | string | local state |
| Country dial codes | list | `utils/countryCodes` |

## 4. User actions
| Control | Effect |
|---|---|
| Send OTP (email or mobile) | Checks that field, makes a 6-digit OTP in the browser and shows it in a toast labelled demo. |
| Verify (email or mobile) | Compares the typed OTP and marks the value verified. Changing the email, the number or the country afterwards removes the verification. |
| Show or hide password | Switches the input type. |
| Register | Checks the form and that both are verified. See below. |

When Register is pressed:
- If the email or the mobile number is not verified, it shows "Verify your email and mobile number with an OTP before registering."
- Otherwise it shows the toast "Registration received. Your access will be enabled after approval." and goes to `/login?role=user`.

## 5. Forms & validation
| Field | Type | Required | Rule and message |
|---|---|---|---|
| company | text | yes | "Enter your company name." |
| email | email | yes | `^\S+@\S+\.\S+$`: "Enter a valid email address." |
| country | select | yes | dial code; India by default |
| mobile | tel | yes | 6 to 15 digits, without the country code: "Enter a valid mobile number (6 to 15 digits, without the country code)." |
| loginId | text, read-only | yes | Generated. Must match `^[A-Za-z0-9]{3,6}\d{4}$`: "Enter a company name with at least 3 letters or digits to generate your login ID." |
| password | password | yes | at least 8 characters: "Use at least 8 characters." |
| confirm | password | yes | must match password: "Passwords do not match." |
| terms | checkbox | yes | must be ticked: "Accept the terms to continue." |
| email OTP and mobile OTP | text | yes | 6 digits that match the sent code |

## 6. Existing API calls
None. OTPs are made in the browser, and nothing is saved.

## 7. Backend requirements (inferred)
**POST `/api/v1/otp/send`**
```json
{ "channel": "email", "to": "admin@acme.example", "purpose": "registration" }
```
200 `{ "otpId": "otp_9f2", "expiresAt": "2026-11-19T09:25:00" }`. 429 `RATE_LIMITED`.

**POST `/api/v1/otp/verify`**
```json
{ "otpId": "otp_9f2", "code": "481920" }
```
200 `{ "verificationToken": "vt_..." }`. 400 `OTP_INVALID` with `attemptsLeft`. 410 `OTP_EXPIRED`.

**GET `/api/v1/registrations/login-id?company=Acme`** returns `{ "loginId": "ACME4821" }`, so the server makes sure the ID is unique.

**POST `/api/v1/registrations`**
```json
{
  "company": "Acme Infra",
  "email": "admin@acme.example",
  "mobile": "+919876543210",
  "loginId": "ACME4821",
  "password": "********",
  "termsAccepted": true,
  "emailVerificationToken": "vt_...",
  "mobileVerificationToken": "vt_..."
}
```
201 `{ "registrationId": "REG-1001", "status": "Pending approval" }`.

Errors:
- 409 `EMAIL_TAKEN` or `LOGIN_ID_TAKEN`;
- 400 `NOT_VERIFIED`;
- 422 with field errors.

## 8. State & side effects
- Sends an email OTP and an SMS OTP once those services exist.
- The page has no loading states today. The backend calls will need them.

## 9. Navigation
- From: [01 Home](01-home.md), or the user form on [02 Login](02-login.md).
- To: [02 Login](02-login.md) with `?role=user`.

## 10. Open questions
- Who approves a registration, and where? CORE has no approval screen for it.
- Does a registration create a tenant, a Tenant Admin, or a module user?
- Where are the terms published?
