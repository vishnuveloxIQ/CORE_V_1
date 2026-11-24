-- Shared rate-limit windows (Phase N decision 3: PostgreSQL table). One row per limit key, such as
-- "ip:<address>" or "login:id:<tenant>:<login id>". Applied once per database (global step, public.core_migration).
-- The window start and the "now" comparisons use the database clock, so every instance agrees on the window.
-- Rows are swept by the application after their window has ended; nothing else reads or writes this table.

CREATE TABLE public.core_rate_limit_window (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 1)
);

CREATE INDEX core_rate_limit_window_start_idx ON public.core_rate_limit_window (window_start);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.core_rate_limit_window TO core_app;
  END IF;
END
$$;
