-- The state the project is working in. Optional: existing projects keep working with it empty.

ALTER TABLE core_project
  ADD COLUMN state text;
