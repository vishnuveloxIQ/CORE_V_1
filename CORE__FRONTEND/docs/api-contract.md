# VeloxIQ CORE API contract (proposed)

**Status:** the frontend makes **no API calls today**. All data is in-memory seed data (`useCore`). Every endpoint below is **(inferred)** from what the screens read and write, except the ones marked **named in code**, which come from `TODO(backend)` comments.

Entity shapes are in [data-model.md](data-model.md). Full request and response examples are in each screen file under [screens/](screens/).

## Conventions
- Base path `/api/v1`, JSON, camelCase field names exactly as in the data model.
- Auth uses a session cookie. Every call except the public ones is scoped to the signed-in user's tenant.
- Dates are `yyyy-MM-dd`. Timestamps are `yyyy-MM-dd'T'HH:mm:ss`. The frontend sends and shows local time with no zone; see [non-functional.md](non-functional.md).
- Lists return `{ "items": [...], "total": n }`. Lists that can grow large (audit, requests) take `cursor` and `limit` and return `nextCursor`. The frontend currently loads everything and filters in the browser.
- Errors:
  ```json
  { "error": { "code": "CODE_TAKEN", "message": "Another project uses this code.", "fields": { "code": "Another project uses this code." } } }
  ```
  `fields` keys match the form field names, so the frontend can call `setError(field, message)` directly.
  - 400 bad input
  - 401 not signed in or step-up needed
  - 403 not allowed
  - 404 not found
  - 409 conflict (unique or state)
  - 422 validation
  - 423 locked
  - 429 rate limit
- Step-up: protected writes need the `X-Step-Up-Token` header from `POST /auth/step-up`. Without it they return 401 `STEP_UP_REQUIRED`.
- Every write adds an audit entry on the server, in the same transaction.
- Bulk endpoints are all-or-nothing:
  - 201 returns `{ "created": n, "ids": [...] }`;
  - 422 returns `{ "rows": [{ "row": 3, "errors": ["..."] }] }`;
  - at most 500 rows.

## 1. Auth, session, shell
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | [02](screens/02-login.md) | `{ loginId, password }`. Returns 401 `INVALID_CREDENTIALS` (attemptsLeft), 423 `LOCKED` (lockedUntil) or 403 `NOT_APPROVED`. |
| 2 | GET | `/auth/session` | [02](screens/02-login.md), guard | the current user, or 401 |
| 3 | POST | `/auth/logout` | [05](screens/05-app-shell.md) | 204 |
| 4 | POST | `/auth/step-up` | [05](screens/05-app-shell.md), [14](screens/14-project-detail.md), [18](screens/18-geofences.md), [21](screens/21-organogram.md), [24](screens/24-user-detail.md), [38](screens/38-audit-trail.md) | `{ action, method: 'totp'\|'passkey', code? }` returns `{ stepUpToken, expiresAt }` |
| 5 | POST | `/auth/password-reset/request` | [04](screens/04-forgot-password.md) | `{ role, channel? , loginId? }` |
| 6 | POST | `/auth/password-reset/confirm` | [04](screens/04-forgot-password.md) | `{ resetId, code, newPassword }` |
| 7 | POST | `/otp/send` | [03](screens/03-register.md) | `{ channel, to, purpose }` |
| 8 | POST | `/otp/verify` | [03](screens/03-register.md) | `{ otpId, code }` returns `{ verificationToken }` |
| 9 | GET | `/registrations/login-id?company=` | [03](screens/03-register.md) | `{ loginId }` |
| 10 | POST | `/registrations` | [03](screens/03-register.md) | the company sign-up; returns 409 `EMAIL_TAKEN` or `LOGIN_ID_TAKEN` |
| 11 | GET | `/me` | [05](screens/05-app-shell.md) | `{ id, name, role, initials, tenantId }` |
| 12 | GET | `/nav-counts` | [05](screens/05-app-shell.md) | `{ approvalsPending, grievanceVisitRequests }` |
| 13 | GET | `/notifications` | [05](screens/05-app-shell.md) | `{ items: [{ id, icon, title, description, at, to, read }] }` |
| 14 | POST | `/notifications/{id}/read` | [05](screens/05-app-shell.md) | 204 |
| 15 | POST | `/notifications/read-all` | [05](screens/05-app-shell.md) | 204 |

## 2. Dashboard
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 16 | GET | `/dashboard?projectId=` | [06](screens/06-dashboard.md) | tiles, chart rows (per project or per marker), waiting requests |

## 3. Company, files, billing, support
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 17 | GET | `/company` | [07](screens/07-company-profile.md) | `CompanyProfile`, with `logo` and `offerLetter.url` as URLs |
| 18 | PUT | `/company` | [07](screens/07-company-profile.md) | the profile without the logo and offer letter |
| 19 | GET | `/company/pan-lookup?pan=` | [07](screens/07-company-profile.md) | `{ gstin, cin, tan }` (lookup named in a code comment) |
| 20 | PUT | `/company/logo` | [07](screens/07-company-profile.md) | multipart; PNG, JPG or SVG, at most 512 KB |
| 21 | DELETE | `/company/logo` | [07](screens/07-company-profile.md) | 204 |
| 22 | GET | `/company/offer-letter` | [07](screens/07-company-profile.md), [27](screens/27-job-openings.md) | `OfferLetterFile` with `url` |
| 23 | PUT | `/company/offer-letter` | [07](screens/07-company-profile.md) | multipart; pdf, doc or docx, at most 2 MB; new `fileId`, revision +1 |
| 24 | GET | `/files/{fileId}` | [07](screens/07-company-profile.md), [31](screens/31-equipment-register.md) | streams the file |
| 25 | GET | `/billing/subscription` | [08](screens/08-subscription.md) | plan, limits, usage |
| 26 | GET | `/billing/invoices` | [08](screens/08-subscription.md) | |
| 27 | GET | `/billing/plans` | [08](screens/08-subscription.md) | **named in code** |
| 28 | POST | `/billing/subscription/upgrade-requests` | [08](screens/08-subscription.md) | `{ plan }` **named in code** |
| 29 | POST | `/billing/subscription/renewals` | [08](screens/08-subscription.md) | **named in code** |
| 30 | POST | `/support/messages` | [08](screens/08-subscription.md) | `{ subject, message }` **named in code** |
| 31 | GET | `/support/tickets` | [39](screens/39-help.md) | |
| 32 | POST | `/support/tickets` | [39](screens/39-help.md) | `{ subject, category, priority, description }`; the server assigns `code` |

## 4. Policies
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 33 | GET | `/policies` | [09](screens/09-policies.md) | the current and scheduled version of each built-in and custom policy |
| 34 | GET | `/policies/versions` | [09](screens/09-policies.md) | every version, for the history table |
| 35 | GET | `/policies/{key}/versions` | [10](screens/10-policy-editor.md) | |
| 36 | POST | `/policies/{key}/versions` | [10](screens/10-policy-editor.md) | `{ effectiveFrom, reason, data }`. Also used by the overtime toggle. Returns 422 `EFFECTIVE_DATE_IN_PAST`. |
| 37 | GET | `/policies/{key}/current?on=` | HRMS, PMS, payroll | the version in force on a date |
| 38 | POST | `/custom-policies` | [09](screens/09-policies.md) | `{ name, description, fields, firstVersion }` |
| 39 | GET | `/custom-policies/{id}` | [11](screens/11-custom-policy.md) | the definition and its versions |
| 40 | POST | `/custom-policies/{id}/versions` | [11](screens/11-custom-policy.md) | `{ effectiveFrom, reason, values }` |

## 5. Projects, chainage, geo-fences
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 41 | GET | `/projects` | [12](screens/12-projects.md), many pickers | the light list; `?include=zones` for [18](screens/18-geofences.md) |
| 42 | POST | `/projects` | [13](screens/13-project-new.md) | returns 409 `CODE_TAKEN` |
| 43 | POST | `/projects/bulk` | [12](screens/12-projects.md) | |
| 44 | GET | `/projects/{id}` | [14](screens/14-project-detail.md) | the full Project |
| 45 | PATCH | `/projects/{id}` | [14](screens/14-project-detail.md) | the details fields |
| 46 | POST | `/projects/{id}/milestones` | [14](screens/14-project-detail.md) | returns 422 `WEIGHT_OVER_100` |
| 47 | PUT | `/projects/{id}/milestones/{milestoneId}` | [14](screens/14-project-detail.md) | |
| 48 | DELETE | `/projects/{id}/milestones/{milestoneId}` | [14](screens/14-project-detail.md) | |
| 49 | POST | `/projects/{id}/wbs` | [14](screens/14-project-detail.md) | returns 409 `CODE_TAKEN` or 422 `BAD_PREFIX` |
| 50 | DELETE | `/projects/{id}/wbs/{nodeId}` | [14](screens/14-project-detail.md) | returns 409 `HAS_CHILDREN` |
| 51 | POST | `/projects/{id}/locations` | [14](screens/14-project-detail.md) | `{ siteId }` |
| 52 | DELETE | `/projects/{id}/locations/{siteId}` | [14](screens/14-project-detail.md) | |
| 53 | GET | `/projects/{id}/zones` | [14](screens/14-project-detail.md), [18](screens/18-geofences.md) | |
| 54 | POST | `/projects/{id}/zones` | [14](screens/14-project-detail.md), [18](screens/18-geofences.md) | **step-up**; validates the shape |
| 55 | PUT | `/projects/{id}/zones/{zoneId}` | [14](screens/14-project-detail.md), [18](screens/18-geofences.md) | **step-up**; version +1 |
| 56 | DELETE | `/projects/{id}/zones/{zoneId}` | [14](screens/14-project-detail.md), [18](screens/18-geofences.md) | **step-up** |
| 57 | GET | `/projects/{id}/chainage` | [17](screens/17-location-detail.md), [06](screens/06-dashboard.md) | `{ startKm, endKm, markers }` |
| 58 | PUT | `/projects/{id}/chainage/range` | [17](screens/17-location-detail.md) | returns 422 `MARKERS_OUTSIDE_RANGE` |
| 59 | POST | `/projects/{id}/chainage/markers` | [17](screens/17-location-detail.md) | returns 409 `KM_TAKEN` or 422 `OUT_OF_RANGE` |
| 60 | DELETE | `/projects/{id}/chainage/markers/{markerId}` | [17](screens/17-location-detail.md) | returns 409 `MARKER_IN_USE` |
| 61 | POST | `/projects/{id}/chainage/markers/bulk` | [17](screens/17-location-detail.md) | |

## 6. Locations (sites)
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 62 | GET | `/sites` | [15](screens/15-locations.md), [14](screens/14-project-detail.md), [28](screens/28-stores.md) | |
| 63 | POST | `/sites` | [16](screens/16-location-new.md) | returns 409 `CODE_TAKEN` |
| 64 | GET | `/sites/{id}` | [17](screens/17-location-detail.md) | |
| 65 | PUT | `/sites/{id}` | [17](screens/17-location-detail.md) | |
| 66 | POST | `/sites/bulk` | [15](screens/15-locations.md) | |

## 7. Planning
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 67 | GET | `/people-plan?projectId=` | [19](screens/19-people-planning.md) | the cross-project list |
| 68 | GET | `/projects/{id}/people-plan` | [14](screens/14-project-detail.md), [19](screens/19-people-planning.md) | **named in code** |
| 69 | POST | `/projects/{id}/people-plan` | [19](screens/19-people-planning.md) | **named in code** |
| 70 | PUT | `/projects/{id}/people-plan/{lineId}` | [19](screens/19-people-planning.md) | **named in code** |
| 71 | DELETE | `/projects/{id}/people-plan/{lineId}` | [19](screens/19-people-planning.md) | **named in code** |
| 72 | POST | `/people-plan/bulk` | [19](screens/19-people-planning.md) | |
| 73 | GET | `/material-plan?projectId=` | [20](screens/20-material-planning.md) | |
| 74 | GET | `/projects/{id}/material-plan` | [14](screens/14-project-detail.md), [20](screens/20-material-planning.md) | **named in code** |
| 75 | POST | `/projects/{id}/material-plan` | [20](screens/20-material-planning.md) | **named in code** |
| 76 | PUT | `/projects/{id}/material-plan/{lineId}` | [20](screens/20-material-planning.md) | **named in code** |
| 77 | DELETE | `/projects/{id}/material-plan/{lineId}` | [20](screens/20-material-planning.md) | **named in code** |
| 78 | POST | `/material-plan/bulk` | [20](screens/20-material-planning.md) | |

## 8. Organisation and users
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 79 | GET | `/departments` | [22](screens/22-departments.md), [21](screens/21-organogram.md) | |
| 80 | POST | `/departments` | [22](screens/22-departments.md) | returns 409 `CODE_TAKEN` or `NAME_TAKEN` |
| 81 | PUT | `/departments/{id}` | [22](screens/22-departments.md) | returns 409 `HAS_ACTIVE_ROLES` or `HAS_ACTIVE_CHILDREN`, or 422 `PARENT_LOOP` |
| 82 | POST | `/departments/bulk` | [22](screens/22-departments.md) | |
| 83 | GET | `/roles` | [21](screens/21-organogram.md), [23](screens/23-users-and-roles.md) | |
| 84 | POST | `/roles` | [21](screens/21-organogram.md), [23](screens/23-users-and-roles.md) | returns 422 `SECOND_TOP_ROLE`, `REPORTING_LOOP`, `INACTIVE_BOSS` or `INACTIVE_DEPARTMENT` |
| 85 | PUT | `/roles/{id}` | [21](screens/21-organogram.md), [23](screens/23-users-and-roles.md) | also `HAS_ACTIVE_REPORTS` |
| 86 | POST | `/roles/bulk` | [23](screens/23-users-and-roles.md) | |
| 87 | GET | `/organisation/export.csv` | [21](screens/21-organogram.md) | **step-up** |
| 88 | GET | `/users` | [23](screens/23-users-and-roles.md), [33](screens/33-approval-matrix.md) | |
| 89 | GET | `/users/{id}` | [24](screens/24-user-detail.md) | |
| 90 | POST | `/users` | [24](screens/24-user-detail.md) | emails a temporary password; returns 409 `EMAIL_TAKEN`, `LOGIN_ID_TAKEN` or `MODULE_HEAD_TAKEN` |
| 91 | PUT | `/users/{id}` | [24](screens/24-user-detail.md) | **step-up** when privileges are added |
| 92 | PATCH | `/users/{id}/status` | [23](screens/23-users-and-roles.md), [24](screens/24-user-detail.md) | `{ status }`; returns 409 `MODULE_HEAD_TAKEN` |
| 93 | POST | `/users/{id}/reset-password` | [23](screens/23-users-and-roles.md), [24](screens/24-user-detail.md) | ends the user's sessions; sets mustChangePassword |
| 94 | POST | `/users/bulk` | [23](screens/23-users-and-roles.md) | |
| 95 | GET | `/users/next-login-id` | [24](screens/24-user-detail.md) | |
| 96 | GET | `/users/{id}/approver-of` | [24](screens/24-user-detail.md) | the chains and levels this user approves at |
| 97 | GET | `/privileges` | [24](screens/24-user-detail.md) | the `PRIVILEGES` catalogue per module |

## 9. Inventory
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 98 | GET | `/stores` | [28](screens/28-stores.md), [20](screens/20-material-planning.md), [29](screens/29-materials.md), [30](screens/30-live-stock.md) | |
| 99 | POST | `/stores` | [28](screens/28-stores.md) | returns 409 `CODE_TAKEN`, or 422 `UNKNOWN_MARKER` or `UNKNOWN_LOCATION` |
| 100 | PUT | `/stores/{id}` | [28](screens/28-stores.md) | |
| 101 | POST | `/stores/bulk` | [28](screens/28-stores.md) | |
| 102 | GET | `/materials` | [29](screens/29-materials.md), [20](screens/20-material-planning.md), [30](screens/30-live-stock.md) | |
| 103 | POST | `/materials` | [29](screens/29-materials.md) | |
| 104 | PUT | `/materials/{id}` | [29](screens/29-materials.md) | |
| 105 | POST | `/materials/bulk` | [29](screens/29-materials.md) | |
| 106 | GET | `/stock?storeId=&materialId=` | [30](screens/30-live-stock.md), [06](screens/06-dashboard.md), [26](screens/26-approval-detail.md) | |
| 107 | PUT | `/integrations/stores/stock` | the Stores module | inbound stock publishing; machine auth |

## 10. Equipment
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 108 | GET | `/equipment/units?projectId=&type=&availability=` | [31](screens/31-equipment-register.md), [32](screens/32-equipment-planning.md), [26](screens/26-approval-detail.md) | |
| 109 | GET | `/equipment/units/{id}` | [31](screens/31-equipment-register.md) | |
| 110 | POST | `/equipment/units` | [31](screens/31-equipment-register.md) | multipart (unit JSON plus 7 files); returns 409 `ASSET_CODE_TAKEN` or 422 `PROJECT_HAS_NO_MARKER` |
| 111 | POST | `/equipment/units/bulk` | [31](screens/31-equipment-register.md) | |
| 112 | GET | `/equipment/types` | [31](screens/31-equipment-register.md), [32](screens/32-equipment-planning.md) | the `EquipmentTypeMaster` list |
| 113 | GET | `/vendors` | [31](screens/31-equipment-register.md) | the owner and hire vendor list |
| 114 | GET | `/equipment/plan-lines?projectId=&type=` | [32](screens/32-equipment-planning.md), [26](screens/26-approval-detail.md) | |
| 115 | POST | `/equipment/plan-lines` | [32](screens/32-equipment-planning.md) | |
| 116 | PUT | `/equipment/plan-lines/{id}` | [32](screens/32-equipment-planning.md) | |
| 117 | DELETE | `/equipment/plan-lines/{id}` | [32](screens/32-equipment-planning.md) | body `{ reason }` |
| 118 | POST | `/equipment/plan-lines/bulk` | [32](screens/32-equipment-planning.md) | |
| 119 | POST | `/equipment/assignments` | no screen (`assignUnits`) | `{ equipmentType, chainageId, qty }`; returns 422 `NOT_ENOUGH_READY` |
| 120 | GET | `/pms-limits` | no screen | **named in code** |
| 121 | PUT | `/pms-limits` | no screen | **named in code** |

## 11. Approvals
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 122 | GET | `/requests?status=&type=&category=&q=&cursor=` | [25](screens/25-approvals-list.md), [06](screens/06-dashboard.md), [27](screens/27-job-openings.md) | the list, without history and payload, unless `type=Job opening` |
| 123 | GET | `/requests/{id}` | [26](screens/26-approval-detail.md) | with payload, history and the resolved chain version |
| 124 | POST | `/requests/{id}/decisions` | [26](screens/26-approval-detail.md) | `{ action, level, comment, decision? }`; see the errors below |
| 125 | POST | `/requests/{id}/clarifications` | [26](screens/26-approval-detail.md) | `{ comment }` (at least 5) |
| 126 | POST | `/requests/{id}/publish` | [26](screens/26-approval-detail.md), [27](screens/27-job-openings.md) | job openings only |
| 127 | POST | `/integrations/requests` | HRMS, PMS, Stores, P&M | inbound: raise a request; the server picks the chain and version |
| 128 | GET | `/approval-chains` | [33](screens/33-approval-matrix.md), [34](screens/34-chain-new.md) | with the current and latest version |
| 129 | POST | `/approval-chains` | [34](screens/34-chain-new.md) | returns 409 `SCOPE_CLASH` |
| 130 | GET | `/approval-chains/{id}` | [35](screens/35-chain-editor.md), [26](screens/26-approval-detail.md) | |
| 131 | POST | `/approval-chains/{id}/versions` | [35](screens/35-chain-editor.md) | `{ effectiveFrom, reason, levels[4] }` |
| 132 | GET | `/approvers` | [34](screens/34-chain-new.md), [35](screens/35-chain-editor.md) | the active CORE users and the Tenant Admin |

Errors for `POST /requests/{id}/decisions`:
- 409 `LEVEL_MISMATCH` or `ALREADY_DECIDED`;
- 403 `NOT_APPROVER_AT_LEVEL` or `SELF_APPROVAL`;
- 422 `DECISION_REQUIRED`.

## 12. Grievances and audit
| # | Method | Path | Used by | Notes |
|---|---|---|---|---|
| 133 | GET | `/grievances` | [36](screens/36-grievances-list.md) | |
| 134 | GET | `/grievances/{id}` | [37](screens/37-grievance-detail.md) | with history |
| 135 | POST | `/grievances` | the raising app | inbound; message at most 10 words; visitDate in the future |
| 136 | POST | `/grievances/{id}/visit` | [37](screens/37-grievance-detail.md) | `{ status, note, visitDate? }`; see the errors below |
| 137 | GET | `/audit?entity=&entityId=&user=&from=&to=&q=&cursor=&limit=` | [38](screens/38-audit-trail.md), [24](screens/24-user-detail.md) | |
| 138 | GET | `/audit/export.csv` | [38](screens/38-audit-trail.md) | **step-up**; the export is itself audited |

Errors for `POST /grievances/{id}/visit`:
- 409 `INVALID_TRANSITION`;
- 422 `VISIT_NOT_DUE` or `DATE_IN_PAST`.

**Total: 138 endpoints.**
- 132 serve a screen, or an inbound feed that a screen depends on.
- 3 have no screen yet: assignments and PMS limits.
- 3 are inbound integrations: stock, requests and grievances.

## Example: the request decision
```http
POST /api/v1/requests/REQ-2039/decisions
Content-Type: application/json

{ "action": "Approved", "level": 1, "comment": "Transfer from camp A", "decision": { "route": "Transfer", "fromStoreId": "ST-1" } }
```
```json
{ "id": "REQ-2039", "status": "In review", "currentLevel": 2,
  "payload": { "kind": "material", "materialId": "M-1", "qty": 400, "neededBy": "2026-11-08", "storeId": "ST-2", "decision": { "route": "Transfer", "fromStoreId": "ST-1" } },
  "history": [{ "level": 1, "by": "Anil Mehta", "action": "Approved", "at": "2026-11-19T10:02:00", "comment": "Transfer from camp A" }] }
```
