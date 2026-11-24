# Screen inventory (CORE-26-02), 2026-11-22

Every screen in the menu, and whether it is ready, gated or deferred. "Ready" means it reads and writes the Core API (v1.6.0), has tests, and passes the automated accessibility check (`src/test/a11y-audit.test.tsx`).

- Menu visibility follows privileges. Items that need a privilege the user lacks are hidden, and opening their address shows the no-access page (`privilegeFor`, `navFor`).
- Only cards that lead somewhere are clickable: the dashboard cards and the approvals filters.

| Area | Screen | Path | State | Notes |
|---|---|---|---|---|
| Overview | Dashboard | `/dashboard` | Ready | Its cards open their lists. Administrators also see when other modules last synced. |
| Company setup | Company profile | `/company` | Ready | GSTIN pre-filled from the PAN and checked locally. Logo sits in the legal identity card. |
| Company setup | Policies | `/policies`, `/policies/:key`, `/policies/custom/:id` | Ready | Versions with compare. Custom policies can be deleted. |
| Company setup | Subscription | `/subscription` | **Gated** | Plan tiers and Stores mapping are open (D17). Upgrade, renewal and support messages have no API. The page shows sample plan data. |
| Projects and locations | Projects | `/projects`, `/projects/new`, `/projects/:id` | Ready | The project ID (code) is fixed after creation. Tabs: milestones, WBS (with status), BOQ, locations, geo-fence. |
| Projects and locations | Locations | `/sites`, `/sites/new`, `/sites/:id` | Ready | Latitude and longitude, plus a chainage tab. |
| Projects and locations | Geofences | `/geofences` | Ready | Changes need a passkey step-up. |
| Projects and locations | Resource planning | `/people-planning` | **Deferred** | No people-plan API yet. Sample data, labelled as such in the code. |
| Projects and locations | Material planning | `/material-planning` | **Deferred** | No material-plan API yet. Sample data. |
| People and organisation | Organogram, Departments | `/organogram`, `/departments` | Ready | |
| People and organisation | Users and roles (Employees) | `/users`, `/users/new`, `/users/:id` | Ready | Shows projects, locations and modules. Login ID is the company prefix plus 4 digits. |
| People and organisation | Approvals | `/approvals`, `/approvals/:id` | Ready | Filters by module, date and level. Only the current approver can decide. Decisions are confirmed and reminded, never escalated. |
| People and organisation | Job openings | `/job-openings` | Ready | |
| Inventory | Stores, Materials, Vendors | `/stores`, `/materials`, `/vendors` | Ready | Vendors are deactivated, never deleted. |
| Inventory | Live stock, Available materials | `/stock`, `/available-materials` | Ready | Read from the stock the Stores module publishes. |
| Equipment | Company equipment register | `/equipment/register` | Ready | Includes the assignment option. |
| Equipment | Maintenance | `/equipment/maintenance` | Ready | Schedules by months or running hours. |
| Equipment | Project equipment planning | `/equipment/planning` | Ready | |
| Governance | Approval matrix | `/approval-matrix`, `/approval-matrix/new`, `/approval-matrix/:id` | Ready | 1 to 4 levels, reminder interval per level. |
| Governance | Grievances | `/grievances`, `/grievances/:id` | Ready | |
| Governance | Audit trail | `/audit` (tabs: Changes, Sign-in history) | Ready | `/audit/access` opens the sign-in tab. |
| Governance | Event monitor | `/integrations/events` | Ready, transport gated | Outbound events stay queued until the transport is chosen (D13). Replay works for dead-letters. |
| Governance | Read models | `/integrations/read-models` | Ready, fixtures gated | No module payloads yet (D15). No stale verdict (D16). |
| Support | Help and support | `/help` | Ready | Troubleshooting answers for sign-outs, conflicts, outages and error references. |

**Public routes:** `/` (landing), `/login`, `/forgot`, `/register`.

**Demo route:** `/style-guide`. It isn't in the menu; keep it for designers or remove it before production.

**Dead links:** none. `src/test/app.test.tsx` checks that every notification points to an existing route.
