# 16 New location

Source: `src/modules/projects/pages/SiteNew.tsx`, `src/modules/projects/components/SiteForm.tsx`, `src/modules/projects/utils/site/schema.ts`

## 1. Purpose
Creates a location.

## 2. Route & access
- Path: `/sites/new`
- Access: Tenant Admin.

## 3. Data displayed
An empty form. The state defaults to "Telangana".

## 4. User actions
| Control | Effect |
|---|---|
| Create location | `saveSite`. Shows "Location created" and goes to `/sites/:id`. |
| Cancel | Goes back in history. |
| Back to locations | Goes to `/sites`. |

## 5. Forms & validation
| Field | Required | Rule and message |
|---|---|---|
| code | yes | 2 to 16 characters, `^[A-Z0-9-]+$`. Unique: "Another location uses this code." |
| name | yes | "Location name is required." |
| addressLine | yes | "Address is required." |
| city | yes | "City is required." |
| state | yes | "State is required." |
| pin | yes | `^\d{6}$`: "PIN code is 6 digits." |
| inCharge | yes | "Location in-charge is required." |
| phone | yes | `^[6-9]\d{9}$`: "Enter a 10-digit mobile number." |
| email | yes | "Enter a valid email address." |
| status | yes | `Active` or `Inactive` |

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**POST `/api/v1/sites`** with the fields above.
- 201 returns the `Site`.
- 409 `CODE_TAKEN`.
- 422 returns field errors.

## 8. State & side effects
Writes the audit entry "Location created".

## 9. Navigation
- From: [15 Locations](15-locations.md).
- To: [17 Location detail](17-location-detail.md).

## 10. Open questions
None.
