-- Project chainage range in kilometres (numeric(12,3), as for locations in 0010). Start and end are set together, both
-- are zero or more, and the start is on or before the end. Chainage markers outside the range are allowed: the range
-- is the project's stated extent, and markers are not checked against it.

ALTER TABLE core_project
  ADD COLUMN chainage_start_km numeric(12,3),
  ADD COLUMN chainage_end_km numeric(12,3);

ALTER TABLE core_project
  ADD CONSTRAINT core_project_chainage_pair_check
    CHECK ((chainage_start_km IS NULL) = (chainage_end_km IS NULL)),
  ADD CONSTRAINT core_project_chainage_order_check
    CHECK (chainage_start_km IS NULL OR (chainage_start_km >= 0 AND chainage_start_km <= chainage_end_km));
