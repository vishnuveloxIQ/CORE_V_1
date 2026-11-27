-- How the project was awarded: directly, to a nominated sub-contractor, as a sub-contract, or on a risk and cost basis.
-- Optional: existing projects keep working with it empty.

ALTER TABLE core_project
  ADD COLUMN project_type text;

ALTER TABLE core_project
  ADD CONSTRAINT core_project_project_type_check
    CHECK (project_type IS NULL OR project_type IN ('direct', 'nominated_sub_contractor', 'sub_contractor', 'risk_and_cost_basis'));
