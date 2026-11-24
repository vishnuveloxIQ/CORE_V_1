import type { PoolClient } from 'pg';

/** The columns login needs from core_user. Hashes stay inside the service and are never returned. */
export interface UserForLogin {
  id: string;
  login_id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  password_hash: string | null;
  failed_count: number | null;
  locked_until: Date | null;
  must_change_password: boolean | null;
}

export interface PublicUser {
  id: string;
  loginId: string;
  name: string | null;
  email: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  device_label: string | null;
  device_info: unknown;
  revoked_at: Date | null;
  /** Why the session ended: 'user' (signed out or revoked from the device list) or 'rotated' (replaced by a refresh). */
  revoked_reason?: string | null;
  expires_at: Date | null;
  status: string | null;
  /** Read by the access-token guard only: true while the user must change a temporary password. */
  must_change_password?: boolean | null;
}

export interface NewSession {
  userId: string;
  deviceLabel: string | null;
  deviceInfo: Record<string, unknown> | null;
  refreshHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

export type AuthEventType =
  | 'login_success'
  | 'login_failure'
  | 'login_locked'
  | 'refresh'
  | 'refresh_reuse'
  | 'logout'
  | 'otp_issued'
  | 'otp_verified'
  | 'otp_failed'
  | 'password_reset'
  | 'password_admin_reset'
  | 'password_changed'
  | 'password_change_failure'
  | 'passkey_challenge'
  | 'passkey_login_success'
  | 'passkey_login_failure'
  | 'passkey_registered'
  | 'passkey_removed'
  | 'session_revoked'
  | 'step_up_success'
  | 'step_up_failure'
  /** a privilege check refused the request (403); purpose holds the method and route pattern */
  | 'access_denied'
  /** the oldest session was signed out because the user went over the configured device limit */
  | 'session_limit_revoked';

/** A stored passkey. The public key is the base64url COSE key; sign_count arrives from pg as a string. */
export interface PasskeyRow {
  id: string;
  credential_key: string;
  public_key: string;
  sign_count: string;
  label: string | null;
  created_at: Date;
}

/** An open WebAuthn challenge: issued for this user and purpose, not used, not expired. */
export interface OpenChallenge {
  id: string;
  challenge: string;
}

/** The columns a password reset needs. Read without a row lock. */
export interface UserForReset {
  id: string;
  login_id: string;
  email: string | null;
  phone: string | null;
  status: string | null;
}

/** An open one-time code: issued, not used or closed, not expired. */
export interface OpenOtp {
  id: string;
  secret_hash: string;
  attempts: number;
}

/** Locks the row so two logins for the same user run one after the other. */
export async function findUserForLogin(
  client: PoolClient,
  loginId: string,
): Promise<UserForLogin | null> {
  const { rows } = await client.query<UserForLogin>(
    `SELECT id, login_id::text AS login_id, name, email::text AS email, status,
            password_hash, failed_count, locked_until, must_change_password
     FROM core_user WHERE login_id = $1 FOR UPDATE`,
    [loginId],
  );
  return rows[0] ?? null;
}

export async function findPublicUser(
  client: PoolClient,
  userId: string,
): Promise<{ user: PublicUser; status: string | null } | null> {
  const { rows } = await client.query<{
    id: string;
    login_id: string;
    name: string | null;
    email: string | null;
    status: string | null;
  }>(
    `SELECT id, login_id::text AS login_id, name, email::text AS email, status
     FROM core_user WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user: { id: row.id, loginId: row.login_id, name: row.name, email: row.email },
    status: row.status,
  };
}

export async function setFailedLogin(
  client: PoolClient,
  userId: string,
  failedCount: number,
  lockedUntil: Date | null,
): Promise<void> {
  await client.query(
    `UPDATE core_user
     SET failed_count = $2, locked_until = $3, updated_at = now(), row_version = row_version + 1
     WHERE id = $1`,
    [userId, failedCount, lockedUntil],
  );
}

export async function setSuccessfulLogin(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE core_user
     SET failed_count = 0, locked_until = NULL, last_login_at = now(),
         updated_at = now(), row_version = row_version + 1
     WHERE id = $1`,
    [userId],
  );
}

export async function insertSession(client: PoolClient, session: NewSession): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO core_user_session (user_id, device_label, device_info, refresh_hash, issued_at, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id`,
    [
      session.userId,
      session.deviceLabel,
      session.deviceInfo === null ? null : JSON.stringify(session.deviceInfo),
      session.refreshHash,
      session.issuedAt,
      session.expiresAt,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into core_user_session returned no row');
  return id;
}

/**
 * Signs out the user's oldest live sessions beyond `limit` (newest kept), with reason device_limit. A refresh with
 * one of their tokens is then refused like any signed-out session, without ending the others. Returns how many ended.
 */
export async function revokeSessionsOverLimit(client: PoolClient, userId: string, limit: number): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE core_user_session
     SET revoked_at = now(), revoked_reason = 'device_limit', updated_at = now(), row_version = row_version + 1
     WHERE id IN (
       SELECT id FROM core_user_session
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY issued_at DESC, id DESC
       OFFSET $2
     )`,
    [userId, limit],
  );
  return rowCount ?? 0;
}

/** Locks the session row so two refreshes with the same token cannot both succeed. */
export async function findSessionByRefreshHash(
  client: PoolClient,
  refreshHash: string,
): Promise<SessionRow | null> {
  const { rows } = await client.query<SessionRow>(
    `SELECT s.id, s.user_id, s.device_label, s.device_info, s.revoked_at, s.revoked_reason, s.expires_at,
            u.status
     FROM core_user_session s
     JOIN core_user u ON u.id = s.user_id
     WHERE s.refresh_hash = $1
     FOR UPDATE OF s`,
    [refreshHash],
  );
  return rows[0] ?? null;
}

/** The session behind an access token: its revocation, expiry and the user's status. */
export async function findSessionForToken(
  client: PoolClient,
  sessionId: string,
  userId: string,
): Promise<SessionRow | null> {
  const { rows } = await client.query<SessionRow>(
    `SELECT s.id, s.user_id, s.device_label, s.device_info, s.revoked_at, s.expires_at,
            u.status, u.must_change_password
     FROM core_user_session s
     JOIN core_user u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );
  return rows[0] ?? null;
}

export async function revokeSession(
  client: PoolClient,
  sessionId: string,
  userId: string,
  reason: 'user' | 'rotated' = 'user',
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE core_user_session
     SET revoked_at = now(), revoked_reason = $3, updated_at = now(), row_version = row_version + 1
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId, reason],
  );
  return rowCount === 1;
}

/** Revokes every open session of the user except the one named, so the caller stays signed in. */
export async function revokeOtherSessions(
  client: PoolClient,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await client.query(
    `UPDATE core_user_session
     SET revoked_at = now(), updated_at = now(), row_version = row_version + 1
     WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
    [userId, keepSessionId],
  );
}

/** The columns a password change needs. Locks the row so two changes run one after the other. */
export async function findUserForPasswordChange(
  client: PoolClient,
  userId: string,
): Promise<{
  id: string;
  login_id: string;
  status: string | null;
  password_hash: string | null;
} | null> {
  const { rows } = await client.query<{
    id: string;
    login_id: string;
    status: string | null;
    password_hash: string | null;
  }>(
    `SELECT id, login_id::text AS login_id, status, password_hash
     FROM core_user WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Sets a server-generated temporary password: the user must change it at the next sign-in. Failures and locks are
 * cleared. The caller revokes the sessions.
 */
export async function setTemporaryPassword(
  client: PoolClient,
  userId: string,
  passwordHash: string,
  actorId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE core_user
     SET password_hash = $2, password_set_at = now(), must_change_password = true,
         failed_count = 0, locked_until = NULL,
         updated_at = now(), updated_by = $3, row_version = row_version + 1
     WHERE id = $1`,
    [userId, passwordHash, actorId],
  );
}

export async function revokeAllSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE core_user_session
     SET revoked_at = now(), updated_at = now(), row_version = row_version + 1
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/**
 * Writes one authentication event. The raw IP is not stored (ip_address stays NULL) until the owner
 * sets the retention period.
 */
export async function recordAuthEvent(
  client: PoolClient,
  userId: string | null,
  eventType: AuthEventType,
  purpose: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO core_auth_activity (user_id, event_type, purpose, occurred_at)
     VALUES ($1, $2, $3, now())`,
    [userId, eventType, purpose],
  );
}

export async function findUserForReset(
  client: PoolClient,
  loginId: string,
): Promise<UserForReset | null> {
  const { rows } = await client.query<UserForReset>(
    `SELECT id, login_id::text AS login_id, email::text AS email, phone, status
     FROM core_user WHERE login_id = $1`,
    [loginId],
  );
  return rows[0] ?? null;
}

/** Closes every open code for the user and purpose, so only the newest one can be used. */
export async function closeOpenOtps(
  client: PoolClient,
  userId: string,
  purpose: string,
  closedAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE core_auth_activity SET used_at = $3
     WHERE user_id = $1 AND purpose = $2 AND event_type = 'otp_issued' AND used_at IS NULL`,
    [userId, purpose, closedAt],
  );
}

export async function insertOtp(
  client: PoolClient,
  input: { userId: string; purpose: string; secretHash: string; issuedAt: Date; expiresAt: Date },
): Promise<void> {
  await client.query(
    `INSERT INTO core_auth_activity
       (user_id, event_type, purpose, secret_hash, expires_at, attempts, occurred_at)
     VALUES ($1, 'otp_issued', $2, $3, $4, 0, $5)`,
    [input.userId, input.purpose, input.secretHash, input.expiresAt, input.issuedAt],
  );
}

/** Locks the newest open code so two confirmations cannot both try attempts at once. */
export async function findOpenOtp(
  client: PoolClient,
  userId: string,
  purpose: string,
  now: Date,
): Promise<OpenOtp | null> {
  const { rows } = await client.query<OpenOtp>(
    `SELECT id, secret_hash, attempts
     FROM core_auth_activity
     WHERE user_id = $1 AND purpose = $2 AND event_type = 'otp_issued'
       AND used_at IS NULL AND expires_at > $3
     ORDER BY occurred_at DESC
     LIMIT 1
     FOR UPDATE`,
    [userId, purpose, now],
  );
  return rows[0] ?? null;
}

/** Stores the attempt count. `closedAt` is set when the code is used up or burned. */
export async function recordOtpAttempt(
  client: PoolClient,
  otpId: string,
  attempts: number,
  closedAt: Date | null,
): Promise<void> {
  await client.query(
    `UPDATE core_auth_activity
     SET attempts = $2, used_at = COALESCE($3, used_at)
     WHERE id = $1`,
    [otpId, attempts, closedAt],
  );
}

/** Sets the new password and clears any failure count or lock. The caller revokes sessions. */
export async function setNewPassword(
  client: PoolClient,
  userId: string,
  passwordHash: string,
  at: Date,
): Promise<void> {
  await client.query(
    `UPDATE core_user
     SET password_hash = $2, password_set_at = $3, must_change_password = false,
         failed_count = 0, locked_until = NULL,
         updated_at = now(), row_version = row_version + 1
     WHERE id = $1`,
    [userId, passwordHash, at],
  );
}

/** Closes every open challenge for the user and purpose, so only the newest can be answered. */
export async function closeOpenChallenges(
  client: PoolClient,
  userId: string,
  purpose: string,
  closedAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE core_auth_activity SET used_at = $3
     WHERE user_id = $1 AND purpose = $2 AND event_type = 'passkey_challenge' AND used_at IS NULL`,
    [userId, purpose, closedAt],
  );
}

export async function insertChallenge(
  client: PoolClient,
  input: {
    userId: string;
    purpose: 'register' | 'login' | 'step_up';
    challenge: string;
    issuedAt: Date;
    expiresAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO core_auth_activity
       (user_id, event_type, purpose, challenge, expires_at, occurred_at)
     VALUES ($1, 'passkey_challenge', $2, $3, $4, $5)`,
    [input.userId, input.purpose, input.challenge, input.expiresAt, input.issuedAt],
  );
}

/** Locks the newest open challenge so one answer cannot race another. */
export async function findOpenChallenge(
  client: PoolClient,
  userId: string,
  purpose: string,
  now: Date,
): Promise<OpenChallenge | null> {
  const { rows } = await client.query<OpenChallenge>(
    `SELECT id, challenge
     FROM core_auth_activity
     WHERE user_id = $1 AND purpose = $2 AND event_type = 'passkey_challenge'
       AND used_at IS NULL AND expires_at > $3
     ORDER BY occurred_at DESC
     LIMIT 1
     FOR UPDATE`,
    [userId, purpose, now],
  );
  return rows[0] ?? null;
}

export async function markChallengeUsed(
  client: PoolClient,
  challengeId: string,
  usedAt: Date,
): Promise<void> {
  await client.query(`UPDATE core_auth_activity SET used_at = $2 WHERE id = $1`, [
    challengeId,
    usedAt,
  ]);
}

export async function listPasskeys(client: PoolClient, userId: string): Promise<PasskeyRow[]> {
  const { rows } = await client.query<PasskeyRow>(
    `SELECT id, credential_key, public_key, sign_count::text AS sign_count, label, created_at
     FROM core_user_passkey WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return rows;
}

/** Locks the passkey row so two sign-ins with the same credential cannot both pass the counter check. */
export async function findPasskeyByCredential(
  client: PoolClient,
  userId: string,
  credentialKey: string,
): Promise<PasskeyRow | null> {
  const { rows } = await client.query<PasskeyRow>(
    `SELECT id, credential_key, public_key, sign_count::text AS sign_count, label, created_at
     FROM core_user_passkey WHERE user_id = $1 AND credential_key = $2 FOR UPDATE`,
    [userId, credentialKey],
  );
  return rows[0] ?? null;
}

export async function insertPasskey(
  client: PoolClient,
  input: {
    userId: string;
    credentialKey: string;
    publicKey: string;
    signCount: number;
    label: string | null;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO core_user_passkey
       (user_id, credential_key, public_key, sign_count, label, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $1, $1)
     RETURNING id`,
    [input.userId, input.credentialKey, input.publicKey, input.signCount, input.label],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into core_user_passkey returned no row');
  return id;
}

export async function updatePasskeySignCount(
  client: PoolClient,
  passkeyId: string,
  signCount: number,
): Promise<void> {
  await client.query(
    `UPDATE core_user_passkey
     SET sign_count = $2, updated_at = now(), row_version = row_version + 1
     WHERE id = $1`,
    [passkeyId, signCount],
  );
}

/** Removes one passkey of the user. Returns false when the passkey is not the user's. */
export async function deletePasskey(
  client: PoolClient,
  userId: string,
  passkeyId: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM core_user_passkey WHERE id = $1 AND user_id = $2`,
    [passkeyId, userId],
  );
  return rowCount === 1;
}

export async function userHasPassword(client: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await client.query<{ has_password: boolean }>(
    `SELECT password_hash IS NOT NULL AS has_password FROM core_user WHERE id = $1`,
    [userId],
  );
  return rows[0]?.has_password ?? false;
}
