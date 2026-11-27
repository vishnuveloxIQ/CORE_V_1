-- Equipment units belong to a project directly. Existing units have no project until one is chosen.

ALTER TABLE core_equipment_unit
  ADD COLUMN project_id uuid REFERENCES core_project (id) ON DELETE RESTRICT;

CREATE INDEX core_equipment_unit_project_id_idx ON core_equipment_unit (project_id);
