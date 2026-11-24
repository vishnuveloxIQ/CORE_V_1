-- Bill of Quantities (decision D6, 2026-11-21): the priced work items of a project. One row per item, identified by
-- its item code (unique within the project, case-insensitive). The unit is a shared.uom row; the WBS node is optional
-- and must belong to the same project (checked by the API). The amount is stored, always quantity x rate rounded to
-- the paisa, so it can never disagree with the two figures it comes from. Standard columns follow 0001.

CREATE TABLE core_boq_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core_project (id),
  item_code citext NOT NULL,
  description text NOT NULL,
  wbs_node_id uuid REFERENCES core_wbs_node (id),
  uom_id uuid NOT NULL REFERENCES shared.uom (id),
  quantity numeric(14,3) NOT NULL,
  rate numeric(14,2) NOT NULL,
  amount numeric(18,2) GENERATED ALWAYS AS (round(quantity * rate, 2)) STORED,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_boq_item_item_code_check
    CHECK (char_length(item_code::text) BETWEEN 1 AND 40 AND item_code::text = btrim(item_code::text)),
  CONSTRAINT core_boq_item_description_check CHECK (char_length(description) BETWEEN 1 AND 500),
  CONSTRAINT core_boq_item_quantity_check CHECK (quantity >= 0),
  CONSTRAINT core_boq_item_rate_check CHECK (rate >= 0),
  CONSTRAINT core_boq_item_status_check CHECK (status IN ('draft', 'approved')),
  CONSTRAINT core_boq_item_row_version_check CHECK (row_version >= 1)
);

-- Item codes are unique within a project (citext compares without regard to case).
CREATE UNIQUE INDEX core_boq_item_project_item_code_key ON core_boq_item (project_id, item_code);

-- Foreign key indexes. The project is the usual list filter, and the unique index above serves it.
CREATE INDEX core_boq_item_wbs_node_id_idx ON core_boq_item (wbs_node_id);
CREATE INDEX core_boq_item_uom_id_idx ON core_boq_item (uom_id);
