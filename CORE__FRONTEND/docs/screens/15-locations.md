# 15 Locations (list and bulk upload)

Source: `src/modules/projects/pages/Sites.tsx`

The code calls these "sites". The screen calls them "Locations".

## 1. Purpose
Lists every location (a physical site) with its city, in-charge and status. Locations are created here and assigned to projects on the project page.

## 2. Route & access
- Path: `/sites`
- Access: Tenant Admin.

## 3. Data displayed
| Item | Field |
|---|---|
| Tiles | total, active, inactive, and the number of stores |
| Code | `code` |
| Location | `name`, `addressLine` |
| City | `city`, `state` |
| In-charge | `inCharge`, `phone` |
| Status | `status`: `Active` or `Inactive` |

Source: `useCore.sites`, `stores`.

## 4. User actions
| Control | Effect |
|---|---|
| New location | Goes to `/sites/new`. |
| Code, or Open | Goes to `/sites/:id`. |
| Bulk upload | `bulkAdd('sites', list)`. |
| Search (code, name, city), status chips, sort, CSV export | In the browser (`core-sites.csv`). |

## 5. Forms & validation
**Bulk upload columns:** `code`, `name`, `address`, `city`, `state`, `pin`, `in_charge`, `phone`, `email`, `status`.

Rows are checked with the location schema in [16](16-location-new.md). Codes must be unique against existing locations and within the file.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/sites`**
```json
{ "items": [{ "id": "S-201", "code": "CAMP-A", "name": "NH-65 camp A", "addressLine": "Km 12, Suryapet bypass", "city": "Suryapet", "state": "Telangana", "pin": "508213", "inCharge": "K. Raju", "phone": "9848012345", "email": "campa@veloxiq.example", "status": "Active" }] }
```
**POST `/api/v1/sites/bulk`**.

## 8. State & side effects
Writes the audit entry "Bulk upload: N location records added".

## 9. Navigation
- From: the menu.
- To: [16 New location](16-location-new.md), [17 Location detail](17-location-detail.md).

## 10. Open questions
- The API path: `/sites` (as the code names it) or `/locations` (as the screen and the handoff `core_location` table name it)? This document uses `/sites`, to match the field names the frontend uses (`sites`, `siteId`).
