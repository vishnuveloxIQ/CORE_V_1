-- Recommendations from handoff section 8 that were signed off on 2026-11-19 ("go with your recommendations"),
-- applied to every tenant schema. Kept apart from 0003, which is already applied to the dev database.

-- 1. Unique keys
ALTER TABLE integ_idempotency_key
  ADD CONSTRAINT integ_idempotency_key_key_unique UNIQUE (key);

ALTER TABLE integ_aggregate_sequence
  ADD CONSTRAINT integ_aggregate_sequence_aggregate_unique UNIQUE (aggregate_type, aggregate_id);

-- 2. ON DELETE rules. Business tables keep NO ACTION. A passkey belongs to its user, so it is removed with the user.
ALTER TABLE core_user_passkey DROP CONSTRAINT core_user_passkey_user_id_fkey;
ALTER TABLE core_user_passkey
  ADD CONSTRAINT core_user_passkey_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES core_user (id) ON DELETE CASCADE;

-- 3. integ_event status vocabulary for each direction
ALTER TABLE integ_event
  ADD CONSTRAINT integ_event_status_check
  CHECK (
    status IS NULL
    OR (direction, status) IN (
      ('outbound', 'pending'),
      ('outbound', 'published'),
      ('outbound', 'dead_lettered'),
      ('inbound', 'received'),
      ('inbound', 'processed'),
      ('inbound', 'dead_lettered')
    )
  );

-- 4. Indexes: every foreign-key column, every text *_key or *_code lookup column, and audit_row_change.changed_at.
--    An index that already leads with the column is left alone.
DO $$
DECLARE
  r record;
  rel oid;
BEGIN
  FOR r IN
    SELECT con.conrelid AS rel, att.attnum, att.attname, cls.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND ns.nspname = current_schema() AND array_length(con.conkey, 1) = 1
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid = r.rel AND i.indkey[0] = r.attnum
    ) THEN
      EXECUTE format('CREATE INDEX %I ON %I (%I)',
        left('ix_' || r.table_name || '_' || r.attname, 63), r.table_name, r.attname);
    END IF;
  END LOOP;

  FOR r IN
    SELECT c.table_name::text AS table_name, c.column_name::text AS column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
      AND c.data_type = 'text'
      AND (c.column_name LIKE '%\_key' OR c.column_name LIKE '%\_code')
  LOOP
    rel := to_regclass(quote_ident(r.table_name));
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute att ON att.attrelid = i.indrelid AND att.attnum = i.indkey[0]
      WHERE i.indrelid = rel AND att.attname = r.column_name
    ) THEN
      EXECUTE format('CREATE INDEX %I ON %I (%I)',
        left('ix_' || r.table_name || '_' || r.column_name, 63), r.table_name, r.column_name);
    END IF;
  END LOOP;
END
$$;

CREATE INDEX ix_audit_row_change_changed_at ON audit_row_change (changed_at);
