# 39 Help and support

Source: `src/modules/support/pages/Help.tsx`

## 1. Purpose
Answers common questions about CORE, and lets the admin raise a support ticket and see their tickets.

## 2. Route & access
- Path: `/help`
- Access: Tenant Admin.

## 3. Data displayed
| Item | Source |
|---|---|
| FAQ: 26 question and answer pairs, filtered by search | the `FAQ` constant |
| Your tickets: code, subject, category, priority, status (`Open`, `Answered` or `Closed`), createdAt | `useCore.tickets` |

## 4. User actions
| Control | Effect |
|---|---|
| Search help | Filters the FAQ. The empty state "No answers match". |
| Raise ticket | `addTicket(values)` returns a code such as `TKT-12`. Shows "Ticket <code> raised. We reply by email." Resets the form. |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| subject | required, at most 120 |
| category | required. See below. |
| priority | `Low`, `Medium` or `High` |
| description | at least 20 characters: "Describe the problem in at least 20 characters." |

Category choices:
- Company setup and policies
- Projects and locations
- Stores and stock
- Equipment
- Users and access
- Organisation
- Approval matrix
- Grievances
- Bulk upload
- Something else

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/support/tickets`** returns `{ "items": [{ "id": "...", "code": "TKT-12", "subject": "...", "category": "Equipment", "priority": "High", "description": "...", "status": "Open", "createdAt": "...", "raisedById": "U-600" }] }`.
- **POST `/api/v1/support/tickets`** with `{ "subject", "category", "priority", "description" }`.
  - 201 returns the ticket, with `code` assigned by the server.
  - 422 returns field errors.
- **GET `/api/v1/support/faq`**, optional, if the FAQ should be editable **(inferred)**.

## 8. State & side effects
- Emails the support team, and later the reply **(inferred)**.
- Writes no audit entry today.

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- Is support the same service as the "Contact support" message on [08 Subscription](08-subscription.md)?
- Can the admin open a ticket to read the replies?
