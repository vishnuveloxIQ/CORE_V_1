-- Stock levels: quantity on hand and quantity reserved per store and material. Frontend shows these per store.
-- One row per (store, material). Standard columns follow 0001. The store and material must exist (foreign keys);
-- a store with stock cannot be deleted (ON DELETE RESTRICT). Deleting a material with stock is refused by the default
-- NO ACTION rule. reserved is kept between zero and qty by CHECK; the service layer gives the clearer 422 first.

CREATE TABLE core_stock_level (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES core_store (id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES core_material (id),
  qty numeric(14,3) NOT NULL DEFAULT 0,
  reserved numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_stock_level_store_material_key UNIQUE (store_id, material_id),
  CONSTRAINT core_stock_level_qty_check CHECK (qty >= 0),
  CONSTRAINT core_stock_level_reserved_check CHECK (reserved >= 0 AND reserved <= qty),
  CONSTRAINT core_stock_level_row_version_check CHECK (row_version >= 1)
);

-- The unique key covers lookups by store. Lookups by material need their own index.
CREATE INDEX core_stock_level_material_id_idx ON core_stock_level (material_id);
