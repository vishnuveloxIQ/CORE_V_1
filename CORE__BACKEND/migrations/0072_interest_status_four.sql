-- Contractor interest statuses (decision 2026-11-26): Contacted, In discussion, Agreed and Declined only.
-- New becomes Contacted (a response has been received), and Not pursued becomes Declined.

ALTER TABLE core_contractor_interest DROP CONSTRAINT core_contractor_interest_status_check;
UPDATE core_contractor_interest SET status = 'CONTACTED' WHERE status = 'NEW';
UPDATE core_contractor_interest SET status = 'DECLINED' WHERE status = 'NOT_PURSUED';
ALTER TABLE core_contractor_interest ADD CONSTRAINT core_contractor_interest_status_check
  CHECK (status IN ('CONTACTED', 'IN_DISCUSSION', 'AGREED', 'DECLINED'));
ALTER TABLE core_contractor_interest ALTER COLUMN status SET DEFAULT 'CONTACTED';
