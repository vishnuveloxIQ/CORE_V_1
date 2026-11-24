# 21 Organogram

Source: `src/modules/organisation/pages/Organogram.tsx`, `src/modules/organisation/components/RoleForm.tsx`

## 1. Purpose
Draws the reporting structure from the roles and departments. From here the admin can open a role, edit it, add a subordinate role, or export the structure.

## 2. Route & access
- Path: `/organogram`
- Query:
  - `role=<roleId>` opens that role's side panel;
  - `dept=<departmentId>` highlights a department.
- Access: Tenant Admin.

## 3. Data displayed
| Item | Fields |
|---|---|
| Role cards | `title`, `code`, `grade`, holder (`heldText`: the holder's name, "N positions" or "Vacant"), department colour, number of direct reports |
| Department legend | `name`, `color` or `colorHex` |
| Side panel | the role's details, who it reports to, and its direct reports |

Source: `useCore.roles`, `departments`.

## 4. User actions
| Control | Effect |
|---|---|
| View: Chart or List | Phones start on the list. |
| Find a role or person | Filters the list or chart. |
| Department filter, or legend click | Highlights the department. |
| Show inactive roles | Toggle. |
| Zoom in or out, Expand all, Fold teams | Changes the chart view only. |
| Click a role card | Opens the side panel. |
| Side panel → Edit | Opens the role form (see [23](23-users-and-roles.md)). `saveRole`. |
| Side panel → Add a role under this one | Opens the role form with `reportsToId` filled in. |
| New role | Opens the role form. |
| Users and roles | Goes to `/users`. |
| Export | Asks for **step-up**, then downloads a CSV of all roles. Shows "Organisation exported: N roles". |

## 5. Forms & validation
The role form rules are in [23 Users and roles](23-users-and-roles.md).

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/roles`** and **GET `/api/v1/departments`** (see [22](22-departments.md) and [23](23-users-and-roles.md)).
- **GET `/api/v1/organisation/export.csv`**, with `X-Step-Up-Token`. Returns 200 `text/csv`. An export done on the server should also be audited.

## 8. State & side effects
- The export is a data export, which PRD §4 says needs step-up.
- Fold state, zoom and view are local state.

## 9. Navigation
- From: the menu, [22 Departments](22-departments.md) (`?dept=`), [23](23-users-and-roles.md) (`?role=`).
- To: [23 Users and roles](23-users-and-roles.md).

## 10. Open questions
- Should exports be audited? Today the frontend export writes no audit entry.
