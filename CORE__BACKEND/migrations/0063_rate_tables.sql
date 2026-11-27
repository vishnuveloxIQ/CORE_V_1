-- Equipment and material rates per project. Each row is one line from an uploaded rate sheet: the rates and amounts
-- for hiring or renting equipment, and the rates for materials. The rows come from a policy version (policy_version_id)
-- so a sheet can be traced to the version it was published under. Standard columns follow 0001.

CREATE TABLE core_equipment_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core_project (id) ON DELETE RESTRICT,
  policy_version_id uuid REFERENCES core_policy_version (id) ON DELETE RESTRICT,
  equipment_type text NOT NULL,
  rate_basis text NOT NULL,
  unit text NOT NULL,
  rate numeric(14,2) NOT NULL,
  amount numeric(14,2),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_equipment_rate_basis_check CHECK (rate_basis IN ('rental', 'hire')),
  CONSTRAINT core_equipment_rate_rate_check CHECK (rate >= 0),
  CONSTRAINT core_equipment_rate_amount_check CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT core_equipment_rate_row_version_check CHECK (row_version >= 1)
);

CREATE INDEX core_equipment_rate_project_id_idx ON core_equipment_rate (project_id);

CREATE TABLE core_material_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core_project (id) ON DELETE RESTRICT,
  policy_version_id uuid REFERENCES core_policy_version (id) ON DELETE RESTRICT,
  material_name text NOT NULL,
  material_code text,
  uom text NOT NULL,
  rate numeric(14,2) NOT NULL,
  amount numeric(14,2),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_material_rate_rate_check CHECK (rate >= 0),
  CONSTRAINT core_material_rate_amount_check CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT core_material_rate_row_version_check CHECK (row_version >= 1)
);

CREATE INDEX core_material_rate_project_id_idx ON core_material_rate (project_id);
