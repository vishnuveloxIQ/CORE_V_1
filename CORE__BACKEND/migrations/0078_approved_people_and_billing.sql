-- Approved people (the HRMS hand-off list), and the tenant's subscription, invoices and the plan catalogue.
-- These were sample data in the frontend. Tables start empty: rows are loaded by a dev script or entered through the API.
-- Standard columns follow 0001.

-- A person approved for a project. Status moves Approved -> With HRMS -> Onboarded.
CREATE TABLE core_approved_person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core_project (id),
  department text NOT NULL,
  name text NOT NULL,
  designation text NOT NULL,
  joining_date date NOT NULL,
  status text NOT NULL DEFAULT 'Approved',
  reason text,
  reason_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_approved_person_status_check CHECK (status IN ('Approved', 'With HRMS', 'Onboarded')),
  CONSTRAINT core_approved_person_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_approved_person_project_idx ON core_approved_person (project_id);

-- The tenant's subscription: one row. Read-only through the API (billing is managed by VeloxIQ, not by the tenant).
CREATE TABLE core_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL UNIQUE,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  billing_cycle text NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true,
  start_date date NOT NULL,
  renewal_date date NOT NULL,
  next_invoice_date date,
  base_amount numeric(14, 2) NOT NULL,
  gst_rate numeric(5, 2) NOT NULL DEFAULT 18,
  support_tier text,
  account_manager text,
  payment_method text,
  billing_email text,
  limit_users integer,
  limit_projects integer,
  limit_sites integer,
  limit_storage_gb integer,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_subscription_status_check CHECK (status IN ('Active', 'Trial', 'Expired')),
  CONSTRAINT core_subscription_amount_check CHECK (base_amount >= 0),
  CONSTRAINT core_subscription_row_version_check CHECK (row_version >= 1)
);

CREATE TABLE core_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  invoice_date date NOT NULL,
  period text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  status text NOT NULL DEFAULT 'Due',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_invoice_status_check CHECK (status IN ('Paid', 'Due')),
  CONSTRAINT core_invoice_amount_check CHECK (amount >= 0),
  CONSTRAINT core_invoice_row_version_check CHECK (row_version >= 1)
);

-- The plan catalogue for the upgrade comparison.
CREATE TABLE core_billing_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price numeric(14, 2) NOT NULL,
  users integer NOT NULL,
  projects integer NOT NULL,
  sites integer NOT NULL,
  storage_gb integer NOT NULL,
  support text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_billing_plan_price_check CHECK (price >= 0),
  CONSTRAINT core_billing_plan_row_version_check CHECK (row_version >= 1)
);
