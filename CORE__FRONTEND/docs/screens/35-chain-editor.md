# 35 Approval chain editor

Source: `src/modules/approvals/pages/ChainEditor.tsx`, `src/modules/approvals/utils/schema.ts`

## 1. Purpose
Shows one approval chain: the version in force, the rules, and all versions. The admin can save a new version of its levels. Requests already raised keep the version they were raised under.

## 2. Route & access
- Path: `/approval-matrix/:id`
- Access: Tenant Admin.
- An unknown ID shows "Chain not found".

## 3. Data displayed
- The current version:
  - effectiveFrom, updatedBy, reason;
  - each level's approver, timeout, timeout rule, escalate-to person and cash limit (Payments only).
- The note "Not usable yet" when L1 is empty.
- The rules card.
- The versions table: version, date, levels set, by, reason.

## 4. User actions
| Control | Effect |
|---|---|
| Back | Goes to `/approval-matrix`. |
| New version | Opens the editor, starting from the latest version. |
| Save new version | `addChainVersion(chainId, { effectiveFrom, reason, levels })`. Shows a toast with the version and date. |
| Reset, or Cancel | Throws the changes away. |

## 5. Forms & validation
`versionSchema` uses the same level, effective-date and reason rules as [34 New chain](34-chain-new.md). Cash limits apply only when `requestType === 'Payments'`.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/approval-chains/{id}`** returns `ApprovalChain` with all `versions`.
- **POST `/api/v1/approval-chains/{id}/versions`** with `{ "effectiveFrom": "...", "reason": "...", "levels": [MatrixLevel x4] }`.
  - 201 returns `MatrixVersion`. The server sets `version`, `updatedAt` and `updatedBy`.
  - 422 returns the level rule errors.
- Versions are never edited or deleted.

## 8. State & side effects
- Writes the audit entry "New matrix version vN".
- New requests use the version in force on the day they are raised.

## 9. Navigation
- From: [33 Approval matrix](33-approval-matrix.md), [34 New chain](34-chain-new.md), [24 User detail](24-user-detail.md), notifications.
- To: [33 Approval matrix](33-approval-matrix.md).

## 10. Open questions
- When a user is deactivated, what happens to chains where they are an approver?
