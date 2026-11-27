# API v1: locked contract

Locked on 2026-11-21 at version 1.0.0, covering the scope that exists today. Current version: **1.23.0** (see the changelog below).

- **Contract:** `docs/api/openapi-v1.json`, 282 operations. 10 are public; every other operation needs a bearer token.
- **SHA-256 of the snapshot:** 1.0.0 `74db7f9a16115bba32b1b14efdd68bdad976a19e00751722ebf10d55f906129f`; 1.1.0 `b61b613b9b0c6663f0c34470d39d17f570863a58c3454d8352030fb4a501891c`; 1.2.0 `2cfce5b5ef8d34dfa1737d8764fd4b79ab722a20074e1e534e78b9b347d867e9`; 1.3.0 `2bd0dad04d96d1aec08821819a5c2026ef6c07b67f64291fb4b9388ef52963fb`; 1.4.0 `e0a7e20f6d079955f4a37a07e233ab8e3ca08a3b827a77f026154200e562ee8a`; 1.5.0 `f3291c2ba96661f9a3858d194039299afea24e2fc732b8dab17821774b6360b0`; 1.6.0 `61ab4dbe43647be6b35f987f3422c06b8eeb06be23c105194d89c42405e7e35d`; 1.7.0 `65f405e8dff07bcc84da01577a53ffc8340750d85b70b3653964574b36db1f15`; 1.8.0 `076d52104b09255f1f1ccb57590379883f53548ee9cf4b1e421ff4474d438d5f`; 1.9.0 `cda1a3a93f5c47f559fa67aa82f19672c30cc877dc1799f7c8402b4a01b7ca66`; 1.10.0 `b52b3772d0c425091bf56144fb5a03eb403295c8cdc48992f1031cdafd0419e2`
- **Guard:** `tests/regression/api-v1-lock.test.ts`, run by `npm run test:regression:api` and `npm run test:regression`.

The lock covers each operation's method and path, parameters, request body schema, idempotency header, security (public or bearer) and documented responses. Summaries and descriptions are wording only, so they can change freely.

## Scope locked in v1

| Area | Operations |
|---|---|
| Identity: `auth`, `users`, `access`, `audit-log` | 35 |
| Projects and locations: `projects`, `locations`, `stores`, `wbs-nodes`, `chainage-markers`, `geo-zones`, `milestones`, `boq-items` | 37 |
| Master data: `vendors`, `materials`, `equipment-types`, `equipment-units`, `equipment-assignments`, `major-material-allocations`, `plan-lines`, `stock-levels`, `uoms`, `maintenance-schedules` | 42 |
| Organisation: company profile, holidays, shifts, number series, departments, positions; `offer-letter` | 28 |
| Policies: `policies`, `policy-versions`, `policy-rules`, `leave-*`, `ot-*`, `custom-policy*`, `cash-limit-rows` (and `pms-limit-rows`) | 68 |
| Approvals: `approval-chains`, `approval-requests`, `matrix-versions`, `matrix-levels` | 22 |
| Records: `files`, `grievances`, `tickets`, `notifications`, `document-templates`, `import-batches`, `import-rows`, `record-timeline`, `usage-counters` | 38 |
| Platform: `health`, `openapi.json`, `offline-operations`, `search` | 5 |
| Integration: `integration-events`, `ref-records` | 7 |
| **Total** | **282** |

The snapshot file is the authority. This table is a summary of it by area.

## Names (owner decision, 2026-11-22)

The names in this contract stay as they are. The early proposed contract (`C:\VELOX_IQpi-contract.md`, written before the backend existed, with paths such as `/sites` and `/projects/{id}/chainage/markers` and cookie sessions) is superseded by this one and is not a source for renames. A rename would break v1 callers, so any future one goes through a v2 plan, not a change to v1.

## Change rules while v1 is in force

| Change | Allowed in v1? | What to do |
|---|---|---|
| Reword a summary or description | Yes | Nothing; the lock ignores wording |
| Add a new operation, or an optional request field | Yes, as a minor version | Bump `version` in `package.json` (for example 1.1.0), run `npm run api:snapshot`, and review the snapshot diff with the frontend owner |
| Remove or rename an operation, path or parameter | **No** | Plan it for v2 |
| Make an optional field required, change a type or enum, change a status code a client relies on | **No** | Plan it for v2 |
| Make a protected operation public, or a public one protected | **No** (security change) | Needs a decision and a v2 or a security note |

The lock test fails on any added, removed or changed operation, including allowed additions, so every contract change is a deliberate, reviewed step and never a side effect.

## Updating the snapshot

```
npm run api:snapshot
```

This builds the app with the database pool from `.env`, so every module route registers, and writes `docs/api/openapi-v1.json` with sorted keys, so the file diffs cleanly. Then run `npm run test:regression:api`.

## Changelog

### 1.23.0 (2026-11-27)

Compared with 1.22.0: nothing removed or changed; additions only (migration 0078).

- **Added, approved people:** `GET /approved-people` (filters `projectId`, `status`), `GET /approved-people/{id}`, `POST`, `PATCH` and `DELETE`. Reads need a signed-in user; writes need `organisation.manage`. A person has a project, department, name, designation, joining date, a status (`Approved`, `With HRMS`, `Onboarded`), and an optional reason and `reasonRequestedAt`. A person is added as `Approved` and only moves forward one step with `PATCH status`.
- **Added, billing (read-only):** `GET /subscriptions` (the tenant's subscription), `GET /invoices` and `GET /billing-plans`, each with `GET /{id}`. Any signed-in user can read. There are no writes.

### 1.22.0 (2026-11-27)

Compared with 1.21.0: nothing removed or changed; additions only.

- **Added, hire status of an equipment unit:** an optional `hireStatus` (`Active` or `Inactive`) on `POST` and `PATCH /equipment-units`, and in every unit read. It says whether a hired unit is still on hire. The registration sets `Active`; the status is changed afterwards with `PATCH` (migration 0077).

### 1.21.0 (2026-11-27)

Compared with 1.20.0: nothing removed or changed; additions only.

- **Added, quotation approval (approvals.manage to write):** `GET /quotations` (filter `status`), `GET /quotations/{id}`, `POST /quotations` and `PATCH /quotations/{id}`. A quotation is a vendor's supply quotation (reference, `vendorName`, `buyerName`, optional `projectName`, `destination`, `quotationDate`, `validUntil`, `paymentTerms`, `amount` and the full quotation `document`: parties, goods with HSN codes, charges, tax, terms and bank details) and is sent for approval and starts `PENDING`. `PATCH` records the decision once: `status` `APPROVED` (with an optional `reason`, kept as the approval note), or `REJECTED` with a required `reason`. A decided quotation cannot change again. There is no `DELETE` (migration 0075).

### 1.20.0 (2026-11-27)

Compared with 1.19.0: nothing removed; additions only.

- **Added, optional:** `storeIds` on `materials` (create and patch; the list of stores the material is available in, replaced when sent) and on the read of a material. Stored in `core_material_store`. A store that does not exist is refused with 400.

### 1.19.0 (2026-11-26)

Compared with 1.18.0: nothing removed or changed; additions only.

- **Added, workforce adverts (projects.manage to write):** `/workforce-adverts` (drafts, publish and close by status), `/workforce-advert-requirements` (worker lines, draft only), `/advert-mail` (read-only: the messages queued for registered sub-contractors on publish), `/contractor-interests` (a sub-contractor's response, with status and reason) and `/interest-steps` (discussion steps).

### 1.18.0 (2026-11-26)

Compared with 1.17.0: nothing removed or changed; additions only.

- **Added, optional:** `status` on `sub-contractors` (`active` or `inactive`; new registrations are `active`). Filter and read on the same routes.

### 1.17.0 (2026-11-26)

Compared with 1.16.0: nothing removed or changed; additions only.

- **Added, project management (projects.manage to write):** `GET`, `POST`, `PATCH` and `DELETE` on `/sub-contractors`: the sub-contract details of a project's sub-contractor (firm, owner, contact, GST and PAN, work order date and title, scope and conditions) and the agreement / work order document (`agreementFileId`, a PDF or Word file uploaded through `/files`). Filter `projectId`.

### 1.16.0 (2026-11-26)

Compared with 1.15.0: nothing removed; additions only.

- **Added, optional:** `overPlanReason` on `equipment-units` (create, update and read): why the unit was assigned to a project beyond the units its equipment planning allows. Cleared when the unit leaves the project.

### 1.15.0 (2026-11-26)

Compared with 1.14.0: nothing removed; additions only.

- **Added, optional:** `approvalRequestId` (the approved equipment request a hired unit is registered against) and `hiredFrom` (who hired it: `HO hiring`, or `Site hiring` when the P&M head registered it) on `equipment-units` (create, update and read).

### 1.14.0 (2026-11-26)

Compared with 1.13.0: nothing removed or changed; additions only.

- **Added, policies (policies.manage to write):** `GET`, `POST`, `PATCH` and `DELETE` on `/equipment-rates` and `/material-rates`: the rate rows of the Fleet and Equipment and the Material management policies, per project (`projectId`), with the policy version they came from (`policyVersionId`). Filters `projectId` and `policyVersionId`.
- **Added, optional:** `projectId` on `policy-versions` (create, read and filter). A version with no project is the company-wide default; a version with a project applies to that project only.

### 1.13.0 (2026-11-25)

Compared with 1.12.0: nothing removed; `role` still works as before; additions only.

- **Added (access.manage):** `roles` on `POST /users` and `PATCH /users/:id`: a list of `module_head` and `approver`, one or both. A user may now be both a module head (with modules) and an approver (placed on levels). When `roles` is sent it wins over `role`; when neither is sent the user is an approver. Responses carry `roles` next to `role`. `role` is the primary role: `module_head` when the user holds it, else `approver`.
- **Changed rule:** an approver may now head modules when `module_head` is in `roles`; a user without `module_head` may not head modules (the old "an approver heads no modules" rule is replaced by this one). Migration 0047 adds `core_user.user_roles` and backfills it from `user_role`.

### 1.12.0 (2026-11-25)

Compared with 1.11.0: nothing removed or changed; one operation added.

- **Added (masters.manage):** `POST /uoms` creates a unit of measure with `code` (up to 20 characters) and `name` (up to 60), for a material whose unit is not on the list. Answers 201 with the unit, 409 when the code exists (compared without regard to case), 400 for a bad code. The unit is added to the company's shared unit list (`shared.uom`), which the application role may now insert into, and nothing else in it (migration 0045).

### 1.11.0 (2026-11-25)

Compared with 1.10.0: nothing removed; two operations added; the company header on sign-in is now optional; one response field added.

- **Added, public (no sign-in):** `POST /auth/register/otp` sends a six-digit code to an email address or a mobile number (`channel` `email` or `mobile`, `target`). Development only: outside production the answer includes `developmentCode` so the registration page can show it; production answers 503 until a delivery provider is chosen (decision D10). At most five codes per address or number in 15 minutes.
- **Added, public:** `POST /auth/register` creates a company: its own tenant, its first administrator (login ID with a 3 to 6 letter prefix and 4 digits, for example ACME1234, holding `access.manage`), and its company profile. It needs the company name, email, mobile, both codes, the login ID and a password of at least 12 characters. Answers 201 with `{ tenantId, loginId }`. Answers 409 when the prefix is already taken, 400 when a code is wrong or expired. Requires the server to have a provisioning connection (`PROVISION_DATABASE_URL`), otherwise 503.
- **Changed, additive:** `POST /auth/login`, `POST /auth/passkeys/login/options` and `POST /auth/passkeys/login/verify` no longer need the `X-Tenant-Id` header. Without it, the company is found from the login ID's prefix (the company directory, migration 0043, with 0044 for the Acme prefixes). With it, behaviour is unchanged.
- **Added to the response:** `tenantId` on `POST /auth/login` and `POST /auth/passkeys/login/verify`, the company the session belongs to.

### 1.10.0 (2026-11-24)

Compared with 1.9.0: nothing removed or changed; one operation and one optional filter added, and one response field added.

- **Added (access.manage):** `POST /audit-log/external`, for the other modules to send entries from their own audit trails (a sign-in in HRMS, a request raised in PMS). The body is `sourceModule` (`hrms`, `pm`, `pms` or `stores`), `action` (for example `signed_in`), `entityType` (for example `leave_request`), optional `recordRef`, `actorName`, optional `actorLogin`, `summary` (the sentence a reader sees), `occurredAt`, optional `correlationId` (the sending module's own, so one action can be followed across systems; CORE's request id is used when it is absent) and optional `details`. It answers 201 with `{ id, module }`. CORE stores the entry in the same append-only, hash-linked chain as its own entries, so the audit trail shows every module's activity in one place. The person named is not a CORE user, so the name and login are kept inside the entry.
- **Added, optional:** `module` filter on `GET /audit-log` (`core`, `hrms`, `pm`, `pms`, `stores`). The `actor` filter also matches the name or login carried inside another module's entry.
- **Sign-ins of other modules:** an entry sent with `entityType` `session` is also listed by `GET /audit-log/auth-events`. Its `action` `signed_in`, `signed_out` or `login_failed` is read as `login_success`, `logout` or `login_failure`. That route gains an optional `module` filter and a `module` field on each event.
- **Added to the response:** `module` on each audit entry (`GET /audit-log`, `GET /audit-log/{id}`). Entries from other modules show their own action, entity, person and time, with the summary and details in `after`.

### 1.9.0 (2026-11-24)

Compared with 1.8.0: nothing removed or changed; the new fields are optional.

- **Added, optional:** `capacity` (text up to 100 characters, a description such as `30-ton (300)` or `10-wheel`) and `model` (text up to 100 characters) on plan lines (`POST /plan-lines`, `PATCH /plan-lines/{id}`) and in their responses. They say what capacity and model an equipment line needs (migrations 0041 and 0042). There is no unit field.

### 1.8.0 (2026-11-24)

Compared with 1.7.0: nothing removed or added. One request limit removed.

- **Changed, looser:** `points` on the geo-fence zone request (`POST /geo-zones`, `PATCH /geo-zones/{id}`) no longer has a maximum of 1000 points. A zone can have any number of points.

### 1.7.0 (2026-11-23)

Compared with 1.6.0: nothing removed or changed, one operation added.

- **Added, step-up by password (any signed-in user):** `POST /auth/step-up/password` with `{ "password": "…" }`. It returns the same `{ stepUpToken, expiresAt }` as `POST /auth/step-up/verify`, valid for five minutes, after the user types their password again. A wrong password answers 401 `STEP_UP_FAILED` and is recorded (`step_up_failure`, purpose `password`); attempts are limited to 10 per user per window (429 `RATE_LIMITED`).
- **Behaviour (not a contract change):** a step-up token now records how it was obtained. Geo-fence zone writes (`POST`, `PATCH` and `DELETE /geo-zones`) accept a token from either a passkey or a password check. Privilege grants and revokes (`/access/...`) still accept a passkey token only, because a password alone must not be enough to hand out access. A password check also works for a user who has no passkey yet. Tokens issued before this version are passkey tokens.

### 1.6.0 (2026-11-22)

Compared with 1.5.0: nothing removed or changed, eight operations added.

- **Added, integration (access.manage):** `GET /integration-events` (filters `direction`, `status`, `eventType`, `from`, `to`; paged), `GET /integration-events/summary`, `GET /integration-events/{id}`, `POST /integration-events/{id}/replay` (dead-lettered events only; audited) and `POST /integration-events/inbound` (an event from HRMS, P&M, PMS or Stores in the versioned envelope; 202 applied or stale, 200 duplicate). Payload values are never returned, only `payloadKeys`. Read models: `GET /ref-records` (filters `sourceModule`, `entityType`, `q`; paged) and `GET /ref-records/sync-status`.
- **Added, search (any signed-in user):** `GET /search?q=&types=&limit=`: master records by code or name in the signed-in company, 2 to 100 characters, at most 20 per type.
- **Behaviour (not a contract change):** approval raises and decisions now write outbound events in the same transaction (transactional outbox). The relay that sends them has no production transport yet (decision D13) and starts only when a transport and retry values (D14) are configured.

### 1.5.0 (2026-11-22)

Compared with 1.4.0: nothing removed, five operations added, fifteen changed (documentation of existing filters only).

- **Added:** `/cash-limit-rows` (GET, POST, GET one, PATCH, DELETE), the new name for PMS limit rows (owner decision). It is the same resource as `/pms-limit-rows`, which stays unchanged for v1 callers; the frontend uses the new name.
- **Changed, documentation only:** the list filters each operation already accepted are now in the contract: `status` on `GET /vendors`, `/materials` and `/equipment-types`; `projectId` on `GET /locations`, `/wbs-nodes`, `/chainage-markers`, `/geo-zones`, `/milestones`, `/major-material-allocations` and `/equipment-assignments`; `projectId` and `resourceKind` on `GET /plan-lines`; and the existing filters of `GET /users`, `/audit-log`, `/equipment-units` and `/stock-levels`. Behaviour is unchanged. Every list operation that accepts a filter now documents it.
- **Behaviour (not a contract change):** `DELETE /custom-policies/{id}` now removes the policy's fields and versions in the same transaction, each with its own audit row, instead of refusing with 409 `POLICY_IN_USE` (owner decision).

### 1.4.0 (2026-11-22)

Compared with 1.3.0: nothing removed, five operations added, two changed (additive).

- **Added:** equipment maintenance schedules: `GET /maintenance-schedules` (filter `equipmentUnitId`), `GET /maintenance-schedules/{id}`, `POST`, `PATCH` and `DELETE`. Reads need a signed-in user; writes need `masters.manage`. A schedule names a task on one equipment unit, due every `intervalMonths` or `intervalHours` (at least one), with the last service date and meter hours (migration 0037).
- **Changed, additive:** `POST /approval-requests` (and the matching PATCH body) take an optional `neededBy` date, returned on every request (migration 0036). Raises without it behave as before.

### 1.3.0 (2026-11-21)

Compared with 1.2.0: nothing removed or changed, five operations added.

- **Added:** Bill of Quantities (owner decision D6): `GET /boq-items` (filters `projectId`, `wbsNodeId`, `status`), `GET /boq-items/{id}`, `POST /boq-items`, `PATCH /boq-items/{id}` and `DELETE /boq-items/{id}`. Reads need a signed-in user; writes need `projects.manage`. An item has a code unique within its project, a description, a unit (`uomId`), an optional WBS node of the same project, quantity, rate and status (`draft` or `approved`). `amount` is read-only: quantity x rate, rounded to two decimals, stored by the database (migration 0035).
- **Not a contract change:** the HTTP layer moved from Fastify to Express (owner decision D1). Every operation, status code and header rule is the same, as this lock test confirms.

### 1.2.0 (2026-11-21)

Compared with 1.1.0: nothing removed or added, two operations changed.

- **Changed, stricter (owner decision):** `POST /matrix-levels` and `PATCH /matrix-levels/{id}` limit `levelNo` to 1 to 4 (was 1 to 20 in 1.1.0). Approval chains have at most four levels. Migration 0034 sets the same limit in the database. No tenant held a level above 4 when it was applied.

### 1.1.0 (2026-11-21)

Compared with 1.0.0: nothing removed, one operation added, three changed. Checked with `diffContracts` against the 1.0.0 snapshot.

- **Added:** `GET /audit-log/auth-events`, the sign-in and access history (CORE-19-06). It needs `access.manage`.
- **Changed, additive:** `POST /approval-requests` takes an optional `sourceRecordId`. A second raise for the same module and source record returns the first request with 200 instead of creating another (CORE-21-07). A raise without it behaves as before.
- **Changed, stricter (specification correction):** `POST /matrix-levels` and `PATCH /matrix-levels/{id}` limit `levelNo` to 1 to 20. Before, any level from 1 up was accepted. The schedule requires 1 to 20 levels (CORE-21-05), so this corrects the contract rather than adding a feature. A client that sent a level above 20 now gets 400. No level above 20 existed in any tenant when the limit was added (migration 0032 applied cleanly).
