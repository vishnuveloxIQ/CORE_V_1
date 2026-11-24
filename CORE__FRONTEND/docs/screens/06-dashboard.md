# 06 Dashboard

Source: `src/modules/dashboard/pages/Dashboard.tsx`

## 1. Purpose
The admin's home page. It shows what needs attention: open approvals, low stock, active projects and open grievances. It has a chart per project, or per chainage marker when one project is chosen.

## 2. Route & access
- Path: `/dashboard`. This is also where the app lands after sign-in.
- Query: `project=<projectId>` (optional). It filters the chart and the approvals table.
- Access: Tenant Admin, signed in.

## 3. Data displayed
| Item | How it is worked out | Source |
|---|---|---|
| Waiting for approval (tile) | requests with status `Pending` or `In review` | `useCore.requests` |
| Low stock (tile) | stock rows that are not "In stock" (see the level rule below) | `stock`, `materials` |
| Active projects (tile) | projects with status `Active` | `projects` |
| Grievances (tile) | grievances with status Requested, Confirmed or Rescheduled | `grievances` |
| Bar chart, all projects | per project: stores, open requests, and in-stock, low and out-of-stock rows | `stores`, `stock`, `requests` through `projectOf(chainageId)` |
| Bar chart, one project | the same counts per chainage marker (`label`, `km`) | `project.chainage.markers` |
| Awaiting approvals table | open requests, filtered by project: code, type, title, raised by, module, level, raised date, emergency, status | `requests` |

Stock level for one row:
- `qty === 0` is **Out of stock**;
- `qty - reserved < material.reorderLevel` is **Low stock**;
- anything else is **In stock**.

## 4. User actions
| Control | Effect |
|---|---|
| Open approvals | Goes to `/approvals`. |
| Project filter on the chart | Sets or clears `?project=` with replace. |
| Request code or Review button | Goes to `/approvals/:id`. |
| Table search, chips, sort and CSV export | In the browser (`core-waiting-approvals.csv`). |

## 5. Forms & validation
None.

## 6. Existing API calls
None. Everything is computed from the in-memory store.

## 7. Backend requirements (inferred)
The page can be built from the list endpoints. A summary endpoint avoids loading every record:

**GET `/api/v1/dashboard?projectId=P-101`**
```json
{
  "tiles": { "waitingForApproval": 6, "lowStock": 4, "activeProjects": 2, "openGrievances": 3 },
  "chart": {
    "groupBy": "marker",
    "rows": [{ "label": "Camp A", "full": "CH 12.5 km · Camp A", "stores": 1, "requests": 2, "available": 5, "low": 1, "out": 0 }]
  },
  "waiting": [{ "id": "REQ-2041", "code": "REQ-2041", "type": "Equipment", "title": "2 excavators", "raisedBy": "Ravi Kumar", "module": "P&M", "currentLevel": 2, "raisedAt": "2026-11-05T10:00:00", "emergency": false, "status": "In review", "chainageId": "CH-1" }]
}
```
- Without `projectId`, `groupBy` is `project` and each row's `label` is the project code.
- 404 `PROJECT_NOT_FOUND` for an unknown project.

## 8. State & side effects
- Chart and table recompute on every render.
- No polling. Counts are as fresh as the store.
- The empty state "No chainage markers yet" shows when the chosen project has no markers.

## 9. Navigation
- From: sign-in, the menu, [40 Not found](40-not-found.md).
- To: [25 Approvals](25-approvals-list.md), [26 Approval detail](26-approval-detail.md).

## 10. Open questions
- Should "Low stock" count rows (as now) or materials?
- Which projects can a scoped user see on this page? The dashboard has no scoping today.
