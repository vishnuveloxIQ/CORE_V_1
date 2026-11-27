-- Whether a hired unit is still on hire: Active or Inactive. Set Active when the unit is registered, and changed afterwards.
ALTER TABLE core_equipment_unit ADD COLUMN hire_status text CHECK (hire_status IN ('Active', 'Inactive'));

-- Hired units already registered: Inactive once the agreement has ended, otherwise Active.
UPDATE core_equipment_unit
   SET hire_status = CASE WHEN agreement_end IS NOT NULL AND agreement_end < CURRENT_DATE THEN 'Inactive' ELSE 'Active' END
 WHERE ownership_type = 'Hired';
