-- Offer letter revisions: one row per uploaded offer letter, kept so older versions can be viewed. Nothing is deleted:
-- the file row is protected by ON DELETE RESTRICT, and the service layer offers no DELETE. revision is 1 for the first
-- letter and counts up by one per upload (assigned in the service under an advisory lock). Standard columns follow 0001.
-- created_by is the uploader. content lives in core_file_content (0015) and is read through the file id.

CREATE TABLE core_offer_letter_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision integer NOT NULL,
  file_id uuid NOT NULL REFERENCES core_file (id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_offer_letter_revision_revision_key UNIQUE (revision),
  CONSTRAINT core_offer_letter_revision_revision_check CHECK (revision >= 1),
  CONSTRAINT core_offer_letter_revision_file_name_check
    CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT core_offer_letter_revision_mime_type_check
    CHECK (char_length(mime_type) BETWEEN 1 AND 127),
  CONSTRAINT core_offer_letter_revision_size_check CHECK (size_bytes >= 0),
  CONSTRAINT core_offer_letter_revision_row_version_check CHECK (row_version >= 1)
);

-- Foreign key index: lookups from a file to its revision.
CREATE INDEX core_offer_letter_revision_file_id_idx ON core_offer_letter_revision (file_id);
