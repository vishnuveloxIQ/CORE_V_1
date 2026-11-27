-- The legal form of the company, chosen on the company profile: a proprietorship, a partnership firm or a
-- private limited company. Nullable, so existing profiles keep working until the type is picked.

ALTER TABLE core_company_profile
  ADD COLUMN company_type text;

ALTER TABLE core_company_profile
  ADD CONSTRAINT core_company_profile_company_type_check
    CHECK (company_type IN ('proprietorship', 'partnership', 'pvt_ltd'));
