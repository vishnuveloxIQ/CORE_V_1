# VeloxIQ Core API: frontend handoff

Base URL (development): `http://127.0.0.1:3200`
Allowed browser origin: `http://localhost:5173` (set in `CORS_ORIGINS`)
Machine-readable spec: `GET /openapi.json`. Interactive page: `GET /docs` (development only).

## Required headers

| Header | When | Value |
| --- | --- | --- |
| `X-Tenant-Id` | every request | `acme` (development tenant) |
| `Authorization` | every protected route | `Bearer <accessToken>` |
| `Idempotency-Key` | every POST and PATCH except auth routes | a fresh UUID per user action |
| `Content-Type` | requests with a body | `application/json` |

## Sign-in flow

1. `POST /auth/login` with `{ "loginId", "password" }` and `X-Tenant-Id`. Returns `accessToken` and `refreshToken`.
2. Send `Authorization: Bearer <accessToken>` on protected routes.
3. When the access token expires, `POST /auth/refresh` with `{ "refreshToken" }`. It returns a new refresh token; **the old one is then dead**. Store the newest one only.
4. If an old refresh token is reused, the whole session is revoked (401). The user must sign in again.
5. `POST /auth/logout` ends the session.

Test accounts for development (passwords are NOT in this file; they are shared separately):

| loginId | Role |
| --- | --- |
| `sweep.ops` | operations user with grants |
| `sweep.plain` | plain user (read only on projects; cannot create) |

## Response format

- Success: `{ "data": ... }`, optionally with `"meta"`. Creates return 201.
- Error: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.
- Common codes: `AUTH_INVALID_CREDENTIALS` (401), `ACCESS_DENIED` (403), `VALIDATION_ERROR` (400), `IDEMPOTENCY_KEY_REQUIRED` (400), `IDEMPOTENCY_KEY_REUSED` (409), `RATE_LIMITED` (429, see `Retry-After`), `NOT_IMPLEMENTED` (501, offline sync is a stub).

## Rules the frontend must follow

- **Idempotency-Key:** generate one UUID per user action and reuse it only for a retry of that same action. Same key with a different body returns 409.
- **Optimistic locking:** every PATCH body must include `rowVersion` from the last read. Missing gives 400; stale gives 409 (reload, then retry).
- **Rate limit:** login is rate limited. Respect `Retry-After`.
- **Money and dates:** money is numeric (send as strings or numbers as the schema says); instants are ISO 8601 timestamps; calendar dates are `YYYY-MM-DD`.
- **Never** show stack traces or SQL; show `error.message`.

## Endpoints (207 operations)

"Bearer" = needs `Authorization`. "Public" = no token. Every operation except public ones also needs `X-Tenant-Id`. Request and response bodies are in `/openapi.json` and `/docs`.

### /access

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/access/users/{userId}` | Bearer |
| POST | `/access/users/{userId}/grants` | Bearer |
| DELETE | `/access/grants/{id}` | Bearer |
| POST | `/access/users/{userId}/suspensions` | Bearer |
| POST | `/access/suspensions/{id}/restore` | Bearer |

### /approval-chains

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/approval-chains` | Bearer |
| POST | `/approval-chains` | Bearer |
| GET | `/approval-chains/{id}` | Bearer |
| PATCH | `/approval-chains/{id}` | Bearer |
| DELETE | `/approval-chains/{id}` | Bearer |

### /approval-requests

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/approval-requests` | Bearer |
| POST | `/approval-requests` | Bearer |
| GET | `/approval-requests/{id}` | Bearer |
| POST | `/approval-requests/{id}/actions` | Bearer |
| GET | `/approval-requests/{id}/actions` | Bearer |

### /auth

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public |
| POST | `/auth/logout` | Bearer |
| GET | `/auth/me` | Bearer |
| POST | `/auth/password-reset/request` | Public |
| POST | `/auth/password-reset/confirm` | Public |
| POST | `/auth/passkeys/register/options` | Bearer |
| POST | `/auth/passkeys/register/verify` | Bearer |
| GET | `/auth/passkeys` | Bearer |
| DELETE | `/auth/passkeys/{id}` | Bearer |
| POST | `/auth/passkeys/login/options` | Public |
| POST | `/auth/passkeys/login/verify` | Public |
| GET | `/auth/me/access` | Bearer |

### /chainage-markers

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/chainage-markers` | Bearer |
| POST | `/chainage-markers` | Bearer |
| PATCH | `/chainage-markers/{id}` | Bearer |
| DELETE | `/chainage-markers/{id}` | Bearer |

### /custom-policies

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/custom-policies` | Bearer |
| POST | `/custom-policies` | Bearer |
| GET | `/custom-policies/{id}` | Bearer |
| PATCH | `/custom-policies/{id}` | Bearer |
| DELETE | `/custom-policies/{id}` | Bearer |

### /custom-policy-fields

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/custom-policy-fields` | Bearer |
| POST | `/custom-policy-fields` | Bearer |
| GET | `/custom-policy-fields/{id}` | Bearer |
| PATCH | `/custom-policy-fields/{id}` | Bearer |
| DELETE | `/custom-policy-fields/{id}` | Bearer |

### /custom-policy-versions

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/custom-policy-versions` | Bearer |
| POST | `/custom-policy-versions` | Bearer |
| GET | `/custom-policy-versions/{id}` | Bearer |
| PATCH | `/custom-policy-versions/{id}` | Bearer |
| DELETE | `/custom-policy-versions/{id}` | Bearer |

### /document-templates

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/document-templates` | Bearer |
| POST | `/document-templates` | Bearer |
| GET | `/document-templates/{id}` | Bearer |
| PATCH | `/document-templates/{id}` | Bearer |
| DELETE | `/document-templates/{id}` | Bearer |

### /equipment-assignments

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/equipment-assignments` | Bearer |
| POST | `/equipment-assignments` | Bearer |
| PATCH | `/equipment-assignments/{id}` | Bearer |
| DELETE | `/equipment-assignments/{id}` | Bearer |

### /equipment-types

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/equipment-types` | Bearer |
| POST | `/equipment-types` | Bearer |
| PATCH | `/equipment-types/{id}` | Bearer |

### /files

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/files` | Bearer |
| POST | `/files` | Bearer |
| GET | `/files/{id}` | Bearer |
| PATCH | `/files/{id}` | Bearer |
| DELETE | `/files/{id}` | Bearer |

### /geo-zones

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/geo-zones` | Bearer |
| POST | `/geo-zones` | Bearer |
| PATCH | `/geo-zones/{id}` | Bearer |
| DELETE | `/geo-zones/{id}` | Bearer |

### /grievances

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/grievances` | Bearer |
| POST | `/grievances` | Bearer |
| GET | `/grievances/{id}` | Bearer |
| PATCH | `/grievances/{id}` | Bearer |
| DELETE | `/grievances/{id}` | Bearer |

### /health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | Public |
| GET | `/health/ready` | Public |

### /import-batches

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/import-batches` | Bearer |
| POST | `/import-batches` | Bearer |
| GET | `/import-batches/{id}` | Bearer |
| POST | `/import-batches/{id}/submit` | Bearer |
| POST | `/import-batches/{id}/rows` | Bearer |

### /import-rows

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/import-rows` | Bearer |
| GET | `/import-rows/{id}` | Bearer |

### /leave-policies

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/leave-policies` | Bearer |
| POST | `/leave-policies` | Bearer |
| GET | `/leave-policies/{id}` | Bearer |
| PATCH | `/leave-policies/{id}` | Bearer |
| DELETE | `/leave-policies/{id}` | Bearer |

### /leave-policy-rules

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/leave-policy-rules` | Bearer |
| POST | `/leave-policy-rules` | Bearer |
| GET | `/leave-policy-rules/{id}` | Bearer |
| PATCH | `/leave-policy-rules/{id}` | Bearer |
| DELETE | `/leave-policy-rules/{id}` | Bearer |

### /leave-types

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/leave-types` | Bearer |
| POST | `/leave-types` | Bearer |
| GET | `/leave-types/{id}` | Bearer |
| PATCH | `/leave-types/{id}` | Bearer |
| DELETE | `/leave-types/{id}` | Bearer |

### /locations

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/locations` | Bearer |
| POST | `/locations` | Bearer |
| PATCH | `/locations/{id}` | Bearer |

### /major-material-allocations

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/major-material-allocations` | Bearer |
| POST | `/major-material-allocations` | Bearer |
| PATCH | `/major-material-allocations/{id}` | Bearer |
| DELETE | `/major-material-allocations/{id}` | Bearer |

### /materials

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/materials` | Bearer |
| POST | `/materials` | Bearer |
| PATCH | `/materials/{id}` | Bearer |

### /matrix-levels

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/matrix-levels` | Bearer |
| POST | `/matrix-levels` | Bearer |
| GET | `/matrix-levels/{id}` | Bearer |
| PATCH | `/matrix-levels/{id}` | Bearer |
| DELETE | `/matrix-levels/{id}` | Bearer |

### /matrix-versions

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/matrix-versions` | Bearer |
| POST | `/matrix-versions` | Bearer |
| GET | `/matrix-versions/{id}` | Bearer |
| PATCH | `/matrix-versions/{id}` | Bearer |
| DELETE | `/matrix-versions/{id}` | Bearer |
| POST | `/matrix-versions/{id}/publish` | Bearer |

### /milestones

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/milestones` | Bearer |
| POST | `/milestones` | Bearer |
| PATCH | `/milestones/{id}` | Bearer |
| DELETE | `/milestones/{id}` | Bearer |

### /notifications

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/notifications` | Bearer |
| GET | `/notifications` | Bearer |
| GET | `/notifications/{id}` | Bearer |
| POST | `/notifications/{id}/read` | Bearer |

### /offline-operations

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/offline-operations` | Public |

### /openapi.json

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/openapi.json` | Public |

### /organisation

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/organisation/company-profile` | Bearer |
| PUT | `/organisation/company-profile` | Bearer |
| GET | `/organisation/holidays` | Bearer |
| POST | `/organisation/holidays` | Bearer |
| PATCH | `/organisation/holidays/{id}` | Bearer |
| DELETE | `/organisation/holidays/{id}` | Bearer |
| GET | `/organisation/shifts` | Bearer |
| POST | `/organisation/shifts` | Bearer |
| PATCH | `/organisation/shifts/{id}` | Bearer |
| GET | `/organisation/number-series` | Bearer |
| POST | `/organisation/number-series` | Bearer |
| PATCH | `/organisation/number-series/{id}` | Bearer |
| GET | `/organisation/departments` | Bearer |
| POST | `/organisation/departments` | Bearer |
| PATCH | `/organisation/departments/{id}` | Bearer |
| DELETE | `/organisation/departments/{id}` | Bearer |
| GET | `/organisation/positions` | Bearer |
| POST | `/organisation/positions` | Bearer |
| PATCH | `/organisation/positions/{id}` | Bearer |
| DELETE | `/organisation/positions/{id}` | Bearer |

### /ot-policies

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/ot-policies` | Bearer |
| POST | `/ot-policies` | Bearer |
| GET | `/ot-policies/{id}` | Bearer |
| PATCH | `/ot-policies/{id}` | Bearer |
| DELETE | `/ot-policies/{id}` | Bearer |

### /ot-policy-rules

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/ot-policy-rules` | Bearer |
| POST | `/ot-policy-rules` | Bearer |
| GET | `/ot-policy-rules/{id}` | Bearer |
| PATCH | `/ot-policy-rules/{id}` | Bearer |
| DELETE | `/ot-policy-rules/{id}` | Bearer |

### /plan-lines

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/plan-lines` | Bearer |
| POST | `/plan-lines` | Bearer |
| PATCH | `/plan-lines/{id}` | Bearer |

### /pms-limit-rows

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/pms-limit-rows` | Bearer |
| POST | `/pms-limit-rows` | Bearer |
| GET | `/pms-limit-rows/{id}` | Bearer |
| PATCH | `/pms-limit-rows/{id}` | Bearer |
| DELETE | `/pms-limit-rows/{id}` | Bearer |

### /policies

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/policies` | Bearer |
| POST | `/policies` | Bearer |
| GET | `/policies/{id}` | Bearer |
| PATCH | `/policies/{id}` | Bearer |
| DELETE | `/policies/{id}` | Bearer |

### /policy-rules

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/policy-rules` | Bearer |
| POST | `/policy-rules` | Bearer |
| GET | `/policy-rules/{id}` | Bearer |
| PATCH | `/policy-rules/{id}` | Bearer |
| DELETE | `/policy-rules/{id}` | Bearer |
| POST | `/policy-rules/{id}/acknowledge` | Bearer |

### /policy-versions

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/policy-versions` | Bearer |
| POST | `/policy-versions` | Bearer |
| GET | `/policy-versions/{id}` | Bearer |
| PATCH | `/policy-versions/{id}` | Bearer |
| DELETE | `/policy-versions/{id}` | Bearer |
| POST | `/policy-versions/{id}/publish` | Bearer |

### /projects

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/projects` | Bearer |
| POST | `/projects` | Bearer |
| PATCH | `/projects/{id}` | Bearer |

### /record-timeline

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/record-timeline` | Bearer |
| POST | `/record-timeline` | Bearer |
| GET | `/record-timeline/{id}` | Bearer |

### /stores

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/stores` | Bearer |
| POST | `/stores` | Bearer |
| PATCH | `/stores/{id}` | Bearer |

### /tickets

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/tickets` | Bearer |
| POST | `/tickets` | Bearer |
| GET | `/tickets/{id}` | Bearer |
| PATCH | `/tickets/{id}` | Bearer |

### /usage-counters

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/usage-counters` | Bearer |
| GET | `/usage-counters/{id}` | Bearer |
| POST | `/usage-counters/increment` | Bearer |

### /vendors

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/vendors` | Bearer |
| POST | `/vendors` | Bearer |
| PATCH | `/vendors/{id}` | Bearer |
| POST | `/vendors/{id}/verify` | Bearer |

### /wbs-nodes

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/wbs-nodes` | Bearer |
| POST | `/wbs-nodes` | Bearer |
| PATCH | `/wbs-nodes/{id}` | Bearer |
| DELETE | `/wbs-nodes/{id}` | Bearer |
