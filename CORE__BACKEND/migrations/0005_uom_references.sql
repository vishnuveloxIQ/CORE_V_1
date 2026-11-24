-- PROVISIONAL: foreign keys from the three tenant tables that hold a unit of measure to shared.uom.
-- Column list from handoff section 6 (uom_id references uom) and section 5 (core_material, core_plan_line,
-- core_major_material_allocation). Requires the global migration 0001_shared_uom.sql to be applied first.
-- Applied to every tenant schema. ON DELETE keeps the default NO ACTION, as for all business tables.

ALTER TABLE core_material
  ADD CONSTRAINT core_material_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES shared.uom (id);

ALTER TABLE core_major_material_allocation
  ADD CONSTRAINT core_major_material_allocation_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES shared.uom (id);

ALTER TABLE core_plan_line
  ADD CONSTRAINT core_plan_line_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES shared.uom (id);

-- Index the new foreign-key columns (same rule as 0004).
CREATE INDEX ix_core_material_uom_id ON core_material (uom_id);
CREATE INDEX ix_core_major_material_allocation_uom_id ON core_major_material_allocation (uom_id);
CREATE INDEX ix_core_plan_line_uom_id ON core_plan_line (uom_id);
