-- Policy versions can belong to one project. A version with no project is the company-wide default. Module policies
-- (holidays, shifts, leave, overtime and the equipment and material rate policies) can differ between projects.
-- Version numbers stay unique per policy; the project only decides which version applies to a project.

ALTER TABLE core_policy_version
  ADD COLUMN project_id uuid REFERENCES core_project (id) ON DELETE RESTRICT;

CREATE INDEX core_policy_version_project_id_idx ON core_policy_version (policy_id, project_id);
