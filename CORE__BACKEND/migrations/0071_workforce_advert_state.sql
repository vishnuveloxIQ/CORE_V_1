-- Workforce adverts (decision 2026-11-26): the advert names a state instead of a location, and a worker line no longer
-- carries a quantity or a skill level. Existing sample rows keep their other data.

ALTER TABLE core_workforce_advert RENAME COLUMN location TO state;
ALTER TABLE core_workforce_advert_requirement DROP COLUMN quantity;
ALTER TABLE core_workforce_advert_requirement DROP COLUMN skill_level;
