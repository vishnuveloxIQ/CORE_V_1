# VeloxIQ Core application: team handoff

This document is for the Core development team. Core holds the shared foundation that every other application uses: the company, branches, projects and locations, master data, users and access, approvals, leave and overtime policies, files, notifications, timelines, imports, and the integration and audit services. Build against this document. If a table or column must change, raise it before writing code, because other applications refer to Core tables.

- **Core tables (`core_*`):** 52
- **Integration and audit services owned by Core:** 5 (`integ_*`, `audit_*`)
- **Tables outside Core that Core refers to:** 2
- **Tables outside Core that refer to Core:** 110 (see section 6)
- **Standard columns on every table:** id, created_at, created_by, updated_at, updated_by, row_version. No tenant_id: the tenant schema is the boundary.
- **Full structure:** [Integrated ERP document](00_Integrated_ERP.md). Other modules: [HRMS](02_HRMS.md), [P&M](03_PM.md), [PMS](04_PMS.md), [Stores](05_Stores.md).

## 1. How the database is laid out

- **One PostgreSQL database.** Each tenant has its own schema, `tenant_<id>`, holding all business tables for that tenant.
- **Tenant code connects to its own schema only.** The tenant is taken from the verified session. The search path is set per transaction with `SET LOCAL`.
- **Shared reference schema** (`shared`) holds read-only codes such as units of measure. Core reads it; it does not write to it.
- **Platform schemas** (`public`, `control`) belong to the super-admin plane. Core code does not use them.
- **Table names carry the owning module.** Core tables start with `core_`. Other applications may read Core tables but change them only through the Core API.
- **No `tenant_id`** on business tables. The schema is the boundary.

![Structure diagram](../00_structure_diagram.png)

## 2. Naming rules

These rules apply to every table. They remove the mix of text and ID references found in round 1.

- **Internal reference:** `<entity>_id` of type `uuid`, pointing to a table in the same tenant schema.
- **External key:** `<name>_key` or `<name>_code` of type `text`, for a value issued by another system or a printed number. It is not a foreign key.
- **Polymorphic reference:** `<x>_module` (text) with `<x>_record_id` (uuid), when the target table depends on a module value.
- **Approval requests:** `approval_request_id` is `uuid` in every table that uses it. The key type is fixed for `core_approval_request`.
- **Locations:** a `location` is a work site. A `storage_location` is a bin or rack inside a store.
- **Users:** `core_user` is the single identity table. Employees link to it through `employee_id`.

## 3. Core tables

These tables belong to Core. Core code creates, changes and reads them. Other applications read them through Core.

| # | Table | Purpose | Columns | Refers to |
|---|---|---|---|---|
| 1 | [`core_company_profile`](#core_company_profile) | The company's legal and contact details (one row per tenant), the logo file, and company settings as JSON (keys listed in the Core handoff, section 8). | 21 | `core_file` |
| 2 | [`core_vendor`](#core_vendor) | Vendor master: code, name, GSTIN, PAN, contact, address and bank-verification status. Frontend shows vendors as equipment owners and hire vendors. | 13 | `core_approval_request`, `core_user` |
| 3 | [`core_role`](#core_role) | Roles that group privileges. Users hold roles through core_user_access; approval levels may name a role. | 3 | - |
| 4 | [`core_equipment_type`](#core_equipment_type) | Equipment type master (Core): code, name, meter kind and precision, fuel norm unit and the tolerance settings key. Equipment units refer to it. | 8 | - |
| 5 | [`core_location`](#core_location) | Work sites. Each location belongs to a project and carries its chainage range (km), its contact details and an optional week-off override (null means the company week-off on core_shift). | 17 | `core_project` |
| 6 | [`core_project`](#core_project) | Projects (contracts or works) with client, dates, value and description. Chainage ranges are held on each location. | 9 | - |
| 7 | [`core_store`](#core_store) | Stores (warehouses) at a location and chainage point, with keeper and contact details. | 9 | `core_chainage_marker`, `core_location` |
| 8 | [`core_wbs_node`](#core_wbs_node) | Work breakdown structure nodes under a project. | 6 | `core_project`, `core_wbs_node` |
| 9 | [`core_chainage_marker`](#core_chainage_marker) | Chainage markers (CH-n) along a linear project, in km, with a label and the WBS node they sit on. | 6 | `core_project`, `core_wbs_node` |
| 10 | [`core_material`](#core_material) | Materials with category, sub-category, unit, HSN code and reorder level. | 9 | - |
| 11 | [`core_major_material_allocation`](#core_major_material_allocation) | Major material allocated to a project, with quantity, unit, material and the date it is required by. | 7 | `core_material`, `core_project` |
| 12 | [`core_plan_line`](#core_plan_line) | Planned requirements per project for equipment, people or material (resource_kind), with dates and status. Replaces three plan tables. From the frontend draft. Proposed; not in source documents. | 15 | `core_equipment_type`, `core_material`, `core_position`, `core_project`, `core_store` |
| 13 | [`core_user`](#core_user) | Every CORE user: login, name, contact, employee link, position, scope, password and PIN hashes (argon2id), and login state. | 16 | `core_position` |
| 14 | [`core_user_passkey`](#core_user_passkey) | Passkey (WebAuthn) credentials registered by a user. Password and PIN are on core_user. | 5 | `core_user` |
| 15 | [`core_user_access`](#core_user_access) | Access grants per user: module head responsibilities, role codes, privileges, project, location and store scopes, and suspensions. | 11 | `core_location`, `core_project`, `core_role`, `core_store`, `core_user` |
| 16 | [`core_user_session`](#core_user_session) | Login sessions with device, refresh-token hash and expiry. | 7 | `core_user` |
| 17 | [`core_auth_activity`](#core_auth_activity) | Authentication events: login attempts, OTPs and passkey challenges, with IP and geo location. | 10 | `core_user` |
| 18 | [`core_policy`](#core_policy) | Named business policies such as payment thresholds. | 4 | - |
| 19 | [`core_policy_version`](#core_policy_version) | Versioned body of each policy, with its effective date and reason. | 6 | `core_policy` |
| 20 | [`core_ot_policy`](#core_ot_policy) | Overtime rules: rates, limits and compensatory-off settings. | 15 | - |
| 21 | [`core_number_series`](#core_number_series) | Document number counters per series and year. | 4 | - |
| 22 | [`core_holiday`](#core_holiday) | Company holidays by date, with type and whether the holiday is optional. | 8 | `core_company_profile`, `core_project` |
| 23 | [`core_shift`](#core_shift) | Shift timings, with weekly off days and their effective period (merged from the week-off pattern). | 11 | `core_company_profile` |
| 24 | [`core_approval_chain`](#core_approval_chain) | One approval chain per request type and module. A project-scope chain carries its project; a company-scope chain does not. | 8 | `core_project`, `core_user` |
| 25 | [`core_matrix_version`](#core_matrix_version) | Published versions of an approval matrix. | 5 | `core_approval_chain` |
| 26 | [`core_matrix_level`](#core_matrix_level) | Approval levels in a matrix version, with approver user, escalation user, timeout and cash limit. | 10 | `core_matrix_version`, `core_role`, `core_user` |
| 27 | [`core_approval_request`](#core_approval_request) | One approval case per business request, with code, status, current level, chainage and payload. | 23 | `core_approval_chain`, `core_chainage_marker`, `core_location`, `core_matrix_version`, `core_user` |
| 28 | [`core_approval_action`](#core_approval_action) | Each action taken on a request: raised, approved, rejected, escalated or commented. | 10 | `core_approval_request`, `core_user` |
| 29 | [`core_grievance`](#core_grievance) | Grievances raised by a person: code, subject, first message, status, requested visit date and linked employee. Follow-up messages are in core_record_timeline. | 12 | `core_user` |
| 30 | [`core_notification`](#core_notification) | In-app notifications to users, with read status. | 8 | `core_user` |
| 31 | [`core_file`](#core_file) | Metadata for every uploaded file, linked to its owner; content is in object storage. | 9 | - |
| 32 | [`core_record_timeline`](#core_record_timeline) | Status history and discussion for any business record, including grievance messages (internal or not). | 15 | `core_user` |
| 33 | [`core_import_batch`](#core_import_batch) | Bulk upload batches with validation counts and preview expiry. | 12 | `core_file` |
| 34 | [`core_usage_counter`](#core_usage_counter) | Weekly counters for metered actions, compared with plan limits. | 4 | - |
| 35 | [`core_department`](#core_department) | Departments as a tree, with a head position and a colour for the organogram. From the frontend draft; not in source documents. Proposed; not in source documents. | 8 | `core_department`, `core_position` |
| 36 | [`core_position`](#core_position) | Organisation positions (grade, reporting line, planned headcount). Separate from access roles. From the frontend draft. Proposed; not in source documents. | 9 | `core_department`, `core_position` |
| 37 | [`core_geo_zone`](#core_geo_zone) | Geo-fence zones of a project: radius, polygon or corridor. Used by attendance and equipment. From the frontend draft. Proposed; not in source documents. | 10 | `core_project` |
| 38 | [`core_project_milestone`](#core_project_milestone) | Milestones of a project with due date, weight and status. From the frontend draft. Proposed; not in source documents. | 5 | `core_project` |
| 39 | [`core_pms_limit_row`](#core_pms_limit_row) | Approval time and amount limits per tier and priority (normal or emergency). From the frontend draft. Proposed; not in source documents. | 7 | - |
| 40 | [`core_policy_rule`](#core_policy_rule) | Rules inside a company rules policy version, with category and acknowledgement flag. From the frontend draft. Proposed; not in source documents. | 5 | `core_policy_version` |
| 41 | [`core_policy_rule_ack`](#core_policy_rule_ack) | Record of each user's acknowledgement of a policy rule. From the frontend draft. Proposed; not in source documents. | 3 | `core_policy_rule`, `core_user` |
| 42 | [`core_custom_policy_field`](#core_custom_policy_field) | Fields of a custom policy: label, type, required flag and choices for select fields. Proposed; not in source documents. | 6 | `core_custom_policy` |
| 43 | [`core_custom_policy`](#core_custom_policy) | Custom policies defined by an administrator. From the frontend draft. Proposed; not in source documents. | 2 | - |
| 44 | [`core_custom_policy_version`](#core_custom_policy_version) | Versioned answers to a custom policy, keyed by field. From the frontend draft. Proposed; not in source documents. | 5 | `core_custom_policy` |
| 45 | [`core_document_template`](#core_document_template) | Document templates. The offer letter is one row (code offer_letter) with its file and revision. Proposed; not in source documents. | 9 | `core_file` |
| 46 | [`core_ot_policy_rule`](#core_ot_policy_rule) | Rules inside an overtime policy, with effective dates. Proposed; not in source documents. | 5 | `core_ot_policy` |
| 47 | [`core_equipment_assignment`](#core_equipment_assignment) | Count of units of one equipment type allocated to a project. | 5 | `core_equipment_type`, `core_project`, `core_user` |
| 48 | [`core_leave_type`](#core_leave_type) | Leave types such as casual, sick or earned leave, with accrual, carry-forward and encashment rules. Owned by Core with the leave policy. Proposed; not in source documents. | 10 | - |
| 49 | [`core_leave_policy`](#core_leave_policy) | Leave policies with their leave year (start and end), status and effective period. Proposed; not in source documents. | 7 | - |
| 50 | [`core_leave_policy_rule`](#core_leave_policy_rule) | Accrual and eligibility rules per leave policy and leave type. Proposed; not in source documents. | 5 | `core_leave_policy`, `core_leave_type` |
| 51 | [`core_import_row`](#core_import_row) | Result of each row in a bulk upload batch. | 9 | `core_import_batch` |
| 52 | [`core_ticket`](#core_ticket) | Tenant-side support tickets raised by users inside the app. Platform support (tenant admin to VeloxIQ) is public.support_issue, a separate record. | 7 | `core_user` |

## 4. Integration and audit services owned by Core

These run under the Core team. Every application uses them for events, idempotent requests, offline sync and the audit trail.

| Table | Purpose |
|---|---|
| [`integ_event`](#integ_event) | Events in and out: outbox to publish, inbox received, and failures in the dead-letter state, with retry and replay. |
| [`integ_idempotency_key`](#integ_idempotency_key) | Stored responses for repeated requests with the same key. |
| [`integ_aggregate_sequence`](#integ_aggregate_sequence) | Last sequence number per business aggregate, for ordering events. |
| [`integ_offline_operation`](#integ_offline_operation) | Operations captured offline on devices and synced later. |
| [`audit_row_change`](#audit_row_change) | Hash-chained log of every row change with old and new values. |

## 5. Tables outside Core that Core refers to

Core cannot store these references without these tables. They are owned by the module named in the table. Core reads them where needed and does not change their structure.

| Table | Owner | Purpose | Core columns that point to it |
|---|---|---|---|
| [`uom`](#uom) | Platform Administration | Units of measure used by materials and stores. | `core_major_material_allocation.uom_id`, `core_material.uom_id`, `core_plan_line.uom_id` |
| [`hrms_employee`](#hrms_employee) | HRMS | Employee master record: code, name, primary phone and email with verification dates, personal details, emergency contact, current and permanent addresses, employment status and onboarding status. Contacts and addresses are held here as fixed slots (see CHANGES_ROUND7.md). | `core_grievance.employee_id`, `core_user.employee_id` |

## 6. Tables outside Core that refer to Core

Other applications store Core records in these columns. Core must keep these records valid and must not delete or change the ids they depend on without agreement with the owning team.

| Table | Column | Points to |
|---|---|---|
| `hrms_attendance_event` (see 02_HRMS.md) | `geofence_id` | [`core_geo_zone`](#core_geo_zone) |
| `hrms_attendance_event` (see 02_HRMS.md) | `media_file_id` | [`core_file`](#core_file) |
| `hrms_attendance_record` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_attendance_record` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `hrms_attendance_record` (see 02_HRMS.md) | `shift_id` | [`core_shift`](#core_shift) |
| `hrms_candidate_application` (see 02_HRMS.md) | `selection_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| [`hrms_employee`](#hrms_employee) | `admin_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| [`hrms_employee`](#hrms_employee) | `import_row_id` | [`core_import_row`](#core_import_row) |
| [`hrms_employee`](#hrms_employee) | `user_id` | [`core_user`](#core_user) |
| `hrms_employee_claim` (see 02_HRMS.md) | `admin_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `hrms_employee_document` (see 02_HRMS.md) | `document_file_id` | [`core_file`](#core_file) |
| `hrms_employee_employment` (see 02_HRMS.md) | `department_id` | [`core_department`](#core_department) |
| `hrms_employee_employment` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_employee_employment` (see 02_HRMS.md) | `position_id` | [`core_position`](#core_position) |
| `hrms_employee_employment` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `hrms_employee_incentive_calculation` (see 02_HRMS.md) | `admin_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `hrms_employee_salary_assignment` (see 02_HRMS.md) | `assigned_by_user_id` | [`core_user`](#core_user) |
| `hrms_expense_claim_item` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_expense_claim_item` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `hrms_interview_panel_member` (see 02_HRMS.md) | `panel_user_id` | [`core_user`](#core_user) |
| `hrms_job_opening` (see 02_HRMS.md) | `department_id` | [`core_department`](#core_department) |
| `hrms_job_opening` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_job_opening` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `hrms_leave_application` (see 02_HRMS.md) | `leave_policy_id` | [`core_leave_policy`](#core_leave_policy) |
| `hrms_leave_application` (see 02_HRMS.md) | `leave_policy_rule_id` | [`core_leave_policy_rule`](#core_leave_policy_rule) |
| `hrms_leave_application` (see 02_HRMS.md) | `leave_type_id` | [`core_leave_type`](#core_leave_type) |
| `hrms_leave_application` (see 02_HRMS.md) | `reviewed_by_user_id` | [`core_user`](#core_user) |
| `hrms_leave_balance` (see 02_HRMS.md) | `leave_policy_id` | [`core_leave_policy`](#core_leave_policy) |
| `hrms_leave_balance` (see 02_HRMS.md) | `leave_policy_rule_id` | [`core_leave_policy_rule`](#core_leave_policy_rule) |
| `hrms_leave_balance` (see 02_HRMS.md) | `leave_type_id` | [`core_leave_type`](#core_leave_type) |
| `hrms_leave_transaction` (see 02_HRMS.md) | `leave_policy_id` | [`core_leave_policy`](#core_leave_policy) |
| `hrms_leave_transaction` (see 02_HRMS.md) | `leave_policy_rule_id` | [`core_leave_policy_rule`](#core_leave_policy_rule) |
| `hrms_leave_transaction` (see 02_HRMS.md) | `leave_type_id` | [`core_leave_type`](#core_leave_type) |
| `hrms_letter_issuance` (see 02_HRMS.md) | `document_file_id` | [`core_file`](#core_file) |
| `hrms_letter_issuance` (see 02_HRMS.md) | `document_template_id` | [`core_document_template`](#core_document_template) |
| `hrms_letter_issuance` (see 02_HRMS.md) | `issued_by_user_id` | [`core_user`](#core_user) |
| `hrms_offboarding_clearance_item` (see 02_HRMS.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `hrms_offboarding_clearance_item` (see 02_HRMS.md) | `owner_user_id` | [`core_user`](#core_user) |
| `hrms_offer_letter` (see 02_HRMS.md) | `auth_activity_id` | [`core_auth_activity`](#core_auth_activity) |
| `hrms_offer_letter` (see 02_HRMS.md) | `document_file_id` | [`core_file`](#core_file) |
| `hrms_offer_letter` (see 02_HRMS.md) | `document_template_id` | [`core_document_template`](#core_document_template) |
| `hrms_onboarding_task` (see 02_HRMS.md) | `assigned_user_id` | [`core_user`](#core_user) |
| `hrms_onboarding_task` (see 02_HRMS.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `hrms_overtime_request` (see 02_HRMS.md) | `policy_id` | [`core_ot_policy`](#core_ot_policy) |
| `hrms_overtime_request` (see 02_HRMS.md) | `policy_rule_id` | [`core_ot_policy_rule`](#core_ot_policy_rule) |
| `hrms_overtime_request` (see 02_HRMS.md) | `reviewed_by_user_id` | [`core_user`](#core_user) |
| `hrms_payroll_adjustment` (see 02_HRMS.md) | `approved_by_user_id` | [`core_user`](#core_user) |
| `hrms_payroll_run` (see 02_HRMS.md) | `admin_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `hrms_separation_request` (see 02_HRMS.md) | `admin_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `hrms_separation_request` (see 02_HRMS.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `hrms_shift_assignment` (see 02_HRMS.md) | `assigned_by_user_id` | [`core_user`](#core_user) |
| `hrms_shift_assignment` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_shift_assignment` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `hrms_shift_assignment` (see 02_HRMS.md) | `shift_id` | [`core_shift`](#core_shift) |
| `hrms_timesheet_entry` (see 02_HRMS.md) | `location_id` | [`core_location`](#core_location) |
| `hrms_timesheet_entry` (see 02_HRMS.md) | `project_id` | [`core_project`](#core_project) |
| `pm_allocation` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_allocation` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_allocation` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_allocation_reassignment` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_allocation_reassignment` (see 03_PM.md) | `target_location_id` | [`core_location`](#core_location) |
| `pm_amc_contract` (see 03_PM.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `pm_amc_service_visit` (see 03_PM.md) | `service_file_id` | [`core_file`](#core_file) |
| `pm_amc_service_visit` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_category_fuel` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_category_fuel` (see 03_PM.md) | `material_id` | [`core_material`](#core_material) |
| `pm_checklist_run` (see 03_PM.md) | `performed_by_user_id` | [`core_user`](#core_user) |
| `pm_checklist_run` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_checklist_run_item` (see 03_PM.md) | `photo_file_id` | [`core_file`](#core_file) |
| `pm_checklist_template` (see 03_PM.md) | `approved_by_user_id` | [`core_user`](#core_user) |
| `pm_checklist_template` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_commissioning` (see 03_PM.md) | `checker_user_id` | [`core_user`](#core_user) |
| `pm_commissioning` (see 03_PM.md) | `releaser_user_id` | [`core_user`](#core_user) |
| `pm_commissioning_defect` (see 03_PM.md) | `rechecked_by_user_id` | [`core_user`](#core_user) |
| `pm_cost_ledger_entry` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_cost_ledger_entry` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_cost_ledger_entry` (see 03_PM.md) | `wbs_id` | [`core_wbs_node`](#core_wbs_node) |
| `pm_deferral` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_disposal` (see 03_PM.md) | `core_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_document_type` (see 03_PM.md) | `approved_by_user_id` | [`core_user`](#core_user) |
| `pm_dpr_publication` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_dpr_publication` (see 03_PM.md) | `published_by_user_id` | [`core_user`](#core_user) |
| `pm_dpr_publication` (see 03_PM.md) | `report_file_id` | [`core_file`](#core_file) |
| `pm_equipment` (see 03_PM.md) | `current_location_id` | [`core_location`](#core_location) |
| `pm_equipment` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_equipment` (see 03_PM.md) | `initial_core_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_equipment_cost_centre` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_equipment_cost_centre` (see 03_PM.md) | `wbs_id` | [`core_wbs_node`](#core_wbs_node) |
| `pm_equipment_document` (see 03_PM.md) | `document_file_id` | [`core_file`](#core_file) |
| `pm_equipment_document` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_equipment_request` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_equipment_request` (see 03_PM.md) | `core_plan_line_id` | [`core_plan_line`](#core_plan_line) |
| `pm_equipment_request` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_equipment_request` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_equipment_request` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_equipment_request` (see 03_PM.md) | `requested_by_user_id` | [`core_user`](#core_user) |
| `pm_equipment_request` (see 03_PM.md) | `wbs_id` | [`core_wbs_node`](#core_wbs_node) |
| `pm_equipment_requirement_line` (see 03_PM.md) | `core_plan_line_id` | [`core_plan_line`](#core_plan_line) |
| `pm_equipment_requirement_line` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_equipment_requirement_line` (see 03_PM.md) | `wbs_id` | [`core_wbs_node`](#core_wbs_node) |
| `pm_fuel_request` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_fuel_request` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_fuel_request` (see 03_PM.md) | `requested_by_user_id` | [`core_user`](#core_user) |
| `pm_fuel_request_line` (see 03_PM.md) | `cleared_by_user_id` | [`core_user`](#core_user) |
| `pm_fuel_request_line` (see 03_PM.md) | `material_id` | [`core_material`](#core_material) |
| `pm_fuel_variance_flag` (see 03_PM.md) | `reviewed_by_user_id` | [`core_user`](#core_user) |
| `pm_hire_bill` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_hire_contract` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_hire_contract` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_hire_contract` (see 03_PM.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `pm_incident` (see 03_PM.md) | `last_known_location_id` | [`core_location`](#core_location) |
| `pm_incident` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_incident` (see 03_PM.md) | `policy_file_id` | [`core_file`](#core_file) |
| `pm_incident` (see 03_PM.md) | `reported_by_user_id` | [`core_user`](#core_user) |
| `pm_incident_corrective_action` (see 03_PM.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `pm_incident_corrective_action` (see 03_PM.md) | `responsible_user_id` | [`core_user`](#core_user) |
| `pm_incident_corrective_action` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_inspection` (see 03_PM.md) | `inspector_user_id` | [`core_user`](#core_user) |
| `pm_inspection` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_job_card` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_job_card` (see 03_PM.md) | `verified_by_user_id` | [`core_user`](#core_user) |
| `pm_job_card_part` (see 03_PM.md) | `material_id` | [`core_material`](#core_material) |
| `pm_logbook` (see 03_PM.md) | `core_shift_id` | [`core_shift`](#core_shift) |
| `pm_logbook` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_logbook_entry` (see 03_PM.md) | `chainage_id` | [`core_chainage_marker`](#core_chainage_marker) |
| `pm_logbook_entry` (see 03_PM.md) | `wbs_id` | [`core_wbs_node`](#core_wbs_node) |
| `pm_lubricant_log` (see 03_PM.md) | `lubricant_material_id` | [`core_material`](#core_material) |
| `pm_maintenance_plan` (see 03_PM.md) | `equipment_type_id` | [`core_equipment_type`](#core_equipment_type) |
| `pm_management_follow_up` (see 03_PM.md) | `assigned_to_user_id` | [`core_user`](#core_user) |
| `pm_management_follow_up` (see 03_PM.md) | `location_id` | [`core_location`](#core_location) |
| `pm_management_follow_up` (see 03_PM.md) | `project_id` | [`core_project`](#core_project) |
| `pm_meter_reading` (see 03_PM.md) | `photo_file_id` | [`core_file`](#core_file) |
| `pm_meter_reading` (see 03_PM.md) | `proof_file_id` | [`core_file`](#core_file) |
| `pm_movement` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_movement` (see 03_PM.md) | `from_location_id` | [`core_location`](#core_location) |
| `pm_movement` (see 03_PM.md) | `received_by_user_id` | [`core_user`](#core_user) |
| `pm_movement` (see 03_PM.md) | `to_location_id` | [`core_location`](#core_location) |
| `pm_movement_discrepancy` (see 03_PM.md) | `responsible_user_id` | [`core_user`](#core_user) |
| `pm_outside_service` (see 03_PM.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `pm_registration_review` (see 03_PM.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `pm_registration_review` (see 03_PM.md) | `reviewed_by_user_id` | [`core_user`](#core_user) |
| `pm_request_revision` (see 03_PM.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pm_request_revision` (see 03_PM.md) | `submitted_by_user_id` | [`core_user`](#core_user) |
| `pm_safety_restriction` (see 03_PM.md) | `clearance_file_id` | [`core_file`](#core_file) |
| `pm_safety_restriction` (see 03_PM.md) | `cleared_by_user_id` | [`core_user`](#core_user) |
| `pm_spot_check` (see 03_PM.md) | `checker_user_id` | [`core_user`](#core_user) |
| `pm_spot_check` (see 03_PM.md) | `fuel_photo_file_id` | [`core_file`](#core_file) |
| `pm_spot_check` (see 03_PM.md) | `meter_photo_file_id` | [`core_file`](#core_file) |
| `pm_vrr_photo` (see 03_PM.md) | `file_id` | [`core_file`](#core_file) |
| `pms_payable` (see 04_PMS.md) | `accepted_by` | [`core_user`](#core_user) |
| `pms_payable` (see 04_PMS.md) | `location_id` | [`core_location`](#core_location) |
| `pms_payable` (see 04_PMS.md) | `paid_by` | [`core_user`](#core_user) |
| `pms_payable` (see 04_PMS.md) | `policy_version_id` | [`core_policy_version`](#core_policy_version) |
| `pms_payable` (see 04_PMS.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `pms_petty_cash_request` (see 04_PMS.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pms_petty_cash_request` (see 04_PMS.md) | `location_id` | [`core_location`](#core_location) |
| `pms_petty_cash_request` (see 04_PMS.md) | `project_id` | [`core_project`](#core_project) |
| `pms_petty_cash_request` (see 04_PMS.md) | `requester_id` | [`core_user`](#core_user) |
| `pms_vendor_payment` (see 04_PMS.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `pms_vendor_payment` (see 04_PMS.md) | `location_id` | [`core_location`](#core_location) |
| `pms_vendor_payment` (see 04_PMS.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_fuel_bowser_reconciliation` (see 05_Stores.md) | `reconciled_by` | [`core_user`](#core_user) |
| `stores_fuel_dispense` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_fuel_dispense` (see 05_Stores.md) | `verified_by` | [`core_user`](#core_user) |
| `stores_fuel_storage` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_fuel_tank_transfer` (see 05_Stores.md) | `recorded_by` | [`core_user`](#core_user) |
| `stores_gate_pass` (see 05_Stores.md) | `from_store_id` | [`core_store`](#core_store) |
| `stores_gate_pass` (see 05_Stores.md) | `to_store_id` | [`core_store`](#core_store) |
| `stores_gate_pass_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_grn` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_grn` (see 05_Stores.md) | `proof_file_id` | [`core_file`](#core_file) |
| `stores_grn` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_grn` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_grn_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_issue_return` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_issue_return` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_issue_return` (see 05_Stores.md) | `verified_by` | [`core_user`](#core_user) |
| `stores_issue_voucher` (see 05_Stores.md) | `destination_location_id` | [`core_location`](#core_location) |
| `stores_issue_voucher` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_issue_voucher_line` (see 05_Stores.md) | `ack_by` | [`core_user`](#core_user) |
| `stores_issue_voucher_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_lending_extension` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_lending_request` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_lending_request` (see 05_Stores.md) | `borrower_location_id` | [`core_location`](#core_location) |
| `stores_lending_request` (see 05_Stores.md) | `project_id` | [`core_project`](#core_project) |
| `stores_lending_request` (see 05_Stores.md) | `requested_by` | [`core_user`](#core_user) |
| `stores_lending_request` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_lending_request_line` (see 05_Stores.md) | `debit_approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_lending_request_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_location_consumption` (see 05_Stores.md) | `consumed_by` | [`core_user`](#core_user) |
| `stores_location_consumption` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_location_consumption` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_material_request` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_material_request` (see 05_Stores.md) | `department_id` | [`core_department`](#core_department) |
| `stores_material_request` (see 05_Stores.md) | `from_store_id` | [`core_store`](#core_store) |
| `stores_material_request` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_material_request` (see 05_Stores.md) | `project_id` | [`core_project`](#core_project) |
| `stores_material_request` (see 05_Stores.md) | `requested_by` | [`core_user`](#core_user) |
| `stores_material_request` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_material_request_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_payment_hold` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_payment_hold` (see 05_Stores.md) | `released_by` | [`core_user`](#core_user) |
| `stores_physical_count` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_physical_count` (see 05_Stores.md) | `counted_by` | [`core_user`](#core_user) |
| `stores_physical_count` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_physical_count_line` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_physical_count_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_po_change` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_po_change` (see 05_Stores.md) | `proposed_by` | [`core_user`](#core_user) |
| `stores_po_vendor_response` (see 05_Stores.md) | `recorded_by` | [`core_user`](#core_user) |
| `stores_purchase_order` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_purchase_order` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_purchase_order` (see 05_Stores.md) | `purchaser_company_profile_id` | [`core_company_profile`](#core_company_profile) |
| `stores_purchase_order` (see 05_Stores.md) | `requester_id` | [`core_user`](#core_user) |
| `stores_purchase_order` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_purchase_order` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_purchase_order_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_quality_hold` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_quality_hold` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_quality_hold` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_quality_hold` (see 05_Stores.md) | `released_by` | [`core_user`](#core_user) |
| `stores_quality_hold` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_quotation` (see 05_Stores.md) | `file_id` | [`core_file`](#core_file) |
| `stores_quotation` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_quotation_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_rfq` (see 05_Stores.md) | `destination_store_id` | [`core_store`](#core_store) |
| `stores_rfq` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_rfq` (see 05_Stores.md) | `project_id` | [`core_project`](#core_project) |
| `stores_rfq` (see 05_Stores.md) | `purchaser_company_profile_id` | [`core_company_profile`](#core_company_profile) |
| `stores_rfq_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_rfq_message` (see 05_Stores.md) | `attachment_file_id` | [`core_file`](#core_file) |
| `stores_rfq_message` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_rfq_vendor` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_rtv` (see 05_Stores.md) | `closed_by` | [`core_user`](#core_user) |
| `stores_rtv` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_stock_adjustment` (see 05_Stores.md) | `approval_request_id` | [`core_approval_request`](#core_approval_request) |
| `stores_stock_adjustment` (see 05_Stores.md) | `evidence_file_id` | [`core_file`](#core_file) |
| `stores_stock_adjustment` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_stock_adjustment` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_stock_adjustment` (see 05_Stores.md) | `verified_by` | [`core_user`](#core_user) |
| `stores_stock_balance` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_stock_balance` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_stock_balance` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_stock_ledger` (see 05_Stores.md) | `location_id` | [`core_location`](#core_location) |
| `stores_stock_ledger` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `stores_stock_ledger` (see 05_Stores.md) | `posted_by` | [`core_user`](#core_user) |
| `stores_stock_ledger` (see 05_Stores.md) | `project_id` | [`core_project`](#core_project) |
| `stores_stock_ledger` (see 05_Stores.md) | `store_id` | [`core_store`](#core_store) |
| `stores_vendor_invoice` (see 05_Stores.md) | `file_id` | [`core_file`](#core_file) |
| `stores_vendor_invoice` (see 05_Stores.md) | `vendor_id` | [`core_vendor`](#core_vendor) |
| `stores_vendor_invoice_line` (see 05_Stores.md) | `material_id` | [`core_material`](#core_material) |
| `support_issue` (see 06_Platform_Administration.md) | `raised_by_user_id` | [`core_user`](#core_user) |

## 7. Decisions taken

Round 10 removed the vendor, role and equipment type masters, and round 11 restored them. The frontend depends on all three. Decisions below are the current position.

| Item | Decision |
|---|---|
| Vendor master | `core_vendor` restored. Vendor references are `vendor_id`. Holds GSTIN, PAN, contact and bank-verification status. |
| Role master | `core_role` restored. Users hold roles through `core_user_access.role_id`. Approval levels name an approver user first (`approver_user_id`); `approver_role_id` is optional. |
| Equipment type | `core_equipment_type` restored as the Core type master, which the source P&M document also names. Equipment units refer to it by id. The type's attributes are no longer copied onto each unit. |
| Equipment owner | P&M owns the equipment unit (`pm_equipment`). Core owns the type master. The frontend reads units through P&M. |
| Storage bins | Not a table. Stock requests and quality holds carry `storage_location_code`, a text label. The frontend has no bins. |
| Due date on approval requests | Removed. The frontend has no due date and the meaning was not stated. |
| Week-off | Company-wide default on `core_shift.week_off_days_json`. A site can override it with `core_location.week_off_days_json`; null means the company default. |
| Password hashing | argon2id for passwords and PINs, stored only as hashes in `core_user`. Passkeys store the public key and sign count only. |
| Settings | Held as JSON on `core_company_profile.settings_json`. Key list in section 8. |
| Policy bodies | Kept as tables (HRMS refers to shift, holiday, overtime and leave rows by foreign key). The API builds the JSON the frontend expects. |
| Tickets | Two records, not one: `core_ticket` for tickets raised inside a tenant; `public.support_issue` for tenant-to-VeloxIQ support. Not linked. |
| Chainage unit | Kilometres everywhere: `core_chainage_marker.chainage_km` and the chainage range on `core_location`. Matches the frontend. |
| WBS link | `core_chainage_marker.wbs_node_id` (uuid) kept. The API returns the WBS code. |
| Material unit | `core_material.uom_id` (shared unit table) kept. The API returns the unit code. |
| Columns with inferred types | All Core columns now have explicit types (see the details). |

## 8. Items to confirm before DDL

- **Proposed Core tables still awaiting sign-off** (not in the source document): `core_plan_line`, `core_department`, `core_position`, `core_geo_zone`, `core_project_milestone`, `core_pms_limit_row`, `core_policy_rule`, `core_policy_rule_ack`, `core_custom_policy_field`, `core_document_template`, `core_ot_policy_rule`, `core_leave_type`, `core_leave_policy`, `core_leave_policy_rule`, `core_custom_policy`, `core_custom_policy_version`. This needs the team's sign-off; the structure is not changed by this document. **Approved 2026-11-19** by the user ("go with your recommendations"), together with the decisions below.
- **Tables without columns in the source:** none.
- **Settings keys (`core_company_profile.settings_json`).** Two key families are used by the schema so far: `fuel.tolerance.<equipment_type_code>` (from `core_equipment_type.tolerance_setting_key`) and `fuel.variance_threshold.<flag_type>` (from `pm_fuel_variance_flag.threshold_setting_key`). The values are set by the company admin; the source documents do not give them. Each new key needs an entry here before it is used.
- **Passkeys** are in `core_user_passkey`, one row per registered device.
- **Session and access tables** stay separate from `core_user` (many rows per user).

No open references: every column that looks like a reference points to a defined table.

- **Design decisions.** Each recommendation below was approved on 2026-11-19 ("go with your recommendations"). The status line after each item says what the DDL and the code will do.
  - **Circular foreign keys.** Two pairs refer to each other: `core_department.head_position_id` and `core_position.department_id`; and `core_user.employee_id` and `hrms_employee.user_id`. Recommendation: make one side of each pair nullable and add that foreign key in a later migration step, after both tables exist. *Accepted:* the nullable side is added in a later migration step, after both tables exist.
  - **Owner of `uom` and the cross-schema foreign key.** Section 1 places units of measure in the `shared` schema; section 5 names Platform Administration as the owner. Recommendation: confirm the owner. If `shared` is correct, add the foreign keys to `shared.uom` after that table exists, and grant the application role read access only. *Accepted:* `uom` lives in the `shared` schema (section 1) and the foreign keys point to `shared.uom`. The owner in section 5 still needs confirming; this does not block DDL.
  - **Polymorphic references and their id types.** `<x>_module` with `<x>_record_id` has no database foreign key. `source_record_id` is `text` in some tables and `uuid` in others, and `linked_record_id` is `uuid`. Recommendation: validate the module value with a check constraint, validate the target in the service layer, and use one type for each `<x>_record_id`: `uuid`, unless the source is an external system, in which case `text` with the system named in the column note. *Accepted:* check constraint on module values; target validated in the service layer; `uuid` unless the source is external, then `text`.
  - **`correlation_id` type.** It is `text` in `audit_row_change` and in one other table, and `uuid` in `integ_event`. Recommendation: `text` everywhere, because request ids may come from clients or other systems. *Accepted:* `text` everywhere.
  - **Audit redaction and append-only rule.** `audit_row_change` must not store `password_hash`, `pin_hash`, `refresh_hash` or `secret_hash`. Recommendation: exclude these columns from audit snapshots, and revoke UPDATE and DELETE on `audit_row_change` from the application role. *Accepted:* the four hash columns are excluded from audit snapshots; the application role gets no UPDATE or DELETE on `audit_row_change`.
  - **Raw IP storage.** `core_auth_activity.ip_address` is `inet`; `audit_row_change` stores `ip_hash` only. Recommendation: keep the raw IP in `core_auth_activity` only, with a retention period set by the owner, and hash it everywhere else. *Accepted:* raw IP is kept only in `core_auth_activity`. The retention period is still to be set by the owner.
  - **OTP storage.** `core_auth_activity` records OTP events and stores `secret_hash`. Recommendation: confirm that OTP values are never stored in clear, only hashed, and expire. *Accepted:* OTP values are stored only as hashes, with an expiry.
  - **Naming drift across modules.** Core uses `approval_request_id`. Other modules use `core_approval_request_id` (`pm_disposal`), `initial_core_approval_request_id` (`pm_equipment`) and `admin_approval_request_id` (`hrms_employee`). The raised-by column is `raised_by`, `raised_by_id` or `raised_by_user_id` depending on the table. Recommendation: the owning modules rename to the section 2 rule. Their documents are not in this folder, so they are not changed here. *Accepted:* Core follows the section 2 rule. The owning modules rename their own columns; no change here.

## 9. Table details

Each table lists its columns, types, and the tables it refers to or is referred to by. Columns marked `type inferred from name` are not typed in the source and must be confirmed.

### Core tables

### core_company_profile

**Purpose:** The company's legal and contact details (one row per tenant), the logo file, and company settings as JSON (keys listed in the Core handoff, section 8).

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 21

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `code` | citext |  |
| `legal_name` | text |  |
| `status` | text |  |
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
| `contact_email` | citext |  |
| `contact_phone` | text |  |
| `website` | text |  |
| `logo_file_id` | uuid | references [`core_file`](#core_file) |
| `settings_json` | jsonb |  |

**Refers to:** [`core_file`](#core_file) via `logo_file_id`

**Referenced by:** [`core_holiday`](#core_holiday) via `company_profile_id`, [`core_shift`](#core_shift) via `company_profile_id`, `stores_rfq` (see 05_Stores.md) via `purchaser_company_profile_id`, `stores_purchase_order` (see 05_Stores.md) via `purchaser_company_profile_id`

### core_vendor

**Purpose:** Vendor master: code, name, GSTIN, PAN, contact, address and bank-verification status. Frontend shows vendors as equipment owners and hire vendors.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 13

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `source_record_id` | text |  |
| `code` | text |  |
| `name` | text |  |
| `status` | text |  |
| `approval_request_id` | uuid | references [`core_approval_request`](#core_approval_request) |
| `gstin` | text |  |
| `pan` | text |  |
| `email` | citext |  |
| `phone` | text |  |
| `address` | text |  |
| `registered_by` | uuid | references [`core_user`](#core_user) |
| `verified_at` | timestamptz |  |

**Refers to:** [`core_approval_request`](#core_approval_request) via `approval_request_id`, [`core_user`](#core_user) via `registered_by`

**Referenced by:** `pm_outside_service` (see 03_PM.md) via `vendor_id`, `pm_amc_contract` (see 03_PM.md) via `vendor_id`, `pm_hire_contract` (see 03_PM.md) via `vendor_id`, `pms_vendor_payment` (see 04_PMS.md) via `vendor_id`, `pms_payable` (see 04_PMS.md) via `vendor_id`, `stores_grn` (see 05_Stores.md) via `vendor_id`, `stores_rtv` (see 05_Stores.md) via `vendor_id`, `stores_rfq_vendor` (see 05_Stores.md) via `vendor_id`, `stores_rfq_message` (see 05_Stores.md) via `vendor_id`, `stores_quotation` (see 05_Stores.md) via `vendor_id`, `stores_purchase_order` (see 05_Stores.md) via `vendor_id`, `stores_vendor_invoice` (see 05_Stores.md) via `vendor_id`

### core_role

**Purpose:** Roles that group privileges. Users hold roles through core_user_access; approval levels may name a role.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 3

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `is_system` | boolean |  |

**Referenced by:** [`core_user_access`](#core_user_access) via `role_id`, [`core_matrix_level`](#core_matrix_level) via `approver_role_id`

### core_equipment_type

**Purpose:** Equipment type master (Core): code, name, meter kind and precision, fuel norm unit and the tolerance settings key. Equipment units refer to it.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `code` | citext |  |
| `name` | text |  |
| `meter_kind` | text |  |
| `meter_precision` | integer |  |
| `fuel_norm_unit` | text |  |
| `tolerance_setting_key` | text |  |
| `active` | boolean |  |

**Referenced by:** [`core_plan_line`](#core_plan_line) via `equipment_type_id`, [`core_equipment_assignment`](#core_equipment_assignment) via `equipment_type_id`, `pm_category_fuel` (see 03_PM.md) via `equipment_type_id`, `pm_equipment` (see 03_PM.md) via `equipment_type_id`, `pm_checklist_template` (see 03_PM.md) via `equipment_type_id`, `pm_equipment_requirement_line` (see 03_PM.md) via `equipment_type_id`, `pm_equipment_request` (see 03_PM.md) via `equipment_type_id`, `pm_maintenance_plan` (see 03_PM.md) via `equipment_type_id`

### core_location

**Purpose:** Work sites. Each location belongs to a project and carries its chainage range (km), its contact details and an optional week-off override (null means the company week-off on core_shift).

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 17

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `status` | text |  |
| `address_line` | text |  |
| `aggregate_seq` | bigint |  |
| `latitude` | numeric(9,6) |  |
| `longitude` | numeric(9,6) |  |
| `city` | text |  |
| `state` | text |  |
| `pin` | text |  |
| `in_charge` | text |  |
| `phone` | text |  |
| `email` | citext |  |
| `project_id` | uuid | references [`core_project`](#core_project) |
| `chainage_start_km` | numeric(12,3) |  |
| `chainage_end_km` | numeric(12,3) |  |
| `week_off_days_json` | jsonb |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** [`core_store`](#core_store) via `location_id`, [`core_user_access`](#core_user_access) via `location_id`, [`core_approval_request`](#core_approval_request) via `location_id`, `hrms_job_opening` (see 02_HRMS.md) via `location_id`, `hrms_employee_employment` (see 02_HRMS.md) via `location_id`, `hrms_shift_assignment` (see 02_HRMS.md) via `location_id`, `hrms_attendance_record` (see 02_HRMS.md) via `location_id`, `hrms_timesheet_entry` (see 02_HRMS.md) via `location_id`, `hrms_expense_claim_item` (see 02_HRMS.md) via `location_id`, `pm_equipment` (see 03_PM.md) via `current_location_id`, `pm_allocation` (see 03_PM.md) via `location_id`, `pm_allocation_reassignment` (see 03_PM.md) via `target_location_id`, `pm_equipment_request` (see 03_PM.md) via `location_id`, `pm_logbook` (see 03_PM.md) via `location_id`, `pm_job_card` (see 03_PM.md) via `location_id`, `pm_fuel_request` (see 03_PM.md) via `location_id`, `pm_movement` (see 03_PM.md) via `from_location_id`, `pm_movement` (see 03_PM.md) via `to_location_id`, `pm_incident` (see 03_PM.md) via `location_id`, `pm_incident` (see 03_PM.md) via `last_known_location_id`, `pm_hire_contract` (see 03_PM.md) via `location_id`, `pm_cost_ledger_entry` (see 03_PM.md) via `location_id`, `pm_management_follow_up` (see 03_PM.md) via `location_id`, `pm_dpr_publication` (see 03_PM.md) via `location_id`, `pms_petty_cash_request` (see 04_PMS.md) via `location_id`, `pms_vendor_payment` (see 04_PMS.md) via `location_id`, `pms_payable` (see 04_PMS.md) via `location_id`, `stores_stock_balance` (see 05_Stores.md) via `location_id`, `stores_stock_ledger` (see 05_Stores.md) via `location_id`, `stores_material_request` (see 05_Stores.md) via `location_id`, `stores_issue_voucher` (see 05_Stores.md) via `destination_location_id`, `stores_location_consumption` (see 05_Stores.md) via `location_id`, `stores_grn` (see 05_Stores.md) via `location_id`, `stores_fuel_storage` (see 05_Stores.md) via `location_id`, `stores_lending_request` (see 05_Stores.md) via `borrower_location_id`, `stores_rfq` (see 05_Stores.md) via `location_id`, `stores_purchase_order` (see 05_Stores.md) via `location_id`, [`integ_offline_operation`](#integ_offline_operation) via `location_id`

### core_project

**Purpose:** Projects (contracts or works) with client, dates, value and description. Chainage ranges are held on each location.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `status` | text |  |
| `aggregate_seq` | bigint |  |
| `client` | text |  |
| `start_date` | date |  |
| `end_date` | date |  |
| `value_amount` | numeric(14,2) |  |
| `description` | text |  |

**Referenced by:** [`core_location`](#core_location) via `project_id`, [`core_wbs_node`](#core_wbs_node) via `project_id`, [`core_chainage_marker`](#core_chainage_marker) via `project_id`, [`core_major_material_allocation`](#core_major_material_allocation) via `project_id`, [`core_plan_line`](#core_plan_line) via `project_id`, [`core_user_access`](#core_user_access) via `project_id`, [`core_holiday`](#core_holiday) via `scope_project_id`, [`core_approval_chain`](#core_approval_chain) via `project_id`, [`core_geo_zone`](#core_geo_zone) via `project_id`, [`core_project_milestone`](#core_project_milestone) via `project_id`, [`core_equipment_assignment`](#core_equipment_assignment) via `project_id`, `hrms_job_opening` (see 02_HRMS.md) via `project_id`, `hrms_employee_employment` (see 02_HRMS.md) via `project_id`, `hrms_shift_assignment` (see 02_HRMS.md) via `project_id`, `hrms_attendance_record` (see 02_HRMS.md) via `project_id`, `hrms_timesheet_entry` (see 02_HRMS.md) via `project_id`, `hrms_expense_claim_item` (see 02_HRMS.md) via `project_id`, `pm_equipment_cost_centre` (see 03_PM.md) via `project_id`, `pm_allocation` (see 03_PM.md) via `project_id`, `pm_equipment_request` (see 03_PM.md) via `project_id`, `pm_hire_contract` (see 03_PM.md) via `project_id`, `pm_cost_ledger_entry` (see 03_PM.md) via `project_id`, `pm_management_follow_up` (see 03_PM.md) via `project_id`, `pms_petty_cash_request` (see 04_PMS.md) via `project_id`, `stores_stock_ledger` (see 05_Stores.md) via `project_id`, `stores_material_request` (see 05_Stores.md) via `project_id`, `stores_lending_request` (see 05_Stores.md) via `project_id`, `stores_rfq` (see 05_Stores.md) via `project_id`, [`integ_offline_operation`](#integ_offline_operation) via `project_id`

### core_store

**Purpose:** Stores (warehouses) at a location and chainage point, with keeper and contact details.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `location_id` | uuid | references [`core_location`](#core_location) |
| `code` | citext |  |
| `name` | text |  |
| `status` | text |  |
| `location_text` | text |  |
| `keeper` | text |  |
| `phone` | text |  |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |

**Refers to:** [`core_location`](#core_location) via `location_id`, [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`

**Referenced by:** [`core_plan_line`](#core_plan_line) via `store_id`, [`core_user_access`](#core_user_access) via `store_id`, `stores_stock_balance` (see 05_Stores.md) via `store_id`, `stores_stock_ledger` (see 05_Stores.md) via `store_id`, `stores_material_request` (see 05_Stores.md) via `store_id`, `stores_material_request` (see 05_Stores.md) via `from_store_id`, `stores_issue_voucher` (see 05_Stores.md) via `store_id`, `stores_grn` (see 05_Stores.md) via `store_id`, `stores_quality_hold` (see 05_Stores.md) via `store_id`, `stores_stock_adjustment` (see 05_Stores.md) via `store_id`, `stores_physical_count` (see 05_Stores.md) via `store_id`, `stores_lending_request` (see 05_Stores.md) via `store_id`, `stores_gate_pass` (see 05_Stores.md) via `from_store_id`, `stores_gate_pass` (see 05_Stores.md) via `to_store_id`, `stores_rfq` (see 05_Stores.md) via `destination_store_id`, `stores_purchase_order` (see 05_Stores.md) via `store_id`, [`integ_offline_operation`](#integ_offline_operation) via `store_id`

### core_wbs_node

**Purpose:** Work breakdown structure nodes under a project.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `project_id` | uuid | references [`core_project`](#core_project) |
| `parent_wbs_node_id` | uuid | references [`core_wbs_node`](#core_wbs_node) |
| `code` | citext |  |
| `name` | text |  |
| `status` | text |  |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_wbs_node`](#core_wbs_node) via `parent_wbs_node_id`

**Referenced by:** [`core_wbs_node`](#core_wbs_node) via `parent_wbs_node_id`, [`core_chainage_marker`](#core_chainage_marker) via `wbs_node_id`, `pm_equipment_cost_centre` (see 03_PM.md) via `wbs_id`, `pm_equipment_requirement_line` (see 03_PM.md) via `wbs_id`, `pm_equipment_request` (see 03_PM.md) via `wbs_id`, `pm_logbook_entry` (see 03_PM.md) via `wbs_id`, `pm_cost_ledger_entry` (see 03_PM.md) via `wbs_id`

### core_chainage_marker

**Purpose:** Chainage markers (CH-n) along a linear project, in km, with a label and the WBS node they sit on.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `project_id` | uuid | references [`core_project`](#core_project) |
| `code` | citext |  |
| `label` | text |  |
| `chainage_km` | numeric(12,3) |  |
| `wbs_node_id` | uuid | references [`core_wbs_node`](#core_wbs_node) |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_wbs_node`](#core_wbs_node) via `wbs_node_id`

**Referenced by:** [`core_store`](#core_store) via `chainage_marker_id`, [`core_approval_request`](#core_approval_request) via `chainage_marker_id`, `pm_logbook_entry` (see 03_PM.md) via `chainage_id`

### core_material

**Purpose:** Materials with category, sub-category, unit, HSN code and reorder level.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `uom_id` | uuid | references [`uom`](#uom) |
| `code` | citext |  |
| `name` | text |  |
| `status` | text |  |
| `hsn` | text |  |
| `reorder_level` | numeric(14,3) |  |
| `category` | text |  |
| `sub_category` | text |  |

**Refers to:** [`uom`](#uom) via `uom_id`

**Referenced by:** [`core_major_material_allocation`](#core_major_material_allocation) via `material_id`, [`core_plan_line`](#core_plan_line) via `material_id`, `pm_category_fuel` (see 03_PM.md) via `material_id`, `pm_lubricant_log` (see 03_PM.md) via `lubricant_material_id`, `pm_job_card_part` (see 03_PM.md) via `material_id`, `pm_fuel_request_line` (see 03_PM.md) via `material_id`, `stores_stock_balance` (see 05_Stores.md) via `material_id`, `stores_stock_ledger` (see 05_Stores.md) via `material_id`, `stores_material_request_line` (see 05_Stores.md) via `material_id`, `stores_issue_voucher_line` (see 05_Stores.md) via `material_id`, `stores_location_consumption` (see 05_Stores.md) via `material_id`, `stores_grn_line` (see 05_Stores.md) via `material_id`, `stores_quality_hold` (see 05_Stores.md) via `material_id`, `stores_stock_adjustment` (see 05_Stores.md) via `material_id`, `stores_physical_count_line` (see 05_Stores.md) via `material_id`, `stores_lending_request_line` (see 05_Stores.md) via `material_id`, `stores_gate_pass_line` (see 05_Stores.md) via `material_id`, `stores_rfq_line` (see 05_Stores.md) via `material_id`, `stores_quotation_line` (see 05_Stores.md) via `material_id`, `stores_purchase_order_line` (see 05_Stores.md) via `material_id`, `stores_vendor_invoice_line` (see 05_Stores.md) via `material_id`

### core_major_material_allocation

**Purpose:** Major material allocated to a project, with quantity, unit, material and the date it is required by.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `quantity` | numeric(14,3) |  |
| `unit` | text |  |
| `required_by` | date |  |
| `material_id` | uuid | references [`core_material`](#core_material) |
| `uom_id` | uuid | references [`uom`](#uom) |
| `aggregate_seq` | bigint |  |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_material`](#core_material) via `material_id`, [`uom`](#uom) via `uom_id`

### core_plan_line

**Purpose:** Planned requirements per project for equipment, people or material (resource_kind), with dates and status. Replaces three plan tables. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 15

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `resource_kind` | text |  |
| `equipment_type_id` | uuid | references [`core_equipment_type`](#core_equipment_type) |
| `position_id` | uuid | references [`core_position`](#core_position) |
| `role` | text |  |
| `material_id` | uuid | references [`core_material`](#core_material) |
| `uom_id` | uuid | references [`uom`](#uom) |
| `store_id` | uuid | references [`core_store`](#core_store) |
| `quantity` | numeric(14,3) |  |
| `withdrawn` | boolean |  |
| `from_date` | date |  |
| `to_date` | date |  |
| `required_by` | date |  |
| `status` | text |  |
| `reason` | text |  |

**Refers to:** [`core_project`](#core_project) via `project_id`, [`core_equipment_type`](#core_equipment_type) via `equipment_type_id`, [`core_position`](#core_position) via `position_id`, [`core_material`](#core_material) via `material_id`, [`uom`](#uom) via `uom_id`, [`core_store`](#core_store) via `store_id`

**Referenced by:** `pm_equipment_requirement_line` (see 03_PM.md) via `core_plan_line_id`, `pm_equipment_request` (see 03_PM.md) via `core_plan_line_id`

### core_user

**Purpose:** Every CORE user: login, name, contact, employee link, position, scope, password and PIN hashes (argon2id), and login state.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 16

| Column | Type | Notes |
|---|---|---|
| `login_id` | citext |  |
| `email` | citext |  |
| `name` | text |  |
| `employee_id` | uuid | references [`hrms_employee`](#hrms_employee) |
| `status` | text |  |
| `last_login_at` | timestamptz |  |
| `failed_count` | integer |  |
| `locked_until` | timestamptz |  |
| `phone` | text |  |
| `must_change_password` | boolean |  |
| `position_id` | uuid | references [`core_position`](#core_position) |
| `scope` | text |  |
| `password_hash` | text |  |
| `password_set_at` | timestamptz |  |
| `pin_hash` | text |  |
| `pin_set_at` | timestamptz |  |

**Refers to:** [`hrms_employee`](#hrms_employee) via `employee_id`, [`core_position`](#core_position) via `position_id`

**Referenced by:** `support_issue` (see 06_Platform_Administration.md) via `raised_by_user_id`, [`core_vendor`](#core_vendor) via `registered_by`, [`core_user_passkey`](#core_user_passkey) via `user_id`, [`core_user_access`](#core_user_access) via `user_id`, [`core_user_session`](#core_user_session) via `user_id`, [`core_auth_activity`](#core_auth_activity) via `user_id`, [`core_approval_chain`](#core_approval_chain) via `raised_by`, [`core_import_batch`](#core_import_batch) via `uploaded_by`, [`core_matrix_level`](#core_matrix_level) via `approver_user_id`, [`core_matrix_level`](#core_matrix_level) via `escalate_to_user_id`, [`core_approval_request`](#core_approval_request) via `raised_by_id`, [`core_approval_request`](#core_approval_request) via `assigned_actor_id`, [`core_approval_action`](#core_approval_action) via `actor_id`, [`core_grievance`](#core_grievance) via `raised_by`, [`core_notification`](#core_notification) via `recipient_user_id`, [`core_record_timeline`](#core_record_timeline) via `actor_id`, [`core_policy_rule_ack`](#core_policy_rule_ack) via `user_id`, [`core_equipment_assignment`](#core_equipment_assignment) via `assigned_by_user_id`, [`core_ticket`](#core_ticket) via `raised_by_user_id`, `hrms_interview_panel_member` (see 02_HRMS.md) via `panel_user_id`, [`hrms_employee`](#hrms_employee) via `user_id`, `hrms_onboarding_task` (see 02_HRMS.md) via `assigned_user_id`, `hrms_offboarding_clearance_item` (see 02_HRMS.md) via `owner_user_id`, `hrms_shift_assignment` (see 02_HRMS.md) via `assigned_by_user_id`, `hrms_leave_application` (see 02_HRMS.md) via `reviewed_by_user_id`, `hrms_overtime_request` (see 02_HRMS.md) via `reviewed_by_user_id`, `hrms_employee_salary_assignment` (see 02_HRMS.md) via `assigned_by_user_id`, `hrms_payroll_adjustment` (see 02_HRMS.md) via `approved_by_user_id`, `hrms_letter_issuance` (see 02_HRMS.md) via `issued_by_user_id`, `pm_equipment_document` (see 03_PM.md) via `verified_by_user_id`, `pm_checklist_template` (see 03_PM.md) via `approved_by_user_id`, `pm_checklist_run` (see 03_PM.md) via `performed_by_user_id`, `pm_checklist_run` (see 03_PM.md) via `verified_by_user_id`, `pm_commissioning` (see 03_PM.md) via `checker_user_id`, `pm_commissioning` (see 03_PM.md) via `releaser_user_id`, `pm_commissioning_defect` (see 03_PM.md) via `rechecked_by_user_id`, `pm_safety_restriction` (see 03_PM.md) via `cleared_by_user_id`, `pm_inspection` (see 03_PM.md) via `inspector_user_id`, `pm_inspection` (see 03_PM.md) via `verified_by_user_id`, `pm_equipment_request` (see 03_PM.md) via `requested_by_user_id`, `pm_spot_check` (see 03_PM.md) via `checker_user_id`, `pm_job_card` (see 03_PM.md) via `verified_by_user_id`, `pm_amc_service_visit` (see 03_PM.md) via `verified_by_user_id`, `pm_fuel_request` (see 03_PM.md) via `requested_by_user_id`, `pm_fuel_request_line` (see 03_PM.md) via `cleared_by_user_id`, `pm_fuel_variance_flag` (see 03_PM.md) via `reviewed_by_user_id`, `pm_movement` (see 03_PM.md) via `received_by_user_id`, `pm_incident` (see 03_PM.md) via `reported_by_user_id`, `pm_incident_corrective_action` (see 03_PM.md) via `responsible_user_id`, `pm_incident_corrective_action` (see 03_PM.md) via `verified_by_user_id`, `pm_movement_discrepancy` (see 03_PM.md) via `responsible_user_id`, `pm_registration_review` (see 03_PM.md) via `reviewed_by_user_id`, `pm_request_revision` (see 03_PM.md) via `submitted_by_user_id`, `pm_management_follow_up` (see 03_PM.md) via `assigned_to_user_id`, `pm_dpr_publication` (see 03_PM.md) via `published_by_user_id`, `pm_document_type` (see 03_PM.md) via `approved_by_user_id`, `pms_petty_cash_request` (see 04_PMS.md) via `requester_id`, `pms_payable` (see 04_PMS.md) via `paid_by`, `pms_payable` (see 04_PMS.md) via `accepted_by`, `stores_stock_ledger` (see 05_Stores.md) via `posted_by`, `stores_material_request` (see 05_Stores.md) via `requested_by`, `stores_issue_voucher_line` (see 05_Stores.md) via `ack_by`, `stores_issue_return` (see 05_Stores.md) via `verified_by`, `stores_location_consumption` (see 05_Stores.md) via `consumed_by`, `stores_quality_hold` (see 05_Stores.md) via `released_by`, `stores_rtv` (see 05_Stores.md) via `closed_by`, `stores_stock_adjustment` (see 05_Stores.md) via `verified_by`, `stores_physical_count` (see 05_Stores.md) via `counted_by`, `stores_fuel_tank_transfer` (see 05_Stores.md) via `recorded_by`, `stores_fuel_dispense` (see 05_Stores.md) via `verified_by`, `stores_fuel_bowser_reconciliation` (see 05_Stores.md) via `reconciled_by`, `stores_lending_request` (see 05_Stores.md) via `requested_by`, `stores_purchase_order` (see 05_Stores.md) via `requester_id`, `stores_po_vendor_response` (see 05_Stores.md) via `recorded_by`, `stores_po_change` (see 05_Stores.md) via `proposed_by`, `stores_payment_hold` (see 05_Stores.md) via `released_by`, [`integ_event`](#integ_event) via `actor_id`, [`integ_offline_operation`](#integ_offline_operation) via `user_id`, [`audit_row_change`](#audit_row_change) via `actor_id`

### core_user_passkey

**Purpose:** Passkey (WebAuthn) credentials registered by a user. Password and PIN are on core_user.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `credential_key` | text |  |
| `public_key` | text |  |
| `sign_count` | bigint |  |
| `label` | text |  |

**Refers to:** [`core_user`](#core_user) via `user_id`

### core_user_access

**Purpose:** Access grants per user: module head responsibilities, role codes, privileges, project, location and store scopes, and suspensions.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 11

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `access_type` | text |  |
| `role_id` | uuid | references [`core_role`](#core_role) |
| `privilege` | text |  |
| `location_id` | uuid | references [`core_location`](#core_location) |
| `project_id` | uuid | references [`core_project`](#core_project) |
| `store_id` | uuid | references [`core_store`](#core_store) |
| `aggregate_seq` | bigint |  |
| `reason` | text |  |
| `restored_at` | timestamptz |  |
| `module` | text |  |

**Refers to:** [`core_user`](#core_user) via `user_id`, [`core_role`](#core_role) via `role_id`, [`core_location`](#core_location) via `location_id`, [`core_project`](#core_project) via `project_id`, [`core_store`](#core_store) via `store_id`

### core_user_session

**Purpose:** Login sessions with device, refresh-token hash and expiry.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `device_label` | text |  |
| `device_info` | jsonb |  |
| `refresh_hash` | text |  |
| `issued_at` | timestamptz |  |
| `expires_at` | timestamptz |  |
| `revoked_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `user_id`

### core_auth_activity

**Purpose:** Authentication events: login attempts, OTPs and passkey challenges, with IP and geo location.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references [`core_user`](#core_user) |
| `event_type` | text |  |
| `purpose` | text |  |
| `secret_hash` | text |  |
| `expires_at` | timestamptz |  |
| `attempts` | integer |  |
| `used_at` | timestamptz |  |
| `ip_address` | inet |  |
| `geo_location` | jsonb |  |
| `occurred_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `user_id`

**Referenced by:** `hrms_offer_letter` (see 02_HRMS.md) via `auth_activity_id`

### core_policy

**Purpose:** Named business policies such as payment thresholds.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `kind` | text |  |
| `code` | text |  |
| `name` | text |  |
| `description` | text |  |

**Referenced by:** [`core_policy_version`](#core_policy_version) via `policy_id`

### core_policy_version

**Purpose:** Versioned body of each policy, with its effective date and reason.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `policy_id` | uuid | references [`core_policy`](#core_policy) |
| `version_no` | integer |  |
| `body` | jsonb |  |
| `effective_from` | date |  |
| `published_at` | timestamptz |  |
| `reason` | text |  |

**Refers to:** [`core_policy`](#core_policy) via `policy_id`

**Referenced by:** [`core_policy_rule`](#core_policy_rule) via `policy_version_id`, `pms_payable` (see 04_PMS.md) via `policy_version_id`

### core_ot_policy

**Purpose:** Overtime rules: rates, limits and compensatory-off settings.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 15

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `name` | text |  |
| `code` | varchar(20) |  |
| `is_active` | boolean |  |
| `settlement_mode` | text |  |
| `rate_working_day` | numeric(5,2) |  |
| `rate_week_off` | numeric(5,2) |  |
| `rate_holiday` | numeric(5,2) |  |
| `comp_off_multiplier` | numeric(4,2) |  |
| `comp_off_expiry_days` | integer |  |
| `max_hours_per_day` | numeric(5,2) |  |
| `max_hours_per_month` | numeric(5,2) |  |
| `claim_within_days` | integer |  |
| `min_minutes` | integer |  |
| `requires_approval` | boolean |  |

**Referenced by:** [`core_ot_policy_rule`](#core_ot_policy_rule) via `policy_id`, `hrms_overtime_request` (see 02_HRMS.md) via `policy_id`

### core_number_series

**Purpose:** Document number counters per series and year.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `series_code` | text |  |
| `prefix` | text |  |
| `year_scope` | integer |  |
| `next_value` | bigint |  |

### core_holiday

**Purpose:** Company holidays by date, with type and whether the holiday is optional.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `company_profile_id` | uuid | references [`core_company_profile`](#core_company_profile) |
| `holiday_date` | date |  |
| `name` | text |  |
| `holiday_type` | text |  |
| `is_optional` | boolean |  |
| `end_date` | date |  |
| `scope_project_id` | uuid | references [`core_project`](#core_project) |

**Refers to:** [`core_company_profile`](#core_company_profile) via `company_profile_id`, [`core_project`](#core_project) via `scope_project_id`

### core_shift

**Purpose:** Shift timings, with weekly off days and their effective period (merged from the week-off pattern).

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 11

| Column | Type | Notes |
|---|---|---|
| `aggregate_seq` | bigint |  |
| `company_profile_id` | uuid | references [`core_company_profile`](#core_company_profile) |
| `code` | text |  |
| `name` | text |  |
| `timezone` | text |  |
| `in_time` | time |  |
| `out_time` | time |  |
| `is_active` | boolean |  |
| `week_off_days_json` | jsonb |  |
| `effective_from` | date |  |
| `effective_to` | date |  |

**Refers to:** [`core_company_profile`](#core_company_profile) via `company_profile_id`

**Referenced by:** `hrms_shift_assignment` (see 02_HRMS.md) via `shift_id`, `hrms_attendance_record` (see 02_HRMS.md) via `shift_id`, `pm_logbook` (see 03_PM.md) via `core_shift_id`

### core_approval_chain

**Purpose:** One approval chain per request type and module. A project-scope chain carries its project; a company-scope chain does not.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `request_type` | text |  |
| `name` | text |  |
| `is_active` | boolean |  |
| `timeout_hours` | integer |  |
| `module` | text |  |
| `scope_type` | text |  |
| `raised_by` | uuid | references [`core_user`](#core_user) |
| `project_id` | uuid | references [`core_project`](#core_project) |

**Refers to:** [`core_user`](#core_user) via `raised_by`, [`core_project`](#core_project) via `project_id`

**Referenced by:** [`core_matrix_version`](#core_matrix_version) via `chain_id`, [`core_approval_request`](#core_approval_request) via `chain_id`

### core_matrix_version

**Purpose:** Published versions of an approval matrix.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `chain_id` | uuid | references [`core_approval_chain`](#core_approval_chain) |
| `version_no` | integer |  |
| `effective_from` | date |  |
| `published_at` | timestamptz |  |
| `reason` | text |  |

**Refers to:** [`core_approval_chain`](#core_approval_chain) via `chain_id`

**Referenced by:** [`core_matrix_level`](#core_matrix_level) via `matrix_version_id`, [`core_approval_request`](#core_approval_request) via `matrix_version_id`

### core_matrix_level

**Purpose:** Approval levels in a matrix version, with approver user, escalation user, timeout and cash limit.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `matrix_version_id` | uuid | references [`core_matrix_version`](#core_matrix_version) |
| `level_no` | integer |  |
| `approver_role_id` | uuid | references [`core_role`](#core_role) |
| `amount_from` | numeric(14,2) |  |
| `amount_to` | numeric(14,2) |  |
| `timeout_hours` | integer |  |
| `on_timeout` | text |  |
| `cash_limit_inr` | numeric(14,2) |  |
| `approver_user_id` | uuid | references [`core_user`](#core_user) |
| `escalate_to_user_id` | uuid | references [`core_user`](#core_user) |

**Refers to:** [`core_matrix_version`](#core_matrix_version) via `matrix_version_id`, [`core_role`](#core_role) via `approver_role_id`, [`core_user`](#core_user) via `approver_user_id`, [`core_user`](#core_user) via `escalate_to_user_id`

### core_approval_request

**Purpose:** One approval case per business request, with code, status, current level, chainage and payload.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 23

| Column | Type | Notes |
|---|---|---|
| `request_type` | text |  |
| `module` | text |  |
| `source_record_id` | text |  |
| `location_id` | uuid | references [`core_location`](#core_location) |
| `raised_by_id` | uuid | references [`core_user`](#core_user) |
| `amount` | numeric(14,2) |  |
| `status` | text |  |
| `levels_snapshot` | jsonb |  |
| `payload_json` | jsonb |  |
| `chain_id` | uuid | references [`core_approval_chain`](#core_approval_chain) |
| `matrix_version_id` | uuid | references [`core_matrix_version`](#core_matrix_version) |
| `config_version_label` | text |  |
| `config_effective_from` | date |  |
| `raised_at` | timestamptz |  |
| `current_level` | smallint |  |
| `assigned_actor_id` | uuid | references [`core_user`](#core_user) |
| `decided_at` | timestamptz |  |
| `title` | text |  |
| `emergency` | boolean |  |
| `code` | text |  |
| `raised_by_name` | text |  |
| `chainage_marker_id` | uuid | references [`core_chainage_marker`](#core_chainage_marker) |
| `matrix_version` | integer |  |

**Refers to:** [`core_location`](#core_location) via `location_id`, [`core_user`](#core_user) via `raised_by_id`, [`core_approval_chain`](#core_approval_chain) via `chain_id`, [`core_matrix_version`](#core_matrix_version) via `matrix_version_id`, [`core_user`](#core_user) via `assigned_actor_id`, [`core_chainage_marker`](#core_chainage_marker) via `chainage_marker_id`

**Referenced by:** [`core_vendor`](#core_vendor) via `approval_request_id`, [`core_approval_action`](#core_approval_action) via `approval_request_id`, `hrms_candidate_application` (see 02_HRMS.md) via `selection_approval_request_id`, [`hrms_employee`](#hrms_employee) via `admin_approval_request_id`, `hrms_separation_request` (see 02_HRMS.md) via `admin_approval_request_id`, `hrms_payroll_run` (see 02_HRMS.md) via `admin_approval_request_id`, `hrms_employee_claim` (see 02_HRMS.md) via `admin_approval_request_id`, `hrms_employee_incentive_calculation` (see 02_HRMS.md) via `admin_approval_request_id`, `pm_equipment` (see 03_PM.md) via `initial_core_approval_request_id`, `pm_allocation` (see 03_PM.md) via `approval_request_id`, `pm_allocation_reassignment` (see 03_PM.md) via `approval_request_id`, `pm_equipment_request` (see 03_PM.md) via `approval_request_id`, `pm_deferral` (see 03_PM.md) via `approval_request_id`, `pm_fuel_request` (see 03_PM.md) via `approval_request_id`, `pm_movement` (see 03_PM.md) via `approval_request_id`, `pm_hire_bill` (see 03_PM.md) via `approval_request_id`, `pm_disposal` (see 03_PM.md) via `core_approval_request_id`, `pm_request_revision` (see 03_PM.md) via `approval_request_id`, `pms_petty_cash_request` (see 04_PMS.md) via `approval_request_id`, `pms_vendor_payment` (see 04_PMS.md) via `approval_request_id`, `stores_material_request` (see 05_Stores.md) via `approval_request_id`, `stores_issue_return` (see 05_Stores.md) via `approval_request_id`, `stores_quality_hold` (see 05_Stores.md) via `approval_request_id`, `stores_stock_adjustment` (see 05_Stores.md) via `approval_request_id`, `stores_physical_count` (see 05_Stores.md) via `approval_request_id`, `stores_lending_request` (see 05_Stores.md) via `approval_request_id`, `stores_lending_request_line` (see 05_Stores.md) via `debit_approval_request_id`, `stores_lending_extension` (see 05_Stores.md) via `approval_request_id`, `stores_purchase_order` (see 05_Stores.md) via `approval_request_id`, `stores_po_change` (see 05_Stores.md) via `approval_request_id`

### core_approval_action

**Purpose:** Each action taken on a request: raised, approved, rejected, escalated or commented.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `approval_request_id` | uuid | references [`core_approval_request`](#core_approval_request) |
| `level_no` | integer |  |
| `actor_id` | uuid | references [`core_user`](#core_user) |
| `action` | text |  |
| `comment` | text |  |
| `acted_at` | timestamptz |  |
| `record_version` | integer |  |
| `line_changes` | jsonb |  |
| `amount_approved` | numeric(14,2) |  |
| `by_name` | text |  |

**Refers to:** [`core_approval_request`](#core_approval_request) via `approval_request_id`, [`core_user`](#core_user) via `actor_id`

### core_grievance

**Purpose:** Grievances raised by a person: code, subject, first message, status, requested visit date and linked employee. Follow-up messages are in core_record_timeline.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 12

| Column | Type | Notes |
|---|---|---|
| `source_module` | text |  |
| `source_record_id` | text |  |
| `raised_by` | uuid | references [`core_user`](#core_user) |
| `subject` | text |  |
| `status` | text |  |
| `closed_at` | timestamptz |  |
| `employee_id` | uuid | references [`hrms_employee`](#hrms_employee) |
| `code` | text |  |
| `message` | text |  |
| `visit_date` | date |  |
| `raised_by_name` | text |  |
| `raised_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `raised_by`, [`hrms_employee`](#hrms_employee) via `employee_id`

### core_notification

**Purpose:** In-app notifications to users, with read status.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `recipient_user_id` | uuid | references [`core_user`](#core_user) |
| `notification_type` | text |  |
| `source_type` | text |  |
| `source_id` | uuid |  |
| `title` | text |  |
| `body` | text |  |
| `delivery_status` | text |  |
| `read_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `recipient_user_id`

### core_file

**Purpose:** Metadata for every uploaded file, linked to its owner; content is in object storage.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `owner_type` | text |  |
| `owner_id` | uuid |  |
| `file_name` | text |  |
| `content_type` | text |  |
| `size_bytes` | bigint |  |
| `sha256` | char(64) |  |
| `object_key` | text |  |
| `visibility` | text |  |
| `captured_at` | timestamptz |  |

**Referenced by:** [`core_company_profile`](#core_company_profile) via `logo_file_id`, [`core_import_batch`](#core_import_batch) via `upload_file_id`, [`core_document_template`](#core_document_template) via `file_id`, `hrms_offer_letter` (see 02_HRMS.md) via `document_file_id`, `hrms_employee_document` (see 02_HRMS.md) via `document_file_id`, `hrms_onboarding_task` (see 02_HRMS.md) via `evidence_file_id`, `hrms_separation_request` (see 02_HRMS.md) via `evidence_file_id`, `hrms_offboarding_clearance_item` (see 02_HRMS.md) via `evidence_file_id`, `hrms_attendance_event` (see 02_HRMS.md) via `media_file_id`, `hrms_letter_issuance` (see 02_HRMS.md) via `document_file_id`, `pm_equipment_document` (see 03_PM.md) via `document_file_id`, `pm_meter_reading` (see 03_PM.md) via `photo_file_id`, `pm_meter_reading` (see 03_PM.md) via `proof_file_id`, `pm_checklist_run_item` (see 03_PM.md) via `photo_file_id`, `pm_safety_restriction` (see 03_PM.md) via `clearance_file_id`, `pm_spot_check` (see 03_PM.md) via `meter_photo_file_id`, `pm_spot_check` (see 03_PM.md) via `fuel_photo_file_id`, `pm_vrr_photo` (see 03_PM.md) via `file_id`, `pm_amc_service_visit` (see 03_PM.md) via `service_file_id`, `pm_incident` (see 03_PM.md) via `policy_file_id`, `pm_incident_corrective_action` (see 03_PM.md) via `evidence_file_id`, `pm_registration_review` (see 03_PM.md) via `evidence_file_id`, `pm_dpr_publication` (see 03_PM.md) via `report_file_id`, `stores_issue_return` (see 05_Stores.md) via `evidence_file_id`, `stores_grn` (see 05_Stores.md) via `proof_file_id`, `stores_quality_hold` (see 05_Stores.md) via `evidence_file_id`, `stores_stock_adjustment` (see 05_Stores.md) via `evidence_file_id`, `stores_physical_count_line` (see 05_Stores.md) via `evidence_file_id`, `stores_fuel_dispense` (see 05_Stores.md) via `evidence_file_id`, `stores_rfq_message` (see 05_Stores.md) via `attachment_file_id`, `stores_quotation` (see 05_Stores.md) via `file_id`, `stores_vendor_invoice` (see 05_Stores.md) via `file_id`, `stores_payment_hold` (see 05_Stores.md) via `evidence_file_id`

### core_record_timeline

**Purpose:** Status history and discussion for any business record, including grievance messages (internal or not).

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 15

| Column | Type | Notes |
|---|---|---|
| `entity_type` | text |  |
| `entity_id` | uuid |  |
| `action` | text |  |
| `actor_id` | uuid | references [`core_user`](#core_user) |
| `status_dimension` | text |  |
| `old_status` | text |  |
| `new_status` | text |  |
| `remarks` | text |  |
| `correlation_id` | text |  |
| `occurred_at` | timestamptz |  |
| `details` | jsonb |  |
| `effective_at` | timestamptz |  |
| `source_record_type` | text |  |
| `source_record_id` | uuid |  |
| `is_internal` | boolean |  |

**Refers to:** [`core_user`](#core_user) via `actor_id`

### core_import_batch

**Purpose:** Bulk upload batches with validation counts and preview expiry.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 12

| Column | Type | Notes |
|---|---|---|
| `batch_code` | text |  |
| `import_type` | text |  |
| `upload_file_id` | uuid | references [`core_file`](#core_file) |
| `template_version` | text |  |
| `uploaded_by` | uuid | references [`core_user`](#core_user) |
| `total_rows` | integer |  |
| `valid_rows` | integer |  |
| `error_rows` | integer |  |
| `status` | text |  |
| `submitted_at` | timestamptz |  |
| `requester_mode` | text |  |
| `expires_at` | timestamptz |  |

**Refers to:** [`core_file`](#core_file) via `upload_file_id`, [`core_user`](#core_user) via `uploaded_by`

**Referenced by:** [`core_import_row`](#core_import_row) via `batch_id`

### core_usage_counter

**Purpose:** Weekly counters for metered actions, compared with plan limits.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `metric` | text |  |
| `scope_key` | text |  |
| `week_start` | date |  |
| `counter_value` | bigint |  |

### core_department

**Purpose:** Departments as a tree, with a head position and a colour for the organogram. From the frontend draft; not in source documents.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 8

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `status` | text |  |
| `parent_department_id` | uuid | references [`core_department`](#core_department) |
| `head_position_id` | uuid | references [`core_position`](#core_position) |
| `description` | text |  |
| `color_index` | smallint |  |
| `color_hex` | text |  |

**Refers to:** [`core_department`](#core_department) via `parent_department_id`, [`core_position`](#core_position) via `head_position_id`

**Referenced by:** [`core_department`](#core_department) via `parent_department_id`, [`core_position`](#core_position) via `department_id`, `hrms_job_opening` (see 02_HRMS.md) via `department_id`, `hrms_employee_employment` (see 02_HRMS.md) via `department_id`, `stores_material_request` (see 05_Stores.md) via `department_id`

### core_position

**Purpose:** Organisation positions (grade, reporting line, planned headcount). Separate from access roles. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `code` | citext |  |
| `title` | text |  |
| `department_id` | uuid | references [`core_department`](#core_department) |
| `grade` | text |  |
| `reports_to_position_id` | uuid | references [`core_position`](#core_position) |
| `planned_positions` | integer |  |
| `holder` | text |  |
| `description` | text |  |
| `status` | text |  |

**Refers to:** [`core_department`](#core_department) via `department_id`, [`core_position`](#core_position) via `reports_to_position_id`

**Referenced by:** [`core_plan_line`](#core_plan_line) via `position_id`, [`core_user`](#core_user) via `position_id`, [`core_department`](#core_department) via `head_position_id`, [`core_position`](#core_position) via `reports_to_position_id`, `hrms_employee_employment` (see 02_HRMS.md) via `position_id`

### core_geo_zone

**Purpose:** Geo-fence zones of a project: radius, polygon or corridor. Used by attendance and equipment. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `label` | text |  |
| `zone_type` | text |  |
| `shape` | text |  |
| `center_lat` | numeric(9,6) |  |
| `center_lng` | numeric(9,6) |  |
| `radius_m` | numeric(10,2) |  |
| `points_json` | jsonb |  |
| `buffer_m` | numeric(10,2) |  |
| `version` | integer |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

**Referenced by:** `hrms_attendance_event` (see 02_HRMS.md) via `geofence_id`

### core_project_milestone

**Purpose:** Milestones of a project with due date, weight and status. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. No Core table refers to it yet. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | references [`core_project`](#core_project) |
| `name` | text |  |
| `due_date` | date |  |
| `weight` | numeric(5,2) |  |
| `status` | text |  |

**Refers to:** [`core_project`](#core_project) via `project_id`

### core_pms_limit_row

**Purpose:** Approval time and amount limits per tier and priority (normal or emergency). From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. No Core table refers to it yet. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `tier` | smallint |  |
| `priority` | text |  |
| `amount_inr` | numeric(14,2) |  |
| `days` | integer |  |
| `hours` | integer |  |
| `minutes` | integer |  |
| `is_final` | boolean |  |

### core_policy_rule

**Purpose:** Rules inside a company rules policy version, with category and acknowledgement flag. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `policy_version_id` | uuid | references [`core_policy_version`](#core_policy_version) |
| `title` | text |  |
| `category` | text |  |
| `body` | text |  |
| `ack_required` | boolean |  |

**Refers to:** [`core_policy_version`](#core_policy_version) via `policy_version_id`

**Referenced by:** [`core_policy_rule_ack`](#core_policy_rule_ack) via `rule_id`

### core_policy_rule_ack

**Purpose:** Record of each user's acknowledgement of a policy rule. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. No Core table refers to it yet. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 3

| Column | Type | Notes |
|---|---|---|
| `rule_id` | uuid | references [`core_policy_rule`](#core_policy_rule) |
| `user_id` | uuid | references [`core_user`](#core_user) |
| `acked_at` | timestamptz |  |

**Refers to:** [`core_policy_rule`](#core_policy_rule) via `rule_id`, [`core_user`](#core_user) via `user_id`

### core_custom_policy_field

**Purpose:** Fields of a custom policy: label, type, required flag and choices for select fields.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. No Core table refers to it yet. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 6

| Column | Type | Notes |
|---|---|---|
| `custom_policy_id` | uuid | references [`core_custom_policy`](#core_custom_policy) |
| `label` | text |  |
| `field_type` | text |  |
| `is_required` | boolean |  |
| `options_json` | jsonb |  |
| `sort_order` | integer |  |

**Refers to:** [`core_custom_policy`](#core_custom_policy) via `custom_policy_id`

### core_custom_policy

**Purpose:** Custom policies defined by an administrator. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 2

| Column | Type | Notes |
|---|---|---|
| `name` | text |  |
| `description` | text |  |

**Referenced by:** [`core_custom_policy_field`](#core_custom_policy_field) via `custom_policy_id`, [`core_custom_policy_version`](#core_custom_policy_version) via `custom_policy_id`

### core_custom_policy_version

**Purpose:** Versioned answers to a custom policy, keyed by field. From the frontend draft.

> **Proposed.** This table is not defined in the source documents. It was added from the frontend draft. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `custom_policy_id` | uuid | references [`core_custom_policy`](#core_custom_policy) |
| `version_no` | integer |  |
| `effective_from` | date |  |
| `reason` | text |  |
| `values_json` | jsonb |  |

**Refers to:** [`core_custom_policy`](#core_custom_policy) via `custom_policy_id`

### core_document_template

**Purpose:** Document templates. The offer letter is one row (code offer_letter) with its file and revision.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `template_version` | text |  |
| `status` | text |  |
| `file_id` | uuid | references [`core_file`](#core_file) |
| `file_name` | text |  |
| `mime_type` | text |  |
| `size_bytes` | bigint |  |
| `revision` | integer |  |

**Refers to:** [`core_file`](#core_file) via `file_id`

**Referenced by:** `hrms_offer_letter` (see 02_HRMS.md) via `document_template_id`, `hrms_letter_issuance` (see 02_HRMS.md) via `document_template_id`

### core_ot_policy_rule

**Purpose:** Rules inside an overtime policy, with effective dates. Proposed; not in source documents.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `policy_id` | uuid | references [`core_ot_policy`](#core_ot_policy) |
| `rule_code` | text |  |
| `rule_json` | jsonb |  |
| `effective_from` | date |  |
| `effective_to` | date |  |

**Refers to:** [`core_ot_policy`](#core_ot_policy) via `policy_id`

**Referenced by:** `hrms_overtime_request` (see 02_HRMS.md) via `policy_rule_id`

### core_equipment_assignment

**Purpose:** Count of units of one equipment type allocated to a project.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `equipment_type_id` | uuid | references [`core_equipment_type`](#core_equipment_type) |
| `qty` | integer |  |
| `assigned_at` | timestamptz |  |
| `assigned_by_user_id` | uuid | references [`core_user`](#core_user) |
| `project_id` | uuid | references [`core_project`](#core_project) |

**Refers to:** [`core_equipment_type`](#core_equipment_type) via `equipment_type_id`, [`core_user`](#core_user) via `assigned_by_user_id`, [`core_project`](#core_project) via `project_id`

### core_leave_type

**Purpose:** Leave types such as casual, sick or earned leave, with accrual, carry-forward and encashment rules. Owned by Core with the leave policy. Proposed; not in source documents.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 10

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `is_paid` | boolean |  |
| `status` | text |  |
| `annual_days` | numeric(5,2) |  |
| `accrual` | text |  |
| `carry_forward` | boolean |  |
| `max_carry_days` | numeric(5,2) |  |
| `expiry_months` | integer |  |
| `encashable` | boolean |  |

**Referenced by:** [`core_leave_policy_rule`](#core_leave_policy_rule) via `leave_type_id`, `hrms_leave_balance` (see 02_HRMS.md) via `leave_type_id`, `hrms_leave_application` (see 02_HRMS.md) via `leave_type_id`, `hrms_leave_transaction` (see 02_HRMS.md) via `leave_type_id`

### core_leave_policy

**Purpose:** Leave policies with their leave year (start and end), status and effective period.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `name` | text |  |
| `effective_from` | date |  |
| `effective_to` | date |  |
| `status` | text |  |
| `year_start` | date |  |
| `year_end` | date |  |

**Referenced by:** [`core_leave_policy_rule`](#core_leave_policy_rule) via `leave_policy_id`, `hrms_leave_balance` (see 02_HRMS.md) via `leave_policy_id`, `hrms_leave_application` (see 02_HRMS.md) via `leave_policy_id`, `hrms_leave_transaction` (see 02_HRMS.md) via `leave_policy_id`

### core_leave_policy_rule

**Purpose:** Accrual and eligibility rules per leave policy and leave type. Proposed; not in source documents.

> **Proposed.** This table is not defined in the source documents. It was added because other tables reference it. Confirm before DDL.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 5

| Column | Type | Notes |
|---|---|---|
| `leave_policy_id` | uuid | references [`core_leave_policy`](#core_leave_policy) |
| `leave_type_id` | uuid | references [`core_leave_type`](#core_leave_type) |
| `rule_json` | jsonb |  |
| `effective_from` | date |  |
| `effective_to` | date |  |

**Refers to:** [`core_leave_policy`](#core_leave_policy) via `leave_policy_id`, [`core_leave_type`](#core_leave_type) via `leave_type_id`

**Referenced by:** `hrms_leave_balance` (see 02_HRMS.md) via `leave_policy_rule_id`, `hrms_leave_application` (see 02_HRMS.md) via `leave_policy_rule_id`, `hrms_leave_transaction` (see 02_HRMS.md) via `leave_policy_rule_id`

### core_import_row

**Purpose:** Result of each row in a bulk upload batch.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 9

| Column | Type | Notes |
|---|---|---|
| `batch_id` | uuid | references [`core_import_batch`](#core_import_batch) |
| `row_number` | integer |  |
| `raw_values` | jsonb |  |
| `validated_values` | jsonb |  |
| `error_messages` | jsonb |  |
| `linked_record_type` | text |  |
| `linked_record_id` | uuid |  |
| `status` | text |  |
| `created_ids` | jsonb |  |

**Refers to:** [`core_import_batch`](#core_import_batch) via `batch_id`

**Referenced by:** [`hrms_employee`](#hrms_employee) via `import_row_id`

### core_ticket

**Purpose:** Tenant-side support tickets raised by users inside the app. Platform support (tenant admin to VeloxIQ) is public.support_issue, a separate record.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 7

| Column | Type | Notes |
|---|---|---|
| `code` | text |  |
| `subject` | text |  |
| `category` | text |  |
| `priority` | text |  |
| `description` | text |  |
| `status` | text |  |
| `raised_by_user_id` | uuid | references [`core_user`](#core_user) |

**Refers to:** [`core_user`](#core_user) via `raised_by_user_id`

### Integration and audit services

### integ_event

**Purpose:** Events in and out: outbox to publish, inbox received, and failures in the dead-letter state, with retry and replay.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 25

| Column | Type | Notes |
|---|---|---|
| `direction` | text | Values: `outbound` (outbox, to publish) or `inbound` (inbox, received). Approved 2026-11-19; a check constraint enforces them. |
| `event_id` | uuid |  |
| `event_type` | text |  |
| `event_version` | text |  |
| `aggregate_type` | text |  |
| `aggregate_id` | uuid |  |
| `aggregate_seq` | bigint |  |
| `occurred_at` | timestamptz |  |
| `correlation_id` | text | Accepted 2026-11-19: `text` everywhere. |
| `causation_id` | uuid |  |
| `actor_id` | uuid | references [`core_user`](#core_user) |
| `payload` | jsonb |  |
| `coalesce_key` | text |  |
| `schema_version` | text |  |
| `source_module` | text |  |
| `status` | text |  |
| `attempts` | integer |  |
| `last_error` | text |  |
| `next_attempt_at` | timestamptz |  |
| `published_at` | timestamptz |  |
| `received_at` | timestamptz |  |
| `processed_at` | timestamptz |  |
| `dead_lettered_at` | timestamptz |  |
| `replay_status` | text |  |
| `replayed_at` | timestamptz |  |

**Refers to:** [`core_user`](#core_user) via `actor_id`

### integ_idempotency_key

**Purpose:** Stored responses for repeated requests with the same key.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 4

| Column | Type | Notes |
|---|---|---|
| `key` | text |  |
| `request_hash` | text |  |
| `response` | jsonb |  |
| `expires_at` | timestamptz |  |

### integ_aggregate_sequence

**Purpose:** Last sequence number per business aggregate, for ordering events.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 3

| Column | Type | Notes |
|---|---|---|
| `aggregate_type` | text |  |
| `aggregate_id` | uuid |  |
| `last_seq` | bigint |  |

### integ_offline_operation

**Purpose:** Operations captured offline on devices and synced later.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 14

| Column | Type | Notes |
|---|---|---|
| `client_operation_key` | text |  |
| `client_device_key` | text |  |
| `user_id` | uuid | references [`core_user`](#core_user) |
| `project_id` | uuid | references [`core_project`](#core_project) |
| `location_id` | uuid | references [`core_location`](#core_location) |
| `store_id` | uuid | references [`core_store`](#core_store) |
| `operation_type` | text |  |
| `payload` | jsonb |  |
| `captured_at` | timestamptz |  |
| `received_at` | timestamptz |  |
| `sync_status` | text |  |
| `result_entity_type` | text |  |
| `result_entity_id` | uuid |  |
| `reason` | text |  |

**Refers to:** [`core_user`](#core_user) via `user_id`, [`core_project`](#core_project) via `project_id`, [`core_location`](#core_location) via `location_id`, [`core_store`](#core_store) via `store_id`

### audit_row_change

**Purpose:** Hash-chained log of every row change with old and new values.

**Schema:** tenant_<id>  ·  **Application:** Core  ·  **Columns:** 12

| Column | Type | Notes |
|---|---|---|
| `table_name` | text |  |
| `record_id` | text |  |
| `op` | text |  |
| `old_row` | jsonb |  |
| `new_row` | jsonb |  |
| `actor_id` | uuid | references [`core_user`](#core_user) |
| `correlation_id` | text |  |
| `module_name` | text |  |
| `ip_hash` | text |  |
| `changed_at` | timestamptz |  |
| `prev_hash` | text |  |
| `row_hash` | text |  |

**Refers to:** [`core_user`](#core_user) via `actor_id`

### uom

**Purpose:** Units of measure used by materials and stores. Not defined in this document.

**Schema:** `shared` (see section 1)  ·  **Owner:** Platform Administration (see 06_Platform_Administration.md)

Core reads this table and does not change it. Column definitions are owned by 06_Platform_Administration.md.

### hrms_employee

**Purpose:** Employee master record. Not defined in this document.

**Schema:** tenant_<id>  ·  **Owner:** HRMS (see 02_HRMS.md)

Core stores only the references listed in section 6 and reads the record where needed. Column definitions are owned by 02_HRMS.md.
