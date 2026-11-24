-- Equipment unit media and telematics (frontend EquipmentUnit lastPing, machine photo and wizard file tiles).
-- The bytes stay in core_file / core_file_content (POST /files, PUT /files/:id/content, owner type equipment_unit);
-- the unit keeps links only. photo_file_id is the machine photo. documents maps a fixed document key to a core_file
-- id; the API checks every id exists. lat and lng already exist (0022). last_ping_at is the last telematics ping.

ALTER TABLE core_equipment_unit
  ADD COLUMN last_ping_at timestamptz,
  ADD COLUMN photo_file_id uuid REFERENCES core_file (id),
  ADD COLUMN documents jsonb;

-- documents is a JSON object whose keys are the wizard's file tiles and whose values are strings (file ids).
ALTER TABLE core_equipment_unit
  ADD CONSTRAINT core_equipment_unit_documents_check
    CHECK (
      documents IS NULL
      OR (
        jsonb_typeof(documents) = 'object'
        AND (documents - ARRAY['chasisPhoto', 'enginePhoto', 'meterPhoto', 'invoiceDoc', 'insuranceDoc', 'pucDoc'])
          = '{}'::jsonb
      )
    );

CREATE INDEX core_equipment_unit_photo_file_id_idx ON core_equipment_unit (photo_file_id);
