-- Core may add a unit of measure (POST /uoms) for a material whose unit is not on the list. shared.uom is still owned by
-- Platform Administration: the application role gets INSERT on that one table, and nothing else (no update, no delete).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_app') THEN
    GRANT INSERT ON shared.uom TO core_app;
  END IF;
END
$$;
