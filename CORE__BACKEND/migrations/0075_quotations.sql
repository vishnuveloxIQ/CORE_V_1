-- Quotation approval (decision 2026-11-27): a vendor quotation for a job waits for the administrator to decide.
-- One row per quotation. The list fields are columns; the full quotation as submitted (bill of quantities, cost summary,
-- timeline, payment terms, warranty, scope, exclusions and terms) is kept as one JSON document. The administrator
-- approves it, or rejects it with a reason. Standard columns follow 0001.

CREATE TABLE core_quotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  package_name text NOT NULL,
  client text NOT NULL,
  project_name text NOT NULL,
  site_address text,
  quotation_date date NOT NULL,
  valid_until date,
  completion text,
  amount numeric(14, 2) NOT NULL,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_quotation_ref_check CHECK (char_length(ref) BETWEEN 1 AND 100),
  CONSTRAINT core_quotation_amount_check CHECK (amount >= 0),
  CONSTRAINT core_quotation_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT core_quotation_range_check CHECK (valid_until IS NULL OR valid_until >= quotation_date),
  CONSTRAINT core_quotation_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_quotation_status_idx ON core_quotation (status);
