-- Access is scoped to a project or a store, not to a location. No grant in any tenant had a location scope when this
-- was written, so dropping the column removes no restriction.

ALTER TABLE core_user_access
  DROP COLUMN IF EXISTS location_id;
