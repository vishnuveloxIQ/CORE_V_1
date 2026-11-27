-- Quotation approval, vendor quotation format (decision 2026-11-27): a quotation is a vendor's supply quotation (vendor,
-- buyer, goods with HSN codes, charges, tax, payment terms), not a bill of quantities. The columns are renamed to match:
--   package_name -> vendor_name, client -> buyer_name, site_address -> destination, completion -> payment_terms.
-- The project is optional. The three sample rows loaded from the first (bill of quantities) layout are removed: they
-- do not fit the new document.

ALTER TABLE core_quotation RENAME COLUMN package_name TO vendor_name;
ALTER TABLE core_quotation RENAME COLUMN client TO buyer_name;
ALTER TABLE core_quotation RENAME COLUMN site_address TO destination;
ALTER TABLE core_quotation RENAME COLUMN completion TO payment_terms;
ALTER TABLE core_quotation ALTER COLUMN project_name DROP NOT NULL;

DELETE FROM core_quotation WHERE ref LIKE 'BWC/PUN/%';
