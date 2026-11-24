# VeloxIQ CORE non-functional requirements (from the frontend)

What the backend must provide beyond the endpoints. **(inferred)** marks items that the code does not show directly.

## 1. Authentication and session
**Today**
- One demo admin. The ID and a SHA-256 password hash are built into the bundle (`useAuth.ts`, marked "DEMO ONLY").
- The session is kept in `sessionStorage` (`veloxiq-core-auth:v1`) and ends when the tab closes.
- 5 failed attempts lock sign-in for 30 seconds. The counter is in the browser.
- The user login, registration and password reset are UI only. OTPs are made in the browser and shown in a toast.

**Needed**
- Server-side login with hashed passwords (argon2 or bcrypt) **(inferred)**.
- An HttpOnly, Secure, SameSite session cookie, or a short-lived token with refresh **(inferred)**.
- The lock counter and lock state on the server.
- PRD §4 asks for **MFA** and **one active session per user**. Admin password reset and user deactivation must end the user's sessions.
- `mustChangePassword` forces a change at the next login. A new user gets a temporary password by email.
- A sign-in page needs a secure context. The admin login refuses plain http unless on localhost.

## 2. Roles and permissions
| Role | Source | Can do |
|---|---|---|
| Tenant Admin | built in (`TENANT_ADMIN` "Anil Mehta"; approver ID `ADMIN_APPROVER`) | every screen in this app |
| Module head | `CoreUser.role = 'Module head'` with `modules[]` and `privileges[]` | privileges are listed, but no screen in this app checks them **(inferred: used by HRMS, PMS, Stores and P&M)** |
| Approver | `CoreUser.role = 'Approver'`, or any person chosen in a chain level | decide requests at their level **(inferred: no approver-only view exists)** |
| Module user | lives in HRMS; uses the user login | no access to CORE screens today |

Rules the server must enforce:
- **One active module head per module.** Enforced in the form, the bulk upload and reactivation.
- **Segregation of duties.** The person who raised a request can never approve it. The UI disables the buttons when `raisedById` is the admin's own ID.
- **Scope.** `scopeType` and `scopeIds` limit a user to projects. The CORE screens do not filter by scope, so the server should filter lists for scoped users **(inferred)**.
- **Privileges** are granted one by one, and adding them needs step-up.

## 3. Step-up authentication
`requireStepUp(action)` asks for a 6-digit authenticator code or a passkey before:
- saving or deleting a geo-fence zone ([14](screens/14-project-detail.md), [18](screens/18-geofences.md));
- adding privileges to a user ([24](screens/24-user-detail.md));
- exporting the organisation structure ([21](screens/21-organogram.md));
- exporting the full audit trail ([38](screens/38-audit-trail.md)).

The check itself is UI only today: any 6 digits pass.

Needed:
- a TOTP or WebAuthn check on the server;
- a short-lived step-up token sent as `X-Step-Up-Token`;
- the server, not the client, decides which actions need it;
- audit entries say "(step-up verified)".

Open: how long one step-up stays valid.

## 4. Audit
- Every write in `useCore` appends `{ id, at, user, action, entity, entityId, before, after }`.
- The audit is read-only in the UI: no edit or delete.
- The backend must:
  - write entries in the same transaction as the change;
  - store the user ID as well as the name;
  - keep entries append-only and tamper-evident **(inferred)**;
  - page with a cursor.
- Exports must themselves be audited. Today the frontend writes no entry for an export.

## 5. Versioning and effective dates
- Policies, custom policies, approval chains and geo-fence zones are **never overwritten**. Each change adds a version.
- Policy and chain versions carry `effectiveFrom` (today or later) and a `reason` of at least 10 characters.
- The version **in force** on a date is the highest version whose `effectiveFrom` is on or before that date. Later ones are "scheduled".
- An approval request keeps the `chainId` and `matrixVersion` it was raised under. Chain changes never affect requests already in flight.
- Other modules need "the version in force on date X" (HRMS attendance and overtime, payroll, PMS payment threshold).

## 6. Approval workflow engine (server side)
- Chain selection: a Project chain that covers the request's project, else the Company chain (`chainFor`). The project comes from the request's `chainageId` (`projectOf`).
- Levels L1 to L4. The stop level is the last level set. For **Payments**, it is the first set level whose `cashLimit` covers the amount (`stopLevel`).
- Timeouts: each level has `timeoutHours` (1 to 720) and `onTimeout`:
  - escalate to the next level;
  - escalate to the Tenant Admin;
  - remind only.
  - Optional `escalateToId` for absence.
  - This needs a **scheduler or job runner** **(inferred)**.
- Decisions must check that the actor is the approver at `currentLevel`. Use optimistic locking (send `level`, return 409 on a mismatch).
- Outcomes must reach the module that raised the request: HRMS executes transfers, promotions, bonuses and loans; Stores executes transfers and purchases; P&M handles equipment. Use webhooks or events **(inferred)**.

## 7. File uploads and storage
| Upload | Types | Max size | Where |
|---|---|---|---|
| Company logo | PNG, JPG, SVG | 512 KB | [07](screens/07-company-profile.md) |
| Offer letter format | PDF, DOC, DOCX | 2 MB | [07](screens/07-company-profile.md) |
| Equipment photos and documents (machine, chassis, engine, meter, invoice, insurance, PUC) | images, or a camera capture | not limited in code | [31](screens/31-equipment-register.md) |
| Bulk CSV | `.csv` | 1 MB and 500 rows | [05](screens/05-app-shell.md) |

- Today files are held as base64 data URLs in memory, and equipment files are dropped.
- Needed:
  - object storage with private, signed download URLs;
  - type checks on the server (by content, not extension), size limits and malware scanning **(inferred)**;
  - SVG logos must be sanitised, or served with a safe content type **(inferred)**.
- The offer letter keeps a `fileId` and `revision`. Replacing it gives a new `fileId`.

## 8. Search, filtering, sorting, paging
- Every list uses `TablePanel`: free-text search, multi-select status chips, column sort and CSV export of the visible rows. **All in the browser, with no paging.**
- That works for master data (projects, sites, stores, materials, users, roles: tens to hundreds of rows).
- It will not scale for **requests**, **audit**, **stock** and **equipment units**. These need server-side `q`, filters, sort and cursor paging, and an export endpoint. When the server pages, the frontend must switch those tables to server mode.
- Deep-link query params the frontend already uses, which the backend list filters should match:
  - `?project=` (dashboard);
  - `?store=` (live stock);
  - `?category=` (approvals);
  - `?type=` (new chain);
  - `?tab=` and `?edit=` (detail pages);
  - `?role=` and `?dept=` (organogram);
  - `?next=` and `?role=` (login).

## 9. Real-time and freshness
- Nothing polls today. The sidebar badges are counted once at load from seed data.
- Needs **(inferred)**:
  - live badge counts and notifications, by polling `/nav-counts` or with SSE or WebSocket;
  - stock that refreshes on open or by push from Stores;
  - new requests and grievances from other modules show without a reload.

## 10. Notifications and messaging
- In-app notifications are a constant list today. Read state is kept in localStorage.
- Email or SMS needed:
  - OTPs (registration, password reset);
  - temporary passwords (new user, reset);
  - the grievance visit note to the person who raised it;
  - support ticket replies;
  - renewal and upgrade requests to the account manager;
  - approver reminders and escalations.

## 11. Third-party integrations
| Integration | Used by | Status |
|---|---|---|
| OpenStreetMap tiles `tile.openstreetmap.org` | geo-fence map | live from the browser; check the tile usage policy, or self-host for production **(inferred)** |
| Esri World Imagery `server.arcgisonline.com` | satellite view | live from the browser; licence terms apply **(inferred)** |
| PAN lookup (GSTIN, CIN, TAN) | [07](screens/07-company-profile.md) | named in a code comment; no provider chosen |
| Email and SMS gateway | OTP, passwords, notes | not chosen |
| HRMS, PMS, Stores, P&M modules | requests in, decisions out, stock in, grievances in, policies out | contracts not written (PRD §5) |
| GPS device feed | `EquipmentUnit.lat`, `lng`, `lastPing` | "GPS device not decided", Release 2 |
| Billing service | [08](screens/08-subscription.md) | mock |

## 12. Data and format conventions
- **Time zone.** Timestamps are local, without a zone (`nowISO()` gives `yyyy-MM-dd'T'HH:mm:ss`). "Today" checks (effective dates, visit dates) use the browser's local date. The backend should store UTC and agree on the tenant zone (IST assumed **(inferred)**). The "today or later" rules must use that zone on both sides.
- **Money** is in INR, as whole numbers in most places (contract value, cash limits, payment threshold). Display uses Indian grouping.
- **Phone numbers:** most forms use Indian 10-digit mobiles (`^[6-9]\d{9}$`). Registration takes 6 to 15 digits plus a country code.
- **Codes** are upper-case `A–Z 0–9 -`, unique per entity per tenant.
- **IDs:** the server should assign all IDs and readable codes (`REQ-n`, `TKT-n`, `G-n`). Today the browser makes some.

## 13. Multi-tenancy
The frontend models a single company. Every table needs a tenant key, and every query must be scoped to the caller's tenant **(inferred)**. The login ID stem (for example `VELOX`) looks tenant-specific.

## 14. Security notes found in the code
1. **Credentials are built into the bundle** (the admin ID and password hash). They must be removed once the backend exists.
2. **Client-side lockout and step-up** can be bypassed. They must move to the server.
3. **The `?next=` redirect** is limited to in-app paths (`safeNext`). Keep the same rule on any server redirect.
4. **CSV export** happens in the browser for every table, without step-up, except the full audit and organogram exports. Decide which exports of personal data (users, phones, emails) need step-up or an audit entry.
5. **CSV injection:** imported and exported cells that start with `=`, `+`, `-` or `@` should be escaped on export **(inferred)**.
6. **The 10-word grievance limit** and the other limits are checked only in the UI. The server must repeat every check in the screen files.
7. **Uploaded SVG and Office files** can carry active content. Sanitise them or serve them as attachments.
8. **Map tiles** load from third-party hosts, which a Content-Security-Policy must allow.
9. **The style guide route** `/style-guide` is reachable in production.
10. **Segregation of duties** is only a disabled button today. The server must refuse self-approval.

## 15. Performance and limits
- Bulk upload: at most 500 rows and 1 MB per file. Imports are all-or-nothing.
- Geo-fence: at most 60 pins per zone.
- Pages are lazy-loaded. API responses for the lists should stay small (light list shapes, details on demand).
