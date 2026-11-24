-- Owner decision (2026-11-21): approval chains have 1 to 4 levels, not 1 to 20 (migration 0032).
-- No tenant held a level above 4 when this was applied.
ALTER TABLE core_matrix_level DROP CONSTRAINT core_matrix_level_no_check;
ALTER TABLE core_matrix_level
  ADD CONSTRAINT core_matrix_level_no_check CHECK (level_no BETWEEN 1 AND 4);
