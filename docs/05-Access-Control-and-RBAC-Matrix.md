# Access Control and RBAC Matrix

| Field | Value |
|---|---|
| Document ID | DOC-05 |
| Title | Access Control and RBAC Matrix (VeloxIQ Core) |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

Record who can do what in VeloxIQ Core as the code implements it: privileges, the API route groups each privilege protects, default roles, the scope model, UI visibility, privilege-change controls, and segregation-of-duties observations.

## 2. Scope

Backend `CORE__BACKEND/src/modules/*/routes.ts`, `src/modules/access/*`, `src/plugins/auth.ts`, `src/core/resource.ts`, and frontend `CORE__FRONTEND/src/modules/shell/config/nav.ts`, `src/app/App.tsx`. Code review only; nothing was verified at runtime. Companion document: DOC-04 (Security Architecture and Controls).

## 3. Access model summary

| Concept | Implementation | Reference |
|---|---|---|
| Identity | `core_user` row per tenant; login id unique per tenant, case-insensitive | `src/modules/access/schema.ts`, migration 0006 |
| Authentication gate | Bearer JWT plus live session check on every request | `src/plugins/auth.ts` |
| Access record | `core_user_access` rows with `access_type` of `role`, `privilege`, `module_head`, `suspension` | `migrations/0008_access.sql` |
| Privilege name | Dotted lowercase (`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`, 3 to 100 chars) | `access/schema.ts` |
| Role | `core_role` (code, name, `is_system`). Only system roles carry privileges | `src/modules/access/roles.ts` |
| Decision function | `userMayAct`: denied if suspended; otherwise allowed only if the user holds `access.manage` | `src/modules/access/service.ts` lines 137-151 |
| Route guard | `guardRoute(options, privilege, docs)`: `null` means signed-in user only; a name adds `requireAccess` | `src/core/resource.ts` |

Important observation (design vs. code): the privilege name and requested scope passed to `userMayAct` are not used in the decision (parameters are prefixed `_`). In the current code every privilege-named route is therefore open to exactly the holders of `access.manage` and to nobody else. The code comment states the intent: "Only an administrator (a holder of access.manage) may act. Module heads and approvers hold no privileges ... they use only their own module's screens."

## 4. Privilege catalogue

| Privilege | Defined in | Meaning (from code comments and routes) | Held by default through | Effective check today |
|---|---|---|---|---|
| `access.manage` | `src/modules/access/roles.ts` | Manage users, grants, suspensions; read audit log and integration events; the "administrator" privilege | System role `access_admin`; or a direct `privilege` grant (bootstrap via `npm run access:grant`) | Checked as itself and as the gate for every other privilege |
| `masters.manage` | `src/modules/masters/routes.ts` | Write vendors, materials, equipment types, allocations, assignments, plan lines, equipment units, maintenance schedules, stock levels | No role maps to it (`SYSTEM_ROLE_PRIVILEGES` has only `access_admin`); direct grant possible | Requires `access.manage` (see section 3) |
| `projects.manage` | `src/modules/projects/routes.ts` | Write projects, locations, stores, WBS nodes, chainage markers, geo-zones, milestones, BOQ items | As above | As above |
| `organisation.manage` | `src/modules/organisation/routes.ts` | Write company profile, holidays, shifts, number series, departments, positions, offer letter | As above | As above |
| `policies.manage` | `src/modules/policies/routes.ts` | Write policies, OT, leave and custom policies, document templates; publish policy versions | As above | As above |
| `approvals.manage` | `src/modules/approvals/routes.ts` | Write approval chains, matrices, limits; publish matrix versions and request publication | As above | As above |
| `records.manage` | `src/modules/records/routes.ts` | Write files, grievances, import batches, usage counters, notifications; update tickets | As above | As above |

Not found in code: any privilege for audit reading ("no audit-reading privilege exists yet", `src/modules/audit-log/routes.ts` comment) or for integration administration (reuses `access.manage`).

## 5. Default roles and user attributes

| Item | Values | Effect on API authorisation | Reference |
|---|---|---|---|
| System role `access_admin` | Privilege set: `access.manage` | Grants administrator rights when assigned through a `role` grant | `src/modules/access/roles.ts` |
| Tenant-defined roles | Any `core_role` with `is_system` false | No privileges "until the owning modules publish their privilege catalogue" | `roles.ts` |
| User attribute `role` (UI role) | `module_head`, `approver` (default `approver`) | Descriptive only; "privileges still come from grants" | `access/schema.ts` |
| User attribute `modules` | `hrms`, `pms`, `stores`, `pm` | Descriptive for module heads | `access/schema.ts` |
| Grant type `module_head` | module in `core`, `hrms`, `pm`, `pms`, `stores` | Held privileges: none (`heldPrivileges` ignores it) | `access/service.ts` |
| Approver role | `core_matrix_level.approver_role_id` or `approver_user_id` | Allows approval actions on a request level | `src/modules/approvals/rules.ts` (`isApproverOf`) |

Seeding: no migration inserts the `access_admin` role row; `is_system` has no default. How the role row is created in a real tenant: To be confirmed (Open items).

## 6. Scope model

| Dimension | Where defined | Enforced? |
|---|---|---|
| Grant scope: `locationId`, `projectId`, `storeId` (each nullable; null means unconstrained) | `AccessScope`, `scopeMatches`, `holdsPrivilege` in `src/modules/access/policy.ts`; optional `scope` in `grantBodySchema` | Stored with the grant and returned in `GET /auth/me/access`. Not applied by the route guard: `requireAccess` is always called without a `scopeOf`, and `userMayAct` ignores the scope |
| User scope: `scopeType` `company` or `project`, `scopeIds` (project ids, max 200) | `core_user.scope`, `scope_ids` (migration 0024); `access/schema.ts` | Stored profile attributes. No route filtering by them was found in the modules reviewed |
| Tenant | Schema `tenant_<id>`, id from the verified token | Enforced for every query (`src/db/tenant.ts`) |

`policy.ts` provides the building blocks for scoped checks (`holdsPrivilege`); the live guard does not call it. Treat project and location scope as a data-model capability, not an active control.

## 7. Route group by privilege matrix

Legend: `Auth` = any signed-in user (and not suspended); `AM` = `access.manage` (effective for all named privileges, section 3); `AM+SU` = `access.manage` plus passkey step-up; `AM+SU*` = `access.manage` plus step-up where a password check is also accepted; `Obj` = additional object-level rule in the service; `Open` = no authentication. A signed-in user whose temporary password is pending is refused (403) except on change password, `GET /auth/me`, `GET /auth/me/access` and sign-out.

| Route group (prefix) | Module file | Read | Write / action | Named privilege (write) |
|---|---|---|---|---|
| `/health`, `/health/ready` | `src/core/health.ts` | Open | n/a | none |
| `/docs` (non-production only) | `src/plugins/api-docs.ts` | Open (dev) | n/a | none |
| `/auth/login`, `/auth/refresh`, `/auth/password-reset/*`, `/auth/passkeys/login/*` | `auth/routes.ts` | Open (rate limited, tenant from header) | Open | none |
| `/auth/logout`, `/auth/me`, `/auth/change-password`, `/auth/me/access` | `auth/routes.ts`, `access/routes.ts` | Auth (allowed while password change pending) | Auth | none |
| `/auth/passkeys`, `/auth/sessions`, `/auth/step-up/*` | `auth/routes.ts` | Auth (own data only) | Auth | none |
| `/users`, `/users/:id` (create, patch, password-reset) | `access/routes.ts` | AM | AM | `access.manage` |
| `/access/users/:userId` (read) | `access/routes.ts` | AM | n/a | `access.manage` |
| `/access/users/:userId/grants`, `DELETE /access/grants/:id` | `access/routes.ts` | n/a | AM+SU (passkey only) | `access.manage` |
| `/access/users/:userId/suspensions`, `/access/suspensions/:id/restore` | `access/routes.ts` | n/a | AM | `access.manage` |
| `/audit-log`, `/audit-log/auth-events`, `/audit-log/:id` | `audit-log/routes.ts` | AM | n/a (append-only) | `access.manage` |
| `POST /audit-log/external` | `audit-log/routes.ts` | n/a | AM | `access.manage` |
| `/integration-events*`, `/ref-records*` (incl. replay, inbound) | `integration/routes.ts` | AM | AM | `access.manage` |
| `/projects`, `/locations`, `/stores`, `/wbs-nodes`, `/chainage-markers`, `/milestones` | `projects/routes.ts` | Auth | AM (named `projects.manage`) | `projects.manage` |
| `/geo-zones` | `projects/routes.ts` | Auth | AM+SU* (passkey or password step-up) | `projects.manage` |
| `/boq-items` | `boq/routes.ts` | Auth | AM (named `projects.manage`) | `projects.manage` |
| `/vendors`, `/materials`, `/equipment-types`, `/major-material-allocations`, `/equipment-assignments`, `/plan-lines`, `POST /vendors/:id/verify` | `masters/routes.ts` | Auth | AM (named `masters.manage`) | `masters.manage` |
| `/equipment-units*` | `equipment-units/routes.ts` | Auth | AM (named `masters.manage`) | `masters.manage` |
| `/maintenance-schedules` | `maintenance/routes.ts` | Auth | AM (named `masters.manage`) | `masters.manage` |
| `/stock-levels` | `stock-levels/routes.ts` | Auth | AM (named `masters.manage`) | `masters.manage` |
| `/uoms` | `uoms/routes.ts` | Auth | none (read only) | none |
| `/organisation/*` (company profile, holidays, shifts, number series, departments, positions) | `organisation/routes.ts` | Auth | AM (named `organisation.manage`) | `organisation.manage` |
| Offer letter routes | `offer-letter/routes.ts` | AM (all routes use the manage guard) | AM | `organisation.manage` |
| `/policies`, `/policy-versions`, `/policy-rules`, `/ot-policies`, `/ot-policy-rules`, `/leave-*`, `/custom-policy*`, `/document-templates`, `POST /policy-versions/:id/publish` | `policies/routes.ts` | Auth | AM (named `policies.manage`) | `policies.manage` |
| `POST /policy-rules/:id/acknowledge`, `GET /policy-rules/acknowledgements` | `policies/routes.ts` | Auth | Auth | none |
| `/approval-chains`, `/matrix-versions`, `/matrix-levels`, `/cash-limit-rows`, `/pms-limit-rows`, `POST /matrix-versions/:id/publish`, `POST /approval-requests/:id/publish` | `approvals/routes.ts` | Auth | AM (named `approvals.manage`) | `approvals.manage` |
| `POST /approval-requests` (raise), `GET /approval-requests*` | `approvals/routes.ts` | Auth | Auth | none |
| `POST /approval-requests/:id/actions` | `approvals/routes.ts` | Auth | Auth + Obj: raiser only for cancel/respond; approver of current level for decisions; suspended refused (403 `APPROVAL_NOT_APPROVER`) | none |
| `/files` (metadata), `PUT /files/:id/content` | `records/routes.ts` | Auth | AM (named `records.manage`); upload limited to 2 MiB and allow-listed types | `records.manage` |
| `GET /files/:id/content` | `records/routes.ts` | Auth + Obj (private file: creator or manage holder; logo any user) | n/a | `records.manage` (as override) |
| `/grievances`, `/import-batches*`, `/import-rows`, `/usage-counters*`, `POST /notifications` | `records/routes.ts` | Auth | AM (named `records.manage`) | `records.manage` |
| `/tickets` | `records/routes.ts` | Auth | create: Auth; update: AM (named `records.manage`) | `records.manage` |
| `/record-timeline` | `records/routes.ts` | Auth | no create route | none |
| `GET /notifications`, `/notifications/:id`, `POST /notifications/:id/read` | `records/routes.ts` | Auth | Auth | none |
| `GET /search` | `search/routes.ts` | Auth | n/a | none |
| `POST /offline-operations` | `offline/routes.ts` | Not guarded; validates then answers 501 | n/a | none |

Read routes marked Auth return tenant data to any signed-in, non-suspended user of the tenant; the code shows no row filtering by user scope.

## 8. UI visibility

| UI element | Rule | Reference |
|---|---|---|
| Signed-out visitor | Redirect to `/login` with `next` | `App.tsx` (`Protected`) |
| Temporary password pending | Forced to `/change-password` | `App.tsx` |
| User without `access.manage` ("non-admin") | `Protected` returns `ModuleHome` only; none of the Core shell, menu or data loads (data load effect also stops for non-admins) | `App.tsx` |
| Administrator (`access.manage`) | Full shell and all routes in `ROUTES` | `App.tsx` |
| Nav items with `needs` | "Users and roles" (`/users`) and "Activity log" (`/audit`) need `access.manage`; hidden otherwise; every other item has no `needs` | `src/modules/shell/config/nav.ts` (`NAV`, `navFor`, `privilegeFor`) |
| `Gate` per route | Shows `NoAccess` if `privilegeFor(path)` names a privilege the user lacks | `App.tsx` |
| Admin constant | `ADMIN_PRIVILEGE = 'access.manage'`; privileges read from `GET /auth/me/access` | `src/modules/auth/store/useAuth.ts` |
| Step-up prompt | `StepUpHost`; routes for grants and geo-zones need a step-up token | `App.tsx`, `src/shared/lib/api.ts` |

Effective result: in the shipped UI the only privilege that changes what a user sees is `access.manage`. Because the backend gate is also `access.manage` (section 3), the UI and API are consistent: administrators operate Core; other users are redirected to a module message. Client checks are convenience; the server is authoritative.

## 9. Privilege-change controls

| Control | Detail | Reference |
|---|---|---|
| Who may change grants | Holder of `access.manage` | `access/routes.ts` |
| Step-up for grant and revoke | Passkey check required (5-minute token bound to user, session, tenant). Password step-up is not accepted for grants | `step-up.ts`, `access/routes.ts` |
| Audit | Every grant (INSERT), revoke (DELETE with old snapshot), user create/update/password reset writes a hash-chained `audit_row_change` row with actor and correlation id | `access/service.ts`, `src/core/audit.ts` |
| Refusals recorded | `access_denied` events store method and route pattern only | `src/plugins/auth.ts` |
| Suspension | Admin suspends with mandatory reason (1 to 500 chars); one active suspension per user (unique index); effective on the next request; sessions stay | `migrations/0008_access.sql`, `access/service.ts` |
| Revocation model | Revoke deletes the grant row; history kept in the audit row | `access/service.ts` (`revokeGrant`) |
| First administrator | CLI `npm run access:grant -- <tenantId> <loginId> <privilege>`; same service, audit row with no actor | `access/cli.ts`, `bootstrap.ts` |
| Admin password reset | New temporary password shown once, all sessions revoked, lockout cleared, must change at next sign-in; audited | `access/service.ts` (`resetUserPassword`) |
| Grant validation | Zod discriminated union (`role`, `privilege`, `module_head`); referenced ids must exist (FK); arbitrary privilege strings matching the pattern are accepted | `access/schema.ts`, `access/service.ts` |

## 10. Segregation-of-duties observations

| # | Observation | Evidence | Risk |
|---|---|---|---|
| S1 | One privilege (`access.manage`) is the effective gate for user administration, audit reading, integration replay, and (via `userMayAct`) every configuration write. A single administrator can create users, grant access, change masters and policies, and read the audit trail | `access/service.ts` lines 137-151 | High |
| S2 | No second-person approval for grants; control is one admin plus the admin's own passkey | `access/routes.ts` | Medium |
| S3 | An administrator is not prevented from granting to or suspending their own account, or from resetting their own password via the admin route (no self-check found in `grantAccess`, `suspendUser`, `resetUserPassword`) | `access/service.ts` | Medium |
| S4 | Audit readers equal audit subjects: those who change access also read the audit log, and no separate audit privilege exists | `audit-log/routes.ts` comment | Medium |
| S5 | Approval workflow has object-level separation: only the raiser may cancel or respond; only a configured approver (user or held role) may decide; suspended users cannot approve. The code does not show a rule that blocks a raiser from also being an approver of their own request | `approvals/service.ts`, `approvals/rules.ts` | Medium (to be confirmed) |
| S6 | Approval configuration (chains, matrix, limits) is edited and published under the same gate as approvals' other administration, and by the same administrator who may be an approver | `approvals/routes.ts` | Medium |
| S7 | Bootstrap grant by CLI has no actor in the audit row and requires direct database credentials | `access/bootstrap.ts` | Low |
| S8 | Privileges mapped by tenant-defined roles are empty; segmentation by privilege (for example `masters.manage` without `access.manage`) cannot work in the current guard | `roles.ts`, `userMayAct` | Design gap |

## 11. Recommendations to consider (not implemented)

| # | Suggestion | Addresses |
|---|---|---|
| R1 | Make `userMayAct` honour the privilege name and scope using `holdsPrivilege`, and map `masters.manage` and others to roles | S1, S8, scope model |
| R2 | Add a dedicated audit-reading privilege | S4 |
| R3 | Refuse self-grant, self-suspension and self-reset on admin routes, or require a second approver | S2, S3 |
| R4 | Block an approver from deciding a request they raised, if policy requires | S5 |
| R5 | Document and seed the `access_admin` system role per tenant | Section 5 |

These are for review; none is a statement that the current behaviour is wrong against an unseen policy.

## 12. Open items

| # | Item | Status |
|---|---|---|
| O1 | Named owner of this document and of access reviews | To be confirmed |
| O2 | Access-review cadence, joiner-mover-leaver procedure, approval authority for grants | To be confirmed |
| O3 | Whether the "administrator only" rule in `userMayAct` is final or interim | To be confirmed |
| O4 | How the `access_admin` system role row is created in a tenant (no seed migration found) | To be confirmed |
| O5 | Intended future privilege catalogue per module and role mapping | To be confirmed |
| O6 | Whether project and location scope (`scopeType`, `scopeIds`, grant scope) will be enforced on reads | To be confirmed |
| O7 | Whether a raiser may approve their own request | To be confirmed |
| O8 | Other module applications (HRMS, PMS, Stores, Plant and Machinery) and their role models | To be confirmed |
| O9 | Runtime verification of this matrix against a running instance | To be confirmed |

## 13. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | Initial draft from repository review |
