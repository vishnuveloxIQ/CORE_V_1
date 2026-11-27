-- Workforce adverts (decision 2026-11-26, from Core_Workforce_Advert_AddOn): head office advertises the workers a
-- project location needs, to the registered sub-contractors of the company. Five tables:
--   core_workforce_advert              the advert: project, location, dates, status (DRAFT, PUBLISHED, CLOSED)
--   core_workforce_advert_requirement  one row per worker type needed (trade, quantity, skill level)
--   core_advert_mail                   the messages each registered sub-contractor is due (QUEUED; no mail provider yet)
--   core_contractor_interest           a sub-contractor's response to a published advert, with its status and reason
--   core_interest_step                 each discussion step recorded against an interest (remarks)
-- Standard columns follow 0001. The approval engine and the contractor platform events are not part of this step.

CREATE TABLE core_workforce_advert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  project_id uuid NOT NULL REFERENCES core_project (id),
  location text,
  description text,
  required_from date NOT NULL,
  required_to date,
  closes_at date,
  status text NOT NULL DEFAULT 'DRAFT',
  published_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_workforce_advert_title_check CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT core_workforce_advert_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
  CONSTRAINT core_workforce_advert_range_check CHECK (required_to IS NULL OR required_to >= required_from),
  CONSTRAINT core_workforce_advert_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_workforce_advert_project_id_idx ON core_workforce_advert (project_id);

CREATE TABLE core_workforce_advert_requirement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id uuid NOT NULL REFERENCES core_workforce_advert (id) ON DELETE CASCADE,
  worker_type text NOT NULL,
  trade text NOT NULL,
  quantity integer NOT NULL,
  skill_level text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_workforce_advert_requirement_quantity_check CHECK (quantity >= 1),
  CONSTRAINT core_workforce_advert_requirement_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_workforce_advert_requirement_advert_id_idx ON core_workforce_advert_requirement (advert_id);

CREATE TABLE core_advert_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id uuid NOT NULL REFERENCES core_workforce_advert (id) ON DELETE CASCADE,
  sub_contractor_id uuid NOT NULL REFERENCES core_sub_contractor (id),
  to_address text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_advert_mail_status_check CHECK (status IN ('QUEUED')),
  CONSTRAINT core_advert_mail_row_version_check CHECK (row_version >= 1),
  CONSTRAINT core_advert_mail_once UNIQUE (advert_id, sub_contractor_id)
);

CREATE TABLE core_contractor_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id uuid NOT NULL REFERENCES core_workforce_advert (id) ON DELETE CASCADE,
  sub_contractor_id uuid NOT NULL REFERENCES core_sub_contractor (id),
  source text NOT NULL DEFAULT 'REGISTERED',
  status text NOT NULL DEFAULT 'NEW',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_contractor_interest_source_check CHECK (source IN ('REGISTERED')),
  CONSTRAINT core_contractor_interest_status_check CHECK (status IN ('NEW', 'CONTACTED', 'IN_DISCUSSION', 'AGREED', 'DECLINED', 'NOT_PURSUED')),
  CONSTRAINT core_contractor_interest_row_version_check CHECK (row_version >= 1),
  CONSTRAINT core_contractor_interest_once UNIQUE (advert_id, sub_contractor_id)
);
CREATE INDEX core_contractor_interest_sub_contractor_id_idx ON core_contractor_interest (sub_contractor_id);

CREATE TABLE core_interest_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id uuid NOT NULL REFERENCES core_contractor_interest (id) ON DELETE CASCADE,
  remarks text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_interest_step_remarks_check CHECK (char_length(remarks) BETWEEN 1 AND 1000),
  CONSTRAINT core_interest_step_row_version_check CHECK (row_version >= 1)
);
CREATE INDEX core_interest_step_interest_id_idx ON core_interest_step (interest_id);
