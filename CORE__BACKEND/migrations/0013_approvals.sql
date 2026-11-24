-- Phase 5e (design defaults recorded in PROGRESS.md, Phase 5e block). Unique keys, CHECKs and NOT NULL constraints
-- only; the tables and their foreign keys are created in 0001. Immutability of published matrix versions, the raise
-- rules and the approver check are enforced in the service layer. The tables are empty, so no backfill is needed.
-- The approval request code is unique in its own migration below, after its 0004 index is dropped.

-- Approval chains (design point b). One company chain per request type, and one chain per project. The nil UUID stands
-- for the company scope so the expression index can cover both cases.
ALTER TABLE core_approval_chain
  ALTER COLUMN request_type SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN module SET NOT NULL,
  ALTER COLUMN scope_type SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;
CREATE UNIQUE INDEX core_approval_chain_scope_key
  ON core_approval_chain (request_type, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE core_approval_chain
  ADD CONSTRAINT core_approval_chain_scope_type_check CHECK (scope_type IN ('company', 'project')),
  ADD CONSTRAINT core_approval_chain_scope_project_check
    CHECK ((scope_type = 'project') = (project_id IS NOT NULL)),
  ADD CONSTRAINT core_approval_chain_timeout_check
    CHECK (timeout_hours IS NULL OR timeout_hours >= 0);

-- Matrix versions (design point c). Numbered per chain; published versions are immutable (service layer).
ALTER TABLE core_matrix_version
  ALTER COLUMN chain_id SET NOT NULL,
  ALTER COLUMN version_no SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL;
CREATE UNIQUE INDEX core_matrix_version_chain_version_key ON core_matrix_version (chain_id, version_no);
ALTER TABLE core_matrix_version
  ADD CONSTRAINT core_matrix_version_no_check CHECK (version_no >= 1);

-- Matrix levels (design point c). Each level names a role, a user, or both. Limits are zero or more.
ALTER TABLE core_matrix_level
  ALTER COLUMN matrix_version_id SET NOT NULL,
  ALTER COLUMN level_no SET NOT NULL,
  ALTER COLUMN amount_from SET NOT NULL,
  ALTER COLUMN amount_from SET DEFAULT 0;
CREATE UNIQUE INDEX core_matrix_level_version_level_key ON core_matrix_level (matrix_version_id, level_no);
ALTER TABLE core_matrix_level
  ADD CONSTRAINT core_matrix_level_no_check CHECK (level_no >= 1),
  ADD CONSTRAINT core_matrix_level_amount_from_check CHECK (amount_from >= 0),
  ADD CONSTRAINT core_matrix_level_amount_range_check
    CHECK (amount_to IS NULL OR amount_to >= amount_from),
  ADD CONSTRAINT core_matrix_level_cash_limit_check
    CHECK (cash_limit_inr IS NULL OR cash_limit_inr >= 0),
  ADD CONSTRAINT core_matrix_level_timeout_check
    CHECK (timeout_hours IS NULL OR timeout_hours >= 0),
  ADD CONSTRAINT core_matrix_level_on_timeout_check
    CHECK (on_timeout IS NULL OR on_timeout IN ('escalate', 'auto_reject', 'hold')),
  ADD CONSTRAINT core_matrix_level_approver_check
    CHECK (approver_role_id IS NOT NULL OR approver_user_id IS NOT NULL);

-- Approval requests (design points d, e, g). The code is unique and generated from the APR series. The 0004 index on
-- the code column is dropped first, so the column is not indexed twice.
ALTER TABLE core_approval_request
  ALTER COLUMN request_type SET NOT NULL,
  ALTER COLUMN module SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN levels_snapshot SET NOT NULL,
  ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN payload_json SET NOT NULL,
  ALTER COLUMN chain_id SET NOT NULL,
  ALTER COLUMN matrix_version_id SET NOT NULL,
  ALTER COLUMN raised_at SET DEFAULT now(),
  ALTER COLUMN raised_at SET NOT NULL,
  ALTER COLUMN current_level SET NOT NULL,
  ALTER COLUMN emergency SET DEFAULT false,
  ALTER COLUMN emergency SET NOT NULL,
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN title SET NOT NULL;
DROP INDEX IF EXISTS ix_core_approval_request_code;
CREATE UNIQUE INDEX core_approval_request_code_key ON core_approval_request (code);
ALTER TABLE core_approval_request
  ADD CONSTRAINT core_approval_request_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  ADD CONSTRAINT core_approval_request_amount_check CHECK (amount >= 0),
  ADD CONSTRAINT core_approval_request_level_check CHECK (current_level >= 1),
  ADD CONSTRAINT core_approval_request_snapshot_check
    CHECK (jsonb_typeof(levels_snapshot) = 'array'),
  ADD CONSTRAINT core_approval_request_payload_check
    CHECK (jsonb_typeof(payload_json) = 'object');

-- Approval actions (design point e, g). Append-only: the service layer never edits or deletes them.
ALTER TABLE core_approval_action
  ALTER COLUMN approval_request_id SET NOT NULL,
  ALTER COLUMN level_no SET NOT NULL,
  ALTER COLUMN actor_id SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN acted_at SET DEFAULT now(),
  ALTER COLUMN acted_at SET NOT NULL,
  ALTER COLUMN record_version SET NOT NULL;
ALTER TABLE core_approval_action
  ADD CONSTRAINT core_approval_action_action_check
    CHECK (action IN ('approve', 'reject', 'return', 'cancel')),
  ADD CONSTRAINT core_approval_action_level_check CHECK (level_no >= 1),
  ADD CONSTRAINT core_approval_action_amount_check
    CHECK (amount_approved IS NULL OR amount_approved >= 0),
  ADD CONSTRAINT core_approval_action_line_changes_check
    CHECK (line_changes IS NULL OR jsonb_typeof(line_changes) = 'array');

-- PMS limit rows (design point h). One row per tier and priority.
ALTER TABLE core_pms_limit_row
  ALTER COLUMN tier SET NOT NULL,
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN is_final SET DEFAULT false,
  ALTER COLUMN is_final SET NOT NULL;
CREATE UNIQUE INDEX core_pms_limit_row_tier_priority_key ON core_pms_limit_row (tier, priority);
ALTER TABLE core_pms_limit_row
  ADD CONSTRAINT core_pms_limit_row_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD CONSTRAINT core_pms_limit_row_tier_check CHECK (tier >= 1),
  ADD CONSTRAINT core_pms_limit_row_amount_check
    CHECK (amount_inr IS NULL OR amount_inr >= 0),
  ADD CONSTRAINT core_pms_limit_row_days_check CHECK (days IS NULL OR days >= 0),
  ADD CONSTRAINT core_pms_limit_row_hours_check
    CHECK (hours IS NULL OR hours BETWEEN 0 AND 23),
  ADD CONSTRAINT core_pms_limit_row_minutes_check
    CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 59);
