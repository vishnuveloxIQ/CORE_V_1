# VeloxIQ Core: Backend and Frontend Changes

Source reviewed: `C:\Users\Admin\Downloads\database-tables\01_Core_and_Integration.md` (57 tables, 398 columns, tenant schema `tenant_<id>`).
Frontend reviewed: `src/modules/core-data/` (types, `useCore` store, seed), `src/modules/auth/`, `docs/ARCHITECTURE.md`, `CHANGES_TODO.md`.

The frontend has no ORM and no live API. It runs on an in-memory zustand store seeded with mock data, so the comparison is between the backend table definitions and the TypeScript types, store slices and seed data.

---

## Part A: Backend changes

### A1. Rule conflicts (fix before DDL)

| # | Table | Problem | Change needed |
|---|---|---|---|
| A1.1 | `core_user_role` | Has only `user_id` and `role_id` (2 columns). Every other table must carry `id, created_at, created_by, updated_at, updated_by, row_version`. | Either add the six standard columns, or document this table as an explicit exception with composite PK `(user_id, role_id)`. Decide once and apply to the rule document. |
| A1.2 | `integ_offline_operation.device_id` | Typed `text`, but the note says it references `pm_telematics_device`. | Change to the same type as `pm_telematics_device`'s primary key (likely `uuid`), or confirm the device key is a text code and make the FK explicit. |

### A2. Open references (no target table defined)

These columns look like foreign keys, but no target table exists in the source documents. Each one needs a decision before DDL.

| # | Column | Decision needed |
|---|---|---|
| A2.1 | `core_holiday.scope_department_id` | Which table is it? `core_department` is not confirmed in this file. Create the table or point to an existing one. |
| A2.2 | `core_holiday.scope_designation_id` | There is no designation table. Frontend stores designation as plain text on the user. Decide: add `core_designation`, or change to a text scope. |
| A2.3 | `core_week_off_pattern.scope_department_id` | Same as A2.1. |
| A2.4 | `core_week_off_pattern.scope_designation_id` | Same as A2.2. |

### A3. Text-only "reference" columns (no FK, no target)

| # | Column | Notes |
|---|---|---|
| A3.1 | `core_vendor.source_ref` | Text reference to an unnamed source. |
| A3.2 | `core_major_material_allocation.item_ref` | Text reference to an item. Confirm the target (stores material or PM item). |
| A3.3 | `core_approval_request.source_ref` | Pairs with `source_module`. Pick one pattern for all of these: either a typed FK per source, or `source_module` + `source_id uuid`. |
| A3.4 | `core_grievance.source_ref` | Same pattern as A3.3. |

Recommendation: use one polymorphic pattern (`source_module text` + `source_id uuid`) for all four, and enforce it with a check constraint on `source_module`.

### A4. Cross-application dependencies to confirm

- `core_approval_request` is referenced by about 25 tables across core, HRMS, PM, PMS and Stores. Any change to its primary key type, or to `id` generation, breaks all of them. Freeze its key type first.
- `core_approval_request.requester_id`, `assigned_actor_id` and `chain_id` all reference the core tables. The frontend seed allows `raisedById: null`. Check whether `requester_id` is nullable in the DDL. If it must be set, seed data needs a user for every request.
- `audit_row_change.actor_id` references `core_user_account`. System actions (jobs, imports, sync) have no user. Decide whether `actor_id` is nullable, or add a system actor row.

### A5. Items to confirm in backend (not verified in this pass)

- Primary key type on every table. The frontend uses prefixed string ids; the backend uses `uuid`. See B1.
- Whether `core_user_account` has the columns the frontend `CoreUser` needs: `empCode`, `designation`, `phone`, `mustChangePassword`, `lastLogin`, and `status`.
- Whether `core_department` has `color` and `status`. `CHANGES_TODO.md` item 19 (Department colour) depends on it.
- Whether `core_approval_action` covers the frontend `history` entries (`level`, `by`, `action`, `at`, `comment`).

---

## Part B: Frontend changes to match the backend

### B1. Identifiers (highest impact)

Frontend ids are display codes used as keys: `P-104`, `REQ-2035`, `GRV-0104`, `U-601`, `D-01`, `R-01`, `AC-1`, `M-401`, `S-201`, `ST-301`, `AU-9001`.

Backend ids are `uuid` primary keys.

**Change:** add a real `id: string` (uuid) to every entity and keep the display code in a separate `code` field. Update:

- `types/index.ts`: every `id` type plus a new `code` field where a display code is shown.
- `store/useCore.ts`: `nextId(prefix, list)` must generate uuids, and display codes must come from a separate sequence.
- `data/seed.ts`: give every seed row a uuid, and keep the current codes in `code`. Cross-references (`parentId`, `headRoleId`, `raisedById`, `storeIds`, `reportsToId`, `departmentId`) must be rewritten to point at the uuids.

### B2. Users, roles and access

| Frontend today | Backend | Change |
|---|---|---|
| `CoreUser.role` (single string) | `core_user_role` (many-to-many user to role) | Replace with `roleIds: string[]` (uuid). Show the role name by lookup. |
| `CoreUser.modules` (array) | Not in this file's user table list I checked | Confirm where module access lives in the backend (likely a privilege or role table). Do not store it on the user. |
| `CoreUser.privileges` | `core_user_privilege` | Map to the privilege table. Do not keep a separate array on the user. |
| `CoreUser.scopeType` + `scopeIds` | Scope tables not checked in this pass | Confirm the scope model in the backend, then match the types exactly. |
| `CoreUser.designation` (text) | Designation may become a table (A2.2) | Keep text until A2.2 is decided. |
| `CoreUser.mustChangePassword`, `lastLogin` | Identity and session group (`core_session`, login log, credentials) | Move these out of the user object. They belong to session and credential data. |
| `TENANT_ADMIN = 'Anil Mehta'` (seed) | Needs a user uuid | Store the admin's uuid and look up the name. |
| `Role.holder` (display name string, sometimes empty) | `core_user_role` | Replace with `holderUserId` (uuid, nullable). Look up the name. |

### B3. Role and department model

- `Department` has `code`, `name`, `parentId`, `headRoleId`, `description`, `color`, `colorHex?`, `status`. Confirm `color` exists in `core_department`. Drop `colorHex` if it is derived.
- `Role` has `departmentId`, `grade`, `reportsToId`, `positions`, `holder`, `status`. Map `positions` to the backend column (confirm name), and replace `holder` as in B2.
- Keep the `colorHex?` field only if the backend stores a hex value. Otherwise derive colour from the palette index.

### B4. Approvals

| Frontend today | Backend | Change |
|---|---|---|
| `ApprovalRequest` has no amount field | `core_approval_request.amount numeric(14,2)` | Add `amount: string` (decimal string, not `number`). Seed amounts such as `18_50_000` must become strings like `"1850000.00"`. |
| `payload` (frontend union of kinds: payment, recruitment, offer, job, mrf, onboarding, transfer, promotion, bonus, loan) | `display_payload jsonb` and `levels_snapshot jsonb` | Type `display_payload` per request type. Keep `levels_snapshot` as the frozen chain copy. Do not rebuild the chain from `chainFor()` at read time. |
| `chainId`, `matrixVersion` (string) | `chain_id` uuid, `matrix_version_id` uuid, `config_version_label` text, `config_effective_from` date | Store the uuid and the label. Keep both. |
| `currentLevel` | `current_level smallint` | Same name, type `number`. |
| `status`: `'Pending' \| 'In review' \| 'Approved' \| 'Rejected'` | `status text` | Define a single enum in `types` and map every status the backend can return. Confirm the backend value list. |
| `raisedAt` (local string `yyyy-MM-dd'T'HH:mm:ss`) | `submitted_at timestamptz` | Use ISO 8601 with offset. See B6. |
| `decide()` appends to `history` in the store | `core_approval_action` (9 columns) | Store actions as their own collection keyed by request id. Map `history` to `core_approval_action`. |
| `stopLevel()` uses `cashLimit` on chain AC-15 for Payments | Cash limits sit in the approval matrix (`core_matrix_level` and matrix tables) | Move the cash limit to the matrix level. Remove the special case in `stopLevel()`. |

Also: `CHANGES_TODO.md` item 9 (Cash-limit approval matrix) is blocked on this change.

### B5. Audit trail

| Frontend today | Backend (`audit_row_change`) | Change |
|---|---|---|
| `log(action, entity, entityId, before, after)` writes `{ id, at, user, action, entity, entityId, before, after }` | `table_name, record_id text, op, old_row jsonb, new_row jsonb, actor_id uuid, correlation_id, module_name, ip_hash, changed_at timestamptz, prev_hash, row_hash` | Rename fields to match. Store `before` and `after` as objects, not display strings. |
| Seed AU-9001 to AU-9007 store `before` and `after` as display strings | `old_row` and `new_row` are jsonb | Replace strings with objects. |
| No hash chain | `prev_hash`, `row_hash` | The hash chain is computed by the backend. The frontend must not show it as verified. Remove any "verified" claim in the UI. |
| No IP or correlation | `ip_hash`, `correlation_id` | Add them to the type; leave them empty in the mock. |

### B6. Dates and times

- The store uses local strings without a timezone (`nowISO()` returns `yyyy-MM-dd'T'HH:mm:ss`).
- The backend uses `timestamptz` and `date`.

**Change:** store timestamps as UTC ISO strings (with `Z`). Use `date` (`yyyy-MM-dd`) only for business dates such as `visitDate` and `effectiveFrom`. Format for display in one helper.

### B7. Grievances

- The status set (`'Requested'`, `'Confirmed'`, `'Rescheduled'`, `'Visited'`, `'Not visited'`) and the history shape (`{ status, at, note }`) must be checked against the backend grievance tables. The backend file shows `core_grievance.source_ref` as a text reference (A3.4).
- `message` is limited to 10 words in the seed. Confirm the column length (`varchar(n)` or `text`).

### B8. Company policies

- `pv(key, version, effectiveFrom, reason, data)` builds `id = ${key}-v${version}`. Replace with a uuid, keep `key` and `version` as fields.
- `effectiveFrom` must become a `date`.
- Payment threshold amounts (`5_00_000`, `10_00_000`) must be decimal strings (B4).

### B9. Store slices that do not exist in the frontend

These backend areas have no slice, type or seed data in `useCore` or `types/index.ts`:

- `core_legal_entity`
- `core_branch`
- `core_session` and the identity and session group (login log, auth challenge, passkeys, credentials)
- `core_file`
- `core_record_timeline`
- `core_import_batch`
- `integ_*` tables: outbox, inbox, dead letter, idempotency, aggregate sequence, offline operation

Only add the slices the UI needs now. For `integ_offline_operation`, the frontend has no offline capture yet, so defer it.

### B10. Mock data that is marked as a backend gap

These are already marked `TODO(backend)` in `seed.ts`. They need backend tables before they can be typed:

- `PEOPLE_PLAN` and `MATERIAL_PLAN`
- `PMS_LIMITS`

Also `CHANGES_TODO.md` item 4 (People Planning) and item 5 (Material Planning) depend on them.

### B11. Naming and casing

- Frontend types are camelCase (`raisedById`, `empCode`). Backend columns are snake_case (`requester_id`, `emp_code`).
- Decide on one mapping layer (e.g. a `toDomain()` / `toRow()` function per module) and keep it out of components.

---

## Part C: Order of work

1. Decide A1.1 (`core_user_role` exception) and A3 (one pattern for text references).
2. Decide the primary key type (B1, uuid) and freeze it. This is the largest change and touches every module.
3. Resolve A2 open references and A1.2 `device_id` type.
4. Update `types/index.ts` and `seed.ts` together, one entity at a time, starting with `CoreUser`, `Role`, `Department`.
5. Update `ApprovalRequest` (B4) and the audit shape (B5).
6. Add the missing slices (B9) only when a screen needs them.
7. Re-run `npm run lint && npm run deps && tsc -b && vitest` after each step.

---

## Notes on what was checked

- The backend file was read in full (1155 lines).
- Frontend types, store and seed were read in full.
- A search of `src/` for backend table names (`core_legal_entity`, `core_branch`, `core_session`, `integ_`, `audit_row_change`, `core_approval_request`, `levels_snapshot`, `display_payload`, `row_version`, `device_id`) returned no matches. The frontend does not reference backend names yet.
- `docs/ARCHITECTURE.md` covers module layout and boundaries only. It does not affect the data model.
- Module pages (approvals, company, organisation, projects, grievances, resources, dashboard, audit, auth) were not reviewed line by line. Items in B2 to B8 come from the types and store, and should be checked against the pages that use them.
