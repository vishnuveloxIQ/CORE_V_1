# 19 Resource planning (manpower)

Source: `src/modules/projects/pages/PeoplePlanning.tsx`

## 1. Purpose
Plans the manpower each project needs: role or trade, headcount, period and status.

## 2. Route & access
- Path: `/people-planning`
- Access: Tenant Admin.

## 3. Data displayed
`PeoplePlanLine` fields:
- `id`, `projectId`, `role`, `headcount`;
- `from`, `to`;
- `status`: `Planned`, `Confirmed` or `Fulfilled`.

Tiles show total headcount, and headcount per status.

Source: `useCore.peoplePlan`. This is mock data, marked `TODO(backend)` in code.

## 4. User actions
| Control | Effect |
|---|---|
| Show project | Filters the table and tiles (local state). |
| Add requirement, or Edit | A dialog. `savePeoplePlan`. Shows "Requirement added" or "Requirement saved". |
| Remove | Asks first. `removePeoplePlan`. Shows "Requirement removed". |
| Bulk upload | `bulkAdd('peoplePlan', list)`. |
| Search, chips, sort, CSV | In the browser (`core-people-plan.csv`). |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| projectId | required: "Choose a project." |
| role | required: "Role or trade is required." |
| headcount | a whole number, at least 1: "Whole numbers only." |
| from | required: "Pick a start date." |
| to | required, and after from: "End date must be after the start date." |
| status | `Planned`, `Confirmed` or `Fulfilled` |

**Bulk upload columns:** `project_code`, `role`, `headcount`, `from`, `to`, `status`.

## 6. Existing API calls
None. The code names `GET/POST/PUT/DELETE /projects/{id}/people-plan`.

## 7. Backend requirements (named in code)
- **GET `/api/v1/people-plan?projectId=`**, a list across all projects **(inferred, for the "All projects" view)**.
- **GET `/api/v1/projects/{id}/people-plan`**
  ```json
  { "items": [{ "id": "...", "projectId": "P-101", "role": "Mason", "headcount": 40, "from": "2026-11-01", "to": "2027-02-28", "status": "Confirmed" }] }
  ```
- **POST `/api/v1/projects/{id}/people-plan`**. 201 returns the line.
- **PUT `/api/v1/projects/{id}/people-plan/{lineId}`**.
- **DELETE `/api/v1/projects/{id}/people-plan/{lineId}`**. Returns 204.
- **POST `/api/v1/people-plan/bulk`** **(inferred)**.

## 8. State & side effects
Writes the audit entries "People plan added", "People plan updated" and "People plan removed".

## 9. Navigation
- From: the menu, [14 Project detail](14-project-detail.md).
- To: none.

## 10. Open questions
- Should `role` be picked from organogram roles, instead of free text?
- Does HRMS move a line to Fulfilled, or the admin?
