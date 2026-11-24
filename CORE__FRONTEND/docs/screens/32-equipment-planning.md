# 32 Project equipment planning

Source: `src/modules/resources/pages/EquipmentPlanning.tsx`

## 1. Purpose
Defines the equipment each project needs, by type, quantity and period. It compares the plan with the units registered in the project, to show shortfall and surplus.

## 2. Route & access
- Path: `/equipment/planning`
- Access: Tenant Admin.

## 3. Data displayed
`PlanLine` fields:
- `id`, `equipmentType`, `projectId`;
- `plannedQty`, `from`, `to`;
- `reason` (shown as "Purpose").

| Item | How it is worked out |
|---|---|
| Tiles | planned units; onboarded units (registered in the project); lines with a shortfall; lines with a surplus |
| Registered / planned | units of this type in this project, against `plannedQty` |
| State | shortfall, surplus or matched (the gap is registered minus planned) |

Source: `planLines`, `units`, `projects`.

## 4. User actions
| Control | Effect |
|---|---|
| Show project | Filters. |
| Add plan line, or Edit | A dialog form. `savePlanLine`. Shows "Plan line added" or "Plan line saved". |
| Remove | A dialog that needs a reason (at least 3 characters: "Say why the line is being removed."). Then `removePlanLine`. Shows "Plan line removed". The reason is **not saved** today. |
| Bulk upload | `bulkAdd('planLines', list)`. |
| Search, chips, sort, CSV | In the browser (`core-equipment-plan.csv`). |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| equipmentType | required |
| plannedQty | a whole number, at least 1: "Whole units only." |
| projectId | required: "Choose the project." |
| from | required |
| to | required, and after from: "End date must be after the start date." |
| reason | at least 3 characters: "Say what the units are for." |

**Bulk upload columns:** `equipment_type`, `code` (the project code), `units`, `from`, `to`, `purpose`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/equipment/plan-lines?projectId=`**
  ```json
  { "items": [{ "id": "PL-1", "equipmentType": "Excavator", "projectId": "P-101", "plannedQty": 4, "from": "2026-10-01", "to": "2027-03-31", "reason": "Earthwork package 2", "registered": 3 }] }
  ```
- **POST `/api/v1/equipment/plan-lines`**, **PUT `/api/v1/equipment/plan-lines/{id}`**.
- **DELETE `/api/v1/equipment/plan-lines/{id}`**, with body `{ "reason": "..." }`. Save the reason in the audit entry.
- **POST `/api/v1/equipment/plan-lines/bulk`**.

Equipment assignment: `useCore.assignUnits` exists, but **no screen calls it**. If it is needed:
- **POST `/api/v1/equipment/assignments`** with `{ "equipmentType", "chainageId", "qty" }`;
- 422 `NOT_ENOUGH_READY` when `qty` is more than the available units minus those already assigned.

## 8. State & side effects
Writes the audit entries "Equipment plan added", "Equipment plan updated" and "Equipment plan removed".

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- Should the removal reason be stored? The dialog asks for it, but the store drops it.
- Is the equipment assignment feature (`core_equipment_assignment`) still needed without a screen?
