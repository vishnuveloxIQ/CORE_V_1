# 37 Grievance detail

Source: `src/modules/grievances/pages/GrievanceDetail.tsx`, `useCore.updateVisit`

## 1. Purpose
Shows one grievance and its history. The admin records the outcome of the Head Office visit.

## 2. Route & access
- Path: `/grievances/:id`
- Access: Tenant Admin.
- An unknown ID shows "Grievance not found".

## 3. Data displayed
- `code`, `raisedBy`, `message`, `visitDate`, `status`, `raisedAt`.
- `history[]`, each with `status`, `at` and `note`, oldest first.

## 4. User actions
| Control | Effect |
|---|---|
| Back to Grievances | Goes to `/grievances`. |
| Record visit (header) | Scrolls to the visit card. |
| Mark visited | Allowed only on or after `visitDate`. See below. |

Before the visit date, Mark visited shows "The visit is scheduled for <date>. It can be marked only after that date." Otherwise it calls `updateVisit(id, 'Visited', note)` and shows "<code> marked as visited."

The only action allowed from each status (`NEXT`):

| Status | Allowed action |
|---|---|
| Requested, Confirmed, Rescheduled | Mark visited |
| Visited, Not visited | none (the grievance is closed) |

The store's `updateVisit(id, to, note, visitDate?)` can also confirm, reschedule (with a new date) or mark Not visited. **No button calls those today.**

## 5. Forms & validation
| Field | Rule |
|---|---|
| note | optional. It is shared with the person who raised the grievance. |

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
- **GET `/api/v1/grievances/{id}`** returns `Grievance` with `history`.
- **POST `/api/v1/grievances/{id}/visit`**
  ```json
  { "status": "Visited", "note": "Met HR, salary released", "visitDate": "2026-11-10" }
  ```
  - `status` is one of `Confirmed`, `Rescheduled`, `Visited` or `Not visited`.
  - `visitDate` is needed only for Rescheduled.
  - 200 returns the updated grievance.
  - Errors:
    - 409 `INVALID_TRANSITION`;
    - 422 `VISIT_NOT_DUE` (Visited before the date);
    - 422 `DATE_IN_PAST` (when rescheduling).

## 8. State & side effects
- Writes the audit entries "Head Office visit <status>" and "Head Office visit moved to <date>".
- The note is shared with the person who raised the grievance, so notify them by SMS, email or app **(inferred)**.

## 9. Navigation
- From: [36 Grievances](36-grievances-list.md), notifications.
- To: [36 Grievances](36-grievances-list.md).

## 10. Open questions
- Should the admin be able to confirm, reschedule or mark Not visited? The store supports it, but the screen offers only "Mark visited". The notification asks to "confirm or reschedule".
