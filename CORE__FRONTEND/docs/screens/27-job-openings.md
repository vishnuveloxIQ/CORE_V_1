# 27 Job openings

Source: `src/modules/approvals/pages/JobOpenings.tsx`

## 1. Purpose
Tracks job-opening requests. It shows whether each one is hired directly at the location or posted by Head Office. It lets the admin publish Head Office openings to the location, and view the offer letter format.

## 2. Route & access
- Path: `/job-openings`
- Access: Tenant Admin.

## 3. Data displayed
Rows are the requests with `payload.kind === 'job'`.

| Column | Field |
|---|---|
| Request | `code` |
| Position / project | `payload.position`, `payload.openings`, the project of `chainageId` |
| CTC range | `payload.ctcMin` – `payload.ctcMax` |
| Route | `payload.route` |
| Approval | `status`, `currentLevel` |
| Raised | `raisedAt` |
| Stage | worked out; see below |

The stage is one of:
- Waiting for decision
- Rejected
- Location hires
- Ready to publish
- Published

Tiles: pending decision, direct location hiring, awaiting publication.

The offer letter dialog shows `company.offerLetter` (see [07](07-company-profile.md)).

## 4. User actions
| Control | Effect |
|---|---|
| Offer letter format | Opens a dialog with preview and download. |
| Publish (stage "Ready to publish") | `publishOpening(id)`. Shows a toast. |
| Request code, or Open | Goes to `/approvals/:id`. |
| Search, chips, sort, CSV | In the browser (`core-job-openings.csv`). |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/requests?type=Job%20opening`**, with `payload` included.
- **POST `/api/v1/requests/{id}/publish`** (see [26](26-approval-detail.md)).
- **GET `/api/v1/company/offer-letter`**.

## 8. State & side effects
- Writes the audit entry "Job opening published to location".
- Publishing should notify HRMS, so it posts on the recruitment page **(inferred)**.

## 9. Navigation
- From: the menu, notifications.
- To: [26 Approval detail](26-approval-detail.md).

## 10. Open questions
- What does "published to location" do in HRMS? Is it an API call to HRMS?
