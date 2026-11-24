# 36 Grievances (list)

Source: `src/modules/grievances/pages/GrievancesList.tsx`, `src/modules/grievances/utils/visits.ts`

## 1. Purpose
Lists grievances with the person who raised each one, a short message, and the Head Office visit date they asked for. The nearest visits come first.

## 2. Route & access
- Path: `/grievances`
- Access: Tenant Admin.

## 3. Data displayed
| Column | Field |
|---|---|
| Grievance | `code` |
| Raised by / message | `raisedBy`, `message` (at most 10 words) |
| Head Office visit | `visitDate`, plus "Date passed" or a relative day |
| Status | `status`: `Requested`, `Confirmed`, `Rescheduled`, `Visited` or `Not visited` |

Tiles:
- visit requests (Requested);
- upcoming visits (not Requested, dated today or later);
- visits today;
- closed (Visited or Not visited).

## 4. User actions
| Control | Effect |
|---|---|
| Next Head Office visit | Opens the nearest upcoming grievance. |
| Code, or Confirm / Open | Goes to `/grievances/:id`. |
| Search (ID, name, message, date), chips, sort, CSV | In the browser. |

## 5. Forms & validation
None.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/grievances`**
```json
{ "items": [{ "id": "GRV-0118", "code": "G-118", "raisedBy": "M. Lakshmi", "raisedById": "EMP-218", "employeeId": "EMP-218", "subject": "Salary delayed two months", "message": "Salary delayed two months", "visitDate": "2026-11-10", "status": "Requested", "raisedAt": "2026-11-06T08:20:00" }] }
```
**Inbound:** grievances are raised in another module, such as HRMS or a mobile app. So the backend also needs **POST `/api/v1/grievances`**, which checks that `message` has at most 10 words and that `visitDate` is a future date.

## 8. State & side effects
None. The list only reads.

## 9. Navigation
- From: the menu, notifications.
- To: [37 Grievance detail](37-grievance-detail.md).

## 10. Open questions
- Which app do people use to raise grievances?
