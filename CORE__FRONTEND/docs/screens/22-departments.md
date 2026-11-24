# 22 Departments

Source: `src/modules/organisation/pages/Departments.tsx`, `src/modules/organisation/components/DepartmentForm.tsx`, `src/modules/organisation/utils/org.ts`

## 1. Purpose
Keeps the department list: name, code, parent department, head role, organogram colour and status. Other modules use departments, but only the admin maintains them.

## 2. Route & access
- Path: `/departments`
- Access: Tenant Admin.

## 3. Data displayed
| Item | Field |
|---|---|
| Tiles | active departments; active sub-departments (those with a `parentId`) |
| Code | `code` |
| Department, and what it is part of | `name`, the parent's name |
| Roles and positions | the number of active roles, and the sum of their `positions` |
| Head | the title of `headRoleId` and its holder |
| Status | `Active` or `Inactive` |

Source: `useCore.departments`, `roles`.

## 4. User actions
| Control | Effect |
|---|---|
| New department, or Edit (or click the code) | A dialog form. `saveDepartment`. Shows "<name> department created" or "<name> saved". |
| View on organogram | Goes to `/organogram?dept=<id>`. |
| Organogram | Goes to `/organogram`. |
| Bulk upload | `bulkAdd('departments', list)`. |
| Search, chips, sort, CSV | In the browser (`core-departments.csv`). |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| name | required, at most 60. Unique ignoring case: "Another department has this name." |
| code | 2 to 16 characters, `^[A-Z0-9-]+$`. Unique: "Another department uses this code." |
| parentId | optional. Only active departments that are not this one and not below it (so there are no loops). |
| headRoleId | optional. One of this department's active roles. |
| description | at most 300 |
| color | a whole number from 0 to 7 |
| colorHex | optional, `^#[0-9a-fA-F]{6}$`: "Enter a valid hex colour, for example #1A73E8." |
| status | `Active` or `Inactive`. See below. |

A department can be made Inactive only when:
- it has no active roles: "N active roles are in this department. Move or deactivate them first.";
- it has no active sub-departments: "<names> sit under it. Move or deactivate them first."

**Bulk upload columns:** `code`, `name`, `parent_code`, `description`, `status`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/departments`**
  ```json
  { "items": [{ "id": "D-1", "code": "PROJ", "name": "Projects", "parentId": null, "headRoleId": "R-02", "description": "", "color": 2, "colorHex": "#1A73E8", "status": "Active" }] }
  ```
- **POST `/api/v1/departments`**.
- **PUT `/api/v1/departments/{id}`**.
- **POST `/api/v1/departments/bulk`**.
- Errors:
  - 409 `CODE_TAKEN` or `NAME_TAKEN`;
  - 409 `HAS_ACTIVE_ROLES` or `HAS_ACTIVE_CHILDREN`;
  - 422 `PARENT_LOOP`.

## 8. State & side effects
Writes the audit entries "Department created", "Department updated", "Department deactivated" and "Department reactivated".

## 9. Navigation
- From: the menu.
- To: [21 Organogram](21-organogram.md).

## 10. Open questions
- There is no hard delete. Is deactivation enough?
