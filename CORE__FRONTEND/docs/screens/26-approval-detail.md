# 26 Approval detail (decide a request)

Source: `src/modules/approvals/pages/ApprovalDetail.tsx`, `useCore.decide`, `clarify`, `publishOpening`, `chainFor`, `stopLevel`

## 1. Purpose
Shows one request in full:
- its details, with a card that depends on the request type;
- context checks against plans, stock and policies;
- the approval chain and history.

The admin approves, rejects or asks for clarification at the current level.

## 2. Route & access
- Path: `/approvals/:id`
- Access: the approver at the request's current level. In the demo this is the Tenant Admin.
- Segregation of duties: when `raisedById` is the admin's own ID, the decision buttons are disabled with "You raised this request".
- An unknown ID shows "Request not found".

## 3. Data displayed
**Request card:**
- `code`, `type`, `module`, `title`, `raisedBy`, `raisedAt`;
- the chainage marker and its project;
- `status`, `currentLevel`;
- `emergency`, which adds the note "The emergency flag raises priority only. It never bypasses approval."

**Payload card, by `payload.kind`:**

| kind | Fields | Extra context shown |
|---|---|---|
| equipment | `equipmentType, qty, from, to, justification` | The planned quantity for this type and project (`planLines`), units of the type held, units at this marker, units available. The note "GPS device not decided". |
| material | `materialId, qty, neededBy, storeId, decision?` | Live stock in other stores: on hand, free, and whether it can cover the need. |
| payment | `amount, payee, purpose` | Payment routing against the current `payment-threshold` policy: below it, PMS pays at the location; at or above it, Head Office pays. |
| loan | `employee, empId, amount, tenureMonths, purpose` | The same routing card. |
| recruitment | `position, count, decision?, candidate?` | Hire locally, or send from Head Office. |
| job | `position, openings, ctcMin, ctcMax, experience, route?, postedOnHrms, publishedToSite?` | A Publish button when Head Office posts and the opening is not yet published. |
| offer | `candidate, position, ctc, joining` | — |
| onboarding | `employees[{ name, position, joining }]` | — |
| mrf | `position, count, reason, requiredBy` | — |
| transfer | `employee, empId, designation, fromSiteId, toSiteId, effective, reason` | Location names. The note that HRMS moves the employee after approval. |
| promotion | `employee, empId, fromRole, toRole, currentCtc, newCtc, effective, justification` | — |
| bonus | `basis, scope, headcount, amount, period, criteria` | The average per person. |

**Approval chain card:**
- the chain ID, its scope and `matrixVersion`;
- each level's approver, timeout and timeout rule;
- for Payments, the cash limits and which level the amount stops at.

**History:** `history[]`, each with `level`, `by`, `action`, `at`, `comment`, and optionally `amountApproved` and `lineChanges`.

**Outcome card** once the request is decided.

## 4. User actions
| Control | Effect |
|---|---|
| Back to approvals | Goes to `/approvals`. |
| Decide (header) | Scrolls to the decision card. |
| Next request | Goes to `/approvals` once the request is decided. |
| Material: Transfer from store X, or Vendor purchase plus the vendor name | Sets the decision. It is required before Approve. |
| Recruitment: Hire locally, or Head Office plus the candidate's name | Required before Approve. |
| Job opening: Location hires directly, or Head Office posts and sends a candidate | Required before Approve. |
| Approve | `decide(id, 'Approved', comment, payloadWithDecision)`. See below. |
| Reject | Needs a comment of at least 5 characters. `decide(id, 'Rejected', comment)`. Shows "<id> rejected". |
| Clarify | Needs a comment of at least 5 characters. `clarify(id, comment)` adds a `Commented` history row and leaves the level and status as they were. Shows "<id>: clarification requested". |
| Publish (job, Head Office route) | `publishOpening(id)` sets `payload.publishedToSite` to now. Shows "Opening published to <project>". |

Approve moves the request to the next level, or to `Approved` at the stop level, and shows "<id> approved at L<n>". For Payments, the stop level is the first set level whose `cashLimit` covers the amount; a level with no limit covers any amount.

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| comment | optional for Approve. At least 5 characters for Reject ("Give a reason for rejecting (at least 5 characters).") and for Clarify ("Write what needs clarifying (at least 5 characters)."). |
| material route | "Choose a store transfer or a vendor purchase." / "Choose the store to transfer from." / "Enter the vendor name." (at least 2 characters) |
| recruitment route | "Choose to hire locally or send a candidate from Head Office." / "Enter the Head Office candidate's name." (at least 2 characters) |
| job route | "Choose whether the location hires directly or Head Office posts the opening." |

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/requests/{id}`** returns the full `ApprovalRequest`, plus the resolved chain version:
```json
{ "id": "REQ-2039", "code": "REQ-2039", "type": "Material", "module": "Stores", "title": "Cement for camp B", "raisedBy": "S. Babu", "raisedById": null, "raisedAt": "2026-11-04T14:40:00",
  "chainageId": "CH-6", "emergency": true, "status": "Pending", "currentLevel": 1, "chainId": "AC-5", "matrixVersion": 1,
  "payload": { "kind": "material", "materialId": "M-1", "qty": 400, "neededBy": "2026-11-08", "storeId": "ST-2" },
  "history": [{ "level": 0, "by": "S. Babu", "action": "Raised", "at": "2026-11-04T14:40:00", "comment": "" }],
  "chain": { "levels": [{ "approverId": "U-600", "approverName": "Anil Mehta", "timeoutHours": 24, "onTimeout": "Escalate to next level" }] } }
```

**Context reads:**
- `GET /api/v1/equipment/plan-lines?projectId=&type=`;
- `GET /api/v1/equipment/units?type=`;
- `GET /api/v1/stock?materialId=`;
- `GET /api/v1/policies/payment-threshold/current`.

**POST `/api/v1/requests/{id}/decisions`**
```json
{ "action": "Approved", "level": 1, "comment": "Transfer from camp A", "decision": { "route": "Transfer", "fromStoreId": "ST-1" } }
```
- 200 returns the updated request.
- Errors:
  - 409 `LEVEL_MISMATCH` when someone else already acted;
  - 403 `NOT_APPROVER_AT_LEVEL`;
  - 403 `SELF_APPROVAL`;
  - 409 `ALREADY_DECIDED`;
  - 422 `DECISION_REQUIRED`.

The decision fields depend on the kind:
- material: `{ route: 'Transfer' | 'Vendor purchase', fromStoreId?, vendor? }`;
- recruitment: `{ decision: 'Local' | 'Head Office', candidate? }`;
- job: `{ route }`.

**POST `/api/v1/requests/{id}/clarifications`** with `{ "comment": "..." }`. 201. It notifies the person who raised the request.

**POST `/api/v1/requests/{id}/publish`** (job only). 200 returns `{ "publishedToSite": "2026-11-19T10:00:00" }`. 409 if it is already published or the route is not Head Office.

The server must work out the next level from the chain version saved on the request. Chain changes never affect requests already in flight.

## 8. State & side effects
- Audit entries:
  - "Approved at Ln" and "Rejected at Ln";
  - "Clarification requested";
  - "Job opening published to location".
- Tell the module that raised the request about each decision (HRMS, PMS, Stores, P&M) by webhook or event **(inferred)**.
- Notify the next approver **(inferred)**.
- Timeouts: each level has `timeoutHours` and `onTimeout` (escalate to the next level, escalate to the Tenant Admin, or remind only). This needs a server scheduler **(inferred)**.

## 9. Navigation
- From: [25 Approvals](25-approvals-list.md), [06 Dashboard](06-dashboard.md), [27 Job openings](27-job-openings.md), notifications.
- To: [25 Approvals](25-approvals-list.md).

## 10. Open questions
- The page title shows `req.id`, not `req.code`. Are they always the same?
- Approvers may edit line items (`lineChanges`) and approve a smaller payment amount (`amountApproved`). The data model allows both, but the UI cannot do either. Are they in scope?
- Who raises requests, and through which API? Inbound endpoints for each module are needed.
- Does "Clarify" send the request back to the person who raised it, or only leave a comment?
