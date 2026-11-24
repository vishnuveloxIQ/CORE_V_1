# 08 Subscription

Source: `src/modules/company/pages/Subscription.tsx`, `src/modules/company/data/subscription.ts`

## 1. Purpose
Shows the company's VeloxIQ plan, its usage against plan limits, billing details and invoices. From here the admin can ask to renew, ask to upgrade, or message support.

## 2. Route & access
- Path: `/subscription`
- Access: Tenant Admin.

## 3. Data displayed
| Item | Type | Source |
|---|---|---|
| plan, status (`Active`, `Trial` or `Expired`), billingCycle, autoRenew | string or bool | `SUBSCRIPTION` mock |
| startDate, renewalDate, nextInvoiceDate | ISO date | mock |
| baseAmount, gstRate | number | mock |
| accountId, supportTier, accountManager, paymentMethod, billingEmail | string | mock |
| modules | string[] | mock (`CORE`, `HRMS`, `Stores`, `P&M`, `PMS`) |
| Usage: users, projects, locations, storage | used / limit | used comes from `useCore` (`users.length`, `projects.length`, `sites.length`). The limits come from the mock. Storage use is mock. |
| Invoices | `{ no, date, period, amount, status: 'Paid' \| 'Due' }[]` | `INVOICES` mock |
| Plans (upgrade dialog) | `{ name, price, users, projects, sites, storageGb, support }[]` | `PLANS` mock |

## 4. User actions
| Control | Effect |
|---|---|
| Renew | Opens a dialog. **Request renewal** shows "Renewal requested. Your account manager will contact you." |
| Upgrade | Opens a dialog listing only plans priced above the current one. Pick one, then **Request upgrade**. See below. |
| Contact support | Opens a dialog with subject and message. **Send** shows "Your message has been sent to support." |
| Invoices table | Search, sort and CSV export (`core-invoices.csv`). |

Request upgrade shows "Upgrade to <plan> requested. Your account manager will contact you."

## 5. Forms & validation
| Form | Field | Rule and message |
|---|---|---|
| Upgrade | plan | must pick one (the button stays disabled until then) |
| Contact support | subject | required |
| Contact support | message | at least 10 characters. Message: "Enter a subject and a message of at least 10 characters." |

## 6. Existing API calls
None. The code marks these TODOs:
- `GET /billing/plans`
- `POST /billing/subscription/upgrade-requests { plan }`
- `POST /billing/subscription/renewals`
- `POST /support/messages { subject, message }`

## 7. Backend requirements
**GET `/api/v1/billing/subscription`** **(inferred)**
```json
{
  "plan": "Enterprise", "status": "Active", "billingCycle": "Annual", "autoRenew": true,
  "startDate": "2025-12-01", "renewalDate": "2026-12-01", "nextInvoiceDate": "2026-11-24",
  "baseAmount": 1250000, "gstRate": 18, "accountId": "SUB-VIQ-0042",
  "supportTier": "Priority, 24x7 phone and email", "accountManager": "Meera Nair",
  "paymentMethod": "Bank transfer (NEFT), HDFC Bank ending 4821", "billingEmail": "accounts@veloxiq.co.in",
  "limits": { "users": 250, "projects": 40, "sites": 120, "storageGb": 500 },
  "usage": { "users": 7, "projects": 3, "sites": 4, "storageGb": 182 },
  "modules": ["CORE", "HRMS", "Stores", "P&M", "PMS"]
}
```
**GET `/api/v1/billing/invoices`** returns `{ "items": [{ "no": "INV-2025-118", "date": "2025-12-01", "period": "1 Dec 2025 – 30 Nov 2026", "amount": 1475000, "status": "Paid", "pdfUrl": "..." }] }` **(inferred)**

**GET `/api/v1/billing/plans`** (named in code) returns `{ "items": [{ "name": "Standard", "price": 450000, "users": 50, "projects": 10, "sites": 30, "storageGb": 100, "support": "Email" }] }`

**POST `/api/v1/billing/subscription/upgrade-requests`** (named in code)
- Body: `{ "plan": "Enterprise Plus" }`.
- 201 returns `{ "id": "UPG-12", "status": "Requested" }`.
- 409 if a request is already open **(inferred)**.

**POST `/api/v1/billing/subscription/renewals`** (named in code)
- Body: `{}`.
- 201 returns `{ "id": "REN-3", "status": "Requested" }`.

**POST `/api/v1/support/messages`** (named in code)
- Body: `{ "subject": "...", "message": "..." }`.
- 201 returns `{ "id": "MSG-88" }`.
- 422 if the message is too short.

## 8. State & side effects
- Emails the account manager or support **(inferred)**.
- Usage bars cap at 100%.
- No loading or error states today.

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- Is billing a separate service owned by VeloxIQ? It is not tenant data.
- How is storage use measured?
- Should invoices be downloadable as PDFs? The table has no download link today.
