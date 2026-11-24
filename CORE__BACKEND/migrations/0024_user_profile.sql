-- User profile fields for the admin user screens. phone, scope and must_change_password already exist on core_user
-- (0001); this adds the rest. They describe the user for the UI only: privileges still come from core_user_access.
--   designation: job title, free text, at most 200 characters.
--   user_role:   the UI role, 'module_head' or 'approver' (API key: role).
--   modules:     the modules a module head heads (API values hrms, pms, stores, pm); empty for an approver.
--   scope:       existing column, now 'company' or 'project' (API key: scopeType).
--   scope_ids:   the project ids of a project scope (API key: scopeIds). An array cannot carry a foreign key, so the
--                service checks that every id exists in core_project.
-- Existing rows keep NULL designation and user_role, and get empty arrays. The tenant schemas hold few users.

ALTER TABLE core_user
  ADD COLUMN designation text,
  ADD COLUMN user_role text,
  ADD COLUMN modules text[] NOT NULL DEFAULT '{}',
  ADD COLUMN scope_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE core_user
  ADD CONSTRAINT core_user_designation_check
    CHECK (designation IS NULL OR char_length(designation) BETWEEN 1 AND 200),
  ADD CONSTRAINT core_user_user_role_check
    CHECK (user_role IS NULL OR user_role IN ('module_head', 'approver')),
  ADD CONSTRAINT core_user_modules_check
    CHECK (modules <@ ARRAY['hrms', 'pms', 'stores', 'pm']::text[]),
  ADD CONSTRAINT core_user_scope_check
    CHECK (scope IS NULL OR scope IN ('company', 'project')),
  ADD CONSTRAINT core_user_phone_check
    CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 30);
