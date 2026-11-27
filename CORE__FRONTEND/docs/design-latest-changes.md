# VeloxIQ Core: design of the latest changes

Status: working document. Describes the changes made in the current working tree, the rules they implement, what was verified, and what is still open.

Paths are relative to `C:\VELOX_IQ\CORE\CORE__V__0.4\`. Frontend is `CORE__FRONTEND\`, backend is `CORE__BACKEND\`.

---

## 1. Scope

The latest work covered four areas:

1. **Locations removal.** Locations stop being a separate concept. Projects, stores, geofences and equipment hang directly off a project. Frontend steps 1 and 2 are done. Backend and database steps are still open (section 11).
2. **Equipment units and project assignment.** Units store the project they belong to. A unit is assigned to one project, becomes "In use", and can be released.
3. **Project equipment planning.** The planned table shows assigned units beside planned units, in one row.
4. **Manpower planning and approved people.** Column changes, a computed "Vacant" column, and a status label rename. Plus small UI fixes: map zoom, light-mode background colour, one stat card removed.

---

## 2. Data model

### 2.1 Migrations touched by this work

| Migration | What it does | State |
|---|---|---|
| 0055 `0055_store_project.sql` | `core_store.project_id` added (FK to `core_project`, nullable). `location_id` kept, nullable, no longer written. | Applied to all tenants (earlier). |
| 0056 | `core_plan_line.department`. | Applied (earlier). |
| 0057 `0057_remove_wbs.sql` | WBS node table and WBS columns dropped. | Applied (earlier). |
| 0058 `0058_access_drop_location.sql` | `core_user_access.location_id` dropped. Access scope is project + store. | Applied (earlier). |
| 0059 `0059_approvals_drop_location.sql` | Approval request location columns dropped. Publish sets `published_at` only. | Applied (earlier). |
| 0060 `0060_equipment_offline_drop_location.sql` | A unit's `location_id` is copied into `current_location` where that text is empty, then `core_equipment_unit.location_id` and `integ_offline_operation.location_id` are dropped. | Applied (earlier). |
| **0061 `0061_equipment_unit_project.sql`** | Adds `core_equipment_unit.project_id uuid NULL REFERENCES core_project(id) ON DELETE RESTRICT`, plus index `core_equipment_unit_project_id_idx`. Existing units get NULL. | **Applied to global and all 10 tenant schemas on this change** (acme, asc, beta, delta, epsilon, gamma, qwer, rtyrty, teston, titanb). |

Registration: `CORE__BACKEND\src\db\migrate.ts`, array `TENANT_MIGRATIONS`, last entry `'0061_equipment_unit_project.sql'`.

Generated types: `CORE__BACKEND\src\db\types.generated.ts`, interface `CoreEquipmentUnitRow` gained `project_id: string | null;` (between `pollution_expiry` and `puc_no`).

### 2.2 Equipment unit fields after this work

| API field | Column | Type | Notes |
|---|---|---|---|
| `projectId` | `project_id` | uuid, nullable | New. Set by assignment. Cleared by release. |
| `availability` | `availability` | enum: Available, In use, Under maintenance, Breakdown | Assignment sets In use. Release sets Available. |
| `currentLocation` | `current_location` | text | Free text. Replaces the old location link. |
| `chainageId` (frontend only) | none | — | Always `''` now. Kept on the frontend type as a leftover; see section 11. |

### 2.3 Units and project assignment: the two systems

Two assignment concepts exist side by side. This is deliberate for now.

- **Per unit (new):** `core_equipment_unit.project_id` plus `availability = 'In use'`. One row per machine.
- **Per type (old):** `core_equipment_assignment` rows, one per project and equipment type, with a quantity. Served by `/equipment-assignments`. Shown in the register's "Project assignments" panel (`UnitAssignments`).

The user decided to **keep the old panel**. The old rows are not created by the new Assign flow.

---

## 3. Backend changes

### 3.1 Equipment units module (`CORE__BACKEND\src\modules\equipment-units\`)

**`repo.ts`**
- `UNIT_FIELDS` gained `field('projectId', 'uuid')`. Column resolves to `project_id` by the usual snake_case rule.
- The select for reads includes the field automatically through `selectOf`.

**`schema.ts`**
- `unitFields` gained `projectId: optionalUuid`, with the comment "The project the unit belongs to (core_project id), or null when none is chosen."
- POST body (`unitCreateBody`) and PATCH body (`unitPatchBody`) both accept it.

**`service.ts`** — `updateUnitRecord(client, actor, id, patch)`
- Order of checks: load unit with row lock → version check (`VERSION_CONFLICT`, 409) → **new in-use guard** → file links check → write → audit.
- **New guard:** if `changes.projectId` is a string, the stored unit's `availability` is `'In use'`, and the string differs from the stored `projectId`, the write is refused with:
  - code `EQUIPMENT_UNIT_IN_USE`
  - HTTP 409
  - message "This equipment unit is in use and cannot be assigned to a project"
- Release is **not** blocked: it sends `projectId: null` (not a string), so the guard does not apply.
- Foreign key: an unknown project id is refused by `mapDatabaseError(PREFIX, err, 'reference')`.

### 3.2 Offline module
- `offline/service.ts` insert uses `$1..$8` after the `location_id` column was removed (earlier work). No change in this round.

### 3.3 Backend verification status
- `npx tsc --noEmit` passes.
- `npx eslint src/modules/equipment-units` passes.
- `npx vitest run tests/equipment-units` **fails** before and after this change, with `ACCESS_DENIED` (403) during test setup. Cause: the admin-only rule in the **working-tree** file `CORE__BACKEND\src\modules\access\service.ts` (uncommitted, not part of this design). The new guard has no test yet.

---

## 4. Frontend changes

### 4.1 Core data (`CORE__FRONTEND\src\modules\core-data\`)

**`types/index.ts` — `EquipmentUnit`**
- Added `projectId?: string`, with a doc comment: the project the unit belongs to; optional for older units.
- `chainageId: string` still present (always `''` for units now).

**`api/units.ts`**
- `UnitRecord`: `locationId` removed; `projectId: string | null` added.
- `UnitDraft`: `locationId` removed; `projectId: string | null` added.
- `unitFrom(r)`: `chainageId: ''`; `projectId: r.projectId ?? undefined`.
- `draftFrom(u, equipmentTypeId)`: two parameters only (location parameter removed). Sends `projectId: u.projectId ?? null`.
- `updateUnit`, `createUnit`, `listUnits` unchanged.

**`store/useCore.ts`**
- `saveUnitRemote(u, key)`: resolves the type id, calls `unitApi.draftFrom(u, typeId)`, then PATCH (if `rowVersion` set) or POST. Location resolution removed.
- `loadSites`, `createSiteRemote` (removed earlier), `updateSiteRemote` (removed earlier): see section 4.6.

### 4.2 Equipment register (`CORE__FRONTEND\src\modules\resources\pages\EquipmentRegister.tsx`)

**Project and location in the register**
- `projectIdOf(u)` returns `u.projectId`. The register's project filter and "Current Project" column use it.
- `projectCodeOf(u)` gives the project code, or "Unassigned" when `projectId` is empty.

**Wizard (AddUnitForm)**
- Step 1 still asks for the project. The value is now saved as `projectId` on the unit (`save` builds `projectId: v.projectId`).
- "Current location" is a **free-text** field. The field is no longer a dropdown of project locations. The old `blank: 'Choose a location'` was removed.
- `unitSchema` no longer has `chainageId`. `addSchema` is `unitSchema.extend({...})` (the `.omit` was removed).
- `NO_LOCATION` and `locationsOf` removed.

**Bulk upload (`validate`)**
- `project_code` resolves to a project. If the code does not match, the row error is `Project code <code> does not exist.`
- The row value includes `projectId: where?.id`.
- The current-location check against project locations was removed. Current location is required by the schema (`docShape.currentLocation: req('Current location')`) and is otherwise free text.

**Table actions per row**
- **Assign** (existing button, now guarded): `disabled` when the type is not on the server, or when `u.availability !== 'Available'`. The tooltip explains why: "`<code>` is `<availability>`", or "This type is not on the server yet".
- **Release** (new): shown only when `u.availability === 'In use'`. Calls `releaseUnit(u)`:
  1. `window.confirm("Release <code>? It becomes Available and is no longer assigned to <project code>.")`
  2. If confirmed: `saveUnitRemote({ ...u, availability: 'Available', projectId: undefined }, idempotencyKey())`. `draftFrom` sends `projectId: null`, so the project is cleared on the server.
  3. Success notice: "`<code>` released". Failure notice: "`<code>` not released: `<error text>`" (6 s).
- **Details** unchanged.

**Assign dialog** — `AssignUnitDialog` (see 4.3).

### 4.3 Equipment controls (`CORE__FRONTEND\src\modules\resources\components\EquipmentControls.tsx`)

**`AssignUnitDialog({ unit, onClose })`** — rewritten. Now assigns **one unit**.
- Project list: `projects.filter(isRemote)`. Default selection: the first remote project.
- Only one field: **Project** (a `Select`).
- Helper text: "`<code>` · `<type>`. Once assigned, the unit is In use and cannot be assigned again."
- Modal title: "Assign to project". Description: "Assign this unit to a project."
- Submit (`submit`):
  1. Clears the form error.
  2. If `unit.availability !== 'Available'`: error "`<code>` is `<availability>` and cannot be assigned to a project." Stop.
  3. If no project chosen: error "Pick a project. Only projects on the server can take an assignment." Stop.
  4. Builds `next = { ...unit, projectId, availability: 'In use' }`.
  5. Idempotency: the key is kept while the body is unchanged (`pending.body === body`).
  6. `saveUnitRemote(next, key)`. On success: clears pending, notice "Equipment assigned to project", closes.
  7. On error: clears pending unless it is a network error; shows `errorText(err)`.
- The old quantity-per-type assignment dialog behaviour (qty field, `assignEquipmentRemote`) is no longer used by this dialog.

**`EditUnitDialog`**
- The Location select was removed from the form.
- `unitEditSchema` no longer has `locationId`.
- `saveUnitRemote` gets `{ ...unit, ... }` without `chainageId` changes.
- Because Edit lets the user change availability, a unit can be set back to Available here as well.

**`UnitAssignments`** — unchanged. Shows the **old per-type** assignments for the unit's type, with Unassign. Kept by decision.

**Import cleanup:** `projectOf` removed from this file's imports (no longer used).

### 4.4 Available equipment (`CORE__FRONTEND\src\modules\resources\pages\AvailableEquipment.tsx`)
- Lists units with `availability === 'Available'` only. Units that are In use leave this list automatically.
- The "Assign to project" button opens the same `AssignUnitDialog`.
- The page has no location or project columns. Its columns are: Asset (code and name), Type, Model, Capacity / size, and the action.
- Stat tiles: Units available, Equipment types.

### 4.5 Project equipment planning (`CORE__FRONTEND\src\modules\resources\pages\EquipmentPlanning.tsx`)

**Data**
- `useCore()` now also reads `units`.

**Grouping** (unchanged): one row per project and equipment type. Lines for the same key are added together.

**New helper `assignedOf(g)`**
- Takes the row's project id and equipment type from its first line.
- Counts units where:
  - `u.projectId === projectId`
  - `u.type` equals `equipmentType` (trimmed, lowercased)
  - `u.availability === "In use"`

**Table "Equipment planned"** — columns in order:
1. Type
2. Needed at
3. Capacity / size
4. Model
5. Units planned (sum of planned quantity in the group)
6. **Assigned** (new, `c-amt`, value from `assignedOf`; CSV gives the same number)
7. Needed from (earliest start date in the group)
8. Actions (Edit / Remove for a single line, or "Manage N lines")

Planned and assigned are in the same row, as requested.

### 4.6 Locations removal (frontend, steps 1 and 2)

**Step 1 — project `locationIds` removed**
- `types/index.ts`: `Project.locationIds` removed.
- `api/projects.ts`: `emptyParts()` no longer sets it.
- `store/useCore.ts`: `loadProjectParts` no longer sets it; `loadSites` only sets `sites` and `sitesLoad`; `createSiteRemote` no longer touches projects.
- `organisation/utils/workplace.ts`: a person's locations are the locations whose `projectId` is in their scope.
- `data/seed.ts` and `data/seed.test.ts`: `locationIds` lists and the test that checked them removed.
- `pages/Projects.tsx`: empty default removed.

**Step 2 — Locations pages removed**
- Deleted: `projects/pages/Sites.tsx`, `projects/pages/SiteNew.tsx`, `projects/pages/SiteDetail.tsx`, `projects/components/SiteForm.tsx`.
- New file: `projects/components/ChainageTab.tsx` exports `ChainageView` and `ChainageEdit` (moved verbatim from `SiteDetail.tsx`, lines 195–591 of the old file). `ProjectDetail.tsx` imports them from there.
- `projects/routes.ts`: `siteRoutes` now holds only `/geofences`. Removed: `/sites`, `/sites/new`, `/sites/:id`.
- `core-data/api/search.ts`: a search hit of type `location` opens `/projects` (was `/sites/<id>`).
- `core-data/api/masters.ts`: `SiteDetails`, `siteBody`, `createLocation`, `updateLocation` removed. `listAllLocations` kept (still used to fill `sites`).
- `core-data/index.ts`: `SiteDetails` export removed.
- `core-data/store/useCore.ts`: `createSiteRemote` and `updateSiteRemote` removed from the interface and the store.
- Still present: `sites` state, `loadSites`, `sitesLoad`, `sitesError`. Used by approval request forms (`fromSiteId`, `toSiteId`, source `'sites'` in `approvals/utils/requestPayload.ts`), the workplace summary, search, and `App.tsx` loading.

### 4.7 Manpower requirements (`CORE__FRONTEND\src\modules\projects\pages\PeoplePlanning.tsx`)

Current state of the table ("Manpower requirements"), columns in order:

| # | Header | Kind | Value |
|---|---|---|---|
| 1 | Project | c-sub | `projectName(l.projectId)` |
| 2 | Role | c-id | `l.role` |
| 3 | Planned | c-amt | `l.headcount` (renamed from "Headcount") |
| 4 | Onboarded | c-amt | `onboardedFor(l)` |
| 5 | Vacant | c-amt | `Math.max(0, l.headcount - onboardedFor(l))` (new) |

Plus the row actions (Edit, Remove).

**Removed in this round**
- "Time Period" column (replaced earlier by a Joining Date column, which was itself removed).
- "Status" column (and the `StatusBadge` import and the `TONE` constant that only it used).
- "Joining Date" column and the `fmtDate` import. This column was re-added to the file outside this session, then removed again.
- Table subtitle text "Filter by status using the chips; pick more than one to combine. Search by project or role. Headcount required per role, per project." The table is passed `subtitle=""`, because `TablePanel` requires the prop (see 11).

**Still present**
- Status filter chips (All, Confirmed, Planned, …). They filter on the status value even though the Status column is gone.
- Search box, Download button, Bulk upload, Add requirement.

**Stat cards (top of page)**
- Total headcount, Planned, Confirmed, Onboarded. The Fulfilled card was removed in an earlier round.

**Onboarded rule** (`onboardedFor(l)`)
- Counts onboarded approved people where:
  - the person's project code equals the requirement's project code,
  - the person's department equals the requirement's department,
  - the person's designation (trimmed, lowercased) equals the requirement's role (trimmed, lowercased).
- Data source: `useApprovedPeople` store (`organisation/store/approvedPeople.ts`), a frontend mock.

### 4.8 Approved people (`CORE__FRONTEND\src\modules\organisation\`)
- Status label renamed "Sent to HRMS" → **"With HRMS"** in:
  - `store/approvedPeople.ts`: the `ApprovedStatus` type, the seed data, and the transition action.
  - `pages/ApprovedList.tsx`: the status tone map and the action shown when the status is With HRMS.
- Status flow is unchanged: Approved → With HRMS → Onboarded.
- No "Sent to HRMS" text remains in `CORE__FRONTEND\src`.

### 4.9 Map (`CORE__FRONTEND\src\modules\projects\components\GeoMap.tsx`)
- Map created with `maxZoom: 21`.
- Street layer (OpenStreetMap): `maxZoom: 21`, `maxNativeZoom: 19`.
- Satellite layer (Esri World Imagery): `maxZoom: 21`, `maxNativeZoom: 18`.
- Why: Esri returns a "Map data not yet available" tile at levels it does not cover. With `maxNativeZoom`, Leaflet scales the last real tile when the user zooms in further, so the error tile is not requested.
- The `fitBounds` `maxZoom: 18` calls are unchanged.

### 4.10 Light-mode background (`CORE__FRONTEND\src\app\styles\core.css`, around line 352–358)
- Selectors: `html:not(.dark) .pub-page`, `html:not(.dark) .shell-classic .main`, `html:not(.dark) .login-page`, `.pub-home`.
- Gradient: white sheen at 115° over a 135° gradient. Colour stops changed from pale rose-gold to light cherry red:
  - `#f9d3d8` 0%, `#fdeef0` 32%, `#f0b4bd` 62%, `#fae0e4` 85%, `#e89aa6` 100%.
- Dark mode is unchanged.
- Verified in the browser on the login page (screenshot showed the new tint).

---

## 5. Business rules (consolidated)

**R1. Assign.** A unit can be assigned only when `availability === 'Available'`. Assignment sets `projectId` and `availability = 'In use'` in one save.

**R2. Assign guard (backend).** If a unit is `In use` and a write sets a different non-null `projectId`, the write is refused (409 `EQUIPMENT_UNIT_IN_USE`).

**R3. Release.** Only for `In use` units. Sets `availability = 'Available'` and `projectId = null`. Not blocked by R2.

**R4. Edit can also change availability.** A unit set to Available through Edit (keeping its old project id) can be assigned again through Assign. Release is the one-step way to clear the project.

**R5. Available list.** Shows only `Available` units. In-use units are not shown there.

**R6. Under maintenance and Breakdown.** Not assignable (frontend rule, R1). The backend does not enforce this; it only enforces R2.

**R7. Planned table Assigned column.** Counts `In use` units with the row's project id and the row's type. Units released to Available drop out of the count.

**R8. Vacant.** `max(0, planned − onboarded)` per requirement row. Never negative.

**R9. Onboarded.** Department and role (designation) must both match the requirement (section 4.7).

**R10. Project on unit is required in the wizard.** Step 1 asks for a project. The save writes it to `projectId`. The bulk upload resolves `project_code`; an unknown code is a row error.

**R11. Current location is free text.** It is required in the wizard and the bulk upload. It is not checked against any list.

**R12. Status label.** "With HRMS" replaces "Sent to HRMS".

---

## 6. User-visible text changes (this round)

| Where | Before | After |
|---|---|---|
| Manpower table column | Headcount | Planned |
| Manpower table column | Time Period | (removed) |
| Manpower table column | Status | (removed) |
| Manpower table subtitle | "Filter by status using the chips…" | (removed) |
| Approved people status | Sent to HRMS | With HRMS |
| Register Assign tooltip | (none) | "`<code>` is `<availability>`" |
| Assign dialog description | "Assign equipment of this unit's type to a project." | "Assign this unit to a project." |
| Assign dialog helper | "Assignments are kept per project and equipment type, not per unit." | "Once assigned, the unit is In use and cannot be assigned again." |
| Assign dialog fields | Project, Quantity | Project |
| Planned table column | (none) | Assigned |
| Register row action | (none) | Release (In use units) |

Earlier in the session, Locations-related text was also removed (menu entry, page titles, "Back to locations", "Location" fields). Not repeated here.

---

## 7. Navigation

- Menu: Locations entry already removed earlier. `/sites` routes removed in this round.
- Remaining route: `/geofences`.
- Search: location hits open `/projects`.

---

## 8. Tests

### 8.1 Test files changed in this round (test-only edits; no UI copy changed)

| File | Change |
|---|---|
| `src/test/access-history.test.tsx` | Tab name "Sign-in history" → "Sign-ins"; no-access text → "module screens are not in this application". |
| `src/test/access.test.tsx` | No-access text updated; the `waitFor` condition rewritten to check `.ph` or the module message, with parentheses made explicit. |
| `src/test/integration.test.tsx` | Non-admin sign-in test now waits for the module message; asserts no `/users` and no `/projects` request. |
| `src/test/policy-setup.test.tsx` | Test user given `access.manage` privilege so `isAdmin` is true in the app. |
| `src/test/app.test.tsx` | Sign-in error text → `/invalid user id or password/i`; home heading → `/driving growth/i`; role control → checkbox; equipment plan test rewritten to check the page subtitle; approval-chain test no longer types a reason; login header assertion now expects no `X-Tenant-Id` on login. |
| `src/test/tasks-23-30.test.tsx` | Expected texts → "Status, Code" and "The values are kept private and are not shown here.". |
| `src/test/available-equipment.test.tsx` | Test renamed "lists only available units"; location and project assertions removed. |

Earlier in the session, these test files were edited for the locations removal: `seed.test.ts`, `change-batch.test.tsx`, `raiseRequest.test.tsx`, `a11y-audit.test.tsx`, `access.test.tsx` (`/sites` removed from page list), `app.test.tsx` (location creation test removed, `/sites` removed from page list, `locationIds` assertions removed).

### 8.2 Results

Last full frontend run (after the test-only edits above):
- Type check (`npx tsc --noEmit -p tsconfig.app.json`): passes.
- Vitest: **213 passed, 1 failed** (of 214).
- Failing: `src/test/app.test.tsx > CORE users > creates a user through POST /users and shows the temporary password once, without storing it`. Symptom: dialog "User created" not found after clicking Create user. Cause **not yet identified**.

After the most recent edits to `PeoplePlanning.tsx` and `EquipmentPlanning.tsx`, the frontend type check passes. The full test suite was not re-run after the last few UI edits.

### 8.3 Backend
- `tsc --noEmit`: passes.
- ESLint on `src/modules/equipment-units`: passes.
- Equipment unit integration tests: cannot run. Fail with `ACCESS_DENIED` during setup because of the uncommitted admin-only rule in `CORE__BACKEND\src\modules\access\service.ts`. No new test exists yet for the in-use guard or for release.

---

## 9. Verification status

| Item | Verified how | Result |
|---|---|---|
| Migration 0061 | Migration runner output | applied on global + 10 tenants |
| Map zoom fix | Frontend type check and related tests | passes; not checked in browser with a map open |
| Light-mode background | Browser, login page | shows the new tint |
| Assign / Release / Assigned column | Frontend type check; equipment-related tests passed (6 of 6 at that point) | **not checked in the browser** |
| In-use guard (backend) | Type check and lint only | **not tested** |
| Manpower table columns | Type check | **not checked in the browser** |
| "With HRMS" label | Type check; source grep | no remaining "Sent to HRMS" in source |

---

## 10. Known gaps and risks

1. **Units carry no chainage.** `chainageId` is always `''`. Any code path that still reads it for a location meaning is wrong. The frontend type still has the field.
2. **Two assignment systems.** Per-unit (new) and per-type (old) coexist. The old panel is kept by decision. Risk: a reader may think the panel shows the real assignment state. It does not reflect per-unit assignments.
3. **Release clears the project but not history.** No assignment history table exists. Past project ids are lost on release.
4. **Under maintenance and Breakdown** are not assignable in the frontend, but the backend does not enforce this rule.
5. **Locations are still in the backend.** `core_location` table, `core_store.location_id`, `/locations` API and the approval forms' `sites` source are still present.
6. **`TablePanel` needs a `subtitle` prop.** The manpower table passes an empty string. Making `subtitle` optional in `src/shared/ui/data/TablePanel.tsx` would be the clean fix; not done.
7. **The Joining Date column reappeared in the file once** outside this session. Its cause was not identified. Check that version control reflects the current intent before committing.
8. **Working-tree admin-only access rule** (`CORE__BACKEND\src\modules\access\service.ts`) blocks backend integration tests and is not part of this design.
9. **Create-user test** failing for an unidentified reason (section 8.2).
10. **Browser checks not done** for: Assign, Release, Assigned column, Vacant column, manpower table, map zoom at high levels.

---

## 11. Open decisions

- Whether to remove the old per-type "Project assignments" panel and its API usage. **Decision so far: keep.**
- Whether Release should also be available from the Available list. Not applicable today (that list has no In use units).
- Whether Under maintenance and Breakdown units should be assignable. Current rule: no.
- Whether to add an assignment history (who assigned, when, released when). Not built.
- Whether to finish the Locations removal in the backend and database (migration to drop `core_store.location_id` and `core_location`, remove `/locations` routes and approval `sites` sources). Needs approval before any migration.
- Whether to make `TablePanel.subtitle` optional.

---

## 12. Rollback notes

- **Frontend:** each area is self-contained in the files listed. Reverting the Assign dialog restores the per-type quantity flow only if `assignEquipmentRemote` is also kept (it is still in the store).
- **Backend guard:** remove the block in `updateUnitRecord` (after the version check) to restore the previous behaviour.
- **Migration 0061:** to roll back, drop `core_equipment_unit_project_id_idx` and the `project_id` column, then remove the entry from `TENANT_MIGRATIONS` in `src/db/migrate.ts`. Data loss: any project links set after 0061 is applied.
- **Map zoom and background:** revert the constants in `GeoMap.tsx` and the gradient in `core.css`.

---

## 13. Glossary

- **Available:** unit may be assigned.
- **In use:** unit is assigned to a project.
- **Under maintenance / Breakdown:** unit may not be assigned.
- **Planned (manpower):** headcount required for a role on a project.
- **Onboarded:** approved people with the same project, department and designation who are onboarded.
- **Vacant:** planned minus onboarded, never below zero.
- **Assigned (equipment planning):** In use units for the row's project and type.
- **With HRMS:** approved person sent to the HRMS system; awaiting onboarding.
