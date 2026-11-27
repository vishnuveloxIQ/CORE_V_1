-- Contractor interest from a contractor who is not in the sub-contractor registration (decision 2026-11-26): head office
-- records a contractor who got in touch directly. Such an interest keeps the contact details it was recorded with.
-- A registered sub-contractor still uses sub_contractor_id; an unregistered one leaves it empty and fills firm_name.

ALTER TABLE core_contractor_interest ALTER COLUMN sub_contractor_id DROP NOT NULL;
ALTER TABLE core_contractor_interest ADD COLUMN firm_name text;
ALTER TABLE core_contractor_interest ADD COLUMN contact_name text;
ALTER TABLE core_contractor_interest ADD COLUMN mail_id text;
ALTER TABLE core_contractor_interest ADD COLUMN phone text;
ALTER TABLE core_contractor_interest ADD CONSTRAINT core_contractor_interest_firm_check
  CHECK (sub_contractor_id IS NOT NULL OR firm_name IS NOT NULL);
