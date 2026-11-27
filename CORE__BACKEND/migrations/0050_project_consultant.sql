-- The project's consultant, if it has one. Optional: existing projects keep working with it empty.

ALTER TABLE core_project
  ADD COLUMN consultant_name text;
