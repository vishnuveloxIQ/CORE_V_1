-- Phase 5d (design defaults recorded in PROGRESS.md, Phase 5d block). Unique keys, CHECKs, NOT NULL constraints and
-- defaults only; the tables and their foreign keys are created in 0001. Rules that need another row (a published
-- version is immutable; a rule is written only while its version is unpublished) are checked in the service layer.
-- The tables are empty when this runs, so no backfill is needed.
-- Text code columns already carry a plain ix_ index from 0004. Each unique key on such a column drops that index first,
-- so the column is not indexed twice.

-- Policies (design point b).
ALTER TABLE core_policy
  ALTER COLUMN kind SET NOT NULL,
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;
DROP INDEX IF EXISTS ix_core_policy_code;
CREATE UNIQUE INDEX core_policy_code_key ON core_policy (code);
ALTER TABLE core_policy
  ADD CONSTRAINT core_policy_kind_check
    CHECK (kind IN ('general', 'attendance', 'leave', 'overtime', 'conduct', 'other'));

-- Policy versions (design point b). Numbered from 1 per policy; published versions are immutable (service layer).
ALTER TABLE core_policy_version
  ALTER COLUMN policy_id SET NOT NULL,
  ALTER COLUMN version_no SET NOT NULL,
  ALTER COLUMN body SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL;
CREATE UNIQUE INDEX core_policy_version_policy_version_key ON core_policy_version (policy_id, version_no);
ALTER TABLE core_policy_version
  ADD CONSTRAINT core_policy_version_version_no_check CHECK (version_no >= 1),
  ADD CONSTRAINT core_policy_version_body_check CHECK (jsonb_typeof(body) = 'object');

-- Policy rules belong to one version (design point c).
ALTER TABLE core_policy_rule
  ALTER COLUMN policy_version_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN body SET NOT NULL,
  ALTER COLUMN ack_required SET DEFAULT false,
  ALTER COLUMN ack_required SET NOT NULL;

-- Acknowledgements (design point c). One per user and rule; the second call returns the first row.
ALTER TABLE core_policy_rule_ack
  ALTER COLUMN rule_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN acked_at SET DEFAULT now(),
  ALTER COLUMN acked_at SET NOT NULL;
CREATE UNIQUE INDEX core_policy_rule_ack_rule_user_key ON core_policy_rule_ack (rule_id, user_id);

-- OT policies (design point d). Code is varchar(20) and keyed; the 0004 index on it is dropped first.
ALTER TABLE core_ot_policy
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN settlement_mode SET NOT NULL,
  ALTER COLUMN requires_approval SET DEFAULT false,
  ALTER COLUMN requires_approval SET NOT NULL;
DROP INDEX IF EXISTS ix_core_ot_policy_code;
CREATE UNIQUE INDEX core_ot_policy_code_key ON core_ot_policy (code);
ALTER TABLE core_ot_policy
  ADD CONSTRAINT core_ot_policy_settlement_mode_check
    CHECK (settlement_mode IN ('comp_off', 'payout', 'both')),
  ADD CONSTRAINT core_ot_policy_rates_check
    CHECK (
      COALESCE(rate_working_day >= 0, true)
      AND COALESCE(rate_week_off >= 0, true)
      AND COALESCE(rate_holiday >= 0, true)
    ),
  ADD CONSTRAINT core_ot_policy_comp_off_check
    CHECK (
      COALESCE(comp_off_multiplier >= 0, true)
      AND COALESCE(comp_off_expiry_days >= 0, true)
    ),
  ADD CONSTRAINT core_ot_policy_caps_check
    CHECK (
      COALESCE(max_hours_per_day BETWEEN 0 AND 24, true)
      AND COALESCE(max_hours_per_month BETWEEN 0 AND 744, true)
    ),
  ADD CONSTRAINT core_ot_policy_limits_check
    CHECK (COALESCE(claim_within_days >= 0, true) AND COALESCE(min_minutes >= 0, true));

-- OT policy rules (design point d). rule_json is an object; the rule is not interpreted in 5d.
ALTER TABLE core_ot_policy_rule
  ALTER COLUMN policy_id SET NOT NULL,
  ALTER COLUMN rule_code SET NOT NULL,
  ALTER COLUMN rule_json SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL;
CREATE UNIQUE INDEX core_ot_policy_rule_key ON core_ot_policy_rule (policy_id, rule_code, effective_from);
ALTER TABLE core_ot_policy_rule
  ADD CONSTRAINT core_ot_policy_rule_json_check CHECK (jsonb_typeof(rule_json) = 'object'),
  ADD CONSTRAINT core_ot_policy_rule_dates_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- Leave types (design point e).
ALTER TABLE core_leave_type
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN is_paid SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN accrual SET DEFAULT 'none',
  ALTER COLUMN accrual SET NOT NULL,
  ALTER COLUMN carry_forward SET DEFAULT false,
  ALTER COLUMN carry_forward SET NOT NULL,
  ALTER COLUMN encashable SET DEFAULT false,
  ALTER COLUMN encashable SET NOT NULL;
DROP INDEX IF EXISTS ix_core_leave_type_code;
CREATE UNIQUE INDEX core_leave_type_code_key ON core_leave_type (code);
ALTER TABLE core_leave_type
  ADD CONSTRAINT core_leave_type_status_check CHECK (status IN ('active', 'inactive')),
  ADD CONSTRAINT core_leave_type_accrual_check CHECK (accrual IN ('monthly', 'yearly', 'none')),
  ADD CONSTRAINT core_leave_type_days_check
    CHECK (
      COALESCE(annual_days >= 0, true)
      AND COALESCE(max_carry_days >= 0, true)
      AND COALESCE(expiry_months >= 0, true)
    );

-- Leave policies (design point e).
ALTER TABLE core_leave_policy
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;
DROP INDEX IF EXISTS ix_core_leave_policy_code;
CREATE UNIQUE INDEX core_leave_policy_code_key ON core_leave_policy (code);
ALTER TABLE core_leave_policy
  ADD CONSTRAINT core_leave_policy_status_check CHECK (status IN ('active', 'inactive')),
  ADD CONSTRAINT core_leave_policy_effective_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  ADD CONSTRAINT core_leave_policy_year_check
    CHECK (year_start IS NULL OR year_end IS NULL OR year_end >= year_start);

-- Leave policy rules (design point e).
ALTER TABLE core_leave_policy_rule
  ALTER COLUMN leave_policy_id SET NOT NULL,
  ALTER COLUMN leave_type_id SET NOT NULL,
  ALTER COLUMN rule_json SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL;
CREATE UNIQUE INDEX core_leave_policy_rule_key
  ON core_leave_policy_rule (leave_policy_id, leave_type_id, effective_from);
ALTER TABLE core_leave_policy_rule
  ADD CONSTRAINT core_leave_policy_rule_json_check CHECK (jsonb_typeof(rule_json) = 'object'),
  ADD CONSTRAINT core_leave_policy_rule_dates_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- Custom policies (design point f). Named, with no code.
ALTER TABLE core_custom_policy
  ALTER COLUMN name SET NOT NULL;

-- Custom policy fields (design point f). The field types are the vocabulary in design point a.
ALTER TABLE core_custom_policy_field
  ALTER COLUMN custom_policy_id SET NOT NULL,
  ALTER COLUMN label SET NOT NULL,
  ALTER COLUMN field_type SET NOT NULL,
  ALTER COLUMN is_required SET DEFAULT false,
  ALTER COLUMN is_required SET NOT NULL,
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;
CREATE UNIQUE INDEX core_custom_policy_field_label_key ON core_custom_policy_field (custom_policy_id, label);
ALTER TABLE core_custom_policy_field
  ADD CONSTRAINT core_custom_policy_field_type_check
    CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select')),
  ADD CONSTRAINT core_custom_policy_field_sort_check CHECK (sort_order >= 0),
  ADD CONSTRAINT core_custom_policy_field_options_check
    CHECK (options_json IS NULL OR jsonb_typeof(options_json) = 'array');

-- Custom policy versions (design point f).
ALTER TABLE core_custom_policy_version
  ALTER COLUMN custom_policy_id SET NOT NULL,
  ALTER COLUMN version_no SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL,
  ALTER COLUMN values_json SET NOT NULL;
CREATE UNIQUE INDEX core_custom_policy_version_key
  ON core_custom_policy_version (custom_policy_id, version_no);
ALTER TABLE core_custom_policy_version
  ADD CONSTRAINT core_custom_policy_version_no_check CHECK (version_no >= 1),
  ADD CONSTRAINT core_custom_policy_version_values_check
    CHECK (jsonb_typeof(values_json) = 'object');

-- Document templates (design point g). The file is handled in 5f; file_id is a foreign key from 0001.
ALTER TABLE core_document_template
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN template_version SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT 1,
  ALTER COLUMN revision SET NOT NULL;
DROP INDEX IF EXISTS ix_core_document_template_code;
CREATE UNIQUE INDEX core_document_template_code_key ON core_document_template (code);
ALTER TABLE core_document_template
  ADD CONSTRAINT core_document_template_status_check
    CHECK (status IN ('draft', 'active', 'retired')),
  ADD CONSTRAINT core_document_template_revision_check CHECK (revision >= 1),
  ADD CONSTRAINT core_document_template_size_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0);
