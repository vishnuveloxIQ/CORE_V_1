# 12 Projects (list and bulk upload)

Source: `src/modules/projects/pages/Projects.tsx`

## 1. Purpose
Lists every project with its client, value, period, number of locations and status. Projects can be added one at a time or in bulk from a CSV file.

## 2. Route & access
- Path: `/projects`
- Access: Tenant Admin.

## 3. Data displayed
| Item | Field | Type |
|---|---|---|
| Tiles | total, `status === 'Active'`, `status === 'Completed'` | number |
| Code | `code` | string |
| Project / client | `name`, `client` | string |
| Value | `value` | number (INR) |
| Time period | `startDate` – `endDate` | ISO date |
| Locations | `locationIds.length` | number |
| Status | `status`: `Planning`, `Active`, `On hold` or `Completed` | enum |

Source: `useCore.projects`.

## 4. User actions
| Control | Effect |
|---|---|
| New project | Goes to `/projects/new`. |
| Code, or Open | Goes to `/projects/:id`. |
| Bulk upload | Opens the CSV dialog (see [05](05-app-shell.md)), then `bulkAdd('projects', list)`. |
| Search (code, name, client), status chips, sort, CSV export | In the browser (`core-projects.csv`). |

## 5. Forms & validation
**Bulk upload columns:** `code`, `name`, `client`, `start_date`, `end_date`, `contract_value`, `status`, `description`.

Each row is checked with the project schema from [13 New project](13-project-new.md). It is also rejected when:
- the code is already used;
- the code appears twice in the file.

New rows start with:
- empty milestones, WBS, zones and `locationIds`;
- an empty plan;
- chainage `{ startKm: 0, endKm: 0, markers: [] }`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/projects`**
```json
{ "items": [{ "id": "P-101", "code": "NH65-PKG2", "name": "NH-65 widening, package 2", "client": "NHAI", "startDate": "2025-04-01", "endDate": "2027-03-31", "status": "Active", "value": 4120000000, "description": "...", "locationIds": ["S-201", "S-202"] }], "total": 3 }
```
The list does not need milestones, WBS, zones or chainage.

**POST `/api/v1/projects/bulk`** with `{ "items": [ProjectInput] }`. See [05](05-app-shell.md) for the response.

## 8. State & side effects
Writes the audit entry "Bulk upload: N project records added".

## 9. Navigation
- From: the menu.
- To: [13 New project](13-project-new.md), [14 Project detail](14-project-detail.md).

## 10. Open questions
- Project IDs: the form builds `P-<n+1>` in the browser. The server must assign IDs.
