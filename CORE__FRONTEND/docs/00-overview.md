# VeloxIQ CORE frontend: backend specification overview

This set of documents describes, screen by screen, what the CORE frontend does and what it needs from a backend. It is written from the code in this repository. Items marked **(inferred)** are not read directly from the code.

Companion files:
- [data-model.md](data-model.md): entities, fields, relationships and conflicts.
- [api-contract.md](api-contract.md): every endpoint, grouped by resource.
- [non-functional.md](non-functional.md): auth, files, search, real-time, integrations and security.
- [screens/](screens/): one file per screen.

## Tech stack
| Area | What the code uses |
|---|---|
| Framework | React 19 with TypeScript, built with Vite 8 |
| Routing | `react-router-dom` 7 with a **HashRouter** (addresses look like `#/projects/P-101`). Routes are registered per module in `src/modules/*/routes.ts` and collected in `src/app/routes.ts`. Pages are lazy-loaded. |
| State | `zustand`: `useCore` (all business data, in memory), `useAuth` (sign-in, in sessionStorage), `useShell` (theme, sidebar, read notifications, in localStorage), and a step-up store |
| Forms | `react-hook-form` with `zod` schemas |
| UI | in-house components (`src/shared/ui`), Radix primitives, `cmdk` command palette, `sonner` toasts, Leaflet maps |
| Structure | a modular monolith: `auth`, `shell`, `dashboard`, `company`, `projects`, `organisation`, `resources`, `approvals`, `grievances`, `audit`, `support` and the shared `core-data` |

## How data is fetched today
- **There are no API calls.** No `fetch` or `axios` calls go to a server. The one `fetch` turns an in-memory data URL into a file for download.
- All business data is **seed data** in `src/modules/core-data/data/seed.ts`. It is loaded into the in-memory `useCore` store and lost on reload.
- Every change runs through a `useCore` action that also writes an audit entry.
- The billing data (`company/data/subscription.ts`) and notifications (`shell/config/nav.ts`) are constants.
- `TODO(backend)` comments name a few endpoints. The other endpoints in [api-contract.md](api-contract.md) are proposals.

## Auth model
- Public routes: `/`, `/login`, `/register` and `/forgot`. Everything else sits behind a guard. The guard redirects to `/login?role=admin&next=<path>`.
- One working sign-in: the demo **Tenant Admin**. The credentials are checked in the browser. The session lasts until the tab closes.
- The **user login**, **registration** and **password reset** are UI only. OTPs are shown in a toast.
- **Step-up** (authenticator code or passkey) is asked for geo-fence changes, privilege grants, and the organogram and audit exports. It is UI only.
- See [non-functional.md](non-functional.md) §1 to §3.

## User roles
| Role | In this app |
|---|---|
| **Tenant Admin** | The only signed-in role. Uses every screen and can be chosen as an approver. |
| **Module head** | A CORE user who heads one or more of HRMS, PMS, Stores and P&M, with privileges. One active head per module. Managed here, but works in the other modules. |
| **High-level approver** | A CORE user chosen at a level of an approval chain. |
| **Module user** | Lives in HRMS. It has a login form here, but no CORE screens. |

## Screens (41)
| # | Screen | Path | What it does |
|---|---|---|---|
| 01 | [Home](screens/01-home.md) | `/` | public landing page |
| 02 | [Login](screens/02-login.md) | `/login` | admin and user sign-in, lockout |
| 03 | [Register](screens/03-register.md) | `/register` | company sign-up with email and mobile OTP |
| 04 | [Forgot password](screens/04-forgot-password.md) | `/forgot` | OTP password reset |
| 05 | [App shell](screens/05-app-shell.md) | all signed-in routes | menu, notifications, command palette, sign-out, step-up dialog, bulk upload dialog, table features |
| 06 | [Dashboard](screens/06-dashboard.md) | `/dashboard` | tiles, a chart per project or marker, waiting approvals |
| 07 | [Company profile](screens/07-company-profile.md) | `/company` | legal identity, address, contact, logo, offer letter format |
| 08 | [Subscription](screens/08-subscription.md) | `/subscription` | plan, usage, invoices; renew, upgrade, contact support |
| 09 | [Policies](screens/09-policies.md) | `/policies` | built-in and custom policies, version history, create a custom policy |
| 10 | [Policy editor](screens/10-policy-editor.md) | `/policies/:key` | new version of shifts, holidays, overtime (with on/off), leave, payment threshold, rules |
| 11 | [Custom policy](screens/11-custom-policy.md) | `/policies/custom/:id` | values and versions of an admin-defined policy |
| 12 | [Projects](screens/12-projects.md) | `/projects` | project list, bulk upload |
| 13 | [New project](screens/13-project-new.md) | `/projects/new` | create a project |
| 14 | [Project detail](screens/14-project-detail.md) | `/projects/:id` | details, milestones, WBS, locations, geo-fence, plan summaries |
| 15 | [Locations](screens/15-locations.md) | `/sites` | location list, bulk upload |
| 16 | [New location](screens/16-location-new.md) | `/sites/new` | create a location |
| 17 | [Location detail](screens/17-location-detail.md) | `/sites/:id` | location details, project chainage range and markers |
| 18 | [Geofences](screens/18-geofences.md) | `/geofences` | geo-fence zones of every project |
| 19 | [Resource planning](screens/19-people-planning.md) | `/people-planning` | manpower needed per project |
| 20 | [Material planning](screens/20-material-planning.md) | `/material-planning` | materials needed per project |
| 21 | [Organogram](screens/21-organogram.md) | `/organogram` | reporting chart, role panel, export |
| 22 | [Departments](screens/22-departments.md) | `/departments` | department master |
| 23 | [Users and roles](screens/23-users-and-roles.md) | `/users` | CORE users (heads, approvers) and organogram roles |
| 24 | [User detail](screens/24-user-detail.md) | `/users/new`, `/users/:id` | create or edit a user, privileges, chains, history |
| 25 | [Approvals](screens/25-approvals-list.md) | `/approvals` | requests waiting for a decision |
| 26 | [Approval detail](screens/26-approval-detail.md) | `/approvals/:id` | request context checks; approve, reject, clarify, publish |
| 27 | [Job openings](screens/27-job-openings.md) | `/job-openings` | job-opening requests, publish to location, offer letter |
| 28 | [Stores](screens/28-stores.md) | `/stores` | store master |
| 29 | [Materials](screens/29-materials.md) | `/materials` | material master and store availability |
| 30 | [Live stock](screens/30-live-stock.md) | `/stock` | stock per store and material (from Stores) |
| 31 | [Equipment register](screens/31-equipment-register.md) | `/equipment/register` | equipment units, four-step registration, details |
| 32 | [Equipment planning](screens/32-equipment-planning.md) | `/equipment/planning` | equipment plan per project, against registered units |
| 33 | [Approval matrix](screens/33-approval-matrix.md) | `/approval-matrix` | approval chains per request type and scope |
| 34 | [New approval chain](screens/34-chain-new.md) | `/approval-matrix/new` | create a chain with levels L1 to L4 |
| 35 | [Chain editor](screens/35-chain-editor.md) | `/approval-matrix/:id` | a new version of a chain |
| 36 | [Grievances](screens/36-grievances-list.md) | `/grievances` | grievances and Head Office visit dates |
| 37 | [Grievance detail](screens/37-grievance-detail.md) | `/grievances/:id` | history, mark visited |
| 38 | [Audit trail](screens/38-audit-trail.md) | `/audit` | read-only change log, export with step-up |
| 39 | [Help and support](screens/39-help.md) | `/help` | FAQ, raise and list tickets |
| 40 | [Not found](screens/40-not-found.md) | `*` | 404 inside the app |
| 41 | [Style guide](screens/41-style-guide.md) | `/style-guide` | developer design reference, not in the menu |

These dialogs are documented inside the screen that opens them:
- step-up, bulk upload, notifications and the command palette ([05](screens/05-app-shell.md));
- "Which policy is changing?" and the custom policy creator ([09](screens/09-policies.md));
- milestone, WBS and zone editors ([14](screens/14-project-detail.md));
- department, role and confirm dialogs ([21](screens/21-organogram.md), [22](screens/22-departments.md), [23](screens/23-users-and-roles.md));
- the store and material forms ([28](screens/28-stores.md), [29](screens/29-materials.md));
- the equipment details dialog ([31](screens/31-equipment-register.md));
- the offer letter preview ([07](screens/07-company-profile.md), [27](screens/27-job-openings.md));
- the renew, upgrade and support dialogs ([08](screens/08-subscription.md)).

## Counts
- **Screens documented:** 41.
- **Entities:** 36 (31 in code, 5 inferred).
- **Endpoints:** 138:
  - 132 for screens;
  - 3 with no screen yet;
  - 3 inbound integrations.

## Most important open questions
1. **Integration contracts with HRMS, PMS, Stores and P&M.** How requests arrive, how decisions go back, how stock is published, and how grievances arrive. PRD §5 leaves these open, and they decide most of the backend.
2. **Identity.** MFA at login or only at step-up; how module users sign in; who approves a company registration; whether the Tenant Admin is a normal user row.
3. **Approver scope.** Do approvers other than the Tenant Admin use CORE screens? If so, which lists and which data scope do they see?
4. **Location or site, and where chainage is edited.** API naming (`/sites` or `/locations`). Chainage belongs to the project but is edited from the location page. Can a location sit in more than one project?
5. **Equipment.** Store the type by ID or by name. Should the owner list come from vendors? Store the registration photos? Is equipment assignment (`assignUnits`) still needed without a screen?
6. **Grievance actions.** The store can confirm, reschedule or mark Not visited, but the screen offers only "Mark visited".
7. **Approval extras in the data model but not the UI:** `amountApproved`, `lineChanges`, chain `isActive`, PMS limit matrix. In scope?
8. **Time zone** for effective dates, visit dates and "today" checks.
