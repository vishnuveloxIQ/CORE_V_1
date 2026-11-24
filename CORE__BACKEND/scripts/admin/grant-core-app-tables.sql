-- Run once by a database administrator, AFTER create-core-app-role.sql and after the app login role has been
-- granted core_app (GRANT core_app TO <login_role>;). Not run by the migration owner (velox_core).
--
-- Least privilege for the application: data read and write on every tenant table, no schema changes, no
-- privilege changes. Migrations keep running as the owner, so tables created later get the same grants through
-- ALTER DEFAULT PRIVILEGES below. Safe to run again.
--
-- Decisions to confirm before go-live are marked DECIDE. Each is a single REVOKE or GRANT line.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    RAISE EXCEPTION 'role core_app does not exist: run create-core-app-role.sql first';
  END IF;
END
$$;

DO $$
DECLARE
  s record;
  t record;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO core_app', s.nspname);
    -- every existing table: read and write rows
    FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = s.nspname AND c.relkind IN ('r', 'p') LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO core_app', s.nspname, t.relname);
    END LOOP;
    -- tables created later by the owner get the same grants
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE velox_core IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO core_app', s.nspname);
  END LOOP;
END
$$;

-- Append-only history: the app may add rows, never change or remove them (audit_row_change is also covered in
-- create-core-app-role.sql). core_auth_activity is NOT append-only: the passkey code marks a sign-in challenge as
-- used by updating its row (used_at), so it keeps UPDATE. integ_event also keeps UPDATE: the relay updates its status.
DO $$
DECLARE
  s record;
  t text;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' LOOP
    FOREACH t IN ARRAY ARRAY['audit_row_change']
    LOOP
      IF to_regclass(format('%I.%I', s.nspname, t)) IS NOT NULL THEN
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I.%I FROM core_app', s.nspname, t);
      END IF;
    END LOOP;
    -- the migration ledger is written by the migration runner only, so the app may read it and nothing more
    IF to_regclass(format('%I.core_migration', s.nspname)) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.core_migration FROM core_app', s.nspname);
    END IF;
  END LOOP;
END
$$;

-- Shared reference data: read only (tenant rows reference shared.uom).
DO $$
BEGIN
  IF to_regclass('shared.uom') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA shared TO core_app;
    GRANT SELECT ON shared.uom TO core_app;
  END IF;
END
$$;

-- Shared tables in the public schema. The rate limiter writes its windows on every sign-in and reset attempt, so the
-- app needs write access to core_rate_limit_window. The migration ledger is read only, as in each tenant.
GRANT USAGE ON SCHEMA public TO core_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.core_rate_limit_window TO core_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.core_migration FROM core_app;
GRANT SELECT ON public.core_migration TO core_app;

-- The app never creates, alters or drops schema objects, and never grants privileges to others.
-- Nothing is granted on the database itself beyond connecting, so no CREATE on the database or on public.
REVOKE CREATE ON SCHEMA public FROM core_app;
