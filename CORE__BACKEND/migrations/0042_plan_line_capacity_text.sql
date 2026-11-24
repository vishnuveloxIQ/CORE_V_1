-- Equipment plan lines: the capacity is a description chosen by type (for example "30-ton (300)" or "10-wheel"), not a number
-- with a unit. Migration 0041 added a numeric capacity and a unit; this reshapes them. The unit is dropped.
ALTER TABLE core_plan_line
  DROP CONSTRAINT core_plan_line_capacity_check,
  DROP CONSTRAINT core_plan_line_capacity_unit_check,
  DROP COLUMN capacity_unit,
  ALTER COLUMN capacity TYPE text USING capacity::text,
  ADD CONSTRAINT core_plan_line_capacity_text_check CHECK (capacity IS NULL OR char_length(capacity) <= 100);
