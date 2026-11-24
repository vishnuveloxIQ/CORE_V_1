# VeloxIQ CORE: Project Requirements Document

| Item | Value |
|---|---|
| Product | VeloxIQ CORE (company, organisation, projects, approvals and governance) |
| Document type | Requirements document for the existing application (as built) |
| Version | 0.4.1 (matches code base `CORE__V__0.4`) |
| Date | 19 Nov 2026 |
| Companion document | [VeloxIQ_CORE_application_document.md](VeloxIQ_CORE_application_document.md): data dictionary (43 tables, 307 columns) |
| Status | Frontend complete on seeded, in-memory data. The backend is not built yet. |

### Changes in 0.4.1

- Stores: the old "Site" field is now **Location** (a required choice from the project locations), and the free-text place is now **Address**.
- Equipment: an equipment type master (meter kind, fuel-norm unit), a hire vendor link on hired units, and the project on each equipment assignment.
- Vendors: a vendor master with Pending or Active status. It is held as data and shown through the equipment register. There is no separate vendor screen yet.
- Users, grievances, tickets and the offer letter carry extra reference fields (employee, position, raised by, file reference). These are data fields only. No form changed.

---

## 1. Purpose and scope

### 1.1 Purpose
VeloxIQ CORE is the governance hub of the VeloxIQ suite for construction and infrastructure companies. It holds the company master data, organisation structure, projects and sites, company policies, and the approval chains that other VeloxIQ applications (HRMS, PMS, P&M, Stores) rely on. It also records an audit trail of every change.

This document states what the application does today, as requirements with acceptance criteria. It is the baseline for building the backend and for future change requests.

### 1.2 In scope
- Sign-in, registration and password recovery (demo implementation).
- Dashboard.
- Company profile, subscription, and company policies (versioned).
- Organisation: organogram, departments, roles and users.
- Projects: details, milestones, WBS, chainage, geo-fences, and planning (people, material, equipment).
- Sites and geo-fences.
- Resources: stores, material masters, live stock, equipment register.
- Approvals: requests, approval matrix (chains), job openings, offer letter format.
- Grievances with Head Office visits.
- Help and support tickets, and the style guide.
- Audit trail.

### 1.3 Out of scope
- Backend services, database, and APIs (see the companion document for the proposed tables).
- Payroll, attendance and recruitment execution (HRMS).
- Payment execution (PMS and Head Office finance).
- Equipment maintenance (P&M) and stock movements (Stores).
- GPS device integration (the device is not decided).

---

## 2. Related applications

| Application | Relationship with CORE |
|---|---|
| **HRMS** | Executes approved transfers, promotions, bonuses and incentives, loans and advances, onboarding and offer letters. Posts approved job openings on its recruitment page. Asks CORE whether to hire locally or send a candidate from Head Office. Reads shifts, holidays, leave and overtime policies. |
| **PMS** | Pays below the payment threshold at the location. |
| **Head Office finance** | Approves and pays the payee directly at or above the payment threshold. |
| **P&M** | Maintains the equipment register. CORE shows the registered units against project equipment plans. |
| **Stores** | Owns stores and stock. CORE shows live stock (free stock = on hand − reserved). The stock publishing API is not specified yet. |
| **GPS device** | Not decided. Equipment approvals show "GPS device not decided". |

---

## 3. Users and roles

| Role | Description | Access |
|---|---|---|
| **Tenant Admin** (`admin`) | Owns the company account. | Everything, including the overtime on/off switch, privilege grants and exports (with step-up). Receives escalations when the chain rule says "Tenant Admin". |
| **Head** | Department or module head. | Only the modules granted to them (at least one module is required). |
| **Approver** | Any user named on an approval chain level. | Decides requests at their level. Can be the escalation person on levels 1–3. |
| **Requester** | Any user who raises a request. | Sees "You raised this request" and the outcome. |
| **Employee** | A user record in the organisation. | Appears on the organogram and in departments and roles. |

Privileges are granted per module. Granting or changing privileges needs step-up verification (NFR-SEC-2).

---

## 4. Functional requirements

Each requirement has an ID, a statement and acceptance criteria (AC).

### 4.1 Authentication (FR-AUTH)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-AUTH-1 | Users sign in with a login ID and password. | Login ID `admin` signs in when the password's SHA-256 hash matches. A wrong password shows an error. |
| FR-AUTH-2 | Repeated failures lock sign-in. | After 5 wrong passwords, sign-in is locked for 30 seconds. |
| FR-AUTH-3 | The session ends when the tab closes. | The session is kept in sessionStorage. A new tab needs a new sign-in. |
| FR-AUTH-4 | A company can register. | Password is at least 8 characters, the confirmation matches, and the terms must be accepted. |
| FR-AUTH-5 | Users can recover a password. | Forgot password sends an OTP (in the demo, it is shown in a toast). |
| FR-AUTH-6 | Protected pages need sign-in. | Opening any app route without a session goes to `/login`. |

### 4.2 Dashboard (FR-DASH)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-DASH-1 | Show key figures. | Shows total projects and awaiting approvals. |
| FR-DASH-2 | Show empty states. | When no chainage markers exist, shows "No chainage markers yet". |

### 4.3 Company (FR-CMP)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CMP-1 | Maintain the company profile. | PAN matches `AAAAA9999A`, TAN matches `AAAA99999A`, and the PIN code is valid. |
| FR-CMP-2 | Upload the company logo and offer letter format. | Files are uploaded and shown. The offer letter format is also available from Job openings. The offer letter keeps a file reference. |
| FR-CMP-3 | Show the subscription. | `/subscription` shows the plan. |

### 4.4 Policies (FR-POL)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-POL-1 | List all policies. | `/policies` lists the six built-in policies and any custom policies, with a summary of the version in force. |
| FR-POL-2 | Policies are versioned and append-only. | "New version" opens the editor starting from the newest version. Saving creates version n+1 with an effective date and a reason of at least 10 characters. Earlier versions are never overwritten. |
| FR-POL-3 | Show version states. | Each version is In force, Scheduled (effective date later than the one in force) or Superseded. The policy page shows the version in force first, any scheduled version, and the history. |
| FR-POL-4 | Rules and regulations. | Each rule is at least 10 characters, has a category, and can be marked "Must acknowledge". |
| FR-POL-5 | Payment threshold. | One amount. Below it, PMS pays at the location. At or above it, Head Office approves and pays the payee directly. |
| FR-POL-6 | Holiday policy. | A calendar year with at least one holiday. To cannot be before From. Holidays cannot overlap. Project variants need a project. |
| FR-POL-7 | Shift count. | At most 4 shifts a day. Shift names are at most 40 characters. Each shift has start and end times (overnight shifts allowed). Week off and notes for HRMS. |
| FR-POL-8 | Leave policy. | Leave codes are 1–4 capital letters and unique. Days a year at most 365. Expiry at most 60 months. Carry-forward days must be 0 when carry-forward is off. A legal note is shown. |
| FR-POL-9 | Overtime policy. | Rates at most 4×. Counted after at most 240 minutes. Daily cap at most 12 h, monthly cap at most 200 h, and the monthly cap at least the daily cap. Needs-approval flag and mode. |
| FR-POL-10 | Admin can turn overtime on or off. | Only the Tenant Admin sees the switch, only on the overtime policy. Switching saves a new version effective today, built on the newest version, with the reason "Overtime turned off by admin" or "Overtime turned on by admin". When off, the summary reads "Off for all locations" and the status reads "Off". The switch is disabled while a scheduled version exists. |
| FR-POL-11 | Custom policies. | Name at most 60 characters, description at most 400. Field names are unique. A choice field needs at least 2 choices. |

### 4.5 Organisation (FR-ORG)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-ORG-1 | Show the organogram. | `/organogram` shows the reporting structure. |
| FR-ORG-2 | Maintain departments. | Name at most 60 characters, description at most 300, week-off 0–7, colour as hex. Code and name are unique. Status Active or Inactive. |
| FR-ORG-3 | Maintain roles. | Title at most 60 characters, 1–500 positions. |
| FR-ORG-4 | Maintain users. | Name at most 80 characters, employee code at most 20. The email is the login and is unique. A head needs at least one module. Each user also holds an employee ID and a position as data fields (not on the form). |
| FR-ORG-5 | Revoke access or reset a user. | Both actions ask for confirmation in a dialog. |
| FR-ORG-6 | Grant privileges. | Changing privileges needs step-up and is audited as "Privileges changed (step-up verified)". |

### 4.6 Projects and planning (FR-PRJ)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-PRJ-1 | Maintain projects. | Unique code. End date after start date. Description at most 500 characters. Status Planning, Active, On hold or Completed. |
| FR-PRJ-2 | Milestones. | Status Not started, In progress or Done. Progress at most 100%. |
| FR-PRJ-3 | WBS. | Codes are numeric and dotted (e.g. 1.2.3) and unique. Child items must be removed before their parent. |
| FR-PRJ-4 | Chainage. | End km greater than start km. A km can have only one marker. |
| FR-PRJ-5 | People planning. | Headcount per role per project. End date after start date. Status Planned, Confirmed or Fulfilled. |
| FR-PRJ-6 | Material planning. | Required-by date and store are required. Status Planned, Requested, Ordered or Received. |
| FR-PRJ-7 | Equipment planning. | End date after start date. Purpose at least 3 characters. Planned units are shown against units registered by P&M. |

### 4.7 Sites and geo-fences (FR-SITE)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-SITE-1 | Maintain sites. | `/sites`, `/sites/new` and `/sites/:id` create and edit sites. |
| FR-SITE-2 | Radius geo-fence. | Radius between 50 m and 5,000 m. |
| FR-SITE-3 | Polygon geo-fence. | At most 60 pins. |
| FR-SITE-4 | Linear geo-fence (roads, pipelines). | At least 2 pins, a line of at least 20 m, and a buffer of 5–1,000 m on each side. |
| FR-SITE-5 | Protect geo-fence changes. | Changing or deleting a zone needs step-up. Each zone records its version, updated at and updated by. Audited as "Geofence zone updated (step-up verified)" or "Geofence zone deleted (step-up verified)". |
| FR-SITE-6 | Geo-fence overview. | `/geofences` lists zones by project. |

### 4.8 Resources (FR-RES)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-RES-1 | Stores. | Unique code and a chainage marker. A required Location (chosen from the project locations) and a free-text Address. Searchable by code, name, keeper or address. Active or Inactive. |
| FR-RES-2 | Material masters. | HSN is 4–8 digits. At least one store. Searchable by code, name, category or HSN. Marked "Owned by Stores". |
| FR-RES-3 | Live stock. | Stock by store and material. Free stock = on hand − reserved. |
| FR-RES-4 | Equipment register. | Each unit has a chainage marker and an equipment type. The type master defines the meter kind (Hours, Kilometres or None) and the fuel-norm unit. A hired unit links to a vendor. Equipment assignments carry the project. Photos from the camera or a file upload. Maintained by P&M. |
| FR-RES-5 | Vendors. | A vendor master with code, GSTIN, PAN, contact details and a Pending or Active status. It is stored as data and shown through the equipment register. There is no separate vendor screen. |

### 4.9 Approvals (FR-APR)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-APR-1 | Request types. | Onboarded employee list, Offer letter, Job opening, Manpower requisition, Equipment, Material, Advance payment, Recruitment, Employee transfer, Promotion, Bonus and incentive, Loan and advance, Payments. |
| FR-APR-2 | Raise a request. | Each request has a code (e.g. REQ-2043), is raised against a chainage, can be flagged as an emergency, and stores a snapshot of the chain and matrix version used. |
| FR-APR-3 | List and filter requests. | `/approvals` lists requests with status Pending, In review, Approved or Rejected. |
| FR-APR-4 | Decide a request. | The approver at the current level can approve, reject, escalate or comment. Every action is recorded (Approved, Rejected, Escalated, Raised, Commented). |
| FR-APR-5 | Type-specific decisions. | Material: Transfer or Vendor, with a live stock check. Recruitment: Local or Head Office. Job opening: "Site hires directly" or "Head Office posts", recording posted on HRMS and published to site. Equipment: checked against equipment planning. |
| FR-APR-6 | Show what happens after approval. | Transfers and promotions: "CORE approves, HRMS executes". Bonus: "CORE approves, HRMS pays through payroll". Offer letter: "Approve before HRMS issues it". |
| FR-APR-7 | Approval chains. | One chain per request type and scope (Company or Project). The most specific matching chain is used, so a Project chain wins over a Company chain. |
| FR-APR-8 | Chain levels. | Each level has an approver, a timeout of 1–720 hours, and a timeout rule: next level, Tenant Admin, or remind only. Levels 1–3 can have an escalation person. Payments levels can have a cash limit of at least ₹1. |
| FR-APR-9 | Chain validation. | L1 must be set before the chain can be used ("Not usable yet" otherwise). An approver cannot repeat an earlier level. The escalation person must differ from the approver. |
| FR-APR-10 | Chains are versioned. | A change creates a new version with an effective date and a reason. It applies to new requests only. Existing requests keep their snapshot. Overlapping chains are flagged. |
| FR-APR-11 | Job openings. | `/job-openings` lists all job openings and the offer letter format. |

### 4.10 Grievances (FR-GRV)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-GRV-1 | Raise a grievance. | Code like G-101. The message is at most 10 words. Each grievance has a date for a Head Office visit. It also records who raised it, the employee, a subject, and the source module and record, as data fields (not on the form). |
| FR-GRV-2 | Track visits. | Status Requested, Confirmed, Rescheduled, Visited or Not visited. Listed by nearest visit date, with History, Head Office visit and Closed sections. |
| FR-GRV-3 | Close a grievance. | "Mark visited" is allowed from Requested, Confirmed or Rescheduled, and closes the grievance. A new grievance can follow a closed one. |

### 4.11 Help and support (FR-SUP)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-SUP-1 | FAQ. | `/help` shows frequently asked questions. |
| FR-SUP-2 | Raise a ticket. | Subject at most 120 characters, description at least 20. Priority Low, Medium or High. The ticket records who raised it. |
| FR-SUP-3 | Track tickets. | "Your tickets" shows status Open, Answered or Closed. |
| FR-SUP-4 | Style guide. | `/style-guide` shows the UI components (Layout Kit, Classic variant). |

### 4.12 Audit (FR-AUD)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-AUD-1 | Record every change. | Every create, update, delete and decision writes an audit entry with who, when and what. Step-up actions say "(step-up verified)". |
| FR-AUD-2 | View the audit trail. | `/audit` lists entries with search and filters. |
| FR-AUD-3 | Export the audit trail. | Export to CSV (`core-audit-trail`) needs step-up. |

---

## 5. Workflows

### 5.1 Approval and escalation
1. A requester raises a request. CORE picks the most specific active chain (Project, then Company) and stores a snapshot.
2. The request goes to L1. The status is Pending, then In review.
3. The approver approves, rejects, comments or escalates.
4. If the level times out, the level's rule applies: move to the next level, send to the Tenant Admin, or only remind.
5. For Payments, a level's cash limit decides whether it can approve the amount on its own.
6. Approval at the last level sets Approved. A rejection at any level sets Rejected.
7. The related application acts on the result (HRMS, PMS or Head Office).

### 5.2 Payment routing
- Amount below the payment threshold: PMS pays at the location.
- Amount at or above the threshold: Head Office approves and pays the payee directly.

### 5.3 Policy versioning
1. The user opens a policy and clicks "New version".
2. The editor starts from the newest version (including a scheduled one).
3. The user sets the effective date and a reason (at least 10 characters) and saves.
4. If the date is today or earlier, the new version is In force. If later, it is Scheduled and becomes In force on that date.
5. Overtime switch: the Tenant Admin flips the switch, which saves a new version effective today. The switch is disabled while a later version is scheduled, so a scheduled change is never undone by accident.

### 5.4 Job openings
1. A job opening request is raised and approved through its chain.
2. The route is "Site hires directly" or "Head Office posts".
3. HRMS posts it on its recruitment page. CORE records posted on HRMS and published to site.
4. For recruitment, HRMS asks CORE to decide Local or Head Office.

### 5.5 Grievances
1. A grievance is raised with a short message and a visit date.
2. Head Office confirms or reschedules the visit.
3. After the visit, "Mark visited" closes it. A missed visit is Not visited.

---

## 6. Business rules (summary)

| Area | Rule |
|---|---|
| Versions | Policies and chains are append-only. Reason at least 10 characters. |
| Chains | One per request type and scope. Project beats Company. L1 required. No repeated approver. Escalation person differs from approver. Timeout 1–720 h. |
| Payments | Threshold routes PMS vs Head Office. Cash limits at least ₹1. |
| Overtime | Off means no overtime is calculated for any location. Only the Tenant Admin can switch it. |
| Geo-fences | Radius 50–5,000 m. Polygon up to 60 pins. Linear: 2+ pins, 20 m+ line, 5–1,000 m buffer. |
| Uniqueness | Department code and name, user email, project code, WBS code, store code, leave code, chainage km. |
| Step-up | Geo-fence change or delete, privilege grants, exports. |

---

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-SEC-1 | Passwords are never stored in plain text (SHA-256 hash in the demo; the backend must use a slow salted hash). |
| NFR-SEC-2 | Sensitive actions need step-up verification with an authenticator app or passkey. |
| NFR-SEC-3 | Five failed sign-ins lock sign-in for 30 seconds. |
| NFR-AUD-1 | Every change is audited. Audit entries cannot be edited or deleted. |
| NFR-A11Y-1 | Controls have accessible names. The overtime switch uses `role="switch"` with `aria-checked`. Disabled controls say why. |
| NFR-UX-1 | Layouts work on desktop, tablet and phone. Feedback is shown with toasts. Empty states explain what to do. |
| NFR-DATA-1 | Today, data is in memory and reloading resets it. Sign-in lives in sessionStorage, and UI preferences in localStorage. Files are kept as data URLs. The backend must replace all of this. |
| NFR-QA-1 | Quality gates: `npx tsc -b`, `npm run lint`, `npm run deps` (module boundaries), `npx vitest run`. |

---

## 8. Assumptions and open items

### 8.1 Assumptions
- One company (tenant) per account.
- Dates use the browser's local date. Amounts are in Indian rupees.
- Related applications read CORE data through APIs that are not built yet.

### 8.2 Open decisions
1. How projects link to locations. Partly settled: a project carries a list of location IDs and a store takes its Location from it. The many-to-many table is still to be confirmed.
2. Whether to merge the three plan tables (people, material, equipment).
3. `core_ticket` versus `support_issue` for support tickets.
4. Whether to store rules and the overtime body as JSON.
5. Whether to split the equipment table further. The type master and the vendor are already separate tables.
6. The Stores stock publishing API.
7. The GPS device.

---

## 9. Traceability: routes to requirements

| Route | Requirements |
|---|---|
| `/`, `/register`, `/login`, forgot password | FR-AUTH-1 to 6 |
| `/dashboard` | FR-DASH-1, 2 |
| `/company`, `/subscription` | FR-CMP-1 to 3 |
| `/policies`, `/policies/:key`, `/policies/custom/:id` | FR-POL-1 to 11 |
| `/organogram`, `/departments`, `/users`, `/users/new`, `/users/:id` | FR-ORG-1 to 6 |
| `/projects`, `/projects/new`, `/projects/:id`, `/people-planning`, `/material-planning`, `/equipment/planning` | FR-PRJ-1 to 7 |
| `/sites`, `/sites/new`, `/sites/:id`, `/geofences` | FR-SITE-1 to 6 |
| `/stores`, `/materials`, `/stock`, `/equipment/register` | FR-RES-1 to 5 |
| `/approvals`, `/approvals/:id`, `/approval-matrix`, `/approval-matrix/new`, `/approval-matrix/:id`, `/job-openings` | FR-APR-1 to 11 |
| `/grievances`, `/grievances/:id` | FR-GRV-1 to 3 |
| `/help`, `/style-guide` | FR-SUP-1 to 4 |
| `/audit` | FR-AUD-1 to 3 |

For tables, columns and data types, see [VeloxIQ_CORE_application_document.md](VeloxIQ_CORE_application_document.md).
