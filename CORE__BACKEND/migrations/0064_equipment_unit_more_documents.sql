-- Two more document tiles on the equipment registration form: the registration document and the fitness certificate
-- document. The documents map keeps its fixed list of keys, so the check is widened to include them.

ALTER TABLE core_equipment_unit
  DROP CONSTRAINT core_equipment_unit_documents_check;

ALTER TABLE core_equipment_unit
  ADD CONSTRAINT core_equipment_unit_documents_check
    CHECK (
      documents IS NULL
      OR (
        jsonb_typeof(documents) = 'object'
        AND (documents - ARRAY['chasisPhoto', 'enginePhoto', 'meterPhoto', 'invoiceDoc', 'insuranceDoc', 'pucDoc', 'regDoc', 'fitnessDoc'])
          = '{}'::jsonb
      )
    );
