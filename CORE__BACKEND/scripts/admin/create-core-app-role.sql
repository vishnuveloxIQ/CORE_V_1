-- Run once by a database administrator (a role with CREATEROLE, such as postgres), not by the migration owner.
-- Creates the application group role core_app and removes its rights to change audit history in every tenant schema.
-- Login roles for the application are granted membership with: GRANT core_app TO <login_role>;
-- Safe to run again.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    CREATE ROLE core_app NOLOGIN;
  END IF;
END
$$;

DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' LOOP
    IF to_regclass(format('%I.audit_row_change', s.nspname)) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I.audit_row_change FROM core_app', s.nspname);
    END IF;
  END LOOP;
END
$$;

-- Read-only access to the shared reference schema (provisional shared.uom). Migration 0001_shared_uom
-- grants this only if the role already exists, so it is repeated here for the case where the role came later.
DO $$
BEGIN
  IF to_regclass('shared.uom') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA shared TO core_app;
    GRANT SELECT ON shared.uom TO core_app;
  END IF;
END
$$;
