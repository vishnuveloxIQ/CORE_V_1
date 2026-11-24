-- Phase 5c (design defaults recorded in PROGRESS.md, Phase 5c block). Unique keys, CHECKs, defaults and NOT NULL
-- constraints only; the tables themselves are created in 0001. Rules that need another row (the plan line store on
-- the same project; the equipment type code fixed after create) are checked in the service layer.
-- The tables are empty when this runs, so no backfill is needed. No foreign-key indexes: 0004 already indexes every
-- single-column foreign key, and the text code columns it covers get their own unique keys below where needed.

-- Required columns (design points b, d, e, f, g, h). Defaults match what the service writes on create.
ALTER TABLE core_vendor
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE core_material
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN uom_id SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE core_equipment_type
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL;

ALTER TABLE core_major_material_allocation
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN material_id SET NOT NULL,
  ALTER COLUMN uom_id SET NOT NULL,
  ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE core_equipment_assignment
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN equipment_type_id SET NOT NULL,
  ALTER COLUMN qty SET NOT NULL,
  ALTER COLUMN assigned_at SET NOT NULL;

ALTER TABLE core_plan_line
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN resource_kind SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN withdrawn SET DEFAULT false,
  ALTER COLUMN withdrawn SET NOT NULL;

-- Unique keys (design points b, d, e, g). Vendor codes are text, so the key is on lower(code). Material and equipment
-- type codes are citext, which compares without regard to case, so the plain column is keyed. One assignment per
-- project and equipment type (point g).
CREATE UNIQUE INDEX core_vendor_code_key ON core_vendor (lower(code));
CREATE UNIQUE INDEX core_material_code_key ON core_material (code);
CREATE UNIQUE INDEX core_equipment_type_code_key ON core_equipment_type (code);
CREATE UNIQUE INDEX core_equipment_assignment_project_type_key
  ON core_equipment_assignment (project_id, equipment_type_id);

-- Vendors (design point b). Deactivated, not deleted. GSTIN is 15 characters and PAN is 10; the format only is
-- checked, as in 5a.
ALTER TABLE core_vendor
  ADD CONSTRAINT core_vendor_status_check
    CHECK (status IN ('active', 'inactive')),
  ADD CONSTRAINT core_vendor_gstin_check
    CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  ADD CONSTRAINT core_vendor_pan_check
    CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- Materials (design point d). HSN is 4, 6 or 8 digits; reorder level is zero or more.
ALTER TABLE core_material
  ADD CONSTRAINT core_material_status_check
    CHECK (status IN ('active', 'inactive')),
  ADD CONSTRAINT core_material_hsn_check
    CHECK (hsn IS NULL OR hsn ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  ADD CONSTRAINT core_material_reorder_level_check
    CHECK (reorder_level IS NULL OR reorder_level >= 0);

-- Equipment types (design point e and open point 2). The vocabularies are open for the team to change.
ALTER TABLE core_equipment_type
  ADD CONSTRAINT core_equipment_type_meter_kind_check
    CHECK (meter_kind IS NULL OR meter_kind IN ('hours', 'km', 'none')),
  ADD CONSTRAINT core_equipment_type_meter_precision_check
    CHECK (meter_precision IS NULL OR meter_precision BETWEEN 0 AND 4),
  ADD CONSTRAINT core_equipment_type_fuel_norm_unit_check
    CHECK (fuel_norm_unit IS NULL OR fuel_norm_unit IN ('litre_per_hour', 'litre_per_km'));

-- Major material allocations (design point f). Quantity is above zero.
ALTER TABLE core_major_material_allocation
  ADD CONSTRAINT core_major_material_allocation_quantity_check
    CHECK (quantity > 0);

-- Equipment assignments (design point g). At least one unit.
ALTER TABLE core_equipment_assignment
  ADD CONSTRAINT core_equipment_assignment_qty_check
    CHECK (qty >= 1);

-- Plan lines (design points h and i). Each resource kind names the reference it needs. The store is checked in the
-- service layer, because it must sit on the same project through its location.
ALTER TABLE core_plan_line
  ADD CONSTRAINT core_plan_line_resource_kind_check
    CHECK (resource_kind IN ('equipment', 'people', 'material')),
  ADD CONSTRAINT core_plan_line_status_check
    CHECK (status IN ('draft', 'approved', 'cancelled')),
  ADD CONSTRAINT core_plan_line_quantity_check
    CHECK (quantity IS NULL OR quantity > 0),
  ADD CONSTRAINT core_plan_line_dates_check
    CHECK (from_date IS NULL OR to_date IS NULL OR to_date >= from_date),
  ADD CONSTRAINT core_plan_line_resource_fields_check
    CHECK (
      CASE resource_kind
        WHEN 'equipment' THEN equipment_type_id IS NOT NULL
        WHEN 'people' THEN position_id IS NOT NULL
        WHEN 'material' THEN material_id IS NOT NULL AND uom_id IS NOT NULL
        ELSE false
      END
    );
