-- PROVISIONAL: shared.uom, the units-of-measure reference table in the shared schema.
-- Owner: Platform Administration (06_Platform_Administration.md, not yet available). Replace this definition
-- when that document arrives; any column change then needs a new migration and a check of every tenant FK.
-- Applied once per database (global step, public.core_migration). Core reads this table and never writes it.

CREATE SCHEMA IF NOT EXISTS shared;

CREATE TABLE shared.uom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uom_code text NOT NULL,
  uom_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT shared_uom_uom_code_unique UNIQUE (uom_code)
);

-- Read-only for the application role. Guarded: the role is created by an administrator (scripts/admin).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    GRANT USAGE ON SCHEMA shared TO core_app;
    GRANT SELECT ON shared.uom TO core_app;
  END IF;
END
$$;
