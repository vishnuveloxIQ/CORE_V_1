-- How the project is executed: by the company itself, a hybrid of its own and sub-contracted work, or back-to-back
-- sub-contracting. Optional: existing projects keep working with it empty.

ALTER TABLE core_project
  ADD COLUMN execution_mode text;

ALTER TABLE core_project
  ADD CONSTRAINT core_project_execution_mode_check
    CHECK (execution_mode IS NULL OR execution_mode IN ('self', 'hybrid', 'back_to_back_subcontracting'));
