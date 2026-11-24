-- Phase 5f follow-up: file content storage. The bytes of a core_file row live here, in PostgreSQL bytea, so they
-- travel with the tenant schema and its backups. The metadata stays in core_file (migration 0001 and 0014).
-- One content row per file: a replacement overwrites it. Deleting the file deletes its content (ON DELETE CASCADE).
-- The size limit (2 MB) and the allowed content types are enforced in the service layer before the write; the CHECK
-- below is a last guard on the stored size and checksum shape.

CREATE TABLE core_file_content (
  file_id uuid PRIMARY KEY REFERENCES core_file (id) ON DELETE CASCADE,
  content bytea NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT core_file_content_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT core_file_content_size_check CHECK (octet_length(content) BETWEEN 1 AND 2097152)
);
