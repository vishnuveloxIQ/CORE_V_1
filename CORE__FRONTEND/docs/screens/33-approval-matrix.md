# 33 Approval matrix (list of chains)

Source: `src/modules/approvals/pages/ApprovalMatrix.tsx`, `chainState` in `useCore`

## 1. Purpose
Lists every approval chain. A chain is one request type at one scope, with up to four levels. A Project chain overrides the Company chain of the same type.

## 2. Route & access
- Path: `/approval-matrix`
- Access: Tenant Admin.

## 3. Data displayed
`ApprovalChain` fields:
- `id`, `name`, `requestType`, `module`, `raisedBy`;
- `isActive`, `timeoutHours`;
- `scopeType`, `scopeIds`;
- `versions[]`.

| Column | How it is worked out |
|---|---|
| Request type | `requestType` |
| Applies to | "Company-wide", or "Project: <codes>" |
| Chain | "L1 <name> → L2 <name> …", with "(up to ₹x)" for Payments cash limits |
| Levels | levels set, out of 4 |
| Version | the version in force and its date, and any scheduled version |
| State | Ready (L1 is set) or Not usable |

Tiles: the number of chains, Project chains, and chains that are not usable.

## 4. User actions
| Control | Effect |
|---|---|
| Approvers and heads | Goes to `/users`. |
| New approval chain | Goes to `/approval-matrix/new`. |
| Request type, or Edit chain | Goes to `/approval-matrix/:id`. |
| Chips (scope or state), search, sort, CSV | In the browser (`core-approval-matrix.csv`). |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/approval-chains`**
```json
{ "items": [{ "id": "AC-7", "name": "Material chain", "requestType": "Material", "module": "Stores", "raisedBy": "Store keeper", "isActive": true, "timeoutHours": 24,
  "scopeType": "Project", "scopeIds": ["P-101"],
  "current": { "version": 2, "effectiveFrom": "2026-06-01", "reason": "...", "updatedBy": "Anil Mehta", "updatedAt": "...", "levels": [{ "approverId": "U-603", "approverName": "R. Rao", "timeoutHours": 24, "onTimeout": "Escalate to next level" }] },
  "latestVersion": 2, "ready": true, "levelsSet": 2 }] }
```

## 8. State & side effects
None.

## 9. Navigation
- From: the menu, [25 Approvals](25-approvals-list.md).
- To: [34 New chain](34-chain-new.md), [35 Chain editor](35-chain-editor.md), [23 Users](23-users-and-roles.md).

## 10. Open questions
- `isActive` exists on the chain, but no screen turns it off. Is deactivating a chain needed?
