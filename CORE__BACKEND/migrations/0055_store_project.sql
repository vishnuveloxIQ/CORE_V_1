-- Stores belong to a project directly, not through a location. Existing stores take the project of their location.
-- location_id is kept for now and is no longer written; it is dropped with the locations table in a later migration.

ALTER TABLE core_store
  ADD COLUMN project_id uuid REFERENCES core_project (id) ON DELETE RESTRICT;

UPDATE core_store s
  SET project_id = l.project_id
  FROM core_location l
  WHERE l.id = s.location_id;

ALTER TABLE core_store
  ALTER COLUMN location_id DROP NOT NULL;

CREATE INDEX core_store_project_id_idx ON core_store (project_id);
