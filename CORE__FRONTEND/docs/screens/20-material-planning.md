# 20 Material planning

Source: `src/modules/projects/pages/MaterialPlanning.tsx`

## 1. Purpose
Plans the materials each project needs, with quantity (as per BOQ), required-by date, target store and status.

## 2. Route & access
- Path: `/material-planning`
- Access: Tenant Admin.

## 3. Data displayed
`MaterialPlanLine` fields:
- `id`, `projectId`, `materialId`;
- `qty`, `uom`, `requiredBy`, `storeId`;
- `status`: `Planned`, `Requested`, `Ordered` or `Received`.

Tiles show the line count, Planned plus Requested, Ordered, and Received.

Source: `useCore.materialPlan` (mock, `TODO(backend)`), with `materials`, `stores` and `projects`.

## 4. User actions
| Control | Effect |
|---|---|
| Show project | Filters. |
| Add material line, or Edit | A dialog. `saveMaterialPlan`. Shows "Material line added" or "Material line saved". |
| Remove | Asks first. `removeMaterialPlan`. |
| Bulk upload | `bulkAdd('materialPlan', list)`. |
| Search, chips, sort, CSV | In the browser (`core-material-plan.csv`). |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| projectId | required: "Choose a project." |
| materialId | required. Only active materials, or the line's current material. |
| qty | at least 1 |
| uom | required: "Unit is required." Filled from the material. |
| requiredBy | required: "Pick the required-by date." |
| storeId | required: "Choose a target store." Only active stores, or the current one. |
| status | `Planned`, `Requested`, `Ordered` or `Received` |

**Bulk upload columns:** `project_code`, `material`, `qty`, `required_by`, `store`, `status`.

## 6. Existing API calls
None. The code names `GET/POST/PUT/DELETE /projects/{id}/material-plan`.

## 7. Backend requirements (named in code)
- **GET `/api/v1/material-plan?projectId=`** **(inferred)**.
- **GET `/api/v1/projects/{id}/material-plan`**
  ```json
  { "items": [{ "id": "...", "projectId": "P-101", "materialId": "M-1", "qty": 1200, "uom": "Bag (50 kg)", "requiredBy": "2026-12-15", "storeId": "ST-1", "status": "Planned" }] }
  ```
- **POST**, **PUT `/{lineId}`** and **DELETE `/{lineId}`** on the same path.
- **POST `/api/v1/material-plan/bulk`** **(inferred)**.
- Errors:
  - 422 `MATERIAL_INACTIVE`;
  - 422 `STORE_INACTIVE`;
  - 422 when the store does not stock the material **(inferred)**.

## 8. State & side effects
Writes the audit entries "Material plan added", "Material plan updated" and "Material plan removed".

## 9. Navigation
- From: the menu, [14 Project detail](14-project-detail.md).
- To: none.

## 10. Open questions
- Should the target store be limited to stores at the project's locations?
- Who moves the status forward: Stores, or the admin?
