-- Tenant schema, core tables, integration and audit tables.
-- Generated once from Core_Database_Handoff.md (sections 3, 4 and 9), approved 2026-11-19.
-- Applied inside each tenant_<id> schema with search_path set to that schema (SET LOCAL).
-- Standard columns on every table: id, created_at, created_by, updated_at, updated_by, row_version.
-- Foreign keys are added at the end so that circular references do not depend on table order.
-- Not created here: shared.uom and hrms_employee (owned by other modules); their foreign keys
-- are added by the owning module migration. Columns that point to them stay plain uuid.

CREATE TABLE core_company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  code citext,
  legal_name text,
  status text,
  trade_name text,
  cin text,
  gstin text,
  pan text,
  tan text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pin text,
  country text,
  contact_name text,
  contact_email citext,
  contact_phone text,
  website text,
  logo_file_id uuid,
  settings_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  source_record_id text,
  code text,
  name text,
  status text,
  approval_request_id uuid,
  gstin text,
  pan text,
  email citext,
  phone text,
  address text,
  registered_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  is_system boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_equipment_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  code citext,
  name text,
  meter_kind text,
  meter_precision integer,
  fuel_norm_unit text,
  tolerance_setting_key text,
  active boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  status text,
  address_line text,
  aggregate_seq bigint,
  latitude numeric(9,6),
  longitude numeric(9,6),
  city text,
  state text,
  pin text,
  in_charge text,
  phone text,
  email citext,
  project_id uuid,
  chainage_start_km numeric(12,3),
  chainage_end_km numeric(12,3),
  week_off_days_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  status text,
  aggregate_seq bigint,
  client text,
  start_date date,
  end_date date,
  value_amount numeric(14,2),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  location_id uuid,
  code citext,
  name text,
  status text,
  location_text text,
  keeper text,
  phone text,
  chainage_marker_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_wbs_node (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  project_id uuid,
  parent_wbs_node_id uuid,
  code citext,
  name text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_chainage_marker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  project_id uuid,
  code citext,
  label text,
  chainage_km numeric(12,3),
  wbs_node_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  uom_id uuid,
  code citext,
  name text,
  status text,
  hsn text,
  reorder_level numeric(14,3),
  category text,
  sub_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_major_material_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  quantity numeric(14,3),
  unit text,
  required_by date,
  material_id uuid,
  uom_id uuid,
  aggregate_seq bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_plan_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  resource_kind text,
  equipment_type_id uuid,
  position_id uuid,
  role text,
  material_id uuid,
  uom_id uuid,
  store_id uuid,
  quantity numeric(14,3),
  withdrawn boolean,
  from_date date,
  to_date date,
  required_by date,
  status text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id citext,
  email citext,
  name text,
  employee_id uuid,
  status text,
  last_login_at timestamptz,
  failed_count integer,
  locked_until timestamptz,
  phone text,
  must_change_password boolean,
  position_id uuid,
  scope text,
  password_hash text,
  password_set_at timestamptz,
  pin_hash text,
  pin_set_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_user_passkey (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  credential_key text,
  public_key text,
  sign_count bigint,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  access_type text,
  role_id uuid,
  privilege text,
  location_id uuid,
  project_id uuid,
  store_id uuid,
  aggregate_seq bigint,
  reason text,
  restored_at timestamptz,
  module text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  device_label text,
  device_info jsonb,
  refresh_hash text,
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_auth_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text,
  purpose text,
  secret_hash text,
  expires_at timestamptz,
  attempts integer,
  used_at timestamptz,
  ip_address inet,
  geo_location jsonb,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text,
  code text,
  name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_policy_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid,
  version_no integer,
  body jsonb,
  effective_from date,
  published_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_ot_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  name text,
  code varchar(20),
  is_active boolean,
  settlement_mode text,
  rate_working_day numeric(5,2),
  rate_week_off numeric(5,2),
  rate_holiday numeric(5,2),
  comp_off_multiplier numeric(4,2),
  comp_off_expiry_days integer,
  max_hours_per_day numeric(5,2),
  max_hours_per_month numeric(5,2),
  claim_within_days integer,
  min_minutes integer,
  requires_approval boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_code text,
  prefix text,
  year_scope integer,
  next_value bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_holiday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  company_profile_id uuid,
  holiday_date date,
  name text,
  holiday_type text,
  is_optional boolean,
  end_date date,
  scope_project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_seq bigint,
  company_profile_id uuid,
  code text,
  name text,
  timezone text,
  in_time time,
  out_time time,
  is_active boolean,
  week_off_days_json jsonb,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_approval_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text,
  name text,
  is_active boolean,
  timeout_hours integer,
  module text,
  scope_type text,
  raised_by uuid,
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_matrix_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid,
  version_no integer,
  effective_from date,
  published_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_matrix_level (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_version_id uuid,
  level_no integer,
  approver_role_id uuid,
  amount_from numeric(14,2),
  amount_to numeric(14,2),
  timeout_hours integer,
  on_timeout text,
  cash_limit_inr numeric(14,2),
  approver_user_id uuid,
  escalate_to_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_approval_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text,
  module text,
  source_record_id text,
  location_id uuid,
  raised_by_id uuid,
  amount numeric(14,2),
  status text,
  levels_snapshot jsonb,
  payload_json jsonb,
  chain_id uuid,
  matrix_version_id uuid,
  config_version_label text,
  config_effective_from date,
  raised_at timestamptz,
  current_level smallint,
  assigned_actor_id uuid,
  decided_at timestamptz,
  title text,
  emergency boolean,
  code text,
  raised_by_name text,
  chainage_marker_id uuid,
  matrix_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_approval_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid,
  level_no integer,
  actor_id uuid,
  action text,
  comment text,
  acted_at timestamptz,
  record_version integer,
  line_changes jsonb,
  amount_approved numeric(14,2),
  by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_grievance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text,
  source_record_id text,
  raised_by uuid,
  subject text,
  status text,
  closed_at timestamptz,
  employee_id uuid,
  code text,
  message text,
  visit_date date,
  raised_by_name text,
  raised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid,
  notification_type text,
  source_type text,
  source_id uuid,
  title text,
  body text,
  delivery_status text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text,
  owner_id uuid,
  file_name text,
  content_type text,
  size_bytes bigint,
  sha256 char(64),
  object_key text,
  visibility text,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_record_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text,
  entity_id uuid,
  action text,
  actor_id uuid,
  status_dimension text,
  old_status text,
  new_status text,
  remarks text,
  correlation_id text,
  occurred_at timestamptz,
  details jsonb,
  effective_at timestamptz,
  source_record_type text,
  source_record_id uuid,
  is_internal boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text,
  import_type text,
  upload_file_id uuid,
  template_version text,
  uploaded_by uuid,
  total_rows integer,
  valid_rows integer,
  error_rows integer,
  status text,
  submitted_at timestamptz,
  requester_mode text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_usage_counter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text,
  scope_key text,
  week_start date,
  counter_value bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  status text,
  parent_department_id uuid,
  head_position_id uuid,
  description text,
  color_index smallint,
  color_hex text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code citext,
  title text,
  department_id uuid,
  grade text,
  reports_to_position_id uuid,
  planned_positions integer,
  holder text,
  description text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_geo_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  label text,
  zone_type text,
  shape text,
  center_lat numeric(9,6),
  center_lng numeric(9,6),
  radius_m numeric(10,2),
  points_json jsonb,
  buffer_m numeric(10,2),
  version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_project_milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  name text,
  due_date date,
  weight numeric(5,2),
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_pms_limit_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier smallint,
  priority text,
  amount_inr numeric(14,2),
  days integer,
  hours integer,
  minutes integer,
  is_final boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_policy_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid,
  title text,
  category text,
  body text,
  ack_required boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_policy_rule_ack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  user_id uuid,
  acked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_custom_policy_field (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_policy_id uuid,
  label text,
  field_type text,
  is_required boolean,
  options_json jsonb,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_custom_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_custom_policy_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_policy_id uuid,
  version_no integer,
  effective_from date,
  reason text,
  values_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_document_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  template_version text,
  status text,
  file_id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint,
  revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_ot_policy_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid,
  rule_code text,
  rule_json jsonb,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_equipment_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type_id uuid,
  qty integer,
  assigned_at timestamptz,
  assigned_by_user_id uuid,
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_leave_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  is_paid boolean,
  status text,
  annual_days numeric(5,2),
  accrual text,
  carry_forward boolean,
  max_carry_days numeric(5,2),
  expiry_months integer,
  encashable boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_leave_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  effective_from date,
  effective_to date,
  status text,
  year_start date,
  year_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_leave_policy_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_policy_id uuid,
  leave_type_id uuid,
  rule_json jsonb,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  row_number integer,
  raw_values jsonb,
  validated_values jsonb,
  error_messages jsonb,
  linked_record_type text,
  linked_record_id uuid,
  status text,
  created_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE core_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  subject text,
  category text,
  priority text,
  description text,
  status text,
  raised_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE integ_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text,
  event_id uuid,
  event_type text,
  event_version text,
  aggregate_type text,
  aggregate_id uuid,
  aggregate_seq bigint,
  occurred_at timestamptz,
  correlation_id text,
  causation_id uuid,
  actor_id uuid,
  payload jsonb,
  coalesce_key text,
  schema_version text,
  source_module text,
  status text,
  attempts integer,
  last_error text,
  next_attempt_at timestamptz,
  published_at timestamptz,
  received_at timestamptz,
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  replay_status text,
  replayed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE integ_idempotency_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text,
  request_hash text,
  response jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE integ_aggregate_sequence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text,
  aggregate_id uuid,
  last_seq bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE integ_offline_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_operation_key text,
  client_device_key text,
  user_id uuid,
  project_id uuid,
  location_id uuid,
  store_id uuid,
  operation_type text,
  payload jsonb,
  captured_at timestamptz,
  received_at timestamptz,
  sync_status text,
  result_entity_type text,
  result_entity_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE audit_row_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text,
  record_id text,
  op text,
  old_row jsonb,
  new_row jsonb,
  actor_id uuid,
  correlation_id text,
  module_name text,
  ip_hash text,
  changed_at timestamptz,
  prev_hash text,
  row_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1
);

-- Foreign keys (ON DELETE NO ACTION, the PostgreSQL default; rules to be signed off)
ALTER TABLE core_company_profile ADD CONSTRAINT core_company_profile_logo_file_id_fkey FOREIGN KEY (logo_file_id) REFERENCES core_file (id);
ALTER TABLE core_vendor ADD CONSTRAINT core_vendor_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES core_approval_request (id);
ALTER TABLE core_vendor ADD CONSTRAINT core_vendor_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES core_user (id);
ALTER TABLE core_location ADD CONSTRAINT core_location_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_store ADD CONSTRAINT core_store_location_id_fkey FOREIGN KEY (location_id) REFERENCES core_location (id);
ALTER TABLE core_store ADD CONSTRAINT core_store_chainage_marker_id_fkey FOREIGN KEY (chainage_marker_id) REFERENCES core_chainage_marker (id);
ALTER TABLE core_wbs_node ADD CONSTRAINT core_wbs_node_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_wbs_node ADD CONSTRAINT core_wbs_node_parent_wbs_node_id_fkey FOREIGN KEY (parent_wbs_node_id) REFERENCES core_wbs_node (id);
ALTER TABLE core_chainage_marker ADD CONSTRAINT core_chainage_marker_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_chainage_marker ADD CONSTRAINT core_chainage_marker_wbs_node_id_fkey FOREIGN KEY (wbs_node_id) REFERENCES core_wbs_node (id);
ALTER TABLE core_major_material_allocation ADD CONSTRAINT core_major_material_allocation_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_major_material_allocation ADD CONSTRAINT core_major_material_allocation_material_id_fkey FOREIGN KEY (material_id) REFERENCES core_material (id);
ALTER TABLE core_plan_line ADD CONSTRAINT core_plan_line_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_plan_line ADD CONSTRAINT core_plan_line_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES core_equipment_type (id);
ALTER TABLE core_plan_line ADD CONSTRAINT core_plan_line_position_id_fkey FOREIGN KEY (position_id) REFERENCES core_position (id);
ALTER TABLE core_plan_line ADD CONSTRAINT core_plan_line_material_id_fkey FOREIGN KEY (material_id) REFERENCES core_material (id);
ALTER TABLE core_plan_line ADD CONSTRAINT core_plan_line_store_id_fkey FOREIGN KEY (store_id) REFERENCES core_store (id);
ALTER TABLE core_user ADD CONSTRAINT core_user_position_id_fkey FOREIGN KEY (position_id) REFERENCES core_position (id);
ALTER TABLE core_user_passkey ADD CONSTRAINT core_user_passkey_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE core_user_access ADD CONSTRAINT core_user_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE core_user_access ADD CONSTRAINT core_user_access_role_id_fkey FOREIGN KEY (role_id) REFERENCES core_role (id);
ALTER TABLE core_user_access ADD CONSTRAINT core_user_access_location_id_fkey FOREIGN KEY (location_id) REFERENCES core_location (id);
ALTER TABLE core_user_access ADD CONSTRAINT core_user_access_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_user_access ADD CONSTRAINT core_user_access_store_id_fkey FOREIGN KEY (store_id) REFERENCES core_store (id);
ALTER TABLE core_user_session ADD CONSTRAINT core_user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE core_auth_activity ADD CONSTRAINT core_auth_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE core_policy_version ADD CONSTRAINT core_policy_version_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES core_policy (id);
ALTER TABLE core_holiday ADD CONSTRAINT core_holiday_company_profile_id_fkey FOREIGN KEY (company_profile_id) REFERENCES core_company_profile (id);
ALTER TABLE core_holiday ADD CONSTRAINT core_holiday_scope_project_id_fkey FOREIGN KEY (scope_project_id) REFERENCES core_project (id);
ALTER TABLE core_shift ADD CONSTRAINT core_shift_company_profile_id_fkey FOREIGN KEY (company_profile_id) REFERENCES core_company_profile (id);
ALTER TABLE core_approval_chain ADD CONSTRAINT core_approval_chain_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES core_user (id);
ALTER TABLE core_approval_chain ADD CONSTRAINT core_approval_chain_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_matrix_version ADD CONSTRAINT core_matrix_version_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES core_approval_chain (id);
ALTER TABLE core_matrix_level ADD CONSTRAINT core_matrix_level_matrix_version_id_fkey FOREIGN KEY (matrix_version_id) REFERENCES core_matrix_version (id);
ALTER TABLE core_matrix_level ADD CONSTRAINT core_matrix_level_approver_role_id_fkey FOREIGN KEY (approver_role_id) REFERENCES core_role (id);
ALTER TABLE core_matrix_level ADD CONSTRAINT core_matrix_level_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES core_user (id);
ALTER TABLE core_matrix_level ADD CONSTRAINT core_matrix_level_escalate_to_user_id_fkey FOREIGN KEY (escalate_to_user_id) REFERENCES core_user (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_location_id_fkey FOREIGN KEY (location_id) REFERENCES core_location (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_raised_by_id_fkey FOREIGN KEY (raised_by_id) REFERENCES core_user (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES core_approval_chain (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_matrix_version_id_fkey FOREIGN KEY (matrix_version_id) REFERENCES core_matrix_version (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_assigned_actor_id_fkey FOREIGN KEY (assigned_actor_id) REFERENCES core_user (id);
ALTER TABLE core_approval_request ADD CONSTRAINT core_approval_request_chainage_marker_id_fkey FOREIGN KEY (chainage_marker_id) REFERENCES core_chainage_marker (id);
ALTER TABLE core_approval_action ADD CONSTRAINT core_approval_action_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES core_approval_request (id);
ALTER TABLE core_approval_action ADD CONSTRAINT core_approval_action_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES core_user (id);
ALTER TABLE core_grievance ADD CONSTRAINT core_grievance_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES core_user (id);
ALTER TABLE core_notification ADD CONSTRAINT core_notification_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES core_user (id);
ALTER TABLE core_record_timeline ADD CONSTRAINT core_record_timeline_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES core_user (id);
ALTER TABLE core_import_batch ADD CONSTRAINT core_import_batch_upload_file_id_fkey FOREIGN KEY (upload_file_id) REFERENCES core_file (id);
ALTER TABLE core_import_batch ADD CONSTRAINT core_import_batch_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES core_user (id);
ALTER TABLE core_department ADD CONSTRAINT core_department_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES core_department (id);
ALTER TABLE core_department ADD CONSTRAINT core_department_head_position_id_fkey FOREIGN KEY (head_position_id) REFERENCES core_position (id);
ALTER TABLE core_position ADD CONSTRAINT core_position_department_id_fkey FOREIGN KEY (department_id) REFERENCES core_department (id);
ALTER TABLE core_position ADD CONSTRAINT core_position_reports_to_position_id_fkey FOREIGN KEY (reports_to_position_id) REFERENCES core_position (id);
ALTER TABLE core_geo_zone ADD CONSTRAINT core_geo_zone_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_project_milestone ADD CONSTRAINT core_project_milestone_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_policy_rule ADD CONSTRAINT core_policy_rule_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES core_policy_version (id);
ALTER TABLE core_policy_rule_ack ADD CONSTRAINT core_policy_rule_ack_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES core_policy_rule (id);
ALTER TABLE core_policy_rule_ack ADD CONSTRAINT core_policy_rule_ack_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE core_custom_policy_field ADD CONSTRAINT core_custom_policy_field_custom_policy_id_fkey FOREIGN KEY (custom_policy_id) REFERENCES core_custom_policy (id);
ALTER TABLE core_custom_policy_version ADD CONSTRAINT core_custom_policy_version_custom_policy_id_fkey FOREIGN KEY (custom_policy_id) REFERENCES core_custom_policy (id);
ALTER TABLE core_document_template ADD CONSTRAINT core_document_template_file_id_fkey FOREIGN KEY (file_id) REFERENCES core_file (id);
ALTER TABLE core_ot_policy_rule ADD CONSTRAINT core_ot_policy_rule_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES core_ot_policy (id);
ALTER TABLE core_equipment_assignment ADD CONSTRAINT core_equipment_assignment_equipment_type_id_fkey FOREIGN KEY (equipment_type_id) REFERENCES core_equipment_type (id);
ALTER TABLE core_equipment_assignment ADD CONSTRAINT core_equipment_assignment_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES core_user (id);
ALTER TABLE core_equipment_assignment ADD CONSTRAINT core_equipment_assignment_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE core_leave_policy_rule ADD CONSTRAINT core_leave_policy_rule_leave_policy_id_fkey FOREIGN KEY (leave_policy_id) REFERENCES core_leave_policy (id);
ALTER TABLE core_leave_policy_rule ADD CONSTRAINT core_leave_policy_rule_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES core_leave_type (id);
ALTER TABLE core_import_row ADD CONSTRAINT core_import_row_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES core_import_batch (id);
ALTER TABLE core_ticket ADD CONSTRAINT core_ticket_raised_by_user_id_fkey FOREIGN KEY (raised_by_user_id) REFERENCES core_user (id);
ALTER TABLE integ_event ADD CONSTRAINT integ_event_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES core_user (id);
ALTER TABLE integ_offline_operation ADD CONSTRAINT integ_offline_operation_user_id_fkey FOREIGN KEY (user_id) REFERENCES core_user (id);
ALTER TABLE integ_offline_operation ADD CONSTRAINT integ_offline_operation_project_id_fkey FOREIGN KEY (project_id) REFERENCES core_project (id);
ALTER TABLE integ_offline_operation ADD CONSTRAINT integ_offline_operation_location_id_fkey FOREIGN KEY (location_id) REFERENCES core_location (id);
ALTER TABLE integ_offline_operation ADD CONSTRAINT integ_offline_operation_store_id_fkey FOREIGN KEY (store_id) REFERENCES core_store (id);
ALTER TABLE audit_row_change ADD CONSTRAINT audit_row_change_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES core_user (id);

-- Check constraints (approved 2026-11-19)
ALTER TABLE integ_event ADD CONSTRAINT integ_event_direction_check CHECK (direction IN ('outbound', 'inbound'));

