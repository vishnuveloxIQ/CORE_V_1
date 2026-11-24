-- Phase 4c (design defaults recorded in PROGRESS.md, Phase 4c block).
-- WebAuthn verification needs the raw challenge, so it is stored here, not as a hash.
ALTER TABLE core_auth_activity ADD COLUMN challenge text;

-- One registration per credential ID in a tenant. A credential cannot belong to two users.
ALTER TABLE core_user_passkey
  ADD CONSTRAINT core_user_passkey_credential_key_unique UNIQUE (credential_key);
