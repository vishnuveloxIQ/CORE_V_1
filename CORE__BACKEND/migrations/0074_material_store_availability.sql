-- Material availability by store (decision 2026-11-27, option 2): which stores a material is available in. One row per
-- material and store. Deleting a material or a store removes its rows. Standard columns follow 0001.

CREATE TABLE core_material_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES core_material (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES core_store (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_material_store_once UNIQUE (material_id, store_id),
  CONSTRAINT core_material_store_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_material_store_store_id_idx ON core_material_store (store_id);
