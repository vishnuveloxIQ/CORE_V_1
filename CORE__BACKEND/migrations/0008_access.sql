-- Phase 4d (design defaults recorded in PROGRESS.md, Phase 4d block).

-- access_type vocabulary (design point a): role, privilege, module_head, suspension.
-- A grant or suspension row always has a type.
ALTER TABLE core_user_access
  ADD CONSTRAINT core_user_access_access_type_check
  CHECK (access_type IS NOT NULL AND access_type IN ('role', 'privilege', 'module_head', 'suspension'));

-- Module names as in migration 0003 (handoff section 8).
ALTER TABLE core_user_access
  ADD CONSTRAINT core_user_access_module_check
  CHECK (module IS NULL OR module IN ('core', 'hrms', 'pm', 'pms', 'stores'));

-- The access guard reads a user's live rows on every request.
CREATE INDEX core_user_access_user_active_idx
  ON core_user_access (user_id) WHERE restored_at IS NULL;

-- At most one active suspension per user (design point e).
CREATE UNIQUE INDEX core_user_access_active_suspension_key
  ON core_user_access (user_id) WHERE access_type = 'suspension' AND restored_at IS NULL;
