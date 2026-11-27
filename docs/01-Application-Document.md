| Field | Value |
|---|---|
| Document ID | DOC-01 |
| Title | VeloxIQ Core: Overall Application Document |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose of this document

This is the single overview of the VeloxIQ Core application as it exists on 2026-11-25. It says what the application is for, who uses it, what it does, how it is built, how it connects to the other VeloxIQ modules, and what is still open. Each section points to the detailed document for the subject (see section 14).

It replaces the earlier `CORE__FRONTEND/docs/VeloxIQ_CORE_application_document.md` as the starting point. That file is a table-by-table data dictionary written when the front end still held its own data; it is kept for reference but is out of date in places.

## 2. What VeloxIQ Core is

VeloxIQ Core is the company-control module of the VeloxIQ platform, built for infrastructure and construction companies. It is where a company sets up and maintains the master information that every other module relies on, and where its administrators oversee what happens across the platform.

| Area | What Core holds |
|---|---|
| Company | Company profile, policies (leave, overtime, custom policies), subscription |
| Projects and locations | Projects, sites (locations), chainage markers, geofences, milestones, work breakdown, bill of quantities |
| Planning | Resource (people) planning, material planning, equipment planning, per project |
| Inventory and stores | Stores, materials, vendors, live stock, available materials |
| Equipment | Company equipment register, maintenance schedules, available equipment |
| People and organisation | Organogram, departments, positions, users and roles, job openings |
| Governance | Approval chains and matrix, approval requests, grievances, activity log |
| Integration | Messages to and from HRMS, P&M, PMS and Stores, and Core's copy of their records |

Core is the system of record for these master data. The other modules (HRMS for people, P&M for plant and machinery, PMS for payments, Stores for stock movements) do their daily work against it and report what they do back.

## 3. Users and access

| User | What they do in Core | Access |
|---|---|---|
| Tenant administrator | Sets up the company, manages all master data, users, approvals and reviews activity | Holds the access-management privilege and sees the full application |
| Module heads and approvers | Use only their own module's screens | Hold no Core privileges; the server refuses their Core requests |
| Other signed-in users | Use the simple module home page | No access to the full application screens |

**How access is enforced today.** The privilege names `projects.manage`, `masters.manage`, `organisation.manage` and `policies.manage` exist and routes are labelled with them, but the server's check (`userMayAct` in `CORE__BACKEND/src/modules/access/service.ts`) lets a user act only if they hold `access.manage` and are not suspended. It does not compare the privilege named on the route, and project or location scope is stored but not applied. In practice one administrator privilege opens everything in Core. Narrower roles would need that check extended. This is recorded as a security observation in DOC-04 and DOC-05.
| Other VeloxIQ modules | Send events and audit entries to Core | Sign in as a user holding the access-management privilege (see DOC-06) |
| Auditors and reviewers | Read the activity log | Read access through the access-management privilege today; a read-only audit role does not exist yet |

Details of roles and privileges are in DOC-05.

## 4. Functional overview

### 4.1 Company setup

- **Company profile:** legal and contact details, logo.
- **Policies:** leave policies, overtime policies and company-defined policies, each versioned.
- **Subscription:** the company's subscription information.

### 4.2 Projects and locations

- **Projects:** code, name, dates, status (Planning, Active, On hold, Completed), with tabs for details, chainage, resource planning, material planning and equipment planning.
- **Locations (sites):** each location belongs to a project; its Chainage tab shows the chainage markers of that project.
- **Chainage and work breakdown:** markers by kilometre, work breakdown items, milestones, bill of quantities.
- **Geofences:** zones with any number of points; changes need a recent identity confirmation (passkey or password).

### 4.3 Planning

| Screen | What it records |
|---|---|
| Resource planning | Roles or trades and headcount needed per project and period |
| Material planning | Materials, quantities and dates needed per project |
| Project equipment planning | The equipment each project needs: type, capacity or size, model and number of units. Lines for the same project and equipment type add up to one row; a **Manage lines** popup edits the individual lines. There is no end date, only "Needed from". |

The equipment type list starts with Tipper, Excavator, Wheel Loader and Roller, then any other type already in the company. **Other…** lets a planner name a new type, which is created for the whole company the first time it is saved. Capacity or size is free text with suggestions by type (for example 6-wheel to 16-wheel for a Tipper, 20-ton (210), 30-ton (300), 40-ton (400) or Mini excavator for an Excavator).

### 4.4 Inventory and stores

- **Stores** are linked directly to a **location**; the project of a store follows its location.
- **Materials, vendors** and **live stock** by store; **Available materials** shows what can be allocated.
- Bulk upload is available on the main master-data screens, with a template, per-row checks and a results list.

### 4.5 Equipment

| Screen | Purpose |
|---|---|
| Company equipment register | Every machine: identity (asset code, name, manufacturer, model, year, chassis and engine numbers), capacity and unit, fuel, meter, ownership (owned or hired with agreement dates), compliance dates (insurance, pollution, registration, fitness), warranty, location and GPS, photo and six documents (chassis, engine and meter photos, invoice, insurance and pollution certificates). Availability is Available, In use, Under maintenance or Breakdown. |
| Maintenance | Service schedules per machine: a task due every N months or N running hours, whichever comes first, with last service date and meter hours. A schedule is **Due soon** within 14 days (or the last 10% of the hours interval) and **Overdue** after that. |
| Available equipment | Machines that are free, with an **Assign to project** action |
| Project equipment planning | See 4.3 |

### 4.6 People and organisation

Organogram, departments, positions, users and roles (grant and revoke privileges, suspend), and job openings.

### 4.7 Governance

- **Approvals:** chains of up to four levels by request type and scope, requests raised from other screens, decisions with reasons and an approval matrix with versions. Each decision also writes an outbound event for the other modules.
- **Grievances** and support tickets.
- **Activity log** (one screen, four tabs):

| Tab | Shows |
|---|---|
| Activity | Who did what in Core and in the other modules, with module, person, record and what happened; filters for dates, module, area, action and person; export needs identity confirmation |
| Sign-ins | Sign-ins, failures, lockouts, ended sessions, passkeys, refused access, for Core and for the other modules |
| Data exchange log | Messages to and from the other modules: waiting, sent, received, failed, with a Replay action for failed ones |
| Shared records | The latest copy Core holds of records owned by the other modules |

### 4.8 Sign-in and account security (user view)

Sign in with a password, a passkey or a one-time code. Sensitive actions (granting privileges, geofence changes, exports) ask the user to confirm identity again. A user signed in on another device is told when a newer sign-in replaces their session.

## 5. Cross-cutting behaviour

| Behaviour | What it does |
|---|---|
| Unsaved-changes guard | Leaving a form with edits (closing, navigating) asks first |
| Optimistic locking | Two people editing the same record: the second save is refused with a message to reload |
| Idempotent writes | A repeated request after a lost connection does not create a duplicate |
| Plain error messages | Errors say what happened and what to do; no technical traces |
| Search and navigation | Ctrl K jumps to any page; master records are searchable by code or name |
| Light and dark mode | One switch in the header; see DOC-14 |
| Responsive layout | Sidebar becomes a drawer on phones; tables become stacked rows |

## 6. Architecture summary

| Layer | Technology |
|---|---|
| Front end | React 19, Vite, Tailwind CSS 4, Radix UI, zustand store, react-hook-form with zod |
| Back end | Node.js 24, TypeScript, Express, Zod validation, pino logging |
| Database | PostgreSQL 18, one database, one schema per tenant (`tenant_<id>`), SQL migrations applied to every tenant |
| Interface | REST/JSON API v1, locked contract, 279 operations (`CORE__BACKEND/docs/API_V1.md`) |
| Authentication | Password and PIN hashes (argon2id), short-lived access tokens, rotating refresh tokens, one-time codes, passkeys |

Every request is authenticated, resolved to a tenant, validated, executed in a transaction with the tenant's schema selected, and written to the audit trail. See DOC-02.

## 7. Data summary

Data is grouped by domain in the database: company and policies, organisation, projects and locations, planning, stores and stock, materials and vendors, equipment (types, units, assignments, maintenance), users and access, approvals, grievances and tickets, files, and integration (events, read models). Every business table carries id, created and updated time and user, and a version number for optimistic locking. Money is stored as numeric, instants as timestamps with time zone, and dates as dates. Personal data and its handling are described in DOC-03 and DOC-18.

## 8. API summary

| Area | Operations |
|---|---|
| Identity: auth, users, access, audit log | 33 |
| Projects and locations | 37 |
| Master data (vendors, materials, equipment, plan lines, stock, units of measure, maintenance) | 41 |
| Organisation (company profile, holidays, shifts, number series, departments, positions, offer letter) | 28 |
| Policies | 68 |
| Approvals | 22 |
| Records (files, grievances, tickets, notifications, templates, imports, timeline, usage counters) | 38 |
| Platform (health, OpenAPI document, offline operations, search) | 5 |
| Integration (events, read models) | 7 |
| **Total** | **279** |

The contract is locked: additions are minor versions, removals and incompatible changes wait for a v2. The current version is 1.10.0 (see DOC-11 for the change history).

## 9. Integration summary

| Direction | What happens today |
|---|---|
| Core to other modules | Approval decisions are written as outbound events in the same transaction as the decision. They are queued safely. No transport to the other modules has been chosen, so nothing is sent yet. |
| Other modules to Core | `POST /integration-events/inbound` applies an event to Core's copy of the record (shared records). Duplicates and out-of-date events are recognised and ignored. |
| Audit entries from other modules | `POST /audit-log/external` stores an entry from a module's own audit trail (a sign-in in HRMS, a request raised in PMS) in Core's tamper-evident chain, shown in the activity log. The module may send its own correlation id. |

See DOC-06.

## 10. Security and audit summary

- Every action is attributed to a user and written to an append-only, hash-linked audit table that can be verified for tampering; other modules' entries go in the same chain.
- Secrets (password hashes, tokens) are never logged or audited.
- Privilege grants need a passkey confirmation; geofence changes and exports need a passkey or password confirmation.
- Data of one tenant is separated from another by schema and by the database role the application runs as.
- Rate limits protect sign-in and public endpoints.

See DOC-04, DOC-05 and DOC-07.

## 11. Non-functional characteristics

| Quality | Position |
|---|---|
| Availability and recovery | Backup, restore and drill tooling exist and drills have been recorded; business targets to be confirmed (DOC-10, DOC-17) |
| Performance | A load baseline script exists; no results have been recorded (DOC-19) |
| Accessibility | An accessibility audit exists (`CORE__FRONTEND/docs/ACCESSIBILITY_AUDIT.md`) |
| Maintainability | Modular code by business area, locked API contract with a regression test, generated database types |
| Testability | Automated tests for the back end and front end; see DOC-08 |

## 12. Current status and known limitations

| Topic | Status |
|---|---|
| Event transport to other modules | Not chosen; outbound events wait in the queue |
| Freshness rule for shared records | Not decided; the screen shows the last sync time only |
| Payload formats of the other modules' events | Open; shared records keep whatever fields a module sends |
| Read-only audit role | Does not exist; access to the activity log uses the access-management privilege |
| Audit data growth | The audit table is append-only and has no retention or archive process yet |
| Sample data | The development tenants hold sample equipment, schedules, files, events and audit entries for demonstration; they are not production data |
| Quality | A known lint error in the equipment register page stops the full CI script at its lint step (see DOC-08, DOC-12) |
| Documents still depending on people | Owners, approvals, penetration test, load-test results, agreed service levels, data protection review (see DOC-00) |

## 13. Glossary

| Term | Meaning |
|---|---|
| Tenant | One customer company and its separate data |
| Location (site) | A physical place where a project works |
| Chainage | Distance along a road or canal, in kilometres |
| Plan line | One planned need (people, material or equipment) for a project |
| Register | The list of owned or hired machines |
| Event | A message between Core and another module |
| Outbox and inbox | Where events wait to be sent, and where received events are recorded |
| Shared records | Core's copy of records owned by other modules (read models) |
| Correlation id | A tag shared by everything that belongs to one action |
| Step-up | Asking the user to confirm their identity again for a sensitive action |
| Idempotency | Repeating a request does not repeat its effect |

## 14. Document map

| Need | Read |
|---|---|
| What documents exist and what is missing | DOC-00 |
| How the system is built | DOC-02 |
| Data, personal data, retention | DOC-03, DOC-18 |
| Security, roles, compliance | DOC-04, DOC-05, DOC-20, DOC-21 |
| Other modules' interfaces | DOC-06 |
| Audit and logging | DOC-07 |
| Testing and performance | DOC-08, DOC-19 |
| Running, supporting and recovering the system | DOC-09, DOC-10, DOC-17 |
| Releases and risks | DOC-11, DOC-12, DOC-13 |
| Screens and design | DOC-14, DOC-15 |
| Training | DOC-16 |

All documents are in the `docs` folder at the repository root, except DOC-14 (`CORE__FRONTEND/docs/design`).

## 15. Open items

1. Name the document owner and approvers (see DOC-00).
2. Confirm the products and modules that count as in scope for the first production release.
3. Confirm the production hosting, service levels and support model (DOC-09, DOC-17).
4. Review the sections written from the code (4, 8, 9) with the product owner.

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | Engineering | First issue |
