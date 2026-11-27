-- Equipment units and offline operations no longer link to a location. A unit's location is kept as its current
-- location text, when that text is empty, so no information is lost.

UPDATE core_equipment_unit u
  SET current_location = COALESCE(NULLIF(u.current_location, ''), l.name)
  FROM core_location l
  WHERE l.id = u.location_id;

ALTER TABLE core_equipment_unit
  DROP COLUMN IF EXISTS location_id;

ALTER TABLE integ_offline_operation
  DROP COLUMN IF EXISTS location_id;
