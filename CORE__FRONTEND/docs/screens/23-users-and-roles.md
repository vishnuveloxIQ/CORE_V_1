# 23 Users and roles

Source:
- `src/modules/organisation/pages/Users.tsx`
- `src/modules/organisation/components/RolesSection.tsx`
- `src/modules/organisation/components/RoleForm.tsx`
- `src/modules/organisation/components/ConfirmDialog.tsx`
- `src/modules/organisation/utils/org.ts`

## 1. Purpose
One page with two views:
- **Users**: the CORE accounts, which are module heads and high-level approvers.
- **Roles**: the positions on the organogram.

Module users are not managed here; they come from HRMS.

## 2. Route & access
- Path: `/users`
- Query: `dept=<departmentId>` preselects a department chip in the Roles view.
- Access: Tenant Admin.

## 3. Data displayed
**Users view.** `CoreUser` fields:

| Field | Type | Notes |
|---|---|---|
| loginId | string | shown as "User ID" |
| name, email, phone, designation | string | |
| role | `Module head` or `Approver` | |
| modules | `('HRMS'\|'PMS'\|'Stores'\|'P&M')[]` | module heads only |
| scopeType, scopeIds | `Company` or `Project`, and project IDs | |
| privileges | string[] | for example `hrms.users.manage` |
| status | `Active` or `Inactive` | |
| lastLogin | ISO or null | |
| mustChangePassword, createdAt, employeeId?, positionId? | | not shown |

Tiles: active module administrators, active high-level approvers, inactive users.

The card "Module administrators by module" shows the one active head of each module, or "No administrator".

**Roles view.** `Role` fields:
- `code`, `title`, `departmentId`, `grade`;
- `reportsToId`, `positions`, `holder`;
- `description`, `status`.

Tiles: active roles; vacant key roles (single-position roles with no holder). Columns include the number of direct reports.

## 4. User actions
| Control | Effect |
|---|---|
| View switch (Users or Roles) | Local state. |
| New user | Goes to `/users/new`. |
| Login ID, or Edit | Goes to `/users/:id`. |
| Reset password | Opens a dialog, then `resetPassword(id)`. See below. |
| Deactivate or Reactivate | Opens a dialog, then `saveUser({ ...u, status })`. See below. |
| Add administrator (on a module with none) | Goes to `/users/new`. |
| Bulk upload (users) | `bulkAdd('users', list)`. |
| Roles: New role, or Edit | The role form dialog. `saveRole`. Shows "<title> added to the organisation" or "<title> saved". |
| Roles: View on organogram | Goes to `/organogram?role=<id>`. |
| Roles: Bulk upload | `bulkAdd('roles', list)`. |
| Search, chips, sort, CSV | In the browser (`core-users.csv`, `core-roles.csv`). |

Reset password:
- sets `mustChangePassword = true`;
- shows the toast "A temporary password will be sent to the registered email address… all active sessions will be ended."

Reactivating is blocked when another active head already holds one of the user's modules ("One administrator per module").

## 5. Forms & validation
**Role form**
| Field | Rule and message |
|---|---|
| title | required, at most 60 |
| code | 2 to 16 characters, `^[A-Z0-9-]+$`. Unique: "Another role uses this code." |
| departmentId | required: "Choose the department." It must be active: "<dept> is inactive. Choose an active department." |
| grade | one of `GRADES` (E executive, M manager, S staff, W workmen): "Choose a grade." |
| reportsToId | optional. See the rules below. |
| positions | a whole number from 1 to 500 |
| holder | at most 60. Kept only when `positions === 1`. |
| description | at most 300 |
| status | `Active` or `Inactive`. An Inactive role may have no active direct reports: "N active roles report to it (...). Move them first." |

Rules for `reportsToId`:
- Only one active role may report to no one: "Only one role reports to no one: <top>. Choose who this role reports to."
- No loops: "That would make a reporting loop. Choose a role above this one."
- The boss must be active: "<boss> is inactive."

**User bulk upload columns:** `name`, `designation`, `email`, `phone`, `login_id`, `role`, `modules`, `scope`, `scope_codes`. Each row is rejected when:
- the email is not valid, is already taken, or appears twice in the file;
- the phone is not a 10-digit mobile number;
- a module already has an active head.

**Role bulk upload columns:** `code`, `title`, `department_code`, `grade`, `reports_to_code`, `positions`, `held_by`, `description`, `status`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/users`** returns `{ "items": [CoreUser] }`. Never return password data.
- **POST `/api/v1/users/{id}/reset-password`**. Returns 204. Emails a temporary password, sets `mustChangePassword` and ends all sessions.
- **PATCH `/api/v1/users/{id}/status`** with `{ "status": "Inactive" }`. Ending the user's sessions on deactivate is inferred. 409 `MODULE_HEAD_TAKEN` on reactivate, with `{ "module": "HRMS", "heldBy": "U-602" }`.
- **POST `/api/v1/users/bulk`**. Returns 409 or 422 per row. Every new user gets a temporary password by email.
- **GET `/api/v1/roles`**, **POST `/api/v1/roles`**, **PUT `/api/v1/roles/{id}`**, **POST `/api/v1/roles/bulk`**.
- Role errors:
  - 409 `CODE_TAKEN`;
  - 422 `SECOND_TOP_ROLE`, `REPORTING_LOOP`, `INACTIVE_BOSS`, `INACTIVE_DEPARTMENT` or `HAS_ACTIVE_REPORTS`.

## 8. State & side effects
- Audit entries:
  - "Role created", "Role updated", "Reporting line changed";
  - "Password reset — change forced at next login";
  - "User deactivated", "User reactivated".
- Emails: temporary passwords.
- Deactivating should end sessions **(inferred)**.

## 9. Navigation
- From: the menu, [21 Organogram](21-organogram.md), [33 Approval matrix](33-approval-matrix.md).
- To: [24 User detail](24-user-detail.md), [21 Organogram](21-organogram.md).

## 10. Open questions
- Is the rule "one active head per module" a hard rule for the server?
- `employeeId` and `positionId` exist in the data but are not on any form. Who sets them: HRMS, or the admin?
- Is the role "holder" free text or a link to a person? Today it is free text.
