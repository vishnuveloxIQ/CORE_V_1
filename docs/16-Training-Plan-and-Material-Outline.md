# VeloxIQ Core: Training Plan and Material Outline

| Field | Value |
|---|---|
| Document ID | DOC-16 |
| Title | Training Plan and Material Outline |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This plan describes how people who use or support VeloxIQ Core are trained before and after go-live. It sets out the audiences, what each must be able to do, the curriculum, how it is delivered, the hands-on exercises, how learning is assessed, how trainers are prepared, how support works during go-live, how training is recorded, and how success is measured.

All durations, group sizes, schedules and pass marks in this document are **Proposed** and are for the document owner to confirm. Names of people, roles filled, dates, venues and contact channels are **To be confirmed**.

## 2. Scope and audience

- **In scope:** the Core web application (the full application used by administrators and the simple module home page shown to other users). Content follows the User and Administrator Guide (DOC-15).
- **Out of scope:** training for the HRMS, P&M, PMS and Stores applications. Where a Core task depends on them (for example Stores publishes stock), the course only explains the hand-off.
- **Readers of this plan:** the training owner, trainers, the project sponsor and the go-live team.

Companion documents: DOC-15 (User and Administrator Guide) is the learner manual. `CORE__FRONTEND/docs/UAT_SCRIPTS.md` is the source of the hands-on exercises.

## 3. Assumptions and constraints

| # | Statement | Basis |
|---|---|---|
| 1 | Only users holding the access-management privilege (administrators) use the full application. Other users see one page with a Sign out button. | `src/app/App.tsx`, `ModuleHome.tsx` |
| 2 | Training runs on a **training company** with fictional data, never on production data. A staging environment does not exist yet, so the date and place of hands-on practice depend on it. | UAT_SCRIPTS.md; release notes (blocker B1) |
| 3 | The release decision is currently "no-go" until the release gates clear. Training dates are therefore not fixed. | RELEASE_NOTES_DRAFT.md |
| 4 | Password reset and registration OTP codes are sample codes outside production until an email provider is chosen. Trainers must tell learners that real delivery is not yet set up. | `ForgotPassword.tsx`, `Register.tsx` |
| 5 | Core has not been tested in Edge or with a screen reader. Learners who depend on assistive technology need a separate check. | Release notes |
| 6 | Each person has one active session. Shared training logins cause "signed in on another device" messages, so each learner needs their own training account. | `Login.tsx` |

## 4. Audiences and learning objectives

Roles below are **job roles**, not Core roles. Several can belong to one person. Which people fill them is To be confirmed.

### 4.1 Tenant administrator

Runs Core for the company. Holds the access-management privilege and typically other manage privileges.

By the end of training the administrator can:

- sign in on the admin login, use a passkey, and explain a step-up check;
- create users, issue and reset temporary passwords, deactivate and reactivate users, and grant and revoke privileges;
- set up company profile, policies (versions and effective dates), projects, locations, stores, materials, vendors, departments and roles;
- configure approval chains (levels, reminders, scope) and read the activity log with its four tabs;
- use bulk upload and read an error report;
- explain which privilege controls which screen.

### 4.2 Project or site coordinator

Maintains projects and locations and plans resources.

Can:

- add a project (knowing the project ID cannot change) and its milestones, WBS and BOQ;
- add a location under the right project and use the Chainage tab;
- maintain geo-fence zones (with step-up confirmation);
- enter resource, material and equipment planning lines.

### 4.3 Store keeper

Works with stores, materials and stock.

Can:

- add or edit a store and link it directly to a location;
- read Live stock and Available materials, and explain free, on hand and reserved;
- add materials and understand reorder level and the "Owned by Stores" note.

### 4.4 Equipment / P&M coordinator

Keeps the equipment register and maintenance current.

Can:

- register equipment through the four-step form, and bulk upload;
- assign equipment to a project and undo an assignment;
- add maintenance schedules (months, hours or both) and read Due soon and Overdue;
- read Available equipment and Project equipment planning, including Manage lines.

### 4.5 Approver

Decides requests at a level in an approval chain. (Approvers use Core screens only where they are administrators; otherwise they use the screens of their own module. Confirm per approver: To be confirmed.)

Can:

- find waiting requests with the filters and open one;
- approve, reject or ask for clarification, and explain why a button is disabled;
- explain reminders, emergency flag and that nothing is escalated.

### 4.6 Auditor / read-only reviewer

Reads records and the activity log without changing them.

Can:

- open the four Activity log tabs and apply filters;
- open an entry's Details and read before and after values;
- export the log (with step-up) and explain that entries cannot be changed;
- read Data exchange log states and Shared records.

### 4.7 Support staff

Help users and handle tickets.

Can:

- explain sign-in messages (wrong password, lockout, signed in elsewhere, wrong login type);
- explain "Someone else changed this", the outage banner and error references;
- use the FAQ and the troubleshooting table in DOC-15, and raise or read tickets from Help and support;
- know what is open or gated (sample data, no email provider).

## 5. Audience-to-module map

| Module (section 6) | Admin | Project/site | Store keeper | Equipment | Approver | Auditor | Support |
|---|---|---|---|---|---|---|---|
| M1 Orientation and sign-in | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| M2 Company setup | Yes | | | | | | Overview |
| M3 Projects and locations | Yes | Yes | | | | | Overview |
| M4 People and organisation | Yes | | | | | | Overview |
| M5 Approvals | Yes | | | | Yes | Overview | Overview |
| M6 Inventory and stores | Yes | | Yes | | | | Overview |
| M7 Equipment | Yes | Planning only | | Yes | | | Overview |
| M8 Governance and activity log | Yes | | | | | Yes | Yes |
| M9 Troubleshooting and support | Yes | | | | | | Yes |

## 6. Curriculum (Proposed)

All durations are **Proposed**. "Overview" means the first 15 minutes only.

| ID | Module | Content (DOC-15 section) | Proposed duration |
|---|---|---|---|
| M1 | Orientation and sign-in | What Core is; administrator versus other users; login choices; password, passkey, OTP for reset; changing a temporary password; step-up; "signed in on another device"; menu, Ctrl K search, light/dark mode, unsaved-changes prompt, tables and export, bulk upload (sections 3 to 5) | 90 min |
| M2 | Company setup | Company profile; policies, versions and effective dates; custom policies; Subscription gated (7) | 60 min |
| M3 | Projects and locations | Projects and tabs; locations; chainage; geo-fences; resource and material planning (8) | 120 min |
| M4 | People and organisation | Organogram, departments, roles; users and privileges; temporary passwords; job openings (9) | 90 min |
| M5 | Approvals | Raising and deciding requests; approval matrix; versions; reminders (9.4, 12.1) | 90 min |
| M6 | Inventory and stores | Stores linked to a location; materials; vendors; live stock; available materials (10) | 75 min |
| M7 | Equipment | Register; assign and unassign; maintenance; available equipment; project equipment planning (11) | 120 min |
| M8 | Governance and activity log | Activity log four tabs and filters; export with step-up; grievances (12) | 75 min |
| M9 | Troubleshooting and support | Messages and what to do; FAQ; tickets; what is gated (5.7, 13, 17) | 45 min |

**Proposed paths per audience:**

| Audience | Modules | Proposed total |
|---|---|---|
| Tenant administrator | M1 to M9 | about 12.5 hours (over 3 half-days) |
| Project or site coordinator | M1, M3, M7 (planning part) | about 4 hours |
| Store keeper | M1, M6 | about 2.75 hours |
| Equipment / P&M coordinator | M1, M7 | about 3.5 hours |
| Approver | M1, M5 | about 3 hours |
| Auditor / reviewer | M1, M8 | about 2.75 hours |
| Support staff | M1 to M9 (overview of M2 to M7) and M8, M9 in full | about 6 hours |

## 7. Delivery methods (Proposed)

| Method | Use | Notes |
|---|---|---|
| Instructor-led workshop (in person or online) | M1 to M9 for administrators and support | Maximum 12 learners per trainer (Proposed). Each learner has a training account. |
| Hands-on lab | Every module | Use the training company with fictional data. Exercises in section 8. |
| Short role-based sessions | Store keepers, equipment coordinators, approvers, auditors | One module plus M1. |
| Self-study | Refresher | DOC-15 and the in-app Help and support FAQ. |
| Quick-reference cards | At the desk | One page per audience: sign-in, step-up, key screens, common messages. To be produced. |
| Recorded walkthroughs | Optional | To be produced after the application is stable. |
| Screenshots | Manual and slides | The placeholders in DOC-15 need real screenshots. |

**Training environment requirements** (all To be confirmed): a training company with its own prefix; one account per learner; accounts for an administrator with every manage privilege, an approver for levels 1 and 2, and a plain module user (as UAT_SCRIPTS.md requires); a browser that supports passkeys; a device with a passkey-capable screen lock for step-up exercises.

## 8. Hands-on exercises

Each exercise is derived from the UAT scripts in `CORE__FRONTEND/docs/UAT_SCRIPTS.md`. Use fictional data only.

| Exercise | Module | Script IDs | Task | Expected result (from the script) |
|---|---|---|---|---|
| E1 Sign in | M1 | U1.1 | Sign in with correct credentials. | The dashboard opens and the header chip names the company. |
| E2 Wrong password | M1 | U1.2 | Sign in with a wrong password. | "Login id or password is incorrect"; the message does not say whether the login exists. |
| E3 One session | M1 | U1.3 | Sign in as the same user on a second browser. | The first browser is signed out on its next action. |
| E4 Reset password | M1 | U1.4 | Use Forgot password with the sample OTP. | The password changes and the new password signs in. |
| E5 Unknown prefix | M1 | U1.5 | Enter a login ID with an unknown prefix. | "This login ID does not belong to a company set up here." |
| E6 Create a project | M3 | U2.1, U2.5 | Create a project and edit it; then try a duplicate project ID. | Saved; the project ID cannot be changed; "Another project uses this project ID." |
| E7 Create a location | M3 | U2.2 | Create a location with latitude and longitude. | The location page shows a map link. |
| E8 WBS and BOQ | M3 | U2.3, U2.4 | Add a WBS item and set it Inactive; add BOQ items. | The tree shows Inactive; each amount is quantity times rate and the total adds up. |
| E9 Read-only user | M3 | U2.6 | Sign in as the plain user and open Projects. | No create or edit buttons. |
| E10 Edit conflict | M3 | U2.7 | Two people edit the same record. | "Someone else changed this..." and nothing is overwritten. |
| E11 Create a user | M4 | U3.1 | Create a user typing only 4 digits. | Login ID gets the company prefix; a temporary password is shown once. |
| E12 Privileges | M4 | U3.2 | Grant and revoke a privilege. | A passkey step-up is asked; the change appears in the activity log. |
| E13 No access | M4 | U3.3 | As the plain user, open the activity log address. | "You do not have access to this page." |
| E14 Approval chain | M5 | U4.1, U4.7 | Create a 2-level chain with a reminder interval, then edit it to a new version. | Saved as v1; reminders only, no escalation; new requests use the new version. |
| E15 Raise a request | M5 | U4.2 | Raise a non-emergency request without a needed-by date, then with one. | Refused with the date message; then raised. |
| E16 Decide a request | M5 | U4.3, U4.4, U4.6 | Approve as level 1; view as someone else at level 2; reject without and with a reason. | Confirmation is asked; "Waiting on [approver]"; rejection needs a reason and a final confirmation. |
| E17 Reminders | M5 | U4.5 | Observe a reminder after the interval. | The approver is reminded; the request stays at its level. |
| E18 Policy versions | M2 | U5.1, U5.2 | Save a new version of the payment threshold; delete a custom policy. | Version history grows and compare highlights the change; the confirmation states what goes with the policy. |
| E19 Maintenance | M7 | U6.1 | Add a schedule of every 3 months or 500 hours with a last service. | The next due date and hours show with a status. |
| E20 Vendor | M6 | U6.2 | Add a vendor with a PAN, then verify it. | Saved and marked verified. |
| E21 Available materials | M6 | U6.3 | Open Available materials. | Free stock per material and where it is held. |
| E22 Data exchange log | M8 | U6.4 | Open the Data exchange log tab after approving a request. | Approval events are listed (Queued) with field names only. |
| E23 Outage | M9 | U7.1, U7.2 | Stop the backend and try to save; restart and choose Check again. | A banner says Core cannot reach the server; the banner clears afterwards. |

**Exercises with no UAT script (Proposed new, run by the trainer and checked against DOC-15):**

| Exercise | Module | Task |
|---|---|---|
| E24 Stores and locations | M6 | Create a store and choose its location. Confirm the store appears for that location's project. |
| E25 Equipment planning rows | M7 | Add two plan lines for the same project and equipment type. Confirm one row shows the total units; open Manage lines; edit one line; remove one with a reason. |
| E26 Register and assign | M7 | Register a unit through the four steps; assign it to a project from Available equipment; unassign it from Details. |
| E27 Chainage | M3 | Open a location's Chainage tab; confirm it shows the location's project chainage; add a marker. |
| E28 Activity log filters | M8 | Apply Module, Area, What and Person filters; open Details; export with step-up. |
| E29 Unsaved changes | M1 | Type in a form, try to leave, and read the prompt; then save and confirm no prompt. |
| E30 Dark mode and search | M1 | Switch mode with the header switch and with Ctrl K; find a record by code. |

## 9. Assessment criteria

Assessment is practical first and written second. Pass marks are **Proposed**.

| Component | Method | Proposed pass mark |
|---|---|---|
| Practical | Learner completes the exercises for their path without help; trainer ticks each against the expected result. | All mandatory exercises completed (marked below); at most two prompts. |
| Written | Questions from the quiz bank (section 10); 10 questions drawn for the path. | 80 percent |
| Observation | Trainer notes safe habits: does not share the temporary password in chat, confirms before approving or rejecting, reads the message before retrying. | Satisfactory |

**Mandatory exercises (Proposed):**

| Audience | Mandatory |
|---|---|
| Tenant administrator | E1, E3, E6, E11, E12, E14, E18, E28, E29 |
| Project or site coordinator | E1, E6, E7, E27 |
| Store keeper | E1, E20, E21, E24 |
| Equipment / P&M coordinator | E1, E19, E25, E26 |
| Approver | E1, E15, E16, E17 |
| Auditor / reviewer | E1, E13, E22, E28 |
| Support staff | E1, E2, E3, E10, E23 |

**Outcomes:** Competent (met all), Competent with coaching (retake one exercise or quiz), Not yet competent (repeat the module). Retakes happen within an agreed window (To be confirmed).

## 10. Quiz bank

Answers are based on how the application behaves today (see DOC-15). Mark each question with the audience it suits.

| # | Question | Answer | Audience |
|---|---|---|---|
| 1 | Which privilege makes a user an administrator who sees the full Core application? | The access-management privilege (access.manage). | All |
| 2 | What does a user without that privilege see after signing in? | One page saying their module screens are not in this application, with a Sign out button. | All |
| 3 | A Login ID is made of what? | The company prefix followed by four digits, for example ACME1234. | All |
| 4 | An administrator signs in on the user login. What happens? | Core refuses and signs the account out, saying it does not sign in on the user login. | Admin, support |
| 5 | After too many wrong passwords, what do you see? | A lockout message with a countdown ("Too many attempts. Try again in N seconds."). | Support |
| 6 | What is the minimum length of a new password? | 12 characters, and it must differ from the current one. | All |
| 7 | When is an OTP used in Core? | When resetting a forgotten password and when registering a company. It is not asked at every sign-in. | Support |
| 8 | How long does a step-up check last? | Five minutes. | Admin, auditor |
| 9 | Which actions need a passkey and not a password for step-up? | Granting or revoking privileges, and exporting the full activity log. (Geo-fence changes also accept a password.) | Admin, auditor |
| 10 | A user says "You signed in on another device, so this session has ended." What happened? | They signed in elsewhere; Core allows one active session per person. They sign in again. | Support |
| 11 | What does the "Leave without saving?" prompt protect? | Unsaved typing in a form when you try to leave the page. | All |
| 12 | After creating a user, where can you see the temporary password again? | Nowhere. It is shown once; use Reset password to issue a new one. | Admin |
| 13 | Can the project ID be changed after a project is created? | No. | Project |
| 14 | A location is created for project A. Can it later be moved to project B? | No. | Project |
| 15 | On a location's Chainage tab, whose chainage do you see? | The chainage of the location's own project. | Project |
| 16 | A store is linked to what? | Directly to a location (and through it, to the project). | Store keeper |
| 17 | How is free stock worked out? | On hand less reserved. | Store keeper |
| 18 | Can a vendor be deleted? | No. It is deactivated so history stays. | Store keeper, admin |
| 19 | In Project equipment planning, two lines exist for the same project and equipment type. How many table rows appear? | One, with the units added together. Use Manage N lines to see each line. | Project, equipment |
| 20 | Does a plan line have an end date? | No. It has a Needed from date only. | Project, equipment |
| 21 | Assignments of equipment are kept per what? | Per project and equipment type, not per unit. | Equipment |
| 22 | In Maintenance, what does "Due soon" mean? | Within 14 days of the due date, or within the last 10 percent of the hour interval. | Equipment |
| 23 | In Maintenance, when is a status "No service recorded"? | When the schedule has no last service date or hours. | Equipment |
| 24 | Where do the hours for a maintenance schedule come from? | The meter reading held in the equipment register. | Equipment |
| 25 | Why can an approver's Approve button be disabled? | They are not the approver at the current level, they raised the request, or it is waiting for a clarification. | Approver |
| 26 | What does the emergency flag do? | It raises priority only. It never skips approval. | Approver |
| 27 | Does editing an approval chain change requests already raised? | No. Each request keeps the version it was raised under. | Approver, admin |
| 28 | An approver does not act. Is the request escalated? | No. The same approver is reminded at each interval. | Approver |
| 29 | Can a rejection be undone? | No. The confirmation says it is final and the request is closed. | Approver |
| 30 | Name the four tabs of the Activity log. | Activity, Sign-ins, Data exchange log, Shared records. | Auditor |
| 31 | Can an activity log entry be edited or deleted? | No. | Auditor |
| 32 | What does a Dead-letter message mean, and what can be done? | Core could not apply or deliver it and stopped trying. After the cause is fixed it can be replayed. | Auditor, support |
| 33 | Do the Activity log filters search the whole log, or only the page shown? | The filters search the whole log (on the server). The Search box only narrows the page shown. | Auditor |
| 34 | What should a user do when they see "Someone else changed this"? | Review the loaded version, make the change again and save. Nothing was overwritten. | All |
| 35 | An error shows a reference code. Why does support want it? | It identifies the request in the server logs. | Support |

## 11. Train-the-trainer outline (Proposed)

**Who:** people nominated as trainers or floor-walkers. Names are To be confirmed.

**Prerequisites:** have passed the written quiz for the Tenant administrator path (or the audience they will train) and completed all mandatory exercises.

| Session | Content | Proposed duration |
|---|---|---|
| T1 Core in depth | Walk through DOC-15 sections 3 to 14; what is gated or open; what is not yet tested. | 3 hours |
| T2 Facilitation | Running a hands-on lab; pacing; handling "it does not work" safely; never using production data; never sharing temporary passwords in public chat. | 2 hours |
| T3 Environment | Resetting the training company; creating learner accounts; setting up a passkey device; recreating the UAT accounts (administrator, approver for L1 and L2, plain user). | 1.5 hours |
| T4 Assessment | Marking practical exercises; using the quiz bank; recording results. | 1 hour |
| T5 Teach-back | Each trainer delivers a 20-minute module section to peers and receives feedback. | 2 hours |

**Trainer toolkit:** DOC-15; this plan; the UAT scripts; slide decks (To be produced); quick-reference cards (To be produced); attendance and skills records (section 14); a list of known limitations from the release notes.

**Trainer certification (Proposed):** pass T5 with a Satisfactory rating and at least 80 percent on the quiz.

## 12. Go-live support plan

All named roles, hours and channels are **To be confirmed**.

| Element | Description | Detail |
|---|---|---|
| Floor-walkers | People who sit with users at each site or office during the first days after go-live and help in person. | Roles and names To be confirmed. Duration of the floor-walking period To be confirmed (Proposed: first two weeks). |
| FAQ channel | A single place where questions are posted and answered, seeded from DOC-15 section 16 and the in-app Help FAQ. | Channel, owner and hours To be confirmed. |
| Ticket route | The in-app **Help and support** screen has a **Raise a ticket** form (Subject, Category, Priority, Description). | Who reads and answers tickets, and the response times, To be confirmed. |
| Escalation | Where a problem goes if the floor-walker or FAQ cannot solve it (for example a server problem needing the error reference). | Contacts To be confirmed. |
| Administrator hotline | A named contact for administrators during the first weeks. | To be confirmed. |
| Daily stand-up | A short daily review of questions and defects during the first week. | Attendees and time To be confirmed. |
| Known limitations briefing | Tell all users what is sample data, gated or untested (see section 3). | Owner To be confirmed. |

**What support staff watch for in the first weeks (from the application's behaviour):**

- repeated "signed in on another device" messages (shared accounts);
- lockouts after wrong passwords, and password resets (OTP is a sample until an email provider is set up);
- "Someone else changed this" messages (two people editing the same record);
- bulk upload rows rejected (missing columns, duplicate codes, unknown project or location codes);
- equipment that cannot be assigned because its type is not on the server;
- projects with no location, which blocks equipment registration;
- approvals stuck because a level has no approver set.

**Reading signals:** the Activity log (Sign-ins tab) shows failed attempts and lockouts, and the Data exchange log shows Dead-letter messages.

## 13. Schedule (Proposed outline)

Dates depend on the staging environment and the release decision, so none are fixed.

| Phase | Activity | Timing |
|---|---|---|
| Prepare | Confirm owner; confirm audiences and names; prepare training company; produce screenshots and cards | Before training starts |
| Train the trainers | Section 11 | After the environment is ready |
| Train administrators | M1 to M9 | Before other audiences |
| Train other audiences | Role-based paths | After administrators, before go-live |
| Go-live support | Section 12 | From go-live |
| Refresher | Short sessions and review of questions | About 4 to 6 weeks after go-live (Proposed) |

## 14. Training records template

Keep one record per learner and one attendance sheet per session. Do not record passwords or other secrets.

**Attendance sheet**

| Field | Entry |
|---|---|
| Session ID | |
| Module(s) | |
| Date | |
| Trainer | |
| Venue or online link | |
| Environment used | |

| Learner name | Login ID (training account) | Audience | Present (Y/N) | Signature or confirmation |
|---|---|---|---|---|
| (name) | (ID) | | | |

**Learner skills record**

| Learner | Audience | Module | Exercises completed | Quiz score | Outcome | Trainer | Date | Retake date (if any) |
|---|---|---|---|---|---|---|---|---|
| (name) | | | | | Competent / with coaching / not yet | | | |

**Retention:** how long records are kept and where is To be confirmed.

## 15. Success measures (Proposed)

Targets are Proposed and for the owner to set. Sources are only those that exist in the application.

| Measure | How measured | Proposed target |
|---|---|---|
| Training completion | Attendance records against the nominated list | 100 percent of nominated administrators before go-live |
| Assessment pass rate | Skills records | At least 90 percent Competent at first attempt |
| Sign-in problems | Activity log, Sign-ins tab: failed attempts and lockouts per user in the first two weeks, and support tickets about sign-in | Falling week on week |
| Common-error tickets | Tickets in Help and support by category | Falling week on week |
| Approvals handled | Approvals screen: requests waiting beyond their reminder interval | Falling week on week |
| Data quality | Bulk upload error rates; projects without a location; chains without a level 1 approver | Reducing |
| Learner confidence | Short survey after each session (1 to 5) | At least 4 average |
| Trainer feedback | Section 11 teach-back ratings | All Satisfactory |

Baseline values and who reports them are To be confirmed.

## 16. Risks

| Risk | Mitigation |
|---|---|
| No staging environment, so no safe place to practice | Use a development setup with a training company until staging exists (UAT_SCRIPTS.md allows this). |
| Training happens before the product is final | Re-brief on changes; keep DOC-15 current; note gated screens. |
| Shared logins cause sign-outs | One account per learner. |
| Assistive-technology users not covered | Run a separate check; record in Open items. |
| OTP not delivered in real use | Say so in training; track the provider decision. |

## 17. Sources checked

- `CORE__FRONTEND/docs/UAT_SCRIPTS.md` (script IDs U1.1 to U7.2)
- `CORE__FRONTEND/docs/SCREEN_INVENTORY.md`, `RELEASE_NOTES_DRAFT.md`
- `docs/15-User-and-Administrator-Guide.md` (DOC-15) and the application files it lists
- `CORE__FRONTEND/src/app/App.tsx`, `src/app/pages/ModuleHome.tsx`, `src/modules/auth/pages/Login.tsx`, `ForgotPassword.tsx`, `ChangePassword.tsx`
- `src/shared/lib/stepUp.tsx`, `unsaved.ts`
- `src/modules/resources/pages/EquipmentPlanning.tsx`, `EquipmentRegister.tsx`, `Maintenance.tsx`, `Stores.tsx`, `Vendors.tsx`, `AvailableMaterials.tsx`
- `src/modules/core-data/api/maintenance.ts`, `api/audit.ts`
- `src/modules/audit/pages/AuditTrail.tsx`; `src/modules/approvals/pages/ApprovalDetail.tsx`; `src/modules/support/pages/Help.tsx`

## 18. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner, approver and training owner | To be confirmed |
| 2 | Names of trainers, floor-walkers, support staff and the administrator hotline | To be confirmed |
| 3 | Support hours, FAQ channel, ticket owner and response times, escalation contacts | To be confirmed |
| 4 | Training environment (staging does not exist yet) and training company setup | To be confirmed |
| 5 | Training dates, venues, group sizes and all durations in this plan | Proposed, to be confirmed |
| 6 | Pass marks, retake window and records retention | Proposed, to be confirmed |
| 7 | Whether approvers use Core screens or only their own module's screens (affects who needs M5) | To be confirmed |
| 8 | Email or SMS provider for OTP codes | To be confirmed |
| 9 | Screenshots, slide decks, quick-reference cards and recordings | To be produced |
| 10 | Testing in Edge and with a screen reader, and training adjustments for assistive technology | Not yet done |
| 11 | Baselines and reporting owner for the success measures | To be confirmed |

## 19. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft for review. |
