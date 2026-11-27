-- Project status gets the set the project form offers: Planning, Active, On hold and Completed.
-- Completed used to be stored as inactive. Those rows become completed, so they still read back as Completed.

ALTER TABLE core_project
  DROP CONSTRAINT core_project_status_check;

UPDATE core_project
  SET status = 'completed'
  WHERE status = 'inactive';

ALTER TABLE core_project
  ADD CONSTRAINT core_project_status_check
    CHECK (status IS NULL OR status IN ('planning', 'active', 'on_hold', 'completed'));
