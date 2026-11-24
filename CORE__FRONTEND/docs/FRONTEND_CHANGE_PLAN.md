# VeloxIQ Core: Frontend Change Plan

Companion to `BACKEND_FRONTEND_CHANGES.md`. That file lists what the backend needs and what each frontend gap is. This file sets the order of frontend work, the files each phase touches, and how each phase is checked.

## Sizing (from a search of `src/`)

| Measure | Result | Reliability |
|---|---|---|
| Imports from `@/modules/core-data` | 55 occurrences in 29 files | Reliable. Each import is a dependency that a type or id change can break. |
| Field-name pattern (`.role`, `raisedById`, `holder`, `parentId`, `headRoleId`, `departmentId`, `reportsToId`, `privileges`, `scopeIds`) | 404 occurrences in 57 files | Noisy. The pattern also matches unrelated code (`.role` in DOM and ARIA code, for example). Use it to find hotspots, not as a count of edits. |

Hotspots by field-pattern count: `core-data/data/seed.ts` (88), `organisation/pages/Organogram.tsx` (29), `organisation/components/UserForm.tsx` (31), `organisation/utils/org.ts` (19), `organisation/pages/Users.tsx` (18), `organisation/components/RolesSection.tsx` (11), `organisation/components/RoleForm.tsx` (15), `approvals/pages/ChainNew.tsx` (12 pattern hits, 3 imports), `projects/pages/ProjectDetail.tsx` (9), `projects/pages/PeoplePlanning.tsx` (7).

Import hotspots: `approvals/pages/ApprovalDetail.tsx` (4), `approvals/pages/ChainNew.tsx` (3), `approvals/components/LevelFields.tsx` (3), `approvals/pages/ApprovalMatrix.tsx` (3), `resources/pages/EquipmentRegister.tsx` (3).

Conclusion: the change is concentrated in the `organisation` and `approvals` modules, plus `core-data` itself. Projects, company, grievances and audit need smaller changes.

## Principles

1. Change the types and the seed together. A type change without the matching seed change will fail `tsc`, which is useful: it shows every call site.
2. One entity per phase. Each phase ends with a green build.
3. Keep mapping out of components. Add one `toDomain()` / `toRow()` function per module (B11 in the backend doc), so a later API swap touches one file per module.
4. Do not add backend slices (B9) until a screen uses them.
5. Do not commit, push or sign in without an explicit instruction.

## Phases

### Phase 0: Decisions (no code)

Decide these before Phase 1. They come from the backend doc, Part C.

- A1.1: `core_user_role` is either given the six standard columns or documented as a composite-key exception. The frontend type for the user-role link is the same either way: `{ userId, roleId }`.
- A3: one polymorphic pattern for text references (`source_module` + `source_id`). Affects `ApprovalRequest` and `Grievance` types.
- B1: primary key type is `uuid` (string in TypeScript). Display codes move to a `code` field.
- B4: amounts are decimal strings. Confirm with the backend team.
- A2: target tables for `scope_department_id` and `scope_designation_id`. Affects holiday and week-off types only, so they can wait.

Verification: decisions written in `BACKEND_FRONTEND_CHANGES.md`, with the open items marked.

### Phase 1: Identifiers and the shared base type

Files:
- `src/modules/core-data/types/index.ts`: add a base type `{ id: string; code?: string }`. Make every entity extend it.
- `src/modules/core-data/store/useCore.ts`: `nextId(prefix, list)` becomes `newId()` (uuid) for `id`, and a separate `nextCode(prefix, list)` for the display code. Update `log()` to use the new id.
- `src/modules/core-data/data/seed.ts`: give every row a uuid, move the current code (`P-104`, `U-601`, etc.) into `code`, and rewrite every cross-reference (`parentId`, `headRoleId`, `raisedById`, `storeIds`, `reportsToId`, `departmentId`, `chainId`) to the uuid. Use a small helper that builds a `code -> uuid` map once, so seed references are written as codes and resolved at load time. That keeps the seed readable.
- Every component that renders an id as a key or link: change the key to `id` and the label to `code`. Search for `key={` and `to={` with entity ids.

Dependency: none. This is the largest phase and must come first.

Risk: references in the seed are typed as `string`, so a missed rewrite will not fail `tsc`. Add a seed integrity test (every `*Id` field resolves to a row) before changing the seed.

Verification: new test `core-data/data/seed.test.ts` checks that every foreign-key-style field resolves and that every `id` is unique. Then `npm run lint && npm run deps && tsc -b && vitest`.

### Phase 2: Users, roles and access (B2)

Files:
- `types/index.ts`: `CoreUser` loses `role`, `modules`, `privileges`, `scopeType`, `scopeIds`, `mustChangePassword`, `lastLogin`. Gains `roleIds: string[]`. `Role` loses `holder`, gains `holderUserId?: string`.
- `store/useCore.ts`: add `userRoles` and `userPrivileges` collections keyed by user id. Add selectors `rolesOfUser(userId)` and `holderOf(roleId)`.
- `data/seed.ts`: move role assignments out of the user rows into `userRoles`. Store `TENANT_ADMIN` as a user id, not a name.
- `organisation/components/UserForm.tsx` (31 hits), `organisation/pages/Users.tsx` (18), `organisation/pages/UserDetail.tsx` (9), `organisation/components/RoleForm.tsx` (15), `organisation/components/RolesSection.tsx` (11), `organisation/pages/Roles.tsx` (deleted in the working tree, so check that `Roles` is not imported elsewhere before relying on it).
- `organisation/utils/org.ts` (19): the role and user lookups move to the selectors above.
- `auth/` pages: anywhere `CoreUser.mustChangePassword` or `lastLogin` is read. Move reads to a session-level store.

Open question for the backend: where module access (`CoreUser.modules`) and scope (`scopeType`, `scopeIds`) live. Do not implement the scope model until this is answered (B2 row 2 and 4 in the backend doc).

Dependency: Phase 1.

Verification: unit tests for `rolesOfUser` and `holderOf`. Manual check in the browser: user list shows the same roles as before the change (compare with a screenshot from the current build). `tsc` and `vitest` must pass.

### Phase 3: Departments and roles (B3)

Files:
- `types/index.ts`: `Department` uses `headRoleId` as a uuid. Drop `colorHex` if colour is derived from the palette (decision needed; `CHANGES_TODO.md` item 19 depends on it). `Role.positions` is typed to the backend column name once confirmed.
- `organisation/components/DepartmentForm.tsx` (10 hits), `organisation/pages/Departments.tsx` (14), `organisation/pages/Organogram.tsx` (29), `organisation/components/ConfirmDialog.tsx` (4, check whether it reads department ids).
- `organisation/utils/org.ts`: the tree builder (`parentId` walk) must work on uuids. Add a test for cycles, since `parentId` is not checked for loops in the current code.

Dependency: Phases 1 and 2 (roles are referenced by departments).

Verification: tree-builder unit test with a cycle and an orphan. Organogram renders the same tree as before (screenshot comparison).

### Phase 4: Approvals (B4)

Files:
- `approvals/utils/schema.ts` (5 hits, plus 2 imports): `amount` as a decimal string. Validation uses a decimal parser, not `Number()`. Add a helper `money(string) -> display`.
- `types/index.ts`: `ApprovalRequest` gains `amount`, `chainId` (uuid), `matrixVersionId`, `configVersionLabel`, `configEffectiveFrom`, `levelsSnapshot`, `sourceModule`, `sourceId`. `status` becomes one enum. `history` becomes `ApprovalAction[]` with the fields of `core_approval_action`.
- `payload`: keep the current union, but add the discriminant to every kind so that the display payload is typed per kind.
- `store/useCore.ts`: `decide()` writes an action record and updates the request. `stopLevel()` reads the cash limit from the matrix level, not from chain AC-15. This removes the special case and closes CHANGES_TODO item 9.
- `approvals/pages/ApprovalDetail.tsx` (4 imports, 6 pattern hits), `approvals/pages/ChainNew.tsx` (3 imports, 12 pattern hits), `approvals/pages/ChainEditor.tsx` (2), `approvals/pages/ApprovalMatrix.tsx` (3), `approvals/pages/ApprovalsList.tsx` (2), `approvals/pages/JobOpenings.tsx`, `approvals/components/LevelFields.tsx` (3), `approvals/components/columns.tsx` (2).
- `company/pages/PolicyEditor.tsx` and `company/components/CustomPolicyEditor.tsx` (cash thresholds in policies, B8): decimal strings.

Dependency: Phase 1 (ids). Phase 2 is needed for approver names.

Verification: tests for `stopLevel()` with the cash limit on the matrix level (replacing the AC-15 case), for `decide()` writing one action per decision, and for money parsing (`"1850000.00"`, `"0.5"`, empty). Check the approvals list and detail in the browser against the current build.

### Phase 5: Audit trail (B5)

Files:
- `types/index.ts`: `AuditEntry` becomes `{ id, changedAt, actorId, action, tableName, recordId, oldRow, newRow, moduleName, correlationId?, ipHash?, rowHash?, prevHash? }`. Keep the old display fields as a view model.
- `store/useCore.ts`: `log()` writes the new shape. `before` and `after` become objects.
- `data/seed.ts`: AU-9001 to AU-9007 store objects, not display strings.
- `audit/pages/AuditTrail.tsx`: add a mapper from the stored shape to the view. Remove any wording that claims the hash chain was verified.

Dependency: Phase 1.

Verification: test for `log()` output shape. Browser check that the trail still displays the same rows.

### Phase 6: Dates and times (B6)

Files:
- `store/useCore.ts`: `nowISO()` returns UTC with `Z`. Business dates (`visitDate`, `effectiveFrom`, `startDate`) stay `yyyy-MM-dd`.
- New helper `shared/lib/dates.ts` (or the existing one, if there is one): `formatDateTime(iso)` and `formatDate(yyyyMMdd)`. All display code calls it.
- `shared/ui/DatePicker.tsx` (2 imports): no change to behaviour. Confirm it works with date-only strings.
- `grievances/utils/visits.ts` (1 import): visit date handling.

Dependency: none strictly, but do it before Phase 4 so that `submittedAt` is written in the new format.

Verification: unit tests for the formatter, including a string with `Z` and a date-only string. Browser check of the approvals list date column.

### Phase 7: Grievances and company policies (B7, B8)

Files:
- `types/index.ts`: `Grievance` gains `sourceModule`, `sourceId` (A3.4). Status set checked against the backend once the table is confirmed.
- `grievances/pages/GrievancesList.tsx` (2 imports), `grievances/pages/GrievanceDetail.tsx` (2), `grievances/utils/visits.ts` (1).
- `company/pages/Policies.tsx`, `company/utils/meta.ts`, `company/components/PolicyView.tsx`, `company/components/editors.tsx`, `company/components/OfferLetterPanel.tsx` (2).
- `store/useCore.ts` and `seed.ts`: `pv()` builds a uuid, keeps `key` and `version`, and `effectiveFrom` is a date.

Dependency: Phases 1 and 6.

Verification: `pv()` test (unique ids, version ordering). Browser check of the policy list.

### Phase 8: Projects, resources and dashboard (smaller changes)

Files:
- `projects/pages/ProjectDetail.tsx` (9 hits), `projects/pages/PeoplePlanning.tsx` (7 hits, 2 imports), `projects/pages/MaterialPlanning.tsx` (2 imports), `projects/components/ProjectForm.tsx` (2), `projects/components/SiteForm.tsx` (2), `projects/components/GeoFenceTab.tsx` (4), `projects/pages/SiteDetail.tsx` (2), `projects/pages/Sites.tsx`, `projects/pages/Projects.tsx`.
- `resources/pages/Stores.tsx`, `resources/pages/Materials.tsx`, `resources/pages/LiveStock.tsx`, `resources/pages/EquipmentRegister.tsx` (3 imports, 5 pattern hits).
- `dashboard/pages/Dashboard.tsx`.
- `PEOPLE_PLAN` and `MATERIAL_PLAN` (B10) stay as `TODO(backend)` mock data. Do not type them yet.

Dependency: Phase 1 (ids). These are mostly `storeIds`, `siteId` and `projectId` renames.

Verification: `tsc` and `vitest` only, plus a browser pass over each page.

### Phase 9: Cleanup

- Remove `colorHex` if Phase 3 dropped it. Remove the `nextId` helper if it has no callers.
- Remove dead code left by the deleted `organisation/pages/Roles.tsx` (check that nothing imports it).
- Run `npm run lint && npm run deps && tsc -b && vitest` on the whole tree.
- Update `docs/ARCHITECTURE.md` if the module boundary changes (the mapping layer from Principle 3).

## Dependency order

```
Phase 0 (decisions)
  └─ Phase 1 (ids)
       ├─ Phase 2 (users, roles)
       │    └─ Phase 3 (departments, roles)
       ├─ Phase 5 (audit)
       ├─ Phase 6 (dates) ─┬─ Phase 4 (approvals) ── needs Phase 2 for approver names
       │                   └─ Phase 7 (grievances, policies)
       └─ Phase 8 (projects, resources, dashboard)
  Phase 9 (cleanup) after all
```

Phases 5 and 6 can run in parallel with Phase 2 once Phase 1 is merged.

## Checks after every phase

1. `npm run lint`
2. `npm run deps` (dependency-cruiser; the module boundaries must still hold)
3. `tsc -b`
4. `vitest`
5. Browser check of each page the phase touched, compared with a screenshot of the current build.

## Defaults applied (the four open questions)

These were answered with defaults so Phase 1 can start. Each one can be changed in review without rework of Phase 1.

1. **Id type:** `uuid` for every entity, including seed-only codes such as `AC-1` and `R-01`. Seed codes stay as `code` values.
2. **Display codes:** visible in the UI, read from `code`. Keys and links use `id`.
3. **Colour:** derived from a palette index in the frontend. `colorHex` is dropped from `Department`. If the backend later stores a hex value, add it back. This also settles `CHANGES_TODO.md` item 19 as "derive from palette".
4. **Module access and scope:** set per role, not per user. The backend holds role-to-module access in a role-module table and scope on the user-role link. `CoreUser` keeps only `roleIds`. A selector `accessOf(userId)` computes effective modules and scope. Phase 2 scope work still waits for the backend team to confirm the table names.

## Remaining options for review

These are the Phase 0 decisions that still need a backend or product sign-off. Each row gives the default this plan uses and the alternative.

| Item | Default used in this plan | Alternative | Frontend impact |
|---|---|---|---|
| A1.1 `core_user_role` | Add the six standard columns, so one rule applies to every table | Document a composite-key exception `(user_id, role_id)` | None either way. The type is `{ userId, roleId }`. |
| A3 text references | `source_module` + `source_id uuid` on `ApprovalRequest` and `Grievance` | Typed foreign key per source module | Small. Two types change either way. |
| A2.1 / A2.3 holiday and week-off department scope | Create `core_department`, since `Department` already exists in the frontend | Point to an existing table | None until the holiday screen uses it. |
| A2.2 / A2.4 designation scope | Keep designation as text until a designation table exists (B2) | Create `core_designation` now | None. The text stays. |
| B4 money | Decimal strings, `numeric(14,2)` on the backend | Number with cents (rejected: float rounding on large sums) | Schema, validation and display helper change in Phase 4. |
| B1 primary key | `uuid`, with `code` for display | Keep text codes as keys (rejected: codes can change, and cross-references break) | Covered in Phase 1. |
| Role `positions` column name | Keep the frontend name, and map it to the backend column in the mapper | Rename the frontend field to match the backend | Two files in Phase 3. |
| Grievance status set | Keep the five current values until the backend table is confirmed | Use the backend enum once it exists | Phase 7 only. |
| Cash limit location (Phase 4) | **Confirmed by product:** move it to the matrix level (`stopLevel()`), closing `CHANGES_TODO.md` item 9 | Keep it on chain level AC-15 | Changes approval behaviour. Confirmed, so Phase 4 implements it. |
| `organisation/pages/Roles.tsx` | Treated as deleted, per the working tree. Confirm nothing imports it. | Restore the file | Phase 2 and Phase 9. |

Two items are not decisions but need a check before Phase 2 starts: confirm that the deletion of `Roles.tsx` is intended, and confirm the table names for module access and scope.

## Estimate

Not estimated in hours. The sizing above suggests Phase 1 and Phase 2 are the largest. Phases 5 to 7 are small and can be done in any order after Phase 1.
