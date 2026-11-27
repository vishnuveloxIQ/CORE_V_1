-- Sub-contractor status (decision 2026-11-26): active or inactive. Existing registrations are active.

ALTER TABLE core_sub_contractor ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE core_sub_contractor ADD CONSTRAINT core_sub_contractor_status_check CHECK (status IN ('active', 'inactive'));
