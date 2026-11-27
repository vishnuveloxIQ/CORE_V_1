-- Approval requests belong to a project and a chainage marker, not to a location. A job opening is published to its
-- project. The location link and the published location are dropped; published_at stays.

ALTER TABLE core_approval_request
  DROP COLUMN IF EXISTS published_location_id;

ALTER TABLE core_approval_request
  DROP COLUMN IF EXISTS location_id;
