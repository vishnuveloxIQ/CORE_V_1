-- Read models (CORE-24-05): Core's copy of records owned by other modules (HRMS, PM, PMS, Stores), built from their
-- inbound events. The module payload formats are an open owner decision (D15), so the copy is generic: one row per
-- source record, holding the fields the module sent. source_seq is the aggregate_seq of the event the row came from;
-- an older or repeated event never overwrites a newer one. synced_at is when Core applied it. Source modules never
-- write these tables directly: rows change only through the inbox.

CREATE TABLE ref_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  entity_type text NOT NULL,
  source_id uuid NOT NULL,
  source_seq bigint NOT NULL,
  event_id uuid NOT NULL,
  data jsonb NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT ref_record_source_module_check CHECK (source_module IN ('hrms', 'pm', 'pms', 'stores')),
  CONSTRAINT ref_record_entity_type_check CHECK (entity_type ~ '^[a-z_]{1,60}$'),
  CONSTRAINT ref_record_source_seq_check CHECK (source_seq >= 1),
  CONSTRAINT ref_record_row_version_check CHECK (row_version >= 1)
);

-- One copy per source record.
CREATE UNIQUE INDEX ref_record_source_key ON ref_record (source_module, entity_type, source_id);

-- The read-model screen lists one module and entity at a time, most recently synced first.
CREATE INDEX ref_record_sync_idx ON ref_record (source_module, entity_type, synced_at DESC);
