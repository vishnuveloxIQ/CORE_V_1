# 10 Policy editor (one built-in policy)

Source:
- `src/modules/company/pages/PolicyEditor.tsx`
- `src/modules/company/components/editors.tsx`
- `src/modules/company/components/PolicyView.tsx`
- `src/modules/core-data/utils/scope.ts` (`versionFields`)

## 1. Purpose
Shows one built-in policy: the version in force, its full history, and a form to save a new version. The overtime policy also has an on/off toggle.

## 2. Route & access
- Path: `/policies/:key`. `key` is one of `shifts`, `holidays`, `overtime`, `leave`, `payment-threshold` or `rules`.
- Query: `edit=1` opens the new-version form straight away.
- Access: Tenant Admin.
- An unknown key shows "Policy not found".

## 3. Data displayed
- The version in force:
  - version, effectiveFrom, createdBy and reason;
  - `data`, shown by `PolicyView`.
- The versions list.
- Data shape per key:

| Key | `data` shape |
|---|---|
| shifts | `{ shiftsPerDay, notes, timings?: [{ name, start "HH:mm", end "HH:mm" }], weekOff?: { type, saturdays?, days? } }` |
| holidays | `{ year, holidays: [{ name, date, endDate?, type }], variants: [{ scope: 'Project', scopeId, holidays: [...] }] }` |
| overtime | `{ mode: 'Automatic' \| 'Manual', weekdayRate, holidayRate, minMinutes, dailyCapHours, monthlyCapHours, requiresApproval, enabled? }` |
| leave | `{ leaveTypes: [{ name, code, annualDays, accrual, carryForward, maxCarryDays, expiryMonths, encashable, paid }], legalNote }` |
| payment-threshold | `{ amount, currency: 'INR' }` |
| rules | `{ rules: [{ title, category, body, ackRequired }] }` |

## 4. User actions
| Control | Effect |
|---|---|
| All policies | Goes to `/policies`. |
| New version, or Edit as new version | Opens the editor, which starts from the latest version. |
| Save (in the editor) | `addPolicyVersion(key, effectiveFrom, reason, data)`. Shows "<Title>: vN saved, effective <date>". |
| Reset or Cancel | Throws the changes away. |
| Overtime toggle "Overtime policy enabled" | Saves a new version effective today, copied from the latest version with `enabled` flipped. See below. |

The overtime toggle:
- The reason is "Overtime turned off by admin" or "Overtime turned on by admin".
- It is disabled while a future version is scheduled.

## 5. Forms & validation
**Every version also needs:**
- `effectiveFrom`: today or later ("Must be today or later. Past payroll and attendance never change.");
- `reason`: at least 10 characters.

**shifts**
- shiftsPerDay: 1 to 4. Messages: "At most 4 shifts per day." and "Define timings for every shift."
- notes: at most 300 characters.
- timings[]:
  - name: required, at most 40 ("Name the shift.");
  - start and end: `HH:mm` ("Set a start time." and "Set an end time.");
  - an end before the start means the shift crosses midnight.
- weekOff.type: `Every Sunday`, `Alternate Saturdays`, `Rotating` or `Custom days`.
  - `saturdays`: `1st & 3rd` or `2nd & 4th`.
  - `days` is required for Custom days, at most 80 ("Enter the week-off days, e.g. Sunday, Wednesday.").

**holidays**
- year: 2020 to 2100.
- holidays: at least 1 ("Add at least one holiday.").
  - name: required.
  - date: required ("Pick a date.") and inside the year ("Date must be in <year>.").
  - endDate: not before date ("To cannot be before From.").
  - No two holidays may overlap ("Another holiday covers these dates.").
- variants[].scopeId: a project ("Choose a project.").

**overtime**
- weekdayRate and holidayRate: 1 to 4.
- minMinutes: 0 to 240.
- dailyCapHours: 0 to 12.
- monthlyCapHours: 0 to 200, and not below the daily cap ("Monthly cap cannot be below the daily cap.").
- `enabled` is carried over from the base version. The form does not change it.

**leave**
- leaveTypes: at least 1.
- code: `^[A-Z]{1,4}$` and unique ("Code already used.").
- annualDays: 0 to 365.
- expiryMonths: 0 to 60.
- maxCarryDays must be 0 when carry-forward is off ("Must be 0 when carry-forward is off.").

**payment-threshold**
- amount: at least 1.
- currency: `INR`.

**rules**
- rules: at least 1.
- title: required.
- category: `Conduct`, `Safety`, `Attendance`, `IT` or `General`.
- body: at least 10 characters.
- ackRequired: boolean.

## 6. Existing API calls
None.

## 7. Backend requirements (inferred)
**GET `/api/v1/policies/{key}/versions`**
```json
{ "items": [{ "id": "overtime-v1", "key": "overtime", "version": 1, "effectiveFrom": "2026-01-01", "reason": "...", "createdBy": "Anil Mehta", "createdAt": "2025-12-20T10:00:00", "data": { "mode": "Automatic", "weekdayRate": 2, "holidayRate": 2, "minMinutes": 30, "dailyCapHours": 4, "monthlyCapHours": 50, "requiresApproval": true, "enabled": true } }] }
```
**POST `/api/v1/policies/{key}/versions`**
```json
{ "effectiveFrom": "2026-12-01", "reason": "Raise holiday rate for 2027", "data": { } }
```
- 201 returns the new version. The server assigns `version = max + 1`.
- 422: field errors, or `EFFECTIVE_DATE_IN_PAST`.
- 404: unknown key.
- Versions are never updated or deleted.

The server should also offer **GET `/api/v1/policies/{key}/current?on=2026-11-19`** for HRMS, PMS and payroll to read **(inferred)**.

## 8. State & side effects
- Writes the audit entry "New policy version vN".
- Other modules (HRMS, payroll, PMS) need to learn about a new version, by event or by reading it **(inferred)**.
- The form remounts after a save, so it starts from the newest version.

## 9. Navigation
- From: [09 Policies](09-policies.md).
- To: [09 Policies](09-policies.md).

## 10. Open questions
- Can a scheduled (future) version be cancelled or replaced?
- If an OT-off version is scheduled for later, should the toggle replace it? It is disabled today.
- Holiday variants exist only per project. Should locations be able to have them too?
