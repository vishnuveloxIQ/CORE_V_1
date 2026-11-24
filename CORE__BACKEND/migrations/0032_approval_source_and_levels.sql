-- CORE-21-05 and CORE-21-07.
-- One approval request per source record: a module raises a request for its own record (source_record_id), and a
-- second raise for the same module and record returns the first request instead of creating another. Requests raised
-- without a source record are not limited.
CREATE UNIQUE INDEX core_approval_request_source_key
  ON core_approval_request (module, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- Approval chains have levels 1 to 20.
ALTER TABLE core_matrix_level DROP CONSTRAINT core_matrix_level_no_check;
ALTER TABLE core_matrix_level
  ADD CONSTRAINT core_matrix_level_no_check CHECK (level_no BETWEEN 1 AND 20);
