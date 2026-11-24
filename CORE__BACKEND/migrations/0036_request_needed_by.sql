-- The date a request is needed by (owner decision, 2026-11-22): a request that is not an emergency says when it is
-- needed. Optional in the database and the API, so requests raised before this and integration feeds keep working;
-- the CORE screen asks for it whenever the request is not an emergency.

ALTER TABLE core_approval_request ADD COLUMN needed_by date;
