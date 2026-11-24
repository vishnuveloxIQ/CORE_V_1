-- Approved decisions from handoff section 8 (signed off 2026-11-19), applied to every tenant schema.

-- 1. audit_row_change: the application role may insert and read, never change history.
--    The role core_app is created by a database administrator (the migration owner cannot create
--    roles). Until it exists, only the PUBLIC revoke below applies. The owner keeps its rights.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_row_change FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    EXECUTE format(
      'REVOKE UPDATE, DELETE, TRUNCATE ON audit_row_change FROM %I',
      'core_app'
    );
  END IF;
END
$$;

-- 2. Polymorphic module references: the module value is checked here; the target record is
--    checked in the service layer. Allowed modules are listed in handoff section 8.
ALTER TABLE core_grievance
  ADD CONSTRAINT core_grievance_source_module_check
  CHECK (source_module IS NULL OR source_module IN ('core', 'hrms', 'pm', 'pms', 'stores'));

ALTER TABLE integ_event
  ADD CONSTRAINT integ_event_source_module_check
  CHECK (source_module IS NULL OR source_module IN ('core', 'hrms', 'pm', 'pms', 'stores'));

ALTER TABLE audit_row_change
  ADD CONSTRAINT audit_row_change_module_name_check
  CHECK (module_name IN ('core', 'hrms', 'pm', 'pms', 'stores'));

-- 3. source_record_id is uuid unless the source is an external system. These three sources are
--    internal (decided 2026-11-19), so they are uuid. The tables hold no rows yet, so the cast is safe.
ALTER TABLE core_vendor
  ALTER COLUMN source_record_id TYPE uuid USING source_record_id::uuid;
ALTER TABLE core_approval_request
  ALTER COLUMN source_record_id TYPE uuid USING source_record_id::uuid;
ALTER TABLE core_grievance
  ALTER COLUMN source_record_id TYPE uuid USING source_record_id::uuid;
