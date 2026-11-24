-- Provisional (Phase 4a, proposed 2026-11-19): a login id identifies one user per tenant.
-- citext makes the comparison case-insensitive. NULL login ids are allowed (several users may have none yet).
ALTER TABLE core_user
  ADD CONSTRAINT core_user_login_id_unique UNIQUE (login_id);
