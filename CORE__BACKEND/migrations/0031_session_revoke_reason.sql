-- Why a device session ended: 'user' (signed out, or revoked from the device list) or 'rotated' (replaced by a
-- refresh). A refresh with a token from a session the user ended is refused; one from a rotated session is reuse,
-- which ends every session. Sessions ended before this migration have no reason and are only refused.
ALTER TABLE core_user_session
  ADD COLUMN revoked_reason text;
