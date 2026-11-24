# 05 App shell, step-up dialog and bulk upload

Source:
- `src/app/App.tsx`
- `src/modules/shell/components/{Shell,Header,Sidebar,CommandPalette}.tsx`
- `src/modules/shell/config/nav.ts`
- `src/modules/shell/store/useShell.ts`
- `src/shared/lib/stepUp.tsx`
- `src/shared/ui/data/BulkUpload.tsx`
- `src/shared/ui/data/TablePanel.tsx`

## 1. Purpose
The frame around every signed-in screen: the header, sidebar menu, notifications, command palette, account menu and theme switch. It also hosts two shared dialogs that many screens use: **step-up verification** and **bulk CSV upload**.

## 2. Route & access
- Wraps every route except `/`, `/login`, `/register` and `/forgot`.
- Access: signed in. When `useAuth.user` is empty, the guard redirects to `/login?role=admin&next=<path>`.
- Inside the shell, `/` redirects to `/dashboard`. Unknown paths show [40 Not found](40-not-found.md).

## 3. Data displayed
| Item | Type | Source |
|---|---|---|
| Menu groups and items | `NavGroup[]` | `config/nav.ts` (static) |
| Approvals badge | number | Seed `REQUESTS` with status Pending or In review. Counted once at load, so it does not update. |
| Grievances badge | number | Seed `GRIEVANCES` with status Requested. Counted once at load. |
| Notifications | `{ id, icon, title, description, at, to }[]` | the `NOTIFICATIONS` constant (6 items) |
| Read notification IDs | string[] | `useShell.read` (localStorage) |
| Signed-in name and role | "Anil Mehta", "Tenant Admin" | `config/app.ts` |
| Theme and sidebar state | — | `useShell` (localStorage key `veloxiq-shell:v1`) |

## 4. User actions
**Shell**
| Control | Effect |
|---|---|
| Menu item | Opens the page. On phones, the first four items form a bottom bar. |
| Collapse sidebar, or open the menu (phone) | Changes the layout only. |
| Search button, or Ctrl/Cmd+K | Opens the command palette. Choosing a page opens it. |
| Notifications bell | Opens the list. Clicking an item marks it read and opens its page. "Mark all as read" marks all of them. |
| Account menu → Company profile | Goes to `/company`. |
| Account menu → Sign out | Calls `useAuth.logout()`, goes to `/` and shows the toast "Signed out". |
| Theme switch | Light or dark. |

**Step-up dialog.** `requireStepUp(action)` opens "Verify it's you" with the action's name. It is used by:
- saving or deleting a geo-fence zone;
- granting privileges;
- exporting the organogram;
- exporting the audit trail.

| Control | Effect |
|---|---|
| Authenticator code, then Verify | Any 6 digits pass (UI only). Error: "Enter the 6-digit code from your authenticator app." |
| Use passkey | Passes at once (UI only). |
| Cancel | Returns false, and the screen cancels the action. |

**Bulk upload dialog.** Used on these screens:
- Projects, Locations, Stores, Materials;
- Users, Roles, Departments;
- Resource planning, Material planning, Equipment planning;
- the Equipment register and chainage markers.

| Control | Effect |
|---|---|
| Download template | A CSV with the screen's columns and one example row. |
| Choose file | CSV only, at most 1 MB and 500 rows. The screen's `validate` checks every row. |
| Import | Allowed only when every row is valid. Calls `bulkAdd(list, items)` and writes one audit entry. |

**Table panel** (every list): a search box, status chips that can be combined, column sorting, and a CSV export of the visible rows (`exportName`). All of this runs in the browser. There is no paging.

## 5. Forms & validation
- Step-up code: `^\d{6}$`.
- Bulk upload:
  - the file must be `.csv`, at most 1 MB and at most 500 rows;
  - each row must also pass the screen's own checks (see each screen).

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/me`**
```json
{ "id": "U-600", "name": "Anil Mehta", "role": "Tenant Admin", "initials": "AM", "tenantId": "T-1" }
```
**GET `/api/v1/nav-counts`** returns `{ "approvalsPending": 4, "grievanceVisitRequests": 2 }`, so the badges stay current.

**GET `/api/v1/notifications?unread=true`**
```json
{ "items": [{ "id": "n1", "icon": "approvals", "title": "REQ-2041 waiting at L2", "description": "...", "at": "2026-11-06T10:15:00", "to": "/approvals/REQ-2041", "read": false }] }
```
**POST `/api/v1/notifications/{id}/read`** returns 204. **POST `/api/v1/notifications/read-all`** returns 204.

**POST `/api/v1/auth/logout`** returns 204.

**POST `/api/v1/auth/step-up`**
```json
{ "action": "Change the geo-fence for NH65-PKG2", "method": "totp", "code": "123456" }
```
- 200 returns `{ "stepUpToken": "su_...", "expiresAt": "..." }`. The protected request then sends the token in the `X-Step-Up-Token` header.
- 401 returns `STEP_UP_FAILED`.
- A passkey would need WebAuthn challenge and response endpoints **(inferred)**.

**Bulk import.** Each resource needs `POST /api/v1/<resource>/bulk` with `{ "items": [...] }`.
- 201 returns `{ "created": 12, "ids": [...] }`.
- 422 returns `{ "rows": [{ "row": 3, "errors": ["..."] }] }`.
- The server must repeat the row checks and, like the UI, add all rows or none.

## 8. State & side effects
- Theme, sidebar state and read notifications are kept in localStorage, in each browser.
- Toasts (`sonner`) appear at the bottom centre.
- An error boundary resets when the route changes.
- Pages load lazily, with an empty fallback while they load.

## 9. Navigation
Reaches every screen. Notifications open:
- [26 Approval detail](26-approval-detail.md);
- [37 Grievance detail](37-grievance-detail.md);
- [27 Job openings](27-job-openings.md);
- [18 Geofences](18-geofences.md);
- [35 Chain editor](35-chain-editor.md).

## 10. Open questions
- Which events create notifications, and are they pushed live?
- Should the theme and read state follow the user across devices?
- Is step-up done with an authenticator app, a passkey, or either? How long does one step-up stay valid?
