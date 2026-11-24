# 34 New approval chain

Source: `src/modules/approvals/pages/ChainNew.tsx`, `src/modules/approvals/utils/schema.ts`, `src/modules/approvals/components/LevelFields.tsx`

## 1. Purpose
Creates an approval chain for one request type and scope, with its first version of levels L1 to L4.

## 2. Route & access
- Path: `/approval-matrix/new`
- Query: `type=<RequestType>` preselects the request type.
- Access: Tenant Admin.

## 3. Data displayed
- The form.
- "How a chain is selected": a Project chain, then the Company chain.
- The existing chains of the chosen request type.

The module and raised-by text of each type come from a built-in map. For example:
- Advance payment → PMS, raised by "Module head or user";
- Payments → PMS.

## 4. User actions
| Control | Effect |
|---|---|
| Copy from company chain | Copies the Company chain's levels into the form. Shows "Levels copied from the company chain. Change what differs." |
| Create chain | `addChain(chain, firstVersion)`. Shows "<type> chain created for <scope>" and goes to `/approval-matrix/:id`. |
| Cancel, or Back to matrix | Goes to `/approval-matrix`. |

## 5. Forms & validation
| Field | Rule and message |
|---|---|
| requestType | one of the 13 request types: "Choose the request type." |
| scopeType | `Company` or `Project` |
| scopeIds | Project scope: at least 1: "Choose at least one project." |
| levels[4].approverId | L1 is required: "L1 must be set before this request type can be used." See the level rules below. |
| levels[].timeoutHours | a whole number from 1 to 720: "At most 720 hours (30 days)." |
| levels[].onTimeout | `Escalate to next level`, `Escalate to Tenant Admin` or `Remind approver only` |
| levels[].cashLimit (Payments only) | a whole number of rupees, at least 1. See below. |
| levels[].escalateToId (L1 to L3) | optional. See below. |
| effectiveFrom | today or later |
| reason | at least 10 characters |

Level rules for `approverId`:
- No gaps: "Set L<n> first. Levels cannot have gaps."
- No person twice: "This person is already an approver at an earlier level."

Rules for `cashLimit`:
- Each limit must be more than the level before: "Must be more than ₹x (the limit at the level before)."
- The level needs an approver first: "Set the L<n> approver before giving it a cash limit."

Rules for `escalateToId`:
- The level needs an approver first: "Set the L<n> approver before choosing who it escalates to."
- It must not be the approver: "Escalate to someone other than the approver."

Scope clash: a chain of the same type whose scope overlaps is refused. Company: "A company chain … already exists". Project: "Already covered by <chain> (<projects>). Untick those or edit that chain."

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**POST `/api/v1/approval-chains`**
```json
{ "requestType": "Material", "scopeType": "Project", "scopeIds": ["P-102"],
  "firstVersion": { "effectiveFrom": "2026-12-01", "reason": "Separate chain for the metro depot",
    "levels": [{ "approverId": "U-603", "timeoutHours": 24, "onTimeout": "Escalate to next level", "escalateToId": "U-600" }, { "approverId": "", "timeoutHours": 48, "onTimeout": "Escalate to next level" }, { "approverId": "", "timeoutHours": 48, "onTimeout": "Escalate to next level" }, { "approverId": "", "timeoutHours": 48, "onTimeout": "Remind approver only" }] } }
```
- The server fills `name`, `module` and `raisedBy` from the request type.
- 201 returns `ApprovalChain`.
- Errors:
  - 409 `SCOPE_CLASH` (with the clashing chain IDs);
  - 422 with the level rule errors.

**GET `/api/v1/approvers`** returns the people who can be chosen as approvers: active CORE users and the Tenant Admin.

## 8. State & side effects
Writes the audit entry "Approval chain created".

## 9. Navigation
- From: [33 Approval matrix](33-approval-matrix.md).
- To: [35 Chain editor](35-chain-editor.md).

## 10. Open questions
- Who can be an approver: only CORE users, or also HRMS module users?
