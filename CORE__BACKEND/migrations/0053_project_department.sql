-- The department that owns the project (for example NHAI or PWD), or the department typed in when "Other" is chosen.
-- Optional: existing projects keep working with it empty.

ALTER TABLE core_project
  ADD COLUMN department text;
