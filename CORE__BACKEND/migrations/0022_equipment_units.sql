-- Equipment units: the register of machines (frontend EquipmentUnit). One row per physical unit, identified by its
-- asset code (unique per tenant, case-insensitive). The equipment type, the hire vendor and the location are foreign
-- keys; the type is required. Standard columns follow 0001. Compliance and purchase fields are plain text or dates,
-- as captured on the registration wizard. Telematics (last ping) is not stored here.

CREATE TABLE core_equipment_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL,
  name text,
  equipment_type_id uuid NOT NULL REFERENCES core_equipment_type (id),
  make_model text,
  reg_no text,
  availability text NOT NULL DEFAULT 'Available',
  location_id uuid REFERENCES core_location (id),
  current_location text,
  lat numeric(9,6),
  lng numeric(9,6),
  ownership_type text,
  manufacturer text,
  model text,
  mfg_year text,
  engine_no text,
  chassis_no text,
  capacity text,
  capacity_unit text,
  meter_type text,
  meter_reading text,
  fuel_type text,
  fuel_norm text,
  tank_capacity text,
  owner text,
  vendor_id uuid REFERENCES core_vendor (id),
  hire_ref text,
  agreement_start date,
  agreement_end date,
  warranty_end date,
  warranty_reading text,
  invoice_no text,
  invoice_date date,
  reg_expiry date,
  insurance_no text,
  insurance_expiry date,
  puc_no text,
  pollution_expiry date,
  fitness_cert text,
  fitness_expiry date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_equipment_unit_asset_code_check
    CHECK (char_length(asset_code) BETWEEN 1 AND 40 AND asset_code = btrim(asset_code)),
  CONSTRAINT core_equipment_unit_availability_check
    CHECK (availability IN ('Available', 'In use', 'Under maintenance', 'Breakdown')),
  CONSTRAINT core_equipment_unit_lat_check CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  CONSTRAINT core_equipment_unit_lng_check CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  CONSTRAINT core_equipment_unit_row_version_check CHECK (row_version >= 1)
);

-- Asset codes are unique per tenant, compared without regard to case.
CREATE UNIQUE INDEX core_equipment_unit_asset_code_key ON core_equipment_unit (lower(asset_code));

-- Foreign key indexes. Lookups by equipment type are the common list filter.
CREATE INDEX core_equipment_unit_equipment_type_id_idx ON core_equipment_unit (equipment_type_id);
CREATE INDEX core_equipment_unit_location_id_idx ON core_equipment_unit (location_id);
CREATE INDEX core_equipment_unit_vendor_id_idx ON core_equipment_unit (vendor_id);
