-- Sub-contractor registration (decision 2026-11-26): the sub-contract details a project gives a firm before its work
-- order is prepared. One row per sub-contract, under the project it belongs to. The agreement / work order document is
-- a core_file row (PDF or Word, uploaded through /files). Standard columns follow 0001.

CREATE TABLE core_sub_contractor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core_project (id),
  site_name text,
  project_name text,
  firm_name text NOT NULL,
  owner_name text NOT NULL,
  address text,
  mail_id text,
  phone text,
  gst_number text,
  pan_number text,
  work_order_date date,
  work_contract_title text NOT NULL,
  work_contract_period text,
  scope_annexure text,
  consumables_terms text,
  shed_tent_material text,
  safety_items text,
  other_conditions text,
  agreement_file_id uuid REFERENCES core_file (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_sub_contractor_firm_name_check CHECK (char_length(firm_name) BETWEEN 1 AND 200),
  CONSTRAINT core_sub_contractor_owner_name_check CHECK (char_length(owner_name) BETWEEN 1 AND 200),
  CONSTRAINT core_sub_contractor_work_contract_title_check CHECK (char_length(work_contract_title) BETWEEN 1 AND 200),
  CONSTRAINT core_sub_contractor_row_version_check CHECK (row_version >= 1)
);

CREATE INDEX core_sub_contractor_project_id_idx ON core_sub_contractor (project_id);
