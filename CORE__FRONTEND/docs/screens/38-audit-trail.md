# 38 Audit trail

Source: `src/modules/audit/pages/AuditTrail.tsx`, `log()` in `useCore`

## 1. Purpose
A read-only record of who changed what in CORE, and when. Entries cannot be edited or deleted.

## 2. Route & access
- Path: `/audit`
- Access: Tenant Admin. Exporting needs **step-up**.

## 3. Data displayed
`AuditEntry` fields:
- `id`, `at`, `user`;
- `action`, `entity`, `entityId`;
- `before`, `after`.

| Column | Field |
|---|---|
| Date/Time | `at` |
| Name/Purpose | `user`, `action` |
| Record | `entityId`, turned into a readable code by looking it up in projects, sites, stores, materials, units, users, requests, grievances, tickets, departments, roles or chains |
| Before / After | free text |
| Area | `entity` |

`entity` values seen in code:
- Company, Policy, Project, Location, Store, Material;
- Equipment plan, People plan, Material plan, Equipment, Equipment unit;
- User, Department, Role, Approval chain, Request, Grievance.

## 4. User actions
| Control | Effect |
|---|---|
| Export all entries | Asks for **step-up**, then downloads a CSV of every entry. Shows "Audit trail exported: N entries". |
| Chips (area, up to 6 shown), search, sort, CSV export of the visible rows | In the browser. The table footer says "Export needs step-up verification". |

## 5. Forms & validation
None.

## 6. Existing API calls
None. Each store action writes its own entry with `user = ME` (the Tenant Admin's name).

## 7. Backend requirements (inferred)
- **GET `/api/v1/audit?entity=&entityId=&user=&from=&to=&q=&cursor=&limit=`**
  ```json
  { "items": [{ "id": "...", "at": "2026-11-06T09:15:00", "user": "Anil Mehta", "userId": "U-600", "action": "Store updated", "entity": "Store", "entityId": "ST-1", "entityCode": "STR-A", "before": "Previous details", "after": "STR-A · Camp A main store" }], "nextCursor": "..." }
  ```
- **GET `/api/v1/audit/export.csv`**, with `X-Step-Up-Token`. Streams every entry. The export itself is logged.
- The server writes audit entries **inside the same transaction** as each change. The client never posts audit entries.

## 8. State & side effects
- The trail grows without limit, so it needs cursor paging. The table loads everything today.
- Retention and immutability are set on the server (append-only).

## 9. Navigation
- From: the menu.
- To: none.

## 10. Open questions
- Should `before` and `after` hold structured JSON diffs instead of text? Today several actions log "Previous details".
- How long are audit entries kept?
