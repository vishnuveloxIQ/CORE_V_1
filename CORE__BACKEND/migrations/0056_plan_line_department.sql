-- The department a people requirement is for (the department the people work in). Optional: existing lines keep working.

ALTER TABLE core_plan_line
  ADD COLUMN department text;
