-- Grievance visit status: where the site visit stands (frontend Requested, Confirmed, Rescheduled, Visited,
-- Not visited). Separate from status (open, in_review, resolved, closed), which is unchanged. Optional.

ALTER TABLE core_grievance
  ADD COLUMN visit_status text;

ALTER TABLE core_grievance
  ADD CONSTRAINT core_grievance_visit_status_check
    CHECK (visit_status IS NULL OR visit_status IN ('requested', 'confirmed', 'rescheduled', 'visited', 'not_visited'));
