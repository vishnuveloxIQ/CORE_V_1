# Handover: implementing the VeloxIQ Core design in another application

Audience: an engineer or team who will rebuild these behaviours in a different application, stack, or codebase.

This document describes **what the system must do**, the **rules**, the **data**, the **screens**, and the **acceptance checks**. It names the VeloxIQ files only as references for where the behaviour currently lives. Do not copy code from them without reading them. Where the current implementation is inconsistent or incomplete, this document says so in section 14 (Open items).

Status: describes the working tree as of the last change in this session. Some items are not yet verified in a browser or by the test suite (see section 13).

---

## 1. Purpose and scope

VeloxIQ Core is an administration console for a construction company. It covers:

1. **Projects**: project records, their chainage (distance markers), geofences, and manpower and equipment plans.
2. **Equipment**: a register of machines (units), their availability, and their assignment to projects.
3. **Approvals**: requests raised by module users, decided level by level by approvers, with clarification and publishing for job openings.
4. **People**: manpower requirements per project, approved people, and a comparison of approved against onboarded people.
5. **Company setup**: departments, roles, users, policies, audit.

This handover covers the pieces that changed most recently:

- Removal of "locations" as a separate concept (projects, stores, geofences and equipment attach to a project directly).
- Per-unit project assignment and release for equipment.
- Project equipment planning showing assigned units next to planned units.
- Manpower requirements with planned, onboarded and vacant counts.
- Approved people: edit, delete, forward (file upload), compare, project filter.
- Approval request screens: action buttons shown only to people who can act, identifiers removed from display, short module labels, job-route labels.
- Navigation and visual changes listed in section 12.

Out of scope here: the full approval matrix editor, grievance handling, audit internals, authentication, and the HRMS integration (which is mocked in the frontend).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| Tenant / company | An isolated customer. One database schema per tenant. |
| Project | A construction project. Has a code (e.g. `CNL-PH1`), a name, a status, and chainage markers. |
| Chainage marker | A labelled distance along a project, in km. |
| Store | A material store that belongs to a project. |
| Geofence / zone | A geographic area attached to a project (circle or corridor). |
| Equipment type | A category such as Excavator, Dump Truck. Units refer to it by name. |
| Unit (equipment unit) | One physical machine, identified by a company asset code. |
| Availability | Unit state: Available, In use, Under maintenance, Breakdown. |
| Assignment (unit) | A unit placed on a project. Sets the unit to In use and stores its project. |
| Assignment (type) | Legacy per-project, per-type quantity record. Still shown, still separate. |
| Plan line | A planned need for equipment of one type at one project, with a quantity and period. |
| Manpower requirement (people plan line) | A planned headcount for one role at one project, with a period and status. |
| Approved person | A person approved for a project, department and designation, with a joining date. |
| Onboarded | Status set when HRMS reports the person has joined. |
| Approval request | A request raised by a user, with a type, a chain of levels, and decisions. |
| Level | One step of an approval chain. Each level has an approver. |
| Clarification | An approver asks the raiser a question; the request waits for the answer. |
| Job opening | An approval request type that opens a vacancy; it can be published to a site. |
| Route (job) | How a job opening is filled: Direct site hiring, or Head Office hiring. |
| Module | A functional area: HRMS (also written HR), PMS, Stores (shown as MM), P&M (shown as FEM). |

Module short labels shown on screen: **Stores → MM**, **P&M → FEM**, **PMS → PCM**. HRMS is unchanged.

---

## 3. Domain model

### 3.1 Project
- Fields used here: `id`, `code` (unique within a company), `name`, `status`, `startDate`, `endDate`, `chainage { startKm, endKm, markers[] }`, `consultantName`, `state`, `executionMode`, `department`, `projectType`.
- Chainage markers: `id`, `km` (number), `label`. Two markers cannot have the same km in one project.

### 3.2 Equipment unit
| Field | Type | Rule |
|---|---|---|
| `id` | UUID | server-assigned |
| `assetCode` | text, ≤40 | unique per company, case-insensitive |
| `equipmentTypeId` | UUID | must exist |
| `projectId` | UUID, nullable | **new**: the project the unit is assigned to; null when unassigned |
| `availability` | enum | Available / In use / Under maintenance / Breakdown |
| `currentLocation` | text, ≤200, nullable | free text; replaces the former location link |
| `rowVersion` | int ≥ 1 | optimistic lock; every write must send the version it read |
| other fields | text/dates/numbers | make, model, chassis, engine, capacity, meter, fuel, owner, hire reference, expiries, documents, photo |

Write rules:
- Create requires `assetCode` and `equipmentTypeId`.
- Update sends any subset of fields plus `rowVersion`. A stale version returns a conflict (409 `VERSION_CONFLICT`).
- Null clears a nullable field.
- **Assignment guard (server):** if the stored unit is `In use` and an update sets `projectId` to a *different non-null* project, refuse with 409 `EQUIPMENT_UNIT_IN_USE`.
- **Release** is an update that sets `availability = Available` and `projectId = null`. The guard does not block it.
- Unknown project ids are refused as a reference error.

### 3.3 Equipment assignment (legacy, per type)
- One row per (project, equipment type), with a quantity.
- Created by `POST /equipment-assignments`, edited by `PATCH`, removed by `DELETE`.
- Kept for now. Not created by the unit Assign action.

### 3.4 Plan line (equipment)
- Fields: `projectId`, `equipmentType`, `plannedQty`, `from`, `to`, `capacity`, `model`, `reason`.
- Grouped for display into one row per (project, equipment type).

### 3.5 Manpower requirement (people plan line)
- Fields: `projectId`, `positionId`, `role`, `headcount`, `from`, `to`, `status` (Planned, Confirmed, Fulfilled).
- `from` is the start date; `to` is the end date.

### 3.6 Approved person (frontend mock today)
- Fields: `id`, `projectCode`, `department` (a department name), `name`, `designation`, `joiningDate`, `status`.
- Status values: `Approved`, `With HRMS`, `Onboarded`.
- Transitions in the store: Approved → With HRMS (`sendToHrms`), With HRMS → Onboarded (`markOnboarded`). **No screen calls these now** (section 14).

### 3.7 Approval request
- Fields used on screen: `code`, `type`, `module`, `title`, `raisedBy`, `raisedById`, `raisedAt`, `chainageId` (a marker id), `emergency`, `status` (Pending, Approved, Rejected, clarification requested, cancelled), `currentLevel`, `levelsSnapshot[]`, `history[]`, `payload` (kind-specific), `publishedAt`.
- The approval chain (`ApprovalChain`) holds versions; each version holds levels with an approver and a timeout.

---

## 4. Rules (consolidated)

### 4.1 Equipment assignment
- **R-EQ-1** Assign applies to one unit at a time.
- **R-EQ-2** Assign is allowed only when the unit's availability is `Available`. Units that are In use, Under maintenance, or in Breakdown cannot be assigned.
- **R-EQ-3** A successful assignment sets `projectId` to the chosen project and `availability` to `In use`, in one save.
- **R-EQ-4** The server refuses a second assignment to a different project while the unit is In use (409 `EQUIPMENT_UNIT_IN_USE`).
- **R-EQ-5** Release is offered only for `In use` units. Confirm before releasing. Release sets `availability` to `Available` and clears `projectId`.
- **R-EQ-6** Edit can set availability directly. Setting a unit back to `Available` there, then assigning it again, is allowed.
- **R-EQ-7** Assignment is not kept as history. Releasing loses the previous project.

### 4.2 Equipment planning display
- **R-EP-1** Rows are one per (project, equipment type). Lines for the same pair are added together.
- **R-EP-2** `Units planned` = sum of planned quantities in the row.
- **R-EP-3** `Assigned` = number of units where `projectId` equals the row's project, `type` equals the row's equipment type (case-insensitive, trimmed), and `availability` is `In use`.
- **R-EP-4** Planned and assigned sit in the same row, so a reader sees both at once.

### 4.3 Manpower requirements display
- **R-MP-1** Columns: Project, Role, Planned, Onboarded, Vacant. No status or date columns.
- **R-MP-2** `Planned` = the requirement's headcount.
- **R-MP-3** `Onboarded` = count of approved people where project code, department name, and designation (trimmed, case-insensitive) all equal the requirement's project code, department, and role.
- **R-MP-4** `Vacant` = max(0, Planned − Onboarded). Never negative.
- **R-MP-5** The status filter chips (for example All, Confirmed, Planned) still filter on the status value, even though the Status column is not shown.
- **R-MP-6** Stat cards at the top: Total headcount, Planned, Confirmed, Onboarded. The Fulfilled card is removed.

### 4.4 Approval request actions
- **R-AP-1** Decision buttons (Reject, Clarify, Approve) are shown only when the signed-in user can act on the request now.
  - Not the raiser (segregation of duties: a raiser never approves their own request).
  - The request is not in clarification.
  - The signed-in user is the approver of the current level, when the level names one person. A level that names a role is left to the server to decide.
- **R-AP-2** While a clarification is open:
  - The raiser sees a response box and a "Send response" button.
  - Everyone else sees the question and the note that the request waits for the raiser. No decision buttons.
- **R-AP-3** The "Go to decision" header button is removed. For closed requests the header shows "Next request".
- **R-AP-4** Identifiers are not shown to users on this screen:
  - The approval chain subtitle shows scope and matrix version, not the chain id.
  - The chainage row shows the marker label only. If no marker matches, it shows a dash.
- **R-AP-5** Approve/Reject/Clarify and the server decide the outcome. A cash limit (payments) can stop approval at a lower level.

### 4.5 Request labels
- **R-LB-1** Raised-by names: a bracketed module name is shortened. `Stores` → `MM`, `P&M` → `FEM`, `PMS` → `PCM`. Example: `Ananya Gupta (Stores module head)` shows as `Ananya Gupta (MM module head)`. The stored name does not change. Other names are unchanged.
- **R-LB-2** Job routes display as:
  - stored `Site hires directly` → shown **Direct site hiring**
  - stored `Head Office posts and sends candidate` → shown **Head Office hiring**
  - Stored values do not change. Apply the label only on screen and in exports.

### 4.6 Approved people
- **R-AP2-1** Add, edit, delete, bulk upload, and forward all require `masters` management privilege.
- **R-AP2-2** Edit keeps the person's status. Delete asks for confirmation and cannot be undone.
- **R-AP2-3** Bulk upload and Forward accept the same five columns: `project_code`, `department`, `employee_name`, `designation`, `joining_date`.
- **R-AP2-4** Row checks: the project code must exist; the department must exist as a department name; name and designation are required; joining date must be a valid date (yyyy-mm-dd). Failing rows show their messages and are not imported. Valid rows are added as `Approved`.
- **R-AP2-5** The **Show project** filter limits the table and the row numbering (Sl no) to that project. "All projects" shows everyone.
- **R-AP2-6** **Compare** dialog: for each project in scope, shows Approved (everyone on the project, any status), Onboarded (status Onboarded), and Not yet onboarded (Approved − Onboarded). With more than one row, a Total row is added. The project filter in the dialog starts on the page's selected project.

### 4.7 Navigation
- **R-NAV-1** "Approvals" lives in the **Projects** group. It is not in the HR management group.
- **R-NAV-2** Every menu entry has its own icon. The Approvals entry uses `fileCheck`.
- **R-NAV-3** The Locations menu entry and the `/sites` routes are removed. `/geofences` remains.

### 4.8 Search
- **R-SR-1** A search result of type `location` opens the projects list (there is no location page).

---

## 5. Screens and behaviour

### 5.1 Equipment register
- Header: Bulk upload / Add (existing).
- Filter chips by availability with counts. Search by asset code, name, type, registration number.
- Table columns (current): S No, Category, Made, Model, Capacity/Size, Company Code, Current Project, Current Status, actions.
- Row actions:
  - **Assign** — enabled only when availability is `Available` and the type is known to the server. Tooltip when disabled: "`<code>` is `<availability>`", or "This type is not on the server yet".
  - **Release** — shown only for `In use` units. Confirms, then releases.
  - **Details** — opens the unit panel. Shows the project assignments (legacy) panel.
- Wizard (add): four steps. Step 1 requires a project (saved as the unit's project). Current location is free text.
- Bulk upload: `project_code` must match a project; unknown code is a row error.

### 5.2 Assign dialog (unit)
- Title: "Assign to project". Description: "Assign this unit to a project."
- Helper: "`<code>` · `<type>`. Once assigned, the unit is In use and cannot be assigned again."
- One field: Project (select, lists projects that exist on the server).
- On submit: refuse if not `Available`; refuse if no project; otherwise save the unit with the project and `In use`.
- Success notice: "Equipment assigned to project".

### 5.3 Available equipment
- Lists units with availability `Available` only. Columns: Asset (code and name), Type, Model, Capacity / size, action.
- Action: **Assign to project** (same dialog).
- Stat tiles: Units available, Equipment types.

### 5.4 Project equipment planning
- Header: Bulk upload, Add plan line.
- Project filter ("Show project").
- Stat tiles: Planned units, Equipment types, Projects planned.
- Table "Equipment planned" columns: Type, Needed at, Capacity / size, Model, Units planned, **Assigned**, Needed from, actions.
- Actions: Edit and Remove (single line) or "Manage N lines".

### 5.5 Manpower requirements (Resource planning)
- Header: Bulk upload, Add requirement.
- Project filter ("Show project").
- Stat tiles: Total headcount, Planned, Confirmed, Onboarded.
- Table "Manpower requirements" (no subtitle text): Project, Role, Planned, Onboarded, Vacant, actions (Edit, Remove).
- Status chips above the table (All, Confirmed, Planned, …) with counts, multi-select, search box, Download.

### 5.6 Approved list
- Header buttons, left to right: **Bulk upload**, **Add Employee**, **Forward**, **Compare**.
- Filter: **Show project**.
- Stat/status chips: All, Approved, Onboarded, With HRMS, with counts.
- Table columns: Sl no, Project, Department, Employee name, Designation, Joining date, Status, actions (**Edit**, **Delete**).
- Add/Edit dialog: Project (select), Department (select), Employee name, Designation, Joining date. Title changes with the mode; the save button reads "Add person" or "Save changes".
- Delete: confirmation "Delete `<name>` from the approved list? This cannot be undone."
- Forward and Bulk upload: file upload dialog with the template and row checks (R-AP2-3, R-AP2-4).
- Compare: dialog (R-AP2-6).

### 5.7 Approvals list
- Tabs/chips by category. Columns: Request ID, Type, **Project** (project name or "Company-wide"), Title / raised by (with R-LB-1 labels), Level, Raised On, Required by, Status.
- Action: Review (open) or View (closed).
- The same request table appears on the dashboard. It takes the project list so the Project column resolves.

### 5.8 Approval request page
- Header: title = request code; description = type and title. Right side: "Next request" for closed requests only (R-AP-3).
- Left column: Request summary (status, type, raised by with R-LB-1 label, raised on, chainage label without ids, project, emergency, needed by, matrix version, current level, waiting on), and type checks.
- Right column:
  - Approval chain card: subtitle is scope and matrix version (no chain id). Levels list with approver names and reminder interval.
  - Decision card: "Your decision" / "Clarification requested". Shows the decision controls and buttons only per R-AP-1 and R-AP-2.
  - For job openings: route options with labels from R-LB-2. The stored values remain.

### 5.9 Job openings
- Columns: Request, Position, Project (split from position), CTC range, Route (label from R-LB-2, "Not decided" if unknown), Approval, Raised, Stage.
- Stage chips and publish action per existing rules.

### 5.10 Approved list and projects
- The Approved list is the source of the Onboarded count used on the Manpower requirements table (R-MP-3).

---

## 6. Data flows and API contracts

These are the calls the current frontend makes. Paths are relative to the API base. All writes send an `Idempotency-Key` header. Responses use `{ data, meta? }`; errors use `{ error: { code, message, details? } }`.

### 6.1 Equipment units
- `GET /equipment-units` — query: `equipmentTypeId`, `status`, `search`.
- `POST /equipment-units` — body: unit fields (section 3.2). Requires `assetCode`, `equipmentTypeId`.
- `PATCH /equipment-units/{id}` — body: any subset of unit fields plus `rowVersion`.
  - Errors: 404 not found; 409 `VERSION_CONFLICT`; 409 `EQUIPMENT_UNIT_IN_USE`; 400 file not found; 409 duplicate asset code.
- Release uses `PATCH` with `{ availability: "Available", projectId: null, rowVersion }`.
- Assign uses `PATCH` with `{ projectId, availability: "In use", rowVersion }` (sent with the whole unit by the current frontend).

### 6.2 Equipment types and legacy assignments
- `GET /equipment-types`, `POST`, `PATCH`.
- `GET /equipment-assignments?projectId=`, `POST` (projectId, equipmentTypeId, qty), `PATCH /{id}` (qty, rowVersion), `DELETE /{id}`.

### 6.3 Plan lines
- `GET /plan-lines`, equipment plan line `POST`, `PATCH`, `DELETE`/cancel (existing; see the planning module).

### 6.4 Projects, locations, stores
- `GET /projects`, `PATCH /projects/{id}` (chainage range), project markers under `/chainage-markers`.
- `GET /locations` — read only. Still used to fill the locations list for approval forms.
- `GET /stores`, `POST`, `PATCH` (stores belong to `projectId`).

### 6.5 Approvals
- `GET/POST /approval-requests`, `POST /approval-requests/{id}/actions` (approve, reject, clarify, respond, cancel), `GET /approval-requests/{id}/actions`, `POST /approval-requests/{id}/publish` (body `rowVersion`).
- `GET/POST /approval-chains`, `POST /matrix-versions`, `POST /matrix-levels`, publish matrix version.

### 6.6 Search
- `GET /search?q=&limit=` — types: project, location, store, material, vendor, equipment.

### 6.7 Users and access
- `GET /users` requires `access.manage`. Non-holders must not call it.
- `GET /auth/me/access` returns the privileges of the signed-in user.

### 6.8 Approved people
- No server API yet. The frontend keeps the list in a client store (section 3.6). Any implementation must add a server resource before it can be relied on.

---

## 7. Permissions

| Action | Privilege |
|---|---|
| See admin screens (any Core screen) | `access.manage` (administrators). Other users see the module message. |
| Manage masters (projects, equipment, approved people, plans) | `masters` management (`MANAGE.masters`) |
| Manage projects | `projects` management |
| Access/users | `access.manage` |
| Approve a level | the level's approver (server checks; UI hides controls otherwise) |

The UI hides buttons the user cannot use. The server must still enforce every rule. Hiding is not security.

---

## 8. Validation rules (summary)

- Asset code: required, ≤40 characters, unique (case-insensitive).
- Equipment name: required in the wizard, ≤200.
- Dates: yyyy-mm-dd. Joining date and bulk dates must be valid calendar dates.
- Headcount: whole number ≥ 1.
- Planned units: whole number ≥ 1.
- Project code (bulk): must match an existing project's code, case-insensitive.
- Department (bulk and form): must match an existing department name, case-insensitive. Stored with the canonical name.
- Login IDs and role rules: existing rules, unchanged.

---

## 9. Error handling and messages

- Conflicts: "Someone else changed this unit. The latest version is loaded; close this and edit it again." Reload the record, then let the user retry.
- In use: "`<code>` is `<availability>` and cannot be assigned to a project."
- Release failure: "`<code>` not released: `<error>`".
- Bulk: each row shows its errors; valid rows are imported; the notice reports how many were added.
- Network errors keep the form open with the pending idempotency key so a retry does not duplicate.

---

## 10. Non-functional requirements

- **Idempotency:** every write carries an idempotency key. A retry with the same body reuses the key.
- **Optimistic locking:** writes to units send `rowVersion`. Conflicts are shown, not silently overwritten.
- **Audit:** every unit write creates an audit entry (INSERT/UPDATE with before/after snapshots, existing behaviour).
- **Tenant isolation:** each company's data is separate. Tenant id is sent with every call.
- **Accessibility:** dialogs have titles; form fields have labels; buttons have text. Contrast follows the design tokens.
- **Responsive:** tables scroll horizontally on narrow screens; no page-level horizontal scroll.
- **Maps:** tile layers must not request zoom levels the provider does not serve (section 11.3).

---

## 11. Visual design

### 11.1 Tokens and components
- Buttons: primary (navy gradient), secondary (white with copper-gold rim), danger (red text on pale red), success (green).
- Cards and secondary buttons share a copper-gold rim: gradient border `#fbe3d4 → #e0a286 → #b96d52 → #e8b39a → #f7d9c6 → #c98b72`, with a thin silver inner edge.
- Tab switches (the `Tabs` control) use the same rim as buttons, with the card fill. The active tab keeps its own fill.

### 11.2 Page background (light mode)
- Pages on the public, login, and classic shell backgrounds use a 135° gradient from light cherry red: `#f9d3d8 → #fdeef0 → #f0b4bd → #fae0e4 → #e89aa6`, with a white sheen at 115°. Dark mode is unchanged.

### 11.3 Map zoom
- Map max zoom 21.
- Street tiles: request up to level 19 and scale beyond.
- Satellite tiles: request up to level 18 and scale beyond. Do not request levels the provider does not serve; that returns "Map data not yet available" tiles.

### 11.4 Icons
- Every menu item has a distinct icon. Approvals uses `fileCheck`.

---

## 12. Changes made in this round (for a change log in the new app)

Frontend:
1. Equipment: unit project field; Assign per unit; Release; Assigned column in planning; Assign blocked when not Available; Edit no longer has location.
2. Manpower: columns Project, Role, Planned, Onboarded, Vacant. Removed Time Period, Status, Joining Date, subtitle text. Stat card Fulfilled removed. Table header "Headcount" renamed to "Planned".
3. Approved list: "Sent to HRMS" renamed "With HRMS" (status and button); Edit and Delete replace the status-action buttons; Show project filter; Bulk upload; Forward (upload); Compare dialog.
4. Approvals: decision buttons shown only when the user can act; "Go to decision" removed; identifiers removed from chain and chainage display; Project column in request tables; module short labels; job route labels; Approvals moved from HR to Projects menu.
5. Locations: removed the Locations menu entry, `/sites` pages and routes, location fields on projects, and create/update location store actions. Search result for a location opens projects.
6. Map zoom limits. Light-mode background colours. Tab switch rim style.
7. Seed data: one pending approval request at level 2 for the administrator (U-600) for demonstration.

Backend (equipment units):
1. Migration `0061_equipment_unit_project`: adds nullable `project_id` with a foreign key to projects and an index.
2. Unit write accepts `projectId`.
3. Assignment guard (409 `EQUIPMENT_UNIT_IN_USE`).

Backend (earlier in the same work, already applied): removal of location and WBS columns and tables (migrations 0055–0060).

---

## 13. Verification status and known test state

- Frontend type check: passes after the last change.
- Frontend tests: the last full run before the final changes showed 211 passing and 3 failing. Later, the accessibility test passed on re-run. The approval-workflow test was updated to match hidden buttons. The full suite was not re-run after the final edits.
- Failing test with unknown cause: "creates a user through POST /users…" (the "User created" dialog does not appear).
- Backend equipment tests cannot run: setup fails with `ACCESS_DENIED` because of an uncommitted admin-only rule in the working-tree access service. The new in-use guard has no test yet.
- Browser checks not done for: Assign, Release, Assigned column, Vacant column, Approved list actions (Edit, Delete, Forward, Compare, Show project), approval request button visibility, label changes, map zoom at high levels.

When implementing elsewhere, write tests for:
- R-EQ-2, R-EQ-4 (in-use guard), R-EQ-5 (release), R-EP-3 (assigned count)
- R-MP-3, R-MP-4 (onboarded and vacant rules)
- R-AP-1, R-AP-2 (who sees which buttons)
- R-AP2-4 (bulk row checks), R-AP2-6 (compare totals)
- R-LB-1, R-LB-2 (display labels; stored values unchanged)

---

## 14. Open items and decisions

1. **Approved list transitions have no screen.** `sendToHrms` (Approved → With HRMS) and `markOnboarded` (With HRMS → Onboarded) still exist in the store but are no longer reachable from the row actions. Decide how people move to With HRMS and Onboarded (for example an HRMS feed, or a row action).
2. **Approved people are client-only.** Needs a server resource, validation, and audit before production use.
3. **Two equipment assignment systems.** Per-unit (new) and per-type quantity (legacy) coexist. The legacy panel was kept by decision. Decide whether to remove it.
4. **No assignment history.** Release discards the previous project.
5. **Under maintenance and Breakdown** are not assignable in the UI. The server does not enforce this rule.
6. **Location concept remains on the server** (`core_location`, `core_store.location_id`, `/locations` read endpoint, approval forms that take a location, `sites` in the client store). Removal needs its own migration and approval.
7. **Chainage on units**: the client still has a `chainageId` field on the equipment type that is always blank. Remove it.
8. **TablePanel subtitle** is required in the shared table component, so the manpower table passes an empty subtitle. Make it optional.
9. **Job route stored values** are the old phrases. Renaming the stored values would need a data migration; this handover keeps them.
10. **Create-user dialog test** fails for an unidentified reason.
11. **Module short labels** (MM, FEM, PCM) are applied on display only. If other screens show module names, they still show the long names.
12. **Forward** is implemented as a second upload with the same rules as Bulk upload. Confirm the intended behaviour of Forward (for example whether it should send the list somewhere).
13. **Compare counts** use "Approved = everyone on the project, any status". Confirm whether only status Approved should count.

---

## 15. Implementation checklist for another application

**Data**
- [ ] Projects with code, name, status, chainage markers, and the extra fields.
- [ ] Equipment units with `projectId` (nullable, foreign key), availability enum, `rowVersion`, asset-code uniqueness.
- [ ] Equipment assignments (legacy) if the legacy panel is kept.
- [ ] Plan lines (equipment and manpower).
- [ ] Approved people (server resource recommended).
- [ ] Approval requests, levels, decisions, clarifications, publishing.

**Rules**
- [ ] R-EQ-1 to R-EQ-7 on the server (guard and release), and in the UI (buttons).
- [ ] R-EP-1 to R-EP-4 in the planning view.
- [ ] R-MP-1 to R-MP-6 in the manpower view.
- [ ] R-AP-1 to R-AP-5 in the approval request view.
- [ ] R-LB-1 and R-LB-2 as display-only mappings.
- [ ] R-AP2-1 to R-AP2-6 for approved people.
- [ ] R-NAV-1 to R-NAV-3 in navigation.
- [ ] R-SR-1 in search.

**Screens**
- [ ] Equipment register, assign dialog, available equipment, project equipment planning.
- [ ] Manpower requirements, with the project filter.
- [ ] Approved list with header buttons (Bulk upload, Add Employee, Forward, Compare), project filter, Edit and Delete.
- [ ] Approvals list with the Project column; approval request page with the restricted buttons.
- [ ] Job openings with the route labels.

**Look and feel**
- [ ] Copper-gold rim on buttons, cards, and tab switches.
- [ ] Light cherry-red page background in light mode.
- [ ] Map zoom limits.

**Checks**
- [ ] Each rule above has a test (section 13 lists the set).
- [ ] Browser walkthrough of each screen, with a non-administrator and an administrator account.
- [ ] No identifiers shown on the approval chain or chainage display.
- [ ] Search for "Sent to HRMS" returns nothing (the label is "With HRMS").

---

## 16. Reference locations in the VeloxIQ codebase

These are for reading the current behaviour. Paths are relative to `C:\VELOX_IQ\CORE\CORE__V__0.4\`.

| Behaviour | Where |
|---|---|
| Unit API types and mapping | `CORE__FRONTEND/src/modules/core-data/api/units.ts` |
| Equipment unit types | `CORE__FRONTEND/src/modules/core-data/types/index.ts` (`EquipmentUnit`) |
| Assign / Release / Edit dialogs | `CORE__FRONTEND/src/modules/resources/components/EquipmentControls.tsx` |
| Equipment register | `CORE__FRONTEND/src/modules/resources/pages/EquipmentRegister.tsx` |
| Available equipment | `CORE__FRONTEND/src/modules/resources/pages/AvailableEquipment.tsx` |
| Equipment planning (Assigned column) | `CORE__FRONTEND/src/modules/resources/pages/EquipmentPlanning.tsx` |
| Manpower requirements | `CORE__FRONTEND/src/modules/projects/pages/PeoplePlanning.tsx` |
| Approved list | `CORE__FRONTEND/src/modules/organisation/pages/ApprovedList.tsx` |
| Approved people store | `CORE__FRONTEND/src/modules/organisation/store/approvedPeople.ts` |
| Approval request page | `CORE__FRONTEND/src/modules/approvals/pages/ApprovalDetail.tsx` |
| Request table columns | `CORE__FRONTEND/src/modules/approvals/components/columns.tsx` |
| Raised-by label mapping | `CORE__FRONTEND/src/modules/approvals/utils/raiser.ts` |
| Job route labels and helpers | `CORE__FRONTEND/src/modules/approvals/utils/jobs.ts` |
| Navigation | `CORE__FRONTEND/src/modules/shell/config/nav.ts` |
| Map | `CORE__FRONTEND/src/modules/projects/components/GeoMap.tsx` |
| Colours and rims | `CORE__FRONTEND/src/app/styles/core.css` |
| Unit server write rules and guard | `CORE__BACKEND/src/modules/equipment-units/service.ts`, `schema.ts`, `repo.ts` |
| Migration 0061 | `CORE__BACKEND/migrations/0061_equipment_unit_project.sql` |
| Migration list | `CORE__BACKEND/src/db/migrate.ts` |

The earlier change summary is in `CORE__FRONTEND/docs/design-latest-changes.md`.
