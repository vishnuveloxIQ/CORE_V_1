-- Grievance note: a free-text note kept with the grievance (for example why a visit was moved). Optional, trimmed by
-- the API, at most 2000 characters.

ALTER TABLE core_grievance
  ADD COLUMN note text;

ALTER TABLE core_grievance
  ADD CONSTRAINT core_grievance_note_check
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000);
