# Workflow Architecture

This document describes how the runtime workflows in VeloxIQ Core work today: approval requests, approval chains and matrix versions, the grievance visit flow, job-opening publishing, and the audit trail. It is derived from the code. Where behaviour is stored or shown but not executed, that is stated explicitly.

For the module layout and import rules, see [ARCHITECTURE.md](ARCHITECTURE.md).

Key files:

| Concern | File |
|---|---|
| All workflow mutations and selectors | `src/modules/core-data/store/useCore.ts` |
| Types (`ApprovalRequest`, `ApprovalChain`, `MatrixVersion`, `MatrixLevel`, `RequestAction`, `Grievance`) | `src/modules/core-data/types/index.ts` |
| Approval detail and decision card | `src/modules/approvals/pages/ApprovalDetail.tsx` |
| Chain create and edit | `src/modules/approvals/pages/ChainNew.tsx`, `ChainEditor.tsx`, `components/LevelFields.tsx`, `utils/schema.ts` |
| Grievance visit states | `src/modules/grievances/utils/visits.ts` |
| Grievance detail and visit actions | `src/modules/grievances/pages/GrievanceDetail.tsx` |
| Job openings | `src/modules/approvals/pages/JobOpenings.tsx` |
| Seed data | `src/modules/core-data/data/seed.ts` |

---

## 1. Approval requests

### 1.1 Request record

An `ApprovalRequest` holds:

- `type`: the request type (for example `Payments`).
- `siteId`, `projectId` and `raisedById` for scope and ownership.
- `status`: one of `Pending`, `In review`, `Approved`, `Rejected`.
- `currentLevel`: the 1-based level currently waiting for a decision.
- `chainId`: the chain the request was routed through.
- `matrixVersion`: the version of that chain in force when the request was raised.
- `payload`: type-specific data. For `Payments` it includes `amount`. For job openings it includes `route` and `publishedToSite`.
- `emergency`: a flag, described in 1.6.
- `history`: a list of `RequestAction` entries.

### 1.2 Status lifecycle

The status is written only by `decide()` in `useCore.ts`:

```
Pending / In review
   │  decide(Approved)  and currentLevel < stop  → In review, currentLevel + 1
   │  decide(Approved)  and currentLevel >= stop → Approved   (final)
   │  decide(Rejected)                           → Rejected   (final, any level)
```

`Pending` is the state after creation. The store does not contain a function that creates new requests. Seed requests are loaded with their status already set. Request creation therefore comes from code outside the store, and I have not verified that path.

Open requests are those in `Pending` or `In review`. The decision card in `ApprovalDetail.tsx` appears only for open requests.

### 1.3 Decision mechanics

`decide(id, action, comment, payload?)`:

1. Finds the request. Returns if it is missing.
2. Resolves the chain. It uses `req.chainId` when set. Otherwise it calls `chainFor()` (see section 2).
3. Looks up the levels of the chain version pinned on the request: `chain.versions.find(v => v.version === req.matrixVersion).levels`.
4. Computes the stop level with `stopLevel(levels, amount)` (see section 3).
5. Sets `isFinal = action === 'Rejected' || req.currentLevel >= stop`.
6. Sets the new status (table above) and advances `currentLevel` unless the decision is final.
7. Appends `{ level, by: ME, action, at, comment }` to `history` and writes an audit entry through `log()`.

The `action` values the store emits are `Approved` and `Rejected`. The type also defines `Escalated`, `Raised` and `Commented`, but nothing in the store emits them. They are reserved and unused.

### 1.4 Self-approval guard

In `ApprovalDetail.tsx`, `selfApproval = req.raisedById === ADMIN_APPROVER.id`. When it is true, both Approve and Reject are disabled. This check is in the UI only. `decide()` does not repeat it, so a direct store call would not be blocked.

### 1.5 Level state labels

The detail page labels each level with one of: **Waiting** (current level), **Done** (decided), **Upcoming** (not reached yet), **Not needed for this amount** (beyond the stop level for the request's amount), or **Not configured** (no approver set).

### 1.6 Emergency flag

`emergency` is shown as a badge, and it changes sort order in the approvals list. It does not change routing, the stop level, or who can decide. The UI describes it as raising priority only. Approval is never bypassed.

---

## 2. Approval chains and resolution

### 2.1 Chain scope

Each chain is an `ApprovalChain` with a `requestType` and a scope: a Site, a Project, or the Company. Chain ids take the form `AC-n`. `addChain` creates a chain at version 1.

### 2.2 Resolution order: `chainFor(chains, sites, type, siteId)`

For a request type and site:

1. A chain scoped to that **Site**, if one exists.
2. Otherwise a chain scoped to the site's **Project**.
3. Otherwise the **Company** chain for that type.

Resolution happens when a request is created or seeded. The result is stored in `chainId`. Later decisions use that stored id, so a change to resolution rules does not reroute requests already in flight.

### 2.3 Versions

Each chain has `versions: MatrixVersion[]`. A `MatrixVersion` has a version number, an `effectiveFrom` date, and `levels: MatrixLevel[]`.

- `addChainVersion` appends a version numbered `versions.length + 1`. The new version starts from the latest one.
- `chainState(chain, today)` returns the version in force today, whether level 1 is set (`ready`), and how many levels are set.
- Existing requests keep the version number stored in `matrixVersion`. Matrix edits never change the rules for in-flight requests.

### 2.4 Levels

A `MatrixLevel` has:

- `approverId`
- `timeoutHours`: integer 1–720, validated in `utils/schema.ts`.
- `onTimeout`: one of `Escalate to next level`, `Escalate to Tenant Admin`, `Remind approver only`.
- `cashLimit?`: used only by `Payments` (section 3.2).

Defaults from `blankLevels()`: four levels. Level 1 has a 24-hour timeout and the others 48 hours. Level 4 defaults to `Remind approver only`.

Two rules are enforced in the schema and the editors:

- The last configured level cannot use `Escalate to next level`, because there is no next level.
- Level 4 is forced to `Remind approver only` in `ChainNew.tsx` and `ChainEditor.tsx`.

### 2.5 Timeouts: stored and shown, not executed

`timeoutHours` and `onTimeout` are saved and displayed. I searched the source outside tests for timers, schedulers, or any code that reads these fields to act. None was found. **No timeout escalates or reminds anyone at runtime.** Treat this as a gap until a scheduler exists.

---

## 3. Stop level and cash-limit bands

`stopLevel(levels, amount?)` decides how far a request travels.

### 3.1 Default

With no amount (any type other than `Payments`), the stop level is the last configured level. Every configured level must approve.

### 3.2 Payments with cash limits

For `Payments`, the stop level is the first configured level whose `cashLimit` is either undefined or at least the request amount. If no level matches, the stop level is the last level. A level without a `cashLimit` acts as the catch-all for its band.

This means a small payment can stop at level 1, and a large one continues to a higher level.

CHANGES_TODO.md section D lists "9 Cash-limit approval matrix" as still open. Check the item against this description before relying on it.

---

## 4. Audit trail

`log()` writes an audit entry for decisions (`decide`) and visit updates (`updateVisit`). I did not verify that chain, version and publish actions all call `log()`, so check that before relying on it. The audit log is shown in the `audit` module (`src/modules/audit/pages/AuditTrail.tsx`). Every workflow change should go through a store action so that it is logged.

Each request also keeps its own `history` (section 1.3). The audit log is the cross-module record. The request history is the per-request record.

---

## 5. Grievances and Head Office visits

### 5.1 Statuses

`GrievanceStatus` is one of `Requested`, `Confirmed`, `Rescheduled`, `Visited`, `Not visited`.

`visits.ts` defines:

- `isUpcomingVisit(s)`: true for `Requested`, `Confirmed`, `Rescheduled`.
- `VISIT_TONE`: the display tone for each status.
- `wordCount(t)`: used for the 10-word limit on messages.

### 5.2 Transitions

`GrievanceDetail.tsx` defines the actions available from each status:

| From | Actions available |
|---|---|
| Requested | Confirm visit → Confirmed; Reschedule visit → Rescheduled |
| Confirmed | Mark visited → Visited; Mark not visited → Not visited; Reschedule visit → Rescheduled |
| Rescheduled | Mark visited → Visited; Mark not visited → Not visited; Reschedule visit → Rescheduled |
| Visited | none (closed) |
| Not visited | none (closed) |

`updateVisit(id, to, note, visitDate?)` does the following:

1. Sets the new status.
2. Sets `visitDate` when one is given. The reschedule action passes the new date.
3. Appends `{ status, at, note }` to the grievance history.
4. Writes an audit entry.

**Visited** and **Not visited** close the grievance. The detail page shows a closing note in each case. For Not visited, it says the person may raise a new grievance with another visit date.

---

## 6. Job openings and publishing

Job requests have `payload.kind === 'job'`, a `route`, and a `publishedToSite` timestamp.

- Route `Head Office posts and sends candidate`: once the request is `Approved`, it can be published. `ApprovalDetail.tsx` shows **Publish to site** only when the request is Approved, the route matches, and nothing is published yet. `JobOpenings.tsx` shows the same action.
- `publishOpening(requestId)` sets `payload.publishedToSite` to the current time. It only applies to job requests.
- Route `Site hires directly`: no publishing step. The site hires directly.
- A route change on a job request resets `publishedToSite` to `null` when the new route needs publishing, or to `undefined` otherwise (`ApprovalDetail.tsx` around line 324).

---

## 7. Known gaps and open items

| # | Item | Status |
|---|---|---|
| 1 | Approval timeouts (`timeoutHours`, `onTimeout`) are stored and displayed but never executed. | Not implemented |
| 2 | `Escalated`, `Raised`, `Commented` actions exist in the type but are never emitted. | Unused |
| 3 | Self-approval is blocked only in the UI, not in `decide()`. | Partial |
| 4 | The emergency flag affects sort and badge only. | By design, to confirm |
| 5 | Request creation is not in the store. The creation path is unverified. | Unverified |
| 6 | CHANGES_TODO.md section D: "9 Cash-limit approval matrix" and "10 Approvers 'Rejected' filter". | Open |
| 7 | Test `sends a signed-out visitor to the login page` (`src/test/app.test.tsx`, around line 16) fails. It may relate to uncommitted changes in `src/modules/auth/pages/Login.tsx`. | Not investigated |
| 8 | Test "remove pin 4" (map pins, around line 401) failed once and passed on rerun. | Intermittent |
| 9 | Register page was not checked in the browser preview. Tests and `tsc --noEmit` pass. | Not verified in browser |

---

## 8. Changing these workflows

- Route every state change through a `useCore` action so it is audited and snapshotted correctly.
- Never edit a chain version that requests already use. Add a new version with `addChainVersion`.
- Keep the stop-level rules in `stopLevel()`. Do not duplicate them in components.
- If you add timeout execution, define the scheduler, its owner, and how it writes to `history` and the audit log before changing `onTimeout` behaviour.
