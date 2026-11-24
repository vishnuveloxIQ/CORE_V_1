# VeloxIQ CORE — screens

Screens for the CORE module described in `../reqs/veloxiq-core-prd-v2.md` (Draft v1.1), built on the VeloxIQ Layout Kit (Classic). The header, sidebar, footer and design tokens come from the kit unchanged, so CORE matches the other modules.

## Run
```bash
npm install --legacy-peer-deps    # Node 22+
npm run dev                       # http://localhost:5173
```
| Command | Purpose |
|---|---|
| `npm run typecheck` · `lint` · `test` | Checks. Tests open every route (including detail pages) inside the frame |
| `npm run build` | Production build in `dist/` |

## Sign in
Open the app and sign in with login ID `admin` and the password you were given. Every screen redirects to `/login` until you do; *Sign out* is in the account menu. Five wrong passwords lock sign-in for 30 seconds. The session lasts until the tab is closed.

> **Demo only.** There is no backend, so this sign-in runs in the browser and anyone with the built files can get past it. The password is stored only as a SHA-256 hash (`src/store/useAuth.ts`), never as plain text. Before production, replace `checkCredentials` with the real auth service (MFA or passkey, one active session per user — PRD §4). Sign-in needs https or localhost.

## Screens (PRD section → route)
| PRD | Screen | Route |
|---|---|---|
| — | Dashboard | `/dashboard` |
| — | Sign in | `/login` |
| 3.7, 3.9 | Approvals inbox and request decision (equipment vs plan, live stock transfer/vendor, payment threshold routing, local/HO recruitment, offer, job opening, MRF, onboarding list) | `/approvals`, `/approvals/:id` |
| 3.6 (v2) | Employee transfer, promotion, bonus and incentive, loan and advance — CORE approves, HRMS executes; loans use threshold routing | `/approvals/:id` |
| 3.11 (v2) | Job openings: site hires directly or HO posts and sends a candidate; publish HO openings to the site. Quick action opens the offer letter format | `/job-openings` |
| 3.8 | Grievances: grievance ID, who raised it, a message of up to 10 words and the HO visit date; confirm, move, or mark visited / not visited | `/grievances`, `/grievances/:id` |
| 3.1 | Company profile (legal IDs, address, contacts, logo) and the one **offer letter format** file (Tenant Admin replaces it) | `/company` |
| 3.1 | Policies: shift count, holidays (+ site/project variants), overtime, leave, payment threshold, rules — each versioned with effective date and reason | `/policies`, `/policies/:key` |
| Org | People and organisation (menu group with job openings): departments, roles with grades and reporting lines, and the organogram drawn from them (chart or list, highlight, fold, zoom) | `/organogram`, `/departments`, `/roles` |
| 3.2 | Projects: details, milestones, WBS, linked sites | `/projects`, `/projects/new`, `/projects/:id` |
| 3.3 | Sites: details, planning, geo-fence on a map (polygon pins, circle, or linear corridor along a road or canal; step-up), chainage. `?tab=Geo-fence&edit=1` opens a tab in edit mode | `/sites`, `/sites/new`, `/sites/:id` |
| 3.4 | Inventory: stores, material masters (most used categories as chips), live stock | `/stores`, `/materials`, `/stock` |
| 3.5 | Equipment planning and register (Release 2, GPS blocked) | `/equipment/planning`, `/equipment/register` |
| 3.7 | Approval matrix L1–L4, versioned, per request type and scope (company, project or site; the most specific wins). *New approval chain* creates one | `/approval-matrix`, `/approval-matrix/new`, `/approval-matrix/:id` |
| 3.6 | CORE users: create module heads (one or more modules each) and high-level approvers (not taken from HRMS); scope, privileges (step-up), deactivate, reset password | `/users`, `/users/new`, `/users/:id` |
| §4 | Audit trail | `/audit` |
| 3.10 | Help: searchable FAQ and ticket form | `/help` |

## How it is put together
- `src/data/types.ts` — domain model. `src/data/seed.ts` — sample data (replace with the APIs in PRD §5).
- `src/store/useCore.ts` — in-memory store. Every change writes an audit entry; policies and approval chains only ever add versions.
- `src/lib/stepUp.tsx` — step-up verification dialog used for geo-fence changes, privilege grants and every CSV export. UI only; the real check belongs to the auth service.
- `src/lib/core.ts` — status tones, lifecycle rules and shared validators.
- Forms use react-hook-form + zod through the kit's `FormGroup`.

## Screen conventions
- **Quick action:** every screen has one primary button at the top right of the header (same colour as the dashboard button).
- **Stat cards** show a solid icon block, uppercase title and big number. They never filter; some link to another page. Lists filter with their own chips (several at once); `chipLimit` shows only the most used values with the rest under *More*.
- **View first, then edit:** detail tabs, company profile, policies, approval chains and users show what is saved and open the form from *Edit*.
- **Bulk upload** (`src/components/data/BulkUpload.tsx`): template download, CSV drop zone, every row checked with the form rules, good rows added, error report for the rest. Used on projects, sites, stores, materials, users, equipment planning, holidays and chainage markers.
- **Notifications** open the page that needs the action (`to` in `src/config/app.ts`).
- **Geo-fence map** (`src/components/map/GeoMap.tsx`) uses Leaflet with OpenStreetMap and Esri imagery tiles, so it needs internet access.

## Menu icons
Each menu item has its own icon (checked by a test). New icons are added in `src/theme/icons.tsx` under "CORE additions", one meaning each.

## Changes to kit files
- `components/data/TablePanel.tsx` — CSV export asks for step-up verification first (PRD §4).
- `components/layout/Header.tsx` — *Sign out* in the account menu now signs out; *Company profile* replaces the placeholder profile item.
- `App.tsx` — `/login` sits outside the frame; every other route needs a signed-in user.
- `components/ui/StatTile.tsx` — new card layout (no filter mode).
- `components/data/TablePanel.tsx` — chips allow several picks; `chipLimit` / `chipRank` show the most used chips with a *More* list; `initialPicked` preselects chips from a link.
- `components/layout/Header.tsx` — a notification opens its action page.
- `components/ui/PageHead.tsx` — breadcrumb links (home and the parent page).
- `components/layout/Sidebar.tsx` — a menu item stays highlighted on its detail pages (`/projects/P-101` keeps *Projects* active).
- `styles/core.css` — small additions, tokens only, imported after the kit styles.

## Not real yet
- Data is sample data and resets on reload. Menu badge counts are taken from the sample data at load.
- Privilege catalogues, GPS, stock and equipment feeds are placeholders until the blocking questions in PRD §6 are answered.
- PRD v2 open question 6 (are loans the same records as advance payments?) is shown on the screens and not decided here. Question 7 no longer applies: there is one offer letter format, replaced only by the Tenant Admin.
- Bulk upload runs in the browser on sample data; a real import should run on the server in one transaction.
- Changes from review round 3 are listed at the top of `../reqs/veloxiq-core-screens-prd.md` and `../reqs/veloxiq-core-srs.md` (Revision 1.1).
