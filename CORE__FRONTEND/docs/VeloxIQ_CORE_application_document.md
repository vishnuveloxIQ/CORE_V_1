# VeloxIQ Core: application document

Shared foundation used by every application: company setup and master data, organisation structure, projects and locations, stores and materials, equipment planning, users and approvals, requests, grievances, support tickets and the audit trail.

- **Tables:** 43
- **Columns:** 307 (business columns only; the standard columns below are not counted)
- **Standard columns on every table:** id, created_at, created_by, updated_at, updated_by, row_version. Frontend fields named `createdAt`, `createdBy`, `updatedAt` and `updatedBy` map to these. No tenant_id: the tenant schema is the boundary.
- **Source:** every table comes from the frontend types in `src/modules/core-data/types/index.ts` and the store in `src/modules/core-data/store/useCore.ts`. Column types are TypeScript types mapped to SQL types. Nothing here is confirmed against a database.
- **Back to:** [Integrated ERP document](00_Integrated_ERP.md)

## Related applications

| Related application | Main connections (frontend) |
|---|---|
| [HRMS](02_HRMS.md) | `core_position` and `core_department` define the structure HRMS uses; `core_user` and `core_grievance` carry employee names; `core_approval_request` payloads for transfer, promotion, bonus, loan, onboarding, offer and job opening are executed by HRMS |
| [P&M](03_PM.md) | `core_equipment_unit`, `core_equipment_assignment`, `core_equipment_type`, `core_plan_line`, `core_chainage_marker` and `core_vendor` |
| [PMS](04_PMS.md) | `core_policy_version` (payment threshold), `core_pms_limit_row`, `core_approval_request` payment requests |
| [Stores](05_Stores.md) | `core_store`, `core_material`, `core_material_store`, `core_stock`, `core_material_plan_line` |

Rows not listed here are used only inside Core.

## Table index

| # | Table | Purpose | Columns | Related to |
|---|---|---|---|---|
| 1 | [`core_company_profile`](#core_company_profile) | Legal and contact details of the company, with the logo as a data URL. | 17 | - |
| 2 | [`core_offer_letter`](#core_offer_letter) | The one offer letter format HRMS uses. Uploading replaces it. | 6 | HRMS |
| 3 | [`core_policy`](#core_policy) | The six fixed company policies. | 3 | - |
| 4 | [`core_policy_version`](#core_policy_version) | Versioned body of each policy, with its effective date. The body is typed per policy in `data_json`. | 5 | PMS, HRMS |
| 5 | [`core_custom_policy`](#core_custom_policy) | Custom policies defined by an admin. | 2 | - |
| 6 | [`core_custom_policy_field`](#core_custom_policy_field) | Fields of a custom policy. | 5 | - |
| 7 | [`core_custom_policy_version`](#core_custom_policy_version) | Versioned answers to a custom policy. | 5 | - |
| 8 | [`core_department`](#core_department) | Departments as a tree, with a head position and an organogram colour. | 8 | HRMS, Stores |
| 9 | [`core_position`](#core_position) | Organisation positions (grade, reporting line, planned headcount). Separate from access roles. | 9 | HRMS |
| 10 | [`core_location`](#core_location) | Work sites. A plain location, not linked to a project on the site itself. | 10 | P&M, Stores |
| 11 | [`core_project`](#core_project) | Projects (contracts or works) with value, dates and chainage range. | 10 | HRMS, P&M, PMS, Stores |
| 12 | [`core_project_location`](#core_project_location) | Locations assigned to a project. | 2 | P&M |
| 13 | [`core_project_plan`](#core_project_plan) | Project-level plan: dates, peak workforce, working days, week off. | 7 | - |
| 14 | [`core_project_milestone`](#core_project_milestone) | Milestones of a project with due date, weight and status. | 5 | - |
| 15 | [`core_wbs_node`](#core_wbs_node) | Work breakdown structure nodes under a project. | 4 | P&M |
| 16 | [`core_chainage_marker`](#core_chainage_marker) | Chainage markers (CH-n) along a linear project. | 4 | P&M, Stores |
| 17 | [`core_geo_zone`](#core_geo_zone) | Geo-fence zones of a project: radius, polygon or corridor. | 10 | HRMS, P&M |
| 18 | [`core_store`](#core_store) | Stores (warehouses) at a chainage point and a location. | 8 | Stores |
| 19 | [`core_material`](#core_material) | Materials with unit, HSN and reorder level. | 7 | P&M, Stores |
| 20 | [`core_material_store`](#core_material_store) | Which stores hold which materials. | 2 | Stores |
| 21 | [`core_stock`](#core_stock) | Stock quantity and reserved quantity per store and material. | 4 | Stores |
| 22 | [`core_equipment_type`](#core_equipment_type) | Equipment type master: meter kind and fuel-norm unit. | 7 | P&M |
| 23 | [`core_plan_line`](#core_plan_line) | Planned equipment per project. | 6 | P&M |
| 24 | [`core_people_plan_line`](#core_people_plan_line) | Planned manpower per project. TODO(backend) in source. | 6 | HRMS |
| 25 | [`core_material_plan_line`](#core_material_plan_line) | Planned material requirement per project. TODO(backend) in source. | 7 | Stores |
| 26 | [`core_pms_limit_row`](#core_pms_limit_row) | Approval time and amount limits per tier and priority. Final tier rows carry no limit. TODO(backend) in source. | 7 | PMS |
| 27 | [`core_equipment_unit`](#core_equipment_unit) | Equipment units: identity, registration, compliance, meter, fuel, hire and location. | 40 | P&M |
| 28 | [`core_equipment_assignment`](#core_equipment_assignment) | Count of units of one equipment type allocated to a chainage marker. | 6 | P&M |
| 29 | [`core_user`](#core_user) | CORE users: module heads and approvers. Module users stay in HRMS. | 13 | HRMS, P&M, PMS, Stores |
| 30 | [`core_user_module`](#core_user_module) | Modules a module head heads. | 2 | - |
| 31 | [`core_user_scope`](#core_user_scope) | Scope ids (projects) a user is limited to. | 2 | - |
| 32 | [`core_user_privilege`](#core_user_privilege) | Privileges granted to a module head. | 2 | - |
| 33 | [`core_approval_chain`](#core_approval_chain) | One approval chain per request type and scope. | 4 | - |
| 34 | [`core_approval_chain_scope`](#core_approval_chain_scope) | Projects a Project-scope chain covers. | 2 | - |
| 35 | [`core_matrix_version`](#core_matrix_version) | Versions of an approval chain. | 4 | - |
| 36 | [`core_matrix_level`](#core_matrix_level) | Approval levels in a matrix version, with approver, timeout and cash limit. | 7 | - |
| 37 | [`core_approval_request`](#core_approval_request) | One approval case per business request, with status and payload. | 14 | HRMS, P&M, PMS, Stores |
| 38 | [`core_approval_action`](#core_approval_action) | Each action taken on a request. | 6 | - |
| 39 | [`core_grievance`](#core_grievance) | Grievances raised by a person or from another module record, with a requested Head Office visit date. | 11 | HRMS |
| 40 | [`core_grievance_event`](#core_grievance_event) | Status history of a grievance. | 4 | - |
| 41 | [`core_ticket`](#core_ticket) | Support tickets raised inside the app. | 7 | Platform Administration |
| 42 | [`core_audit_entry`](#core_audit_entry) | Audit trail: one row per mutation, with before and after values. | 6 | - |
| 43 | [`core_vendor`](#core_vendor) | Vendor master: hire vendors and equipment owners. | 11 | P&M |

## Table details

### core_company_profile

**Purpose:** Legal and contact details of the company, with the logo as a data URL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 17

| Column | Type | Notes |
|---|---|---|
| `legal_name` | text |  |
| `trade_name` | text |  |
| `cin` | text |  |
| `gstin` | text |  |
| `pan` | text |  |
| `tan` | text |  |
| `address_line1` | text |  |
| `address_line2` | text |  |
| `city` | text |  |
| `state` | text |  |
| `pin` | text |  |
| `country` | text |  |
| `contact_name` | text |  |
| `contact_email` | text |  |
| `contact_phone` | text |  |
| `website` | text |  |
| `logo_data_url` | text | Frontend holds a data URL. Backend would store the file in `core_file`. |

**Refers to:** none

**Referenced by:** none

### core_offer_letter

**Purpose:** The one offer letter format HRMS uses. Uploading a new file replaces it.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `file_id` | uuid | Id of the stored file (`core_file`); a new id on every replacement. |
| `file_name` | text |  |
| `mime_type` | text |  |
| `size_bytes` | integer |  |
| `data_url` | text | Frontend holds a data URL. Backend would store the file in `core_file`. |
| `revision` | integer | Counts replacements. |

**Refers to:** none

**Referenced by:** none

### core_policy

**Purpose:** The six fixed company policies: shifts, holidays, overtime, leave, payment threshold and rules.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 3

| Column | Type | Notes |
|---|---|---|
| `policy_key` | text | One of `shifts`, `holidays`, `overtime`, `leave`, `payment-threshold`, `rules`. |
| `title` | text | From the frontend policy meta. |
| `description` | text | From the frontend policy meta. |

**Refers to:** none

**Referenced by:** [`core_policy_version`](#core_policy_version) via `policy_id`

### core_policy_version

**Purpose:** Versioned body of each policy with its effective date. Versions are never overwritten; a change is a new version. Overtime on/off is a version with `enabled` set.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `policy_id` | uuid | references [`core_policy`](#core_policy) |
| `version_no` | integer |  |
| `effective_from` | date |  |
| `reason` | text |  |
| `data_json` | jsonb | Body typed per policy key (`PolicyData[K]`). See the policy shapes below. |

Policy shapes stored in `data_json`:

- **shifts:** `shiftsPerDay`, `notes`, `timings[]` (name, start, end), `weekOff` (type, saturdays, days).
- **holidays:** `year`, `holidays[]` (name, date, endDate, type), `variants[]` (scope "Project", scopeId, holidays[]).
- **overtime:** `mode`, `weekdayRate`, `holidayRate`, `minMinutes`, `dailyCapHours`, `monthlyCapHours`, `requiresApproval`, `enabled` (missing means on).
- **leave:** `leaveTypes[]` (name, code, annualDays, accrual, carryForward, maxCarryDays, expiryMonths, encashable, paid), `legalNote`.
- **payment-threshold:** `amount`, `currency` ("INR").
- **rules:** `rules[]` (title, category, body, ackRequired). Kept inside JSON; no rule table yet.

**Refers to:** [`core_policy`](#core_policy) via `policy_id`

**Referenced by:** none

### core_custom_policy

**Purpose:** Custom policies defined by an admin, each with its own fields.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `name` | text |  |
| `description` | text |  |

**Refers to:** none

**Referenced by:** [`core_custom_policy_field`](#core_custom_policy_field) via `custom_policy_id`, [`core_custom_policy_version`](#core_custom_policy_version) via `custom_policy_id`

### core_custom_policy_field

**Purpose:** Fields of a custom policy: label, type, required flag and choices for select fields.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `custom_policy_id` | uuid | references [`core_custom_policy`](#core_custom_policy) |
| `label` | text |  |
| `field_type` | text | One of text, longtext, number, date, yesno, select. |
| `is_required` | boolean |  |
| `options_json` | jsonb | Choices for select fields; null otherwise. |

**Refers to:** [`core_custom_policy`](#core_custom_policy) via `custom_policy_id`

**Referenced by:** none

### core_custom_policy_version

**Purpose:** Versioned answers to a custom policy, keyed by field.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `custom_policy_id` | uuid | references [`core_custom_policy`](#core_custom_policy) |
| `version_no` | integer |  |
| `effective_from` | date |  |
| `reason` | text |  |
| `values_json` | jsonb | Answers keyed by field id. |

**Refers to:** [`core_custom_policy`](#core_custom_policy) via `custom_policy_id`

**Referenced by:** none

### core_department

**Purpose:** Departments as a tree, with a head position and a colour for the organogram.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `parent_department_id` | uuid | references [`core_department`](#core_department); null at the top |
| `head_position_id` | uuid | references [`core_position`](#core_position) |
| `description` | text |  |
| `color_index` | integer | Accent 0 to 7 on the organogram. |
| `color_hex` | text | Optional custom colour; overrides `color_index` when set. |
| `status` | text | Active or Inactive. |

**Refers to:** [`core_department`](#core_department) via `parent_department_id`, [`core_position`](#core_position) via `head_position_id`

**Referenced by:** [`core_position`](#core_position) via `department_id`, [`core_department`](#core_department) via `parent_department_id`

### core_position

**Purpose:** Organisation positions: grade, reporting line and planned headcount. HRMS holds the people; Core keeps the structure.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `title` | text |  |
| `department_id` | uuid | references [`core_department`](#core_department) |
| `grade` | text | For example E1, M2, S3, W1. |
| `reports_to_position_id` | uuid | references [`core_position`](#core_position); null only at the top |
| `planned_positions` | integer |  |
| `holder` | text | For single-position roles: a CORE user or a name from HRMS. |
| `description` | text |  |
| `status` | text | Active or Inactive. |

**Refers to:** [`core_department`](#core_department) via `department_id`, [`core_position`](#core_position) via `reports_to_position_id`

**Referenced by:** [`core_department`](#core_department) via `head_position_id`, [`core_position`](#core_position) via `reports_to_position_id`, [`core_user`](#core_user) via `position_id`

### core_location

**Purpose:** Work sites. A location is a plain place; its project link is held on the project side (see [`core_project_location`](#core_project_location)).

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `code` | text | Display code, for example S-1. |
| `name` | text |  |
| `address_line` | text |  |
| `city` | text |  |
| `state` | text |  |
| `pin` | text |  |
| `in_charge` | text |  |
| `phone` | text |  |
| `email` | text |  |
| `status` | text | Active or Inactive. |

**Refers to:** none

**Referenced by:** [`core_project_location`](#core_project_location) via `location_id`, [`core_store`](#core_store) via `location_id`

### core_project

**Purpose:** Projects (contracts or works) with value, dates, status and the chainage range the project's stores, equipment and requests reference.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `client` | text |  |
| `start_date` | date |  |
| `end_date` | date |  |
| `status` | text | Planning, Active, On hold or Completed. |
| `value_amount` | numeric |  |
| `description` | text |  |
| `chainage_start_km` | numeric |  |
| `chainage_end_km` | numeric |  |

**Refers to:** none

**Referenced by:** [`core_project_location`](#core_project_location) via `project_id`, [`core_project_plan`](#core_project_plan) via `project_id`, [`core_project_milestone`](#core_project_milestone) via `project_id`, [`core_wbs_node`](#core_wbs_node) via `project_id`, [`core_chainage_marker`](#core_chainage_marker) via `project_id`, [`core_geo_zone`](#core_geo_zone) via `project_id`, [`core_plan_line`](#core_plan_line) via `project_id`, [`core_people_plan_line`](#core_people_plan_line) via `project_id`, [`core_material_plan_line`](#core_material_plan_line) via `project_id`, [`core_approval_chain_scope`](#core_approval_chain_scope) via `project_id`, [`core_user_scope`](#core_user_scope) via `scope_id`, [`core_equipment_assignment`](#core_equipment_assignment) via `project_id`

### core_project_location

**Purpose:** Locations assigned to a project. Each row is one location under one project.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `location_id` | uuid | references [`core_location`](#core_location) |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_location`](#core_location) via `location_id`

**Referenced by:** none

### core_project_plan

**Purpose:** Project-level plan: dates, peak workforce, working days and week off. Planning sits at project level, not site level.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `start_date` | date |  |
| `end_date` | date |  |
| `peak_workforce` | integer |  |
| `working_days_text` | text | Legacy free text. |
| `week_off_json` | jsonb | Optional week-off pattern (type, saturdays, days). |
| `notes` | text |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_project_milestone

**Purpose:** Milestones of a project with due date, weight and status.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `name` | text |  |
| `due_date` | date |  |
| `weight` | numeric |  |
| `status` | text | Not started, In progress or Done. |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_wbs_node

**Purpose:** Work breakdown structure nodes under a project.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `code` | text |  |
| `name` | text |  |
| `parent_wbs_node_id` | uuid | references [`core_wbs_node`](#core_wbs_node); null at the top |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_wbs_node`](#core_wbs_node) via `parent_wbs_node_id`

**Referenced by:** [`core_chainage_marker`](#core_chainage_marker) via `wbs_code` (by code, not by key), [`core_wbs_node`](#core_wbs_node) via `parent_wbs_node_id`

### core_chainage_marker

**Purpose:** Chainage markers (CH-n) along a linear project. Stores, equipment and requests reference them.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `km` | numeric |  |
| `label` | text | For example CH-12. |
| `wbs_code` | text | Code of a WBS node. |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** [`core_store`](#core_store) via `chainage_marker_id`, [`core_equipment_unit`](#core_equipment_unit) via `chainage_marker_id`, [`core_equipment_assignment`](#core_equipment_assignment) via `chainage_marker_id`, [`core_approval_request`](#core_approval_request) via `chainage_marker_id`

### core_geo_zone

**Purpose:** Geo-fence zones of a project, used by attendance and equipment. Shape is a radius, a polygon or a corridor along a centre line.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `label` | text |  |
| `zone_type` | text | Head Office, Mess, Store yard, Gate or Other. |
| `shape` | text | Radius, Polygon or Linear. |
| `center_lat` | numeric |  |
| `center_lng` | numeric |  |
| `radius_m` | numeric | Used when shape is Radius. |
| `points_json` | jsonb | Boundary pins (Polygon) or centre-line pins (Linear), in order. |
| `buffer_m` | numeric | Linear only: corridor width on each side, in metres. |
| `version` | integer |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_store

**Purpose:** Stores (warehouses) at a chainage point and a project location.

**Schema:** tenant_<id>  ·  **Application:** Stores  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |
| `location_id` | uuid | references [`core_location`](#core_location); required. The location belongs to the marker's project. |
| `location_text` | text | Address: free text (shed, yard or gate); required. Frontend field `location`. |
| `keeper` | text |  |
| `phone` | text |  |
| `status` | text | Active or Inactive. |

**Refers to:** [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`, [`core_location`](#core_location) via `location_id`

**Referenced by:** [`core_material_store`](#core_material_store) via `store_id`, [`core_stock`](#core_stock) via `store_id`, [`core_material_plan_line`](#core_material_plan_line) via `store_id`

### core_material

**Purpose:** Materials with unit, HSN code and reorder level.

**Schema:** tenant_<id>  ·  **Application:** Stores  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `category` | text |  |
| `uom` | text | Unit of measure. |
| `hsn` | text |  |
| `reorder_level` | numeric |  |
| `status` | text | Active or Inactive. |

**Refers to:** none

**Referenced by:** [`core_material_store`](#core_material_store) via `material_id`, [`core_stock`](#core_stock) via `material_id`, [`core_material_plan_line`](#core_material_plan_line) via `material_id`

### core_material_store

**Purpose:** Which stores hold which materials.

**Schema:** tenant_<id>  ·  **Application:** Stores  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `material_id` | uuid | references [`core_material`](#core_material) |
| `store_id` | uuid | references [`core_store`](#core_store) |

**Refers to:** [`core_material`](#core_material) via `material_id`, [`core_store`](#core_store) via `store_id`

**Referenced by:** none

### core_stock

**Purpose:** Stock quantity and reserved quantity per store and material.

**Schema:** tenant_<id>  ·  **Application:** Stores  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `store_id` | uuid | references [`core_store`](#core_store) |
| `material_id` | uuid | references [`core_material`](#core_material) |
| `qty` | numeric |  |
| `reserved_qty` | numeric |  |

**Refers to:** [`core_store`](#core_store) via `store_id`, [`core_material`](#core_material) via `material_id`

**Referenced by:** none

### core_equipment_type

**Purpose:** Equipment type master: one row per type, with the meter it uses and the fuel-norm unit.

**Schema:** tenant_<id>  ·  **Application:** P&M  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `code` | text | For example ET-EX. |
| `name` | text | Referenced by name from `core_plan_line.equipment_type`, `core_equipment_assignment.equipment_type` and `core_equipment_unit.type`. |
| `meter_kind` | text | Hours, Kilometres or None. |
| `meter_precision` | integer | Decimal places on readings. |
| `fuel_norm_unit` | text | L/hr, km/L or None. |
| `tolerance_setting_key` | text | For example fuel.tolerance.ET-EX. |
| `active` | boolean |  |

Seed: Dump Truck uses Kilometres (km/L). Scaffolding System and Concrete Vibrator use None. Every other type uses Hours (L/hr).

**Refers to:** none

**Referenced by:** [`core_plan_line`](#core_plan_line), [`core_equipment_assignment`](#core_equipment_assignment) and [`core_equipment_unit`](#core_equipment_unit) by name (no key yet)

### core_plan_line

**Purpose:** Planned equipment per project: type, quantity, dates and reason.

**Schema:** tenant_<id>  ·  **Application:** P&M  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `equipment_type` | text | Name from [`core_equipment_type`](#core_equipment_type). |
| `planned_qty` | integer |  |
| `from_date` | date |  |
| `to_date` | date |  |
| `reason` | text |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_people_plan_line

**Purpose:** Planned manpower per project. TODO(backend): GET/POST/PUT/DELETE `/projects/{id}/people-plan`.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `role` | text | Position or role name, as text. |
| `headcount` | integer |  |
| `from_date` | date |  |
| `to_date` | date |  |
| `status` | text | Planned, Confirmed or Fulfilled. |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_material_plan_line

**Purpose:** Planned material requirement per project. TODO(backend): GET/POST/PUT/DELETE `/projects/{id}/material-plan`.

**Schema:** tenant_<id>  ·  **Application:** Stores  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `material_id` | uuid | references [`core_material`](#core_material) |
| `qty` | numeric |  |
| `uom` | text |  |
| `required_by` | date |  |
| `store_id` | uuid | references [`core_store`](#core_store) |
| `status` | text | Planned, Requested, Ordered or Received. |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_material`](#core_material) via `material_id`, [`core_store`](#core_store) via `store_id`

**Referenced by:** none

### core_pms_limit_row

**Purpose:** One row of the PMS limit matrix: tier and priority, with an amount and time limit. Final tier rows carry no limit. TODO(backend): GET/PUT `/pms-limits`.

**Schema:** tenant_<id>  ·  **Application:** PMS  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `tier` | integer |  |
| `priority` | text | Emergency or Normal. |
| `amount_inr` | numeric | Null for final tier rows. |
| `days` | integer |  |
| `hours` | integer |  |
| `minutes` | integer |  |
| `is_final` | boolean |  |

**Refers to:** none

**Referenced by:** none

### core_equipment_unit

**Purpose:** Equipment units: identity, registration, compliance, technical, meter, fuel, hire and location details. Compliance and registration fields are optional until P&M captures them on upload.

**Schema:** tenant_<id>  ·  **Application:** P&M  ·  **Columns:** 40

| Column | Type | Notes |
|---|---|---|
| `asset_code` | text | Readable asset code; the key for people is `id`. |
| `type` | text | Name from [`core_equipment_type`](#core_equipment_type). |
| `make_model` | text |  |
| `reg_no` | text | Registration number. |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |
| `lat` | numeric | Nullable. |
| `lng` | numeric | Nullable. |
| `last_ping_at` | timestamptz | Nullable. |
| `availability` | text | Available, In use, Under maintenance or Breakdown. |
| `name` | text | Equipment name given at registration. |
| `invoice_no` | text |  |
| `invoice_date` | date |  |
| `chassis_no` | text | Frontend field `chasisNo`; spelling kept in the name here. |
| `reg_expiry` | date |  |
| `insurance_no` | text |  |
| `insurance_expiry` | date |  |
| `puc_no` | text |  |
| `pollution_expiry` | date |  |
| `fitness_cert` | text |  |
| `fitness_expiry` | date |  |
| `ownership_type` | text |  |
| `manufacturer` | text |  |
| `model` | text |  |
| `mfg_year` | text |  |
| `engine_no` | text |  |
| `capacity` | text |  |
| `capacity_unit` | text |  |
| `meter_type` | text |  |
| `meter_reading` | text |  |
| `fuel_type` | text |  |
| `fuel_norm` | text |  |
| `tank_capacity` | text |  |
| `owner` | text | Display label: Company or the hire vendor's name. |
| `vendor_id` | uuid | references [`core_vendor`](#core_vendor); set for hired units, null for Company. |
| `hire_ref` | text |  |
| `agreement_start` | date |  |
| `agreement_end` | date |  |
| `warranty_end` | date |  |
| `warranty_reading` | text |  |
| `current_location` | text | Location at registration. |

**Refers to:** [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`, [`core_vendor`](#core_vendor) via `vendor_id`

**Referenced by:** none

### core_equipment_assignment

**Purpose:** A count of units of one equipment type allocated to a requested chainage marker.

**Schema:** tenant_<id>  ·  **Application:** P&M  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `equipment_type` | text | Name from [`core_equipment_type`](#core_equipment_type). |
| `project_id` | uuid | references [`core_project`](#core_project); the project of the marker. |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |
| `qty` | integer |  |
| `assigned_at` | timestamptz |  |
| `assigned_by` | text | User name. |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`

**Referenced by:** none

### core_user

**Purpose:** Every CORE user: a module head of one or more modules, or a high-level approver. Module users stay in HRMS.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 13

| Column | Type | Notes |
|---|---|---|
| `code` | text | Readable user code, for example U-601. |
| `name` | text |  |
| `email` | text |  |
| `phone` | text |  |
| `designation` | text |  |
| `emp_code` | text | Optional company employee code; not looked up from HRMS. |
| `employee_id` | text | HRMS employee id, for example EMP-601; optional. |
| `position_id` | uuid | references [`core_position`](#core_position); optional. |
| `role` | text | Module head or Approver. |
| `scope_type` | text | Company or Project. |
| `status` | text | Active or Inactive. |
| `must_change_password` | boolean |  |
| `last_login_at` | timestamptz | Nullable. |

No password or credential column exists in the frontend type. The reset-password action is frontend-only.

**Refers to:** [`core_position`](#core_position) via `position_id`

**Referenced by:** [`core_user_module`](#core_user_module) via `user_id`, [`core_user_scope`](#core_user_scope) via `user_id`, [`core_user_privilege`](#core_user_privilege) via `user_id`, [`core_matrix_level`](#core_matrix_level) via `approver_user_id` and `escalate_to_user_id`, [`core_approval_request`](#core_approval_request) via `raised_by_id`, [`core_grievance`](#core_grievance) via `raised_by_id`, [`core_ticket`](#core_ticket) via `raised_by_id`, [`core_vendor`](#core_vendor) via `registered_by`

### core_user_module

**Purpose:** Modules a module head heads. Each module has one active head.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `module` | text | HRMS, PMS, Stores or P&M. |

**Refers to:** [`core_user`](#core_user) via `user_id`

**Referenced by:** none

### core_user_scope

**Purpose:** Scope ids a user is limited to.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `scope_id` | uuid | references [`core_project`](#core_project) when scope_type is Project. |

**Refers to:** [`core_user`](#core_user) via `user_id`, [`core_project`](#core_project) via `scope_id`

**Referenced by:** none

### core_user_privilege

**Purpose:** Privileges granted to a module head.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `privilege` | text | Privilege name from the seed privilege list. |

**Refers to:** [`core_user`](#core_user) via `user_id`

**Referenced by:** none

### core_approval_chain

**Purpose:** One approval chain per request type and scope. A request uses the most specific chain that covers its project: a Project chain, else the Company chain.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `request_type` | text | One of the request types (for example Equipment, Payments). |
| `module` | text | HRMS, PMS, Stores or P&M. |
| `raised_by` | text | Who raised the chain. |
| `scope_type` | text | Company or Project. |

**Refers to:** none

**Referenced by:** [`core_approval_chain_scope`](#core_approval_chain_scope) via `chain_id`, [`core_matrix_version`](#core_matrix_version) via `chain_id`, [`core_approval_request`](#core_approval_request) via `chain_id`

### core_approval_chain_scope

**Purpose:** Projects a Project-scope chain covers.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `chain_id` | uuid | references [`core_approval_chain`](#core_approval_chain) |
| `project_id` | uuid | references [`core_project`](#core_project) |

**Refers to:** [`core_approval_chain`](#core_approval_chain) via `chain_id`, [`core_project`](#core_project) via `project_id`

**Referenced by:** none

### core_matrix_version

**Purpose:** Versions of an approval chain. A change is a new version with an effective date; requests in flight keep the version they started with.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `chain_id` | uuid | references [`core_approval_chain`](#core_approval_chain) |
| `version_no` | integer |  |
| `effective_from` | date |  |
| `reason` | text |  |

**Refers to:** [`core_approval_chain`](#core_approval_chain) via `chain_id`

**Referenced by:** [`core_matrix_level`](#core_matrix_level) via `matrix_version_id`

### core_matrix_level

**Purpose:** Approval levels in a matrix version, with approver, timeout and, on the Payments chain, a cash limit.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `matrix_version_id` | uuid | references [`core_matrix_version`](#core_matrix_version) |
| `level_no` | integer | Position of the level in the chain, from 1. |
| `approver_user_id` | uuid | references [`core_user`](#core_user) |
| `timeout_hours` | integer |  |
| `on_timeout` | text | Escalate to next level, Escalate to Tenant Admin or Remind approver only. |
| `cash_limit_inr` | numeric | Payments only. A payment up to this amount stops at this level. Null means no limit. |
| `escalate_to_user_id` | uuid | references [`core_user`](#core_user); levels 1 to 3 only. Never the level's own approver. |

**Refers to:** [`core_matrix_version`](#core_matrix_version) via `matrix_version_id`, [`core_user`](#core_user) via `approver_user_id` and `escalate_to_user_id`

**Referenced by:** none

### core_approval_request

**Purpose:** One approval case per business request, with status, current level and the payload of the request type.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 14

| Column | Type | Notes |
|---|---|---|
| `code` | text | Readable request number, for example REQ-2043. |
| `request_type` | text | One of the request types. |
| `module` | text | HRMS, PMS, Stores or P&M. |
| `title` | text |  |
| `raised_by_name` | text | Name of the person who raised it. |
| `raised_by_id` | uuid | references [`core_user`](#core_user); nullable. |
| `raised_at` | timestamptz |  |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |
| `emergency` | boolean |  |
| `status` | text | Pending, In review, Approved or Rejected. |
| `current_level` | integer |  |
| `chain_id` | uuid | references [`core_approval_chain`](#core_approval_chain); the chain used. |
| `matrix_version` | integer | Version number snapshot used for this request. |
| `payload_json` | jsonb | One of 12 payload kinds, see below. |

Payload kinds stored in `payload_json` (`kind` field): equipment, material, payment, recruitment, job, offer, onboarding, mrf, transfer, promotion, bonus, loan.

**Refers to:** [`core_approval_chain`](#core_approval_chain) via `chain_id`, [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`, [`core_user`](#core_user) via `raised_by_id`

**Referenced by:** [`core_approval_action`](#core_approval_action) via `request_id`, [`core_vendor`](#core_vendor) via `approval_request_id`

### core_approval_action

**Purpose:** Each action taken on a request: raised, approved, rejected, escalated or commented.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `request_id` | uuid | references [`core_approval_request`](#core_approval_request) |
| `level_no` | integer |  |
| `by_name` | text | Name of the person who acted. |
| `action` | text | Approved, Rejected, Escalated, Raised or Commented. |
| `acted_at` | timestamptz |  |
| `comment` | text |  |

**Refers to:** [`core_approval_request`](#core_approval_request) via `request_id`

**Referenced by:** none

### core_grievance

**Purpose:** Grievances raised by a person or from another module record, with a requested Head Office visit date. Core confirms, moves or closes the visit.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 11

| Column | Type | Notes |
|---|---|---|
| `code` | text | Readable grievance code, for example G-101. |
| `raised_by_name` | text |  |
| `raised_by_id` | uuid | references [`core_user`](#core_user) |
| `employee_id` | text | HRMS employee id; optional. |
| `subject` | text | Optional. |
| `source_module` | text | Module the grievance came from; optional. |
| `source_record_id` | text | Id of the source record; optional. |
| `message` | text | At most 10 words. |
| `visit_date` | date | Picked by the raiser; may be moved by Core. |
| `status` | text | Requested, Confirmed, Rescheduled, Visited or Not visited. |
| `raised_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `raised_by_id`

**Referenced by:** [`core_grievance_event`](#core_grievance_event) via `grievance_id`

### core_grievance_event

**Purpose:** Status history of a grievance.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `grievance_id` | uuid | references [`core_grievance`](#core_grievance) |
| `status` | text | Same values as `core_grievance.status`. |
| `event_at` | timestamptz |  |
| `note` | text |  |

**Refers to:** [`core_grievance`](#core_grievance) via `grievance_id`

**Referenced by:** none

### core_ticket

**Purpose:** Support tickets raised inside the app.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `code` | text | Readable ticket code, for example TKT-n. |
| `subject` | text |  |
| `category` | text |  |
| `priority` | text | Low, Medium or High. |
| `description` | text |  |
| `status` | text | Open, Answered or Closed. |
| `raised_by_id` | uuid | references [`core_user`](#core_user) |

**Refers to:** [`core_user`](#core_user) via `raised_by_id`

**Referenced by:** none

### core_audit_entry

**Purpose:** Audit trail. Each mutation in the frontend adds one entry with the before and after values as text.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `user_name` | text | Who made the change. |
| `action` | text |  |
| `entity` | text | Entity name, for example policy or user. |
| `entity_id` | text | Id of the changed row. |
| `before_text` | text |  |
| `after_text` | text |  |

The frontend does not hash-chain entries. The reference design calls for a hash-chained log (`audit_row_change`); that is not built here.

**Refers to:** none

**Referenced by:** none

### core_vendor

**Purpose:** Vendor master: hire vendors that own equipment units. A new vendor is Pending until approved.

**Schema:** tenant_<id>  ·  **Application:** P&M  ·  **Columns:** 11

| Column | Type | Notes |
|---|---|---|
| `code` | text | For example VEN-001. |
| `name` | text |  |
| `status` | text | Pending, Active or Inactive. |
| `approval_request_id` | uuid | references [`core_approval_request`](#core_approval_request); nullable. |
| `gstin` | text |  |
| `pan` | text |  |
| `email` | text |  |
| `phone` | text |  |
| `address` | text |  |
| `registered_by` | uuid | references [`core_user`](#core_user) |
| `verified_at` | timestamptz | Null until the bank account is verified. |

Seed: VEN-001 "Hire vendor" (Active, verified) and VEN-002 "Sri Sai Earthmovers" (Pending).

**Refers to:** [`core_approval_request`](#core_approval_request) via `approval_request_id`, [`core_user`](#core_user) via `registered_by`

**Referenced by:** [`core_equipment_unit`](#core_equipment_unit) via `vendor_id`

## Frontend-only state (not in any table above)

These parts of the running application are held in the browser and are not part of the data model:

- **Core entities** (`useCore`) are in memory only. The store has no persistence and is seeded from `src/modules/core-data/data/seed.ts`, so a reload resets everything.
- **Session and user** (`useAuth`) persist to sessionStorage.
- **Shell preferences** (`useShell`) persist to localStorage.
- **Notifications** are toasts (`notify`), not stored notifications. There is no notification table.
- **Files** (logo and offer letter) are data URLs inside the entity. There is no file table in the frontend. The offer letter carries a `fileId` that changes on every upload.
- **Password reset** sets a flag on the user; no credential is stored.

## Open decisions for the backend

1. **Project and location link.** The frontend keeps the link on the project side (`core_project_location`). The reference design puts the link on the location (`core_location` belongs to a project). One side must win.
2. **Plan tables.** The frontend has three plan types (`core_plan_line`, `core_people_plan_line`, `core_material_plan_line`). The reference design merges them into one `core_plan_line` with a `resource_kind`. Decide whether to merge.
3. **Support tickets.** `core_ticket` here corresponds to `support_issue` in Platform Administration. Pick one name.
4. **Rules and overtime rows.** Rules and the overtime body are kept as JSON inside `core_policy_version`. Decide whether they need their own tables.
5. **Equipment compliance columns.** The 40-column `core_equipment_unit` could be split into identity, compliance and hire tables.
6. **Equipment type by name.** Plan lines, assignments and units still reference `core_equipment_type` by name; switch to `equipment_type_id`.
7. **Store location.** `core_store.location_id` is chosen independently of the chainage marker; the backend should check the location belongs to the marker's project.
