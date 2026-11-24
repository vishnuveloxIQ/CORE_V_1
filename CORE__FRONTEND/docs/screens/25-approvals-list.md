# 25 Approvals (list)

Source: `src/modules/approvals/pages/ApprovalsList.tsx`, `src/modules/approvals/components/columns.tsx`

## 1. Purpose
Lists the requests from every module that must be approved in CORE, so the admin can open one and decide.

## 2. Route & access
- Path: `/approvals`
- Query: `category=<label>`, which can repeat. It preselects the category chips. Values:
  - `Hiring`
  - `Employee actions`
  - `Equipment and material`
  - `Payments and loans`
- Access: Tenant Admin, or any user who is an approver **(inferred)**.

## 3. Data displayed
**Tiles:**
- waiting for decision (Pending plus In review);
- emergency (open requests only);
- approved;
- rejected.

**Tabs (`VIEWS`):** All, Pending (open), Approved, Rejected.

**Columns:**

| Column | Field |
|---|---|
| Request | `code` |
| Type | `type` (`RequestType`) |
| Title / raised by | `title`, `raisedBy`, `module` |
| Level | `currentLevel` (shown as "—" once decided) |
| Raised | `raisedAt`, `emergency` |
| Status | `status`: `Pending`, `In review`, `Approved` or `Rejected` |

**Category of each request type:**

| Category | Request types |
|---|---|
| Hiring | Job opening, Manpower requisition, Offer letter, Onboarded employee list, Recruitment |
| Employee actions | Employee transfer, Promotion, Bonus and incentive |
| Equipment and material | Equipment, Material |
| Payments and loans | Advance payment, Loan and advance |
| Other | Payments |

## 4. User actions
| Control | Effect |
|---|---|
| Approval matrix | Goes to `/approval-matrix`. |
| Review oldest | Opens the oldest open request. |
| Tabs, chips, search (ID, title, person), sort, CSV | In the browser (`core-approvals.csv`). |
| Request code, or Review / View | Goes to `/approvals/:id`. |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/requests?status=Pending,In%20review&category=Hiring&q=...`**
```json
{ "items": [{ "id": "REQ-2041", "code": "REQ-2041", "type": "Equipment", "module": "P&M", "title": "2 excavators for NH-65 camp A", "raisedBy": "Ravi Kumar", "raisedById": null, "raisedAt": "2026-11-05T10:00:00", "chainageId": "CH-1", "emergency": false, "status": "In review", "currentLevel": 2, "chainId": "AC-3", "matrixVersion": 2 }],
  "counts": { "open": 6, "emergency": 1, "approved": 12, "rejected": 2 } }
```
The list does not need `history` or `payload`. Only requests the current user may see or act on should come back **(inferred)**.

## 8. State & side effects
- None. The list only reads.
- New requests come from other modules. The admin would see them sooner with polling or a push **(inferred)**.

## 9. Navigation
- From: the menu, [06 Dashboard](06-dashboard.md), [30 Live stock](30-live-stock.md) (`?category=Equipment+and+material`).
- To: [26 Approval detail](26-approval-detail.md), [33 Approval matrix](33-approval-matrix.md).

## 10. Open questions
- `Payments` falls under no category. Should it join "Payments and loans"?
- Should approvers other than the Tenant Admin use this screen?
