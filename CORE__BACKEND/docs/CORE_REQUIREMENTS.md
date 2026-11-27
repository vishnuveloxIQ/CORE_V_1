# VeloxIQ Core: requirements document

Version 1.0, 2026-11-27. Describes the Core application as built (backend API 1.23.0, frontend 1.0.0) and the data it exchanges with the other VeloxIQ applications.

**How to read the status column.** *Built* means the code and database exist in this repository. *Contract only* means the data contract is defined in a handoff document but nothing in Core sends or receives it yet. *Open* means an owner decision is still needed.

Sources: `Core_Database_Handoff.md` (tables and cross-module references), `docs/API_V1.md` (locked API), `src/modules/*` (behaviour), and the Contractor App handoff (`docs/API.md`, `HANDOFF.md`).

---

## 1. Purpose and scope

Core is the shared foundation every VeloxIQ application uses. A construction or infrastructure company (a *tenant*) sets up its company, projects, sites, people, masters and rules once in Core; the other applications read these and raise their own business records against them.

**Core owns**
- Company profile, subscription, policies (leave, overtime, shift, holiday, custom).
- Projects, sites (locations), geofences, WBS, chainage, milestones, BOQ, sub-contractors, workforce adverts, quotations.
- Master data: stores, materials, vendors, equipment types, equipment units, units of measure (via shared schema).
- Organisation: departments, positions, organogram, approved people, users, roles and access.
- Approval engine: chains, matrix versions, requests, actions.
- Platform services: files, notifications, grievances, tickets, audit log, imports, integration events, idempotency, offline sync.

**Core does not own** (owned by the other applications)
- HRMS: employees, attendance, leave balances, payroll, recruitment, offboarding.
- P&M (plant and machinery): equipment operations, fuel, maintenance jobs, movements, hire contracts and bills.
- PMS (petty cash and payables): petty cash requests, vendor payments, payables.
- Stores: stock ledger, GRN, issues, purchase orders, RFQs, quality holds.
- Contractor App: contractor accounts and their interest in adverts.

**Reason for the split:** other applications keep their own transaction tables and point at Core ids. Core must not delete or re-key a record another application refers to (Handoff section 6 lists 110 such columns).

---

## 2. Users and roles

| Actor | What they do in Core | Reason |
|---|---|---|
| Tenant Admin (Core administrator) | Sets up everything, sees every screen, decides top-level approvals, reads integration monitor and audit log | One accountable owner per company; holds `access.manage`. |
| Module head (for example P&M head, Stores head, HR head) | Works their module's screens; registers equipment as *FEM head*; raises requests | Module-level responsibility and approval levels. |
| Approver (L1, L2, L3 …) | Approves, rejects, returns, asks for clarification on requests assigned to them | The approval chain names approver users per level. |
| Head Office user | Registers company equipment as *HO registration*; hires equipment as *HO hiring* | Distinguishes who registered, for audit and reporting. |
| Site user | Raises requests, records offline operations from devices | Field capture with weak connectivity. |
| HR admin | Gives the reason a person is not onboarded; sends people to HRMS | Closes the loop between approval and onboarding. |
| Platform operator (VeloxIQ) | Outside Core: provisions tenants, manages billing, verifies contractors | Tenant isolation: tenants cannot change their own billing. |

Access model: a user holds roles through `core_user_access`; each role carries privileges (for example `projects.manage`, `organisation.manage`, `access.manage`, `approvals.manage`, `masters.manage`, `policies.manage`, `records.manage`). The menu shows only items the user's privileges allow. Reads need a signed-in user; writes need the named privilege at company scope.

---

## 3. Architecture and integration model

| Topic | Decision | Reason |
|---|---|---|
| Tenancy | One PostgreSQL database, one schema per tenant (`tenant_<id>`); the tenant comes from the verified session and `SET LOCAL search_path` per transaction. No `tenant_id` on business tables. | The schema is the isolation boundary; a bug cannot cross tenants. |
| API | Fastify REST under a locked v1 contract (`docs/api/openapi-v1.json`); every POST/PATCH needs an `Idempotency-Key`; updates need the `rowVersion` read. Responses `{data, meta}` or `{error}`. | Safe retries and optimistic locking for flaky networks and concurrent editors. |
| Sync reads | Other applications read Core tables (read-only) or call the Core API. They change Core data only through the Core API. | One writer per record keeps the audit trail honest. |
| Events out | Transactional outbox: a business change and its event commit together in `integ_event` (direction `outbound`); a relay publishes with retry, per-aggregate ordering and dead-letter. | An event exists exactly when the change committed; no lost or phantom events. |
| Events in | Inbox: `POST /integration-events/inbound` records the event once (duplicate by `eventId`) and applies it to a read model `ref_record` if its `aggregateSeq` is newer. | Idempotent, order-safe copies of other applications' records. |
| Audit | Hash-chained `audit_row_change` for every row change, old and new values, secrets excluded, append-only. | Tamper-evident history. |
| Offline | `POST /offline-operations` stores operations captured on devices (`integ_offline_operation`) for later sync. | Sites lose connectivity. |
| Transport | **Open (decision D13).** The relay has a `Publisher` interface; only a test `MockPublisher` exists. | Broker or webhook not yet chosen. |

---

## 4. Functional requirements, screen by screen

For each screen: what the user does, the key fields entered, what Core stores, and which other application receives or needs it.

### 4.1 Overview and company setup

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Dashboard** | Counts and shortcuts: pending approvals, grievances, projects, units. Read-only. | None | Built |
| **Company profile** | Legal and trade name, tax ids (GSTIN, PAN), addresses, logo, settings. | Stores (`purchaser_company_profile_id` on RFQ and PO), HRMS letters (company header) | Built |
| **Policies** | Leave types and policies, overtime policy and rules, shifts, holidays, custom policies and fields, document templates (offer letter). | HRMS reads leave type, leave policy and rule, OT policy and rule, shift, holiday, document template (referenced by foreign key) | Built |
| **Subscription** | Plan, renewal, invoices, plan catalogue, usage against limits. Read-only for a tenant (API 1.23.0). | Platform billing | Built (read). Renew, upgrade and support-message buttons only show a message. |

### 4.2 Projects

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Projects** | Code, name, client, dates, value, status; tabs for parts (WBS, chainage markers, milestones, BOQ), sub-contractors, locations. | HRMS (`project_id` on attendance, employment, timesheets), P&M, PMS, Stores | Built |
| **Geofences** | Zone name, polygon or centre and radius, project. | HRMS attendance (`geofence_id`) | Built |
| **Sub-contractors** | Firm, owner, address, mail, phone, GST, PAN, work order date and title, period, scope, terms, agreement file, status (active/inactive). | Workforce adverts (mail targets); PMS (payables, future) | Built |
| **Workforce adverts** | Title, project, state, dates, requirement lines (worker type, trade, notes), publish and close; interests from contractors with status and discussion steps. | Contractor App (see 6.4) | Built in Core; the link to the Contractor App is **Contract only** |
| **Quotation approval** | Vendor quotation: ref, vendor, buyer, project, destination, dates, payment terms, amount, full document JSON; administrator approves or rejects with a reason. | Stores (purchase flow) | Built |

### 4.3 Approvals and governance

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Approvals** | Inbox of requests: code, type, module, amount, project, status, level; actions approve, reject, return, cancel, clarify, respond; decision note. | The raising application (event `approval_request.decided`) | Built |
| **Approval matrix** | Chains per request type and scope (company or project), matrix versions, levels (approver user, optional role, amount band, timeout mode escalate/auto-reject/hold). | Approval engine | Built |
| **Petty cash: pending approvals and reports** | Petty cash requests awaiting approval and reports. | PMS (`pms_petty_cash_request.approval_request_id`) | Built as approvals view; PMS data **Contract only** |
| **Grievances** | Subject, message, status, visit date, raised by, employee. | HRMS (`core_grievance.employee_id`) | Built |
| **Audit log** | Sign-in events and row changes, filter by user, event, date. `access.manage` only. | None | Built |
| **Help and support** | Tickets (`core_ticket`) raised inside the tenant. | None (tenant-to-VeloxIQ support is a separate platform table) | Built |

### 4.4 HR management system (Core side)

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Resource planning (people planning)** | Plan lines per project (resource kind people): designation, quantity, dates, capacity. | HRMS recruitment; Approved list | Built |
| **Organogram / Departments** | Departments (name, parent, head position) and positions (department, reports-to). | HRMS (`department_id`, `position_id` on employment and job openings) | Built |
| **Users and roles** | User: login id, name, status, employee link, roles and access scopes; password and PIN set as argon2id hashes; passkeys. `access.manage` only. | HRMS (`user_id` links employee), every application for sign-in | Built |
| **Job openings** | Opening raised as an approval request; once approved, published to its project. | HRMS (`hrms_job_opening`) | Built in Core; HRMS side **Contract only** |
| **Approved list** | Person: project, department, name, designation, joining date, status Approved to With HRMS to Onboarded, reason and when it was requested. API `/approved-people` (1.23.0). | HRMS onboarding (hand-off); status returns from HRMS | Built; the automatic return from HRMS is **Contract only** (today HRMS status is changed by hand with PATCH) |
| **Manpower availability** | Approved people grouped by project and status. Read-only. | None | Built |

### 4.5 Material management

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Store registration** | Store code, name, location, type. | Stores (`store_id` everywhere) | Built |
| **Material registration** | Code, name, category, unit of measure, specs, status. | Stores, P&M (fuel, spare parts) | Built |
| **Vendor registration** | Name, GSTIN, PAN, contact, bank-verification status. | Stores (PO, RFQ), PMS (payments), P&M (hire, AMC) | Built |
| **Project material planning** | Plan lines per project: material, quantity, unit, dates. | Stores requests | Built |
| **Live stock** | Stock levels per store and material (read of stock levels). | Stores (owner of the ledger) | Built as a read view |
| **Available materials** | Availability of materials by store. | Stores | Built |

### 4.6 Fleet and equipment management

| Screen | Function and key fields | Goes to / used by | Status |
|---|---|---|---|
| **Company equipment register** | Register an owned unit through the wizard: asset code, type, name, make and model, reg no, engine and chassis numbers, capacity, meter type and reading, fuel type and norm, tank capacity, owner, invoice, insurance, PUC, fitness, warranty, photos and documents. The table shows **Registered by** (HO registration or FEM head), set from who registers, never typed. Filter by project. | P&M (`pm_equipment`) | Built |
| **Hired equipment register** | Same wizard for hired units plus approved equipment request, vendor, hire reference, agreement dates, **Hired by** (HO hiring or Site hiring) and **Hire status** (Active or Inactive; Active at registration, changed afterwards in Edit only). | P&M (`pm_hire_contract`, `pm_hire_bill`), PMS (vendor payments) | Built |
| **Project equipment planning** | Plan lines per project: equipment type, quantity, capacity, model, purpose (optional). | P&M equipment requests (`core_plan_line_id`) | Built |
| **Available equipment** | Units available to assign, by type and project. | P&M allocation | Built |
| **Assigned equipment** | Assignment of a unit to a project with over-plan reason when above the plan. | P&M allocation | Built |
| **Maintenance** | Maintenance schedules per unit. | P&M job cards and maintenance plan | Built |

---

## 5. Workflows

### 5.1 Approval workflow (used by every module)

```
Raiser (any app or Core screen)
  POST /approval-requests {requestType, module, amount, projectId, title, payload, neededBy, sourceRecordId}
     -> Core picks the chain by type and scope, snapshots the matrix version,
        assigns level 1 approver, status = pending
     -> event approval_request.raised (outbox, same transaction)
Approver (level n)
  approve  -> next level, or status = approved at the last level
  reject   -> status = rejected
  return   -> status = returned (raiser edits and re-raises)
  clarify  -> status = clarification_requested; raiser responds; request waits at the same level
  cancel   -> status = cancelled (raiser)
  each action -> event approval_request.decided
Timeout at a level -> escalate, auto-reject or hold (chain setting)
```

Reasons: a second raise with the same `module` + `sourceRecordId` returns the first request (no duplicates on retry); the event payload carries identifiers and states only, because comments and amounts' reasons stay inside Core.

### 5.2 Equipment: plan, request, hire or register, assign

```
Project equipment planning (Core)   plan line: type, quantity, capacity, model
   -> P&M raises an equipment request against core_plan_line_id (approval request)
   -> Approver decides: Local hire / Head Office hire / allocate own unit
   Owned:  Company equipment register -> Registered by = HO registration | FEM head
   Hired:  Hired equipment register  -> bound to the approved request, Hired by, Hire status = Active
   -> Available equipment -> Assigned equipment (project; over-plan reason if above plan)
   -> Maintenance schedule; P&M runs operations and returns meter readings
   -> Hire ends: user edits Hire status to Inactive
```

### 5.3 Workforce: plan, approve, onboard

```
Resource planning (people plan lines)
   -> Job opening raised -> approval request -> approved -> published to project
   -> HRMS recruits and selects (HRMS owns candidates)
   -> Core Approved list: person added (Approved)
   -> HR admin sends to HRMS (With HRMS) -> HRMS onboards -> Onboarded
   -> If not onboarded: admin requests the reason from the HR admin (<= 50 words)
```

### 5.4 Workforce advert to the Contractor App (contract only)

```
Core: advert drafted (project, trades, quantities, dates) -> publish (status published)
   -> mail queued to registered sub-contractors (advert-mail)
   -> workforce_advert.published sent to Contractor App
Contractor App: contractor presses "I am interested" with consent
   -> contractor_interest.submitted received by Core -> interest recorded
Core: discussion steps; status changes -> contractor_interest.status_changed sent
   -> close advert -> workforce_advert.closed sent
```

### 5.5 Quotation approval

Vendor quotation received -> status PENDING -> administrator approves (optional note, for example why a 100 percent advance is accepted) or rejects with a mandatory reason -> decided once, cannot be deleted -> Stores continues the purchase.

### 5.6 Sign-in and access

Login id and password with `X-Tenant-Id` (argon2id; 5 failures lock for 15 minutes); optional OTP and passkeys; 15-minute access token plus rotating 30-day refresh token; reuse of an old refresh token revokes every session of that user.

### 5.7 Offline capture

Device records an operation with `clientDeviceKey` and `clientOperationKey` -> `POST /offline-operations` -> stored with `captured_at` and `received_at` -> processed into the target record later; the same key is never applied twice.

---

## 6. Data flow between Core and the other applications

### 6.1 Channels

| Channel | Direction | Mechanism | Status |
|---|---|---|---|
| Reference reads | Core to HRMS, P&M, PMS, Stores | Read-only access to `core_*` tables or Core API reads; foreign keys on Core ids | Built (Core side) |
| Approval requests | Other apps to Core | `POST /approval-requests`, then decision events back | Built |
| Outbound events | Core to others | Outbox `integ_event`, relay, publisher | Built; transport **Open (D13)** |
| Inbound events | Others to Core | `POST /integration-events/inbound` into `ref_record` | Built |
| Files | Both | `core_file` ids stored by other apps | Built |
| Contractor App | Both | Events with `X-Integration-Key`, webhook back | **Contract only** |

### 6.2 What Core sends: reference data (read by other applications)

Each row is a Core table other applications point at. Fields are the ones other applications need; the reason says why.

| Entity (table) | Fields shared | Reason | Used by |
|---|---|---|---|
| Project (`core_project`) | `id`, `code`, `name`, `status`, `client`, `start_date`, `end_date` | Every cost, attendance, request and stock movement is booked to a project; code is the printed key | HRMS, P&M, PMS, Stores |
| Location / site (`core_location`) | `id`, name, project, chainage range, week-off days, geo | Work sites receive people, equipment and material; week-off drives attendance | HRMS, P&M, PMS, Stores |
| Geo zone (`core_geo_zone`) | `id`, name, shape, project | Attendance is valid only inside the geofence | HRMS |
| WBS node, chainage marker | `id`, code, parent, `chainage_km`, WBS link | Cost and progress are tracked by work item and position along the route | P&M (cost ledger, logbook) |
| Store (`core_store`) | `id`, code, name, location | Stock and documents belong to a store | Stores |
| Material (`core_material`) | `id`, code, name, category, `uom_id` | One material list across stock, requests and fuel | Stores, P&M |
| Vendor (`core_vendor`) | `id`, name, GSTIN, PAN, contact, bank-verification status | One vendor identity for purchase, hire and payment | Stores, PMS, P&M |
| Equipment type (`core_equipment_type`) | `id`, code, name, fuel tolerance key | Type drives fuel norms and checklists | P&M |
| Equipment unit (`/equipment-units`) | `id`, asset code, type, availability, project, registration, hire fields, owner, documents | Unit identity and where it works. Handoff section 7 says P&M owns the unit; today Core holds it and the frontend reads it from Core (see open item O3) | P&M, PMS |
| Plan line (`core_plan_line`) | `id`, project, resource kind, type or designation, quantity, capacity, model, dates | Requests are raised against the approved plan | P&M, Stores, HRMS |
| User (`core_user`) | `id`, login id, name, status, `employee_id` | Single identity for sign-in and "who did it" | all |
| Department, position | `id`, name, parent, department, reports-to | Organisation structure for employment and approvals | HRMS, Stores |
| Shift, holiday | `id`, times, week-off days, dates | Attendance and timesheets | HRMS, P&M (logbook) |
| Leave type, leave policy, leave policy rule | `id`, name, accrual and carry rules | Leave balances and applications must follow one rule set | HRMS |
| OT policy, OT policy rule | `id`, thresholds, rates | Overtime requests are valued by policy | HRMS |
| Document template | `id`, kind, body | Offer and other letters use company templates | HRMS |
| Company profile | `id`, names, tax ids, settings (fuel tolerance, variance thresholds) | Purchaser identity on documents; company-wide thresholds | Stores, P&M |
| Policy version | `id`, policy, version | PMS payables record which policy version applied | PMS |
| File (`core_file`) | `id`, name, type, size | Photos, documents and evidence are stored once and referenced | all |
| Approval request (`core_approval_request`) | `id`, code, status, level | Each app links its record to the request that authorised it | all |
| Unit of measure (`shared.uom`) | `id`, code, name | Shared, read-only codes; Core only reads it | Stores, Core |

### 6.3 What Core sends: events (outbound)

Envelope of every event: `eventId`, `eventType`, `eventVersion`, `schemaVersion`, `aggregateType`, `aggregateId`, `aggregateSeq`, `occurredAt`, `correlationId`, `causationId`, `actorId`, `sourceModule`, `payload`.

| Envelope field | Reason |
|---|---|
| `eventId` | Receiver ignores repeats (at-least-once delivery) |
| `eventType`, `eventVersion`, `schemaVersion` | Receiver picks the handler and survives later changes |
| `aggregateType`, `aggregateId` | Which record the event is about |
| `aggregateSeq` | Increasing number per record, gap-free; receiver drops older events (order safety) |
| `occurredAt` | When the change happened (not when it was sent) |
| `correlationId`, `causationId` | Trace one user action across applications |
| `actorId` | Who did it (an id only) |
| `sourceModule` | Which application produced it (`core`) |

| Event | Payload fields | Reason | Receiver | Status |
|---|---|---|---|---|
| `approval_request.raised` | `requestId`, `code`, `requestType`, `module`, `status`, `currentLevel` | Tell the raising application its request exists and where it waits | The module in `module` (HRMS, P&M, PMS, Stores) | Built |
| `approval_request.decided` | same plus `action`, `actedAtLevel` | The raiser proceeds on approve, or reworks on reject and return | same | Built |

Payload deliberately excludes comments, decision text, amounts' justification and the request's own payload. They stay in Core so personal and commercial data does not leave through the event stream.

### 6.4 What Core receives

**A. Approval requests raised by other applications** (`POST /approval-requests`)

| Field | Reason |
|---|---|
| `requestType` | Selects the approval chain |
| `module` | Which application raised it; routes the decision event back |
| `amount` | Chooses the approval level by amount band |
| `projectId` | Project scope (a project can have its own chain) |
| `chainageMarkerId` | Position on the route when relevant |
| `title` | What the approver sees |
| `payload` | The detail the approver needs to decide |
| `emergency`, `neededBy` | Urgency; the screen asks for the needed-by date unless emergency |
| `sourceRecordId` | The raiser's record; a repeat for the same record returns the first request |

**B. Inbound events from HRMS, P&M, PMS and Stores** (`POST /integration-events/inbound`, stored in `ref_record`)

| Field | Reason |
|---|---|
| `eventId` | Record once; a second delivery is a duplicate |
| `eventType` | `*.deleted` marks the copy deleted |
| `eventVersion`, `schemaVersion` | Handle format changes |
| `aggregateType` | Becomes `entity_type` (lower case, underscores) |
| `aggregateId` | The source application's record id |
| `aggregateSeq` | Applied only if newer than the stored copy |
| `occurredAt` | Business time of the change |
| `sourceModule` | One of `hrms`, `pm`, `pms`, `stores` |
| `correlationId`, `causationId` | Tracing |
| `payload` | The record's fields as the source publishes them; unknown fields are kept as they are |

Core holds the copy as a read model (`ref_record`: module, entity, source id, sequence, data, deleted flag, synced time) so screens can show data from other applications without calling them. Administrators see only event field names, never values, in the monitor.

The payload contents are **not fixed by Core**. The proposed minimum for each source, so Core screens can use it, is below. These need agreement with each owning team (open item O1).

| Source | Entity (`aggregateType`) | Proposed minimum fields | Reason |
|---|---|---|---|
| HRMS | `hrms_employee` | `employeeCode`, `name`, `status`, `onboardingStatus`, `userId`, `projectId`, `departmentId`, `positionId`, `joiningDate` | Approved list needs onboarding status; users link to employees |
| HRMS | `hrms_job_opening` | `openingId`, `approvalRequestId`, `projectId`, `status`, `positionsFilled` | Close the loop on openings Core published |
| P&M | `pm_equipment` | `assetCode`, `equipmentTypeId`, `currentLocationId`, `meterReading`, `status` | Available and assigned equipment show live position and meter |
| P&M | `pm_allocation` | `unitId`, `projectId`, `locationId`, `status`, `approvalRequestId` | Assigned equipment reflects what P&M allocated |
| PMS | `pms_petty_cash_request` | `requestId`, `approvalRequestId`, `projectId`, `amount`, `status` | Petty cash reports |
| PMS | `pms_vendor_payment` | `paymentId`, `vendorId`, `amount`, `status`, `approvalRequestId` | Vendor payment visibility |
| Stores | `stores_stock_balance` | `storeId`, `materialId`, `quantity`, `uomCode`, `asOf` | Live stock and available materials |
| Stores | `stores_purchase_order` | `poNumber`, `vendorId`, `approvalRequestId`, `status`, `amount` | Quotation and purchase follow-through |

**C. Contractor App events** (`POST /integration/events` on the Contractor App side; Core is the *company* that sends and receives). Contract only: not yet implemented in Core.

Core sends to the Contractor App:

| Event | Fields | Reason |
|---|---|---|
| `workforce_advert.published` | `advertId`, `title`, `requirements[{workerType, tradeCode, quantity, skillLevel?, notes?}]`; optional `code`, `companyName`, `projectName`, `locationName`, `city`, `state`, `pin`, `requiredFrom`, `requiredTo`, `audienceMode`, `description`, `publishedAt`, `closesAt` | Contractors can only respond to what the company advertised. A republish with a higher `sequence` updates the copy |
| `workforce_advert.closed` | `advertId`, optional `status` (CLOSED or WITHDRAWN), `closedAt`, `reason` | Remove the advert from the contractor's list |
| `contractor_interest.status_changed` | `advertId`, `contractorRef`, `status` (NEW, CONTACTED, IN_DISCUSSION, AGREED, DECLINED, NOT_PURSUED), `changedAt`, optional `coreInterestRef`, `reason` (never shown to the contractor) | Contractor follows progress; `coreInterestRef` ties both systems' records |

Envelope sent by Core: `eventId`, `eventType`, `tenantCode`, `sequence` (required for advert events), `occurredAt`, `payload`, with header `X-Integration-Key`. Reasons: `tenantCode` selects the company; `sequence` keeps adverts in order; the key proves the sender.

Core receives from the Contractor App (webhook with `Idempotency-Key: <eventId>`):

| Event | Fields | Reason |
|---|---|---|
| `contractor_interest.submitted` | `interestId`, `advertId`, `contractorRef`, `companyName`, `contactName`, `contactPhone`, `contactEmail`, `trades[{tradeCode, serviceState}]`, `consentAt`, `expressedAt` | Creates the interest the company works. Contact details arrive only after the contractor's consent |
| `contractor_interest.withdrawn` | `interestId`, `advertId`, `contractorRef`, `withdrawnAt` | Stop working an interest the contractor withdrew |

Core replies with any 2xx and may return `{coreInterestRef}`. Failures retry up to 8 times with backoff; events for one tenant arrive in order.

**D. Offline operations from devices** (`POST /offline-operations`)

| Field | Reason |
|---|---|
| `clientDeviceKey`, `clientOperationKey` | Identify the device and make the operation idempotent |
| `operationType` | Which kind of record to create |
| `capturedAt` | When it happened offline (kept apart from `received_at`) |
| `userId`, `projectId`, `storeId` | Who, where and in which store |
| `payload` | The operation's data |

### 6.5 Screen-wise data flow summary

| Core screen | Data Core sends out | Data Core receives in |
|---|---|---|
| Company profile, Policies | Company and policy records read by HRMS, Stores, P&M | none |
| Projects, Geofences | Project, location, zone, WBS, chainage read by all applications | none |
| Sub-contractors, Workforce adverts | Advert and status events to Contractor App | Contractor interests |
| Approvals, Approval matrix, Petty cash | `approval_request.raised` and `.decided` | Approval requests from any application |
| Users and roles | User and role read by all | Employee link from HRMS |
| Job openings, Approved list | Opening to HRMS; person with status With HRMS | Onboarding status and opening progress from HRMS |
| Resource planning | People plan lines read by HRMS | none |
| Store, Material, Vendor registration | Masters read by Stores, PMS, P&M | none |
| Live stock, Available materials | none | Stock balances from Stores |
| Equipment registers, Planning, Available, Assigned | Unit, type, plan line read by P&M | Allocation and live position from P&M |
| Maintenance | Schedules read by P&M | Job card results from P&M |
| Quotation approval | Decision to Stores | Quotations raised for approval |
| Grievances | Grievance read by HRMS | Employee reference from HRMS |
| Audit log, Integration monitor | none | none (reads own logs) |

---

## 7. Non-functional requirements

| Area | Requirement | Reason |
|---|---|---|
| Security | argon2id hashes for passwords and PINs; hashes and OTP values never logged or audited; raw IP kept only in `core_auth_activity` with a retention period; secrets redacted in logs | Protect credentials and personal data |
| Isolation | Tenant schema per company; tenant from the verified session only | No cross-tenant reads |
| Reliability | Outbox with retry, per-aggregate order and dead-letter with replay; inbox duplicate and stale checks | Events survive crashes and retries |
| Integrity | Idempotency-Key on writes; `rowVersion` optimistic lock | Safe retries; no lost updates |
| Auditability | Hash-chained audit with old and new values; append-only | Evidence for disputes and review |
| Contract stability | API v1 locked; additive changes bump the minor version and update `docs/API_V1.md` | Other applications must not break |
| Privacy in events | Events carry ids and states, not free text or commercial detail | Limit data leaving Core |
| Usability | Works on phone width; monitor shows field names, not values | Site use; protect data from administrators |

---

## 8. Open items and risks

| # | Item | Impact |
|---|---|---|
| O1 | Inbound payload fields for HRMS, P&M, PMS and Stores are not fixed (section 6.4 B is a proposal) | Core screens cannot rely on a field until each team agrees |
| O2 | Event transport (D13) undecided; only a test publisher exists | Core events are stored but not delivered anywhere |
| O3 | Equipment unit ownership: handoff says P&M owns it; Core currently holds and edits it | Needs a decision before P&M integrates, to avoid two writers |
| O4 | Contractor App link is a contract only; per-company integration keys and webhooks are proposed, not built | Adverts do not reach contractors yet |
| O5 | HRMS onboarding status is set by hand; no automatic return | Approved list can drift from HRMS |
| O6 | Subscription Renew, Upgrade and Support actions have no endpoint; storage usage has no source | Buttons only show a message |
| O7 | "Registered by" for owned units reuses the `hired_from` column | Works, but a dedicated column is cleaner |
| O8 | Production items not done: security review, backup and restore drill, monitoring, load test, production secrets | Needed before go-live |
| O9 | `shared.uom` is provisional until the Platform Administration document arrives | Unit codes may change |
| O10 | Raw IP retention period not set | Compliance |
