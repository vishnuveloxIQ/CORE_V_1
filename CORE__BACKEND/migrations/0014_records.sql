-- Phase 5f (design defaults recorded in PROGRESS.md, Phase 5f block). Unique keys, CHECKs, NOT NULL constraints, defaults
-- and indexes only; the tables and their foreign keys are created in 0001. Closed-at timing, the draft rule for import
-- batches and the ownership of notifications are enforced in the service layer. The tables are empty, so no backfill
-- is needed. Text code columns that 0004 indexed are dropped from that index before their unique key is created.

-- Files (design point b). Metadata only; object_key is supplied by the caller and unique.
ALTER TABLE core_file
  ALTER COLUMN owner_type SET NOT NULL,
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN content_type SET NOT NULL,
  ALTER COLUMN size_bytes SET NOT NULL,
  ALTER COLUMN object_key SET NOT NULL,
  ALTER COLUMN visibility SET DEFAULT 'private',
  ALTER COLUMN visibility SET NOT NULL;
CREATE UNIQUE INDEX core_file_object_key ON core_file (object_key);
ALTER TABLE core_file
  ADD CONSTRAINT core_file_visibility_check CHECK (visibility IN ('private', 'team', 'company')),
  ADD CONSTRAINT core_file_size_check CHECK (size_bytes >= 0),
  ADD CONSTRAINT core_file_sha256_check
    CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

-- Record timeline (design point c). Append-only: the service layer offers no PATCH or DELETE.
ALTER TABLE core_record_timeline
  ALTER COLUMN entity_type SET NOT NULL,
  ALTER COLUMN entity_id SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT now(),
  ALTER COLUMN occurred_at SET NOT NULL,
  ALTER COLUMN is_internal SET DEFAULT false,
  ALTER COLUMN is_internal SET NOT NULL;
CREATE INDEX ix_core_record_timeline_entity ON core_record_timeline (entity_type, entity_id);

-- Grievances (design point d). Code is unique and caller-supplied.
ALTER TABLE core_grievance
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN subject SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'open',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN raised_at SET DEFAULT now(),
  ALTER COLUMN raised_at SET NOT NULL;
DROP INDEX IF EXISTS ix_core_grievance_code;
CREATE UNIQUE INDEX core_grievance_code_key ON core_grievance (code);
ALTER TABLE core_grievance
  ADD CONSTRAINT core_grievance_status_check
    CHECK (status IN ('open', 'in_review', 'resolved', 'closed'));

-- Notifications (design point e). delivery_status is recorded only; nothing is sent in 5f.
ALTER TABLE core_notification
  ALTER COLUMN recipient_user_id SET NOT NULL,
  ALTER COLUMN notification_type SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN delivery_status SET DEFAULT 'pending',
  ALTER COLUMN delivery_status SET NOT NULL;
ALTER TABLE core_notification
  ADD CONSTRAINT core_notification_delivery_check
    CHECK (delivery_status IN ('pending', 'sent', 'failed'));

-- Tickets (design point f). Code is unique and caller-supplied.
ALTER TABLE core_ticket
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN subject SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN priority SET DEFAULT 'medium',
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'open',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN raised_by_user_id SET NOT NULL;
DROP INDEX IF EXISTS ix_core_ticket_code;
CREATE UNIQUE INDEX core_ticket_code_key ON core_ticket (code);
ALTER TABLE core_ticket
  ADD CONSTRAINT core_ticket_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD CONSTRAINT core_ticket_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));

-- Import batches (design point g). Batch code is unique; a batch is a draft until it is submitted.
ALTER TABLE core_import_batch
  ALTER COLUMN batch_code SET NOT NULL,
  ALTER COLUMN import_type SET NOT NULL,
  ALTER COLUMN template_version SET NOT NULL,
  ALTER COLUMN uploaded_by SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN total_rows SET DEFAULT 0,
  ALTER COLUMN total_rows SET NOT NULL,
  ALTER COLUMN valid_rows SET DEFAULT 0,
  ALTER COLUMN valid_rows SET NOT NULL,
  ALTER COLUMN error_rows SET DEFAULT 0,
  ALTER COLUMN error_rows SET NOT NULL;
DROP INDEX IF EXISTS ix_core_import_batch_batch_code;
CREATE UNIQUE INDEX core_import_batch_code_key ON core_import_batch (batch_code);
ALTER TABLE core_import_batch
  ADD CONSTRAINT core_import_batch_status_check
    CHECK (status IN ('draft', 'submitted', 'processed', 'rejected')),
  ADD CONSTRAINT core_import_batch_counts_check
    CHECK (total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0);

-- Import rows (design point g). One row per batch and row number.
ALTER TABLE core_import_row
  ALTER COLUMN batch_id SET NOT NULL,
  ALTER COLUMN row_number SET NOT NULL,
  ALTER COLUMN raw_values SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;
CREATE UNIQUE INDEX core_import_row_batch_row_key ON core_import_row (batch_id, row_number);
ALTER TABLE core_import_row
  ADD CONSTRAINT core_import_row_number_check CHECK (row_number >= 1),
  ADD CONSTRAINT core_import_row_status_check
    CHECK (status IN ('pending', 'valid', 'error', 'created')),
  ADD CONSTRAINT core_import_row_raw_check CHECK (jsonb_typeof(raw_values) = 'object');

-- Usage counters (design point h). One counter per metric, scope and week.
ALTER TABLE core_usage_counter
  ALTER COLUMN metric SET NOT NULL,
  ALTER COLUMN scope_key SET NOT NULL,
  ALTER COLUMN week_start SET NOT NULL,
  ALTER COLUMN counter_value SET DEFAULT 0,
  ALTER COLUMN counter_value SET NOT NULL;
CREATE UNIQUE INDEX core_usage_counter_metric_scope_week_key
  ON core_usage_counter (metric, scope_key, week_start);
ALTER TABLE core_usage_counter
  ADD CONSTRAINT core_usage_counter_value_check CHECK (counter_value >= 0);
