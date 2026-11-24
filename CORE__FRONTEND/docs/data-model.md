# VeloxIQ CORE data model (from the frontend)

Read from `src/modules/core-data/types/index.ts`, `useCore.ts`, `seed.ts` and the screens. The field names below are the ones the frontend uses. Keep them in API payloads (camelCase), so the backend plugs in without frontend changes. Database column names can differ. The companion data dictionary [VeloxIQ_CORE_application_document.md](VeloxIQ_CORE_application_document.md) maps them to `core_*` tables.

Conventions used by the frontend:
- `id` is the stable key. New records get a uuid (`newId()`), but seed data uses readable IDs (`P-101`, `S-201`, `REQ-2039`).
- `code` is the readable code shown to people. It is unique per entity and upper-case `^[A-Z0-9-]+$`, 2 to 16 characters.
- Dates are `yyyy-MM-dd`. Timestamps are local `yyyy-MM-dd'T'HH:mm:ss` with **no time zone**.
- Status enums are written exactly as below, including spaces and capitals.
- Versioned data (policies, matrix chains, geo-fence zones) is never overwritten. A change adds a version.

Entity count: **31 entities in code** (marked C) and **5 inferred** for the backend (marked I), **36 in total**.

## 1. Company and tenant

### CompanyProfile (C), one per tenant
| Field | Type | Constraints |
|---|---|---|
| legalName | string | required |
| tradeName | string | |
| pan | string | `^[A-Z]{5}\d{4}[A-Z]$` |
| gstin | string | 15 characters, GSTIN pattern; from the PAN lookup |
| cin | string | 21 characters, CIN pattern |
| tan | string | `^[A-Z]{4}\d{5}[A-Z]$` |
| addressLine1, city, state, country | string | required |
| addressLine2 | string | |
| pin | string | `^\d{6}$` |
| contactName | string | required |
| contactEmail | string | email |
| contactPhone | string | `^[6-9]\d{9}$` |
| website | string | empty or a URL |
| logo | string | data URL today. Should become a file URL. PNG, JPG or SVG, at most 512 KB. |
| offerLetter | OfferLetterFile \| null | |

### OfferLetterFile (C)
| Field | Type | Constraints |
|---|---|---|
| fileId | string | new on every replacement |
| fileName, mimeType | string | pdf, doc or docx |
| size | number | bytes, at most 2 MB |
| dataUrl | string | becomes a download URL |
| revision | number | +1 on every replacement |
| updatedAt, updatedBy | timestamp, string | |

### Subscription (C, mock), Invoice (C, mock), Plan (C, mock)
- Subscription: plan, status (`Active`, `Trial` or `Expired`), billingCycle, autoRenew, startDate, renewalDate, nextInvoiceDate, baseAmount, gstRate, accountId, supportTier, accountManager, paymentMethod, billingEmail, `limits { users, projects, sites, storageGb }`, `modules[]`.
- Invoice: `no`, `date`, `period`, `amount`, `status` (`Paid` or `Due`).
- Plan: `name`, `price`, `users`, `projects`, `sites`, `storageGb`, `support`.

These belong to VeloxIQ billing, not to tenant data. See [08](screens/08-subscription.md).

## 2. Policies

### PolicyVersion (C)
| Field | Type | Constraints |
|---|---|---|
| id | string | `<key>-v<n>` today |
| key | `shifts` \| `holidays` \| `overtime` \| `leave` \| `payment-threshold` \| `rules` | |
| version | number | max + 1 per key |
| effectiveFrom | date | today or later when created |
| reason | string | at least 10 characters |
| createdBy, createdAt | string, timestamp | |
| data | one of the shapes below | |

`data` shapes:
- **shifts**:
  - `shiftsPerDay` (1 to 4) and `notes` (at most 300);
  - `timings?: { name, start, end }[]` (HH:mm);
  - `weekOff?: { type: 'Every Sunday'|'Alternate Saturdays'|'Rotating'|'Custom days', saturdays?: '1st & 3rd'|'2nd & 4th', days? }`.
- **holidays**:
  - `year` (2020 to 2100);
  - `holidays: { name, date, endDate?, type: 'National'|'Festival'|'Optional'|'Regional' }[]` (at least 1, no overlaps);
  - `variants: { scope: 'Project', scopeId, holidays[] }[]`.
- **overtime**:
  - `mode: 'Automatic'|'Manual'`;
  - `weekdayRate`, `holidayRate` (1 to 4);
  - `minMinutes` (0 to 240), `dailyCapHours` (0 to 12), `monthlyCapHours` (0 to 200, at least the daily cap);
  - `requiresApproval: boolean`;
  - `enabled?: boolean`, where missing means on.
- **leave**:
  - `leaveTypes: { name, code (^[A-Z]{1,4}$, unique), annualDays (0 to 365), accrual: 'Yearly'|'Monthly', carryForward, maxCarryDays (0 if no carry), expiryMonths (0 to 60), encashable, paid }[]`;
  - `legalNote`.
- **payment-threshold**: `{ amount (at least 1), currency: 'INR' }`.
- **rules**: `{ rules: { title, category: 'Conduct'|'Safety'|'Attendance'|'IT'|'General', body (at least 10), ackRequired }[] }`.

The version in force on a date is the highest version with `effectiveFrom` on or before that date.

### CustomPolicyDef (C)
`id`, `name` (at most 60), `description` (at most 400), `createdBy`, `createdAt`, and `fields: CustomField[]` (at least 1, labels unique).

CustomField: `id`, `label` (at most 60), `type: 'text'|'longtext'|'number'|'date'|'yesno'|'select'`, `required`, `options?: string[]` (select only, at least 2).

### CustomPolicyVersion (C)
`id` (`<policyId>-v<n>`), `policyId` → CustomPolicyDef, `version`, `effectiveFrom`, `reason`, `createdBy`, `createdAt`, `values: Record<fieldId, string|number|boolean>`.

## 3. Organisation

### Department (C)
| Field | Type | Constraints |
|---|---|---|
| id, code | string | code unique |
| name | string | at most 60, unique ignoring case |
| parentId | string \| null | → Department; no loops |
| headRoleId | string \| null | → Role in this department |
| description | string | at most 300 |
| color | int | 0 to 7 |
| colorHex | string? | `#RRGGBB` |
| status | `Active` \| `Inactive` | Inactive only with no active roles and no active sub-departments |

### Role (C), a position on the organogram
| Field | Type | Constraints |
|---|---|---|
| id, code | string | code unique |
| title | string | at most 60 |
| departmentId | string | → Department (active) |
| grade | enum `GRADES` | E executive, M manager, S staff, W workmen bands |
| reportsToId | string \| null | → Role. Exactly one active role has null. No loops. |
| positions | int | 1 to 500 |
| holder | string | at most 60; only when positions = 1 |
| description | string | at most 300 |
| status | `Active` \| `Inactive` | Inactive only with no active direct reports |

### CoreUser (C)
| Field | Type | Constraints |
|---|---|---|
| id | string | |
| loginId | string | `^[A-Za-z0-9]{3,6}\d{4}$`, unique ignoring case, stored upper-case |
| name | string | at most 80 |
| email | string | unique |
| phone | string | `^[6-9]\d{9}$` |
| designation | string | required |
| role | `Module head` \| `Approver` | |
| modules | `('HRMS'\|'PMS'\|'Stores'\|'P&M')[]` | module head: at least 1. **One active head per module.** |
| scopeType | `Company` \| `Project` | |
| scopeIds | string[] | → Project; at least 1 when Project |
| privileges | string[] | from the `PRIVILEGES` catalogue of the chosen modules; empty for approvers |
| status | `Active` \| `Inactive` | |
| mustChangePassword | boolean | true on create and on reset |
| lastLogin | timestamp \| null | |
| createdAt | timestamp | |
| employeeId? | string | HRMS employee number |
| positionId? | string | → Role |

Privilege catalogue (`PRIVILEGES`), per module:
- `<m>.users.manage`
- `<m>.requests.raise`
- `<m>.reports.view`
- `<m>.approve`
- plus `pms.payments.release` and `stores.transfer.raise`

Here `<m>` is `hrms`, `pms`, `stores` or `pm`.

The **Tenant Admin** ("Anil Mehta", `ADMIN_APPROVER`) is not in `users`. It is a separate built-in identity and can be chosen as an approver.

## 4. Projects and locations

### Project (C)
| Field | Type | Constraints |
|---|---|---|
| id, code | string | code unique |
| name, client | string | required |
| startDate, endDate | date | end after start |
| status | `Planning` \| `Active` \| `On hold` \| `Completed` | |
| value | number | INR, at least 0 |
| description | string | at most 500 |
| milestones | Milestone[] | weights add up to at most 100 |
| wbs | WbsNode[] | |
| plan | SitePlan | `{ startDate, endDate, peakWorkforce, workingDays, weekOff?, notes }`. **Not shown on any screen.** |
| zones | GeoZone[] | |
| chainage | `{ startKm, endKm, markers: ChainageMarker[] }` | endKm > startKm |
| locationIds | string[] | → Site (many-to-many) |

### Milestone (C), child of Project
`id`, `name`, `due` (date), `weight` (1 to 100), `status: 'Not started'|'In progress'|'Done'`.

### WbsNode (C), child of Project
`id`, `code` (`^\d+(\.\d+)*$`, unique, starts with the parent's code), `name`, `parentId` (→ WbsNode or null). It cannot be removed while it has children.

### ChainageMarker (C), child of Project
`id` (`CH-n`), `km` (inside the range, unique per project), `label`, `wbsCode` (→ WbsNode.code or ""). **Referenced by** Store, EquipmentUnit, EquipmentAssignment and ApprovalRequest through `chainageId`.

### GeoZone (C), child of Project; extends GeoFence
| Field | Type | Constraints |
|---|---|---|
| id, label | string | label required |
| type | `Head Office` \| `Mess` \| `Store yard` \| `Gate` \| `Other` | |
| shape | `Radius` \| `Polygon` \| `Linear` | |
| centerLat, centerLng | number | 6 decimals |
| radiusM | number | Radius: 50 to 5,000; otherwise 0 |
| points | `[lat, lng][]` | Polygon: 3 to 60 pins, no self-intersection. Linear: 2 to 60 pins. |
| bufferM | number | Linear: 5 to 1,000 m on each side; otherwise 0 |
| version | number | +1 on every save |
| updatedAt, updatedBy | timestamp, string | |

### Site (C), shown as "Location"
`id`, `code` (unique), `name`, `addressLine`, `city`, `state`, `pin` (6 digits), `inCharge`, `phone`, `email`, `status`. A site holds no project link. Projects point at sites through `locationIds`.

## 5. Planning

### PeoplePlanLine (C)
`id`, `projectId` → Project, `role` (free text), `headcount` (int, at least 1), `from`, `to` (to after from), `status: 'Planned'|'Confirmed'|'Fulfilled'`.

### MaterialPlanLine (C)
`id`, `projectId`, `materialId` → Material, `qty` (at least 1), `uom`, `requiredBy`, `storeId` → Store, `status: 'Planned'|'Requested'|'Ordered'|'Received'`.

### PlanLine, the equipment plan (C)
`id`, `equipmentType` (the type **name**), `projectId`, `plannedQty` (int, at least 1), `from`, `to`, `reason` (at least 3).

### PmsLimitRow (C, seed only, no screen)
`tier`, `priority: 'Emergency'|'Normal'`, `amount: number|null`, `days`, `hours`, `minutes`, `final?`. Named in code as `GET/PUT /pms-limits`.

## 6. Inventory

### Store (C)
`id`, `code` (unique), `name`, `chainageId` → ChainageMarker, `locationId` → Site, `location` (the **address** text), `keeper`, `phone`, `status`.

### Material (C)
`id`, `code` (unique), `name`, `category` (14 fixed values), `uom` (9 fixed values), `hsn` (`^\d{4,8}$`), `reorderLevel` (at least 0), `storeIds` → Store[] (at least 1), `status`.

### StockRow (C), published by Stores
`id`, `storeId`, `materialId`, `qty` (on hand), `reserved`, `updatedAt`. Free stock = `qty - reserved`. Unique per store and material **(inferred)**.

## 7. Equipment

### EquipmentTypeMaster (C)
`id`, `code` (`ET-<prefix>`), `name`, `meterKind: 'Hours'|'Kilometres'|'None'`, `meterPrecision`, `fuelNormUnit: 'L/hr'|'km/L'|'None'`, `toleranceSettingKey`, `active`.

### Vendor (C)
`id`, `code`, `name`, `status: 'Pending'|'Active'|'Inactive'`, `approvalRequestId?`, `gstin`, `pan`, `email`, `phone`, `address`, `registeredBy` → user, `verifiedAt`. There is no screen. It is held as data.

### EquipmentUnit (C)
Fields:
- Identity:
  - `id`;
  - `assetCode` (unique);
  - `name?`, `type` (the type **name**);
  - `makeModel`, `regNo`, `ownershipType?`.
- Position:
  - `chainageId`;
  - `lat`, `lng`, `lastPing` (all null until GPS exists).
- State: `availability: 'Available'|'In use'|'Under maintenance'|'Breakdown'`.
- 27 optional detail strings:
  - manufacturer, model, mfgYear, chasisNo, engineNo;
  - capacity, capacityUnit, meterType, meterReading;
  - fuelType, fuelNorm, tankCapacity;
  - invoice, insurance, PUC, registration and fitness numbers and dates;
  - owner, hireRef, agreementStart, agreementEnd;
  - warrantyEnd, warrantyReading, currentLocation.
- `vendorId?` → Vendor.

### EquipmentAssignment (C, no screen)
`id`, `equipmentType` (name), `projectId`, `chainageId`, `qty`, `assignedAt`, `assignedBy` (user ID).

## 8. Approvals

### ApprovalChain (C)
`id`, `name`, `requestType` (13 values), `module`, `raisedBy` (text), `isActive`, `timeoutHours`, `scopeType`, `scopeIds` → Project[], `versions: MatrixVersion[]`.

Rules:
- At most one chain per (requestType, Company).
- Project chains of the same type may not share a project.

### MatrixVersion (C) and MatrixLevel (C)
MatrixVersion: `version`, `effectiveFrom`, `reason`, `updatedBy`, `updatedAt`, `levels: MatrixLevel[4]`.

MatrixLevel:
- `approverId` → CoreUser or the Tenant Admin (empty means not set);
- `timeoutHours` (1 to 720);
- `onTimeout: 'Escalate to next level'|'Escalate to Tenant Admin'|'Remind approver only'`;
- `cashLimit?` (Payments only, rising with each level);
- `escalateToId?` (L1 to L3, not the approver).

Level rules:
- L1 is required for the chain to be usable.
- No gaps between levels.
- No person twice.

### ApprovalRequest (C)
| Field | Type | Notes |
|---|---|---|
| id, code | string | code such as `REQ-2043` |
| type | RequestType | 13 values, listed below |
| module | ModuleName | |
| title | string | |
| raisedBy | string | name snapshot |
| raisedById | string \| null | null when raised outside CORE |
| raisedAt | timestamp | |
| chainageId | string | → ChainageMarker; the project is derived from it |
| emergency | boolean | raises priority only |
| status | `Pending` \| `In review` \| `Approved` \| `Rejected` | |
| currentLevel | number | 1 to 4 |
| chainId? , matrixVersion | string, number | the chain version saved when the request was raised |
| history | RequestAction[] | |
| payload | RequestPayload | a union keyed by `kind`; see [26](screens/26-approval-detail.md) |

RequestType values:
- Onboarded employee list, Offer letter, Job opening, Manpower requisition
- Equipment, Material
- Advance payment, Recruitment
- Employee transfer, Promotion, Bonus and incentive, Loan and advance
- Payments

RequestAction: `level`, `by`, `action: 'Approved'|'Rejected'|'Escalated'|'Raised'|'Commented'`, `at`, `comment`, `amountApproved?`, `lineChanges?`.

## 9. Grievances, support, audit

### Grievance (C)
`id`, `code`, `raisedBy`, `raisedById`, `employeeId?`, `subject?`, `sourceModule?`, `sourceRecordId?`, `message` (at most 10 words), `visitDate`, `status: 'Requested'|'Confirmed'|'Rescheduled'|'Visited'|'Not visited'`, `raisedAt`, `history: { status, at, note }[]`.

### Ticket (C)
`id`, `code` (`TKT-n`), `subject` (at most 120), `category` (10 values), `priority: 'Low'|'Medium'|'High'`, `description` (at least 20), `status: 'Open'|'Answered'|'Closed'`, `createdAt`, `raisedById`.

### AuditEntry (C)
`id`, `at`, `user` (a **name** today), `action`, `entity`, `entityId`, `before`, `after` (free text). Append-only.

### Notification (C, constant)
`id`, `icon`, `title`, `description`, `at`, `to` (an app path). Read state is kept in each browser.

## 10. Inferred backend entities (I)
| Entity | Why |
|---|---|
| Tenant | Every record above belongs to one company. Not modelled in the frontend. |
| Session / credential | Password hash, MFA secret or passkey, lock counters, active sessions ([02](screens/02-login.md)). |
| OTP / password reset | [03](screens/03-register.md), [04](screens/04-forgot-password.md) |
| Registration | Company sign-up awaiting approval ([03](screens/03-register.md)). |
| StoredFile | Logo, offer letter, equipment photos and documents. |

## 11. Relationships
```
Tenant 1─* everything
Department 1─* Role ; Department ─parent→ Department ; Department.headRoleId → Role
Role ─reportsTo→ Role ; CoreUser.positionId → Role
Project 1─* Milestone, WbsNode, ChainageMarker, GeoZone, PeoplePlanLine, MaterialPlanLine, PlanLine
Project *─* Site (locationIds)
ChainageMarker 1─* Store, EquipmentUnit, EquipmentAssignment, ApprovalRequest
Store *─1 Site (locationId) ; Material *─* Store (storeIds) ; StockRow (Store × Material)
EquipmentUnit *─1 Vendor (vendorId) ; EquipmentUnit.type ~ EquipmentTypeMaster.name
ApprovalChain 1─* MatrixVersion ; ApprovalChain *─* Project (scopeIds) ; MatrixLevel → CoreUser
ApprovalRequest *─1 ApprovalChain (+ matrixVersion) ; RequestAction * per request
CustomPolicyDef 1─* CustomPolicyVersion ; PolicyVersion * per key
CoreUser *─* Project (scopeIds)
```

## 12. Conflicts and shape mismatches across screens
1. **Site or Location.** Code and fields say `site`, `sites` and `siteId`. Screens, the audit and the handoff say "Location" and `core_location`. The API keeps the frontend names.
2. **`Store.location` is the address, not a location.** The real link is `locationId`. The name is misleading but the frontend depends on it.
3. **Equipment type by name.** `EquipmentUnit.type`, `PlanLine.equipmentType`, `EquipmentAssignment.equipmentType` and the equipment request payload all hold the type **name**. `EquipmentTypeMaster` has its own `id` and `code`. The backend should store the type ID and also return the name.
4. **Owner text versus vendor link.** `EquipmentUnit.owner` is a free label ("Hire vendor", "Sai Earthmovers"), and the wizard's owner list is hard-coded. `vendorId` is the real link.
5. **`raisedById` means different things.**
   - Request: a user ID, or null.
   - Grievance: commented as a user ID, but the seed holds employee numbers (`EMP-2..`).
   - Ticket: the Tenant Admin's approver ID.
6. **The audit `user` is a display name**, not an ID. Elsewhere `createdBy` and `updatedBy` are also names. The backend should store IDs and return names.
7. **ID generation differs.**
   - Projects get `P-<n>` in the form.
   - Policy versions get `<key>-v<n>`.
   - Other records get a uuid.
   - Seed data uses readable IDs.
   - The server should own all IDs and codes.
8. **`ApprovalRequest.id` and `code`.** The detail page title shows `id`; lists show `code`.
9. **Payments and Advance payment** are separate request types with the same routing. The Help text says it is open whether they are the same records (PRD v2 Q6).
10. **The Tenant Admin is outside `users`.** An approver ID can be the Tenant Admin, who has no CoreUser row.
11. **`Project.plan` (SitePlan)** is kept but never shown or edited.
12. **Removal reason dropped.** Equipment plan removal asks for a reason that is not stored.
13. **Equipment registration files** (meter photo and others) are required on the form but not saved on the unit.
