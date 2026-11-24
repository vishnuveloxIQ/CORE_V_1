-- Approval requests: clarification, approver decisions and job opening publication.
--   Status clarification_requested: an approver asked the raiser a question. The request stays at its level; the
--   raiser's respond action returns it to pending at the same level. Actions clarify and respond record both steps.
--   decision: an optional short choice the approver records with an action (a store or vendor, a local or Head Office
--   hire). Free text, at most 100 characters.
--   published_location_id and published_at: where and when an approved job opening was published. Set together.
-- The CHECK constraints from 0013 are replaced with wider lists; every existing value stays valid.

ALTER TABLE core_approval_request
  DROP CONSTRAINT core_approval_request_status_check,
  ADD CONSTRAINT core_approval_request_status_check
    CHECK (status IN ('pending', 'clarification_requested', 'approved', 'rejected', 'returned', 'cancelled'));

ALTER TABLE core_approval_action
  DROP CONSTRAINT core_approval_action_action_check,
  ADD CONSTRAINT core_approval_action_action_check
    CHECK (action IN ('approve', 'reject', 'return', 'cancel', 'clarify', 'respond'));

ALTER TABLE core_approval_action
  ADD COLUMN decision text;
ALTER TABLE core_approval_action
  ADD CONSTRAINT core_approval_action_decision_check
    CHECK (decision IS NULL OR char_length(decision) BETWEEN 1 AND 100);

ALTER TABLE core_approval_request
  ADD COLUMN published_location_id uuid REFERENCES core_location (id) ON DELETE RESTRICT,
  ADD COLUMN published_at timestamptz;
ALTER TABLE core_approval_request
  ADD CONSTRAINT core_approval_request_published_pair_check
    CHECK ((published_location_id IS NULL) = (published_at IS NULL));

-- Foreign key index: lookups from a location to the openings published there.
CREATE INDEX core_approval_request_published_location_id_idx
  ON core_approval_request (published_location_id);
