import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import {
  assertPasswordPolicy,
  dummySecretHash,
  hashSecret,
  verifySecret,
} from '../../core/password.js';
import { tenantExists, withTenant } from '../../db/tenant.js';
import * as repo from './repo.js';
import type { PublicUser } from './repo.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  newRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from './tokens.js';

/** Failed password attempts before the account is locked (Phase 4a design default). */
export const MAX_FAILED_LOGINS = 5;
/** How long a locked account stays locked (Phase 4a design default). */
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface AuthDeps {
  pool: Pool;
  signingKey: Uint8Array;
  /** Most devices per user (SESSION_DEVICE_LIMIT). Unset means no limit. */
  deviceLimit?: number | undefined;
}

export interface TokenPair {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
  /** ISO 8601 instant when the refresh token and its session end. */
  refreshTokenExpiresAt: string;
}

export interface LoginResult extends TokenPair {
  user: PublicUser;
  /**
   * True when the password is a temporary one set by an administrator. Until the user changes it with
   * POST /auth/change-password, the token opens only the routes that change the password, read the user, or sign out.
   */
  mustChangePassword: boolean;
}

export interface LoginInput {
  tenantId: string;
  loginId: string;
  password: string;
  deviceLabel?: string | undefined;
  userAgent?: string | undefined;
}

function invalidCredentials(): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 401, 'Login id or password is incorrect');
}

export interface OpenSessionInput {
  userId: string;
  deviceLabel: string | null;
  userAgent?: string | undefined;
  now: Date;
  /** When set, the oldest live sessions beyond this number are signed out. */
  deviceLimit?: number | undefined;
}

/**
 * Opens a session with a fresh refresh token. Called inside the caller's transaction, after the
 * caller has checked the user. Password login and passkey login both use it.
 */
export async function openSession(
  client: PoolClient,
  input: OpenSessionInput,
): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(input.now.getTime() + REFRESH_TOKEN_TTL_MS);
  const sessionId = await repo.insertSession(client, {
    userId: input.userId,
    deviceLabel: input.deviceLabel,
    deviceInfo: input.userAgent ? { userAgent: input.userAgent.slice(0, 256) } : null,
    refreshHash: hashRefreshToken(refreshToken),
    issuedAt: input.now,
    expiresAt,
  });
  if (input.deviceLimit !== undefined) {
    // the new session counts: the oldest sessions beyond the limit end, and each is recorded
    const ended = await repo.revokeSessionsOverLimit(client, input.userId, input.deviceLimit);
    for (let i = 0; i < ended; i += 1) await repo.recordAuthEvent(client, input.userId, 'session_limit_revoked');
  }
  return { sessionId, refreshToken, expiresAt };
}

/** Signs the access token for an opened session and returns the pair the client receives. */
export async function tokenPairFor(
  signingKey: Uint8Array,
  session: {
    tenantId: string;
    userId: string;
    sessionId: string;
    refreshToken: string;
    expiresAt: Date;
  },
): Promise<TokenPair> {
  const accessToken = await signAccessToken(signingKey, {
    userId: session.userId,
    sessionId: session.sessionId,
    tenantId: session.tenantId,
  });
  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Checks a login id and password, then opens a session. Every failure returns the same 401, so the
 * response does not show whether the login id exists, is locked or is inactive.
 *
 * The transaction commits the failure count before the 401 is thrown. Throwing inside withTenant would roll it back.
 */
export async function login(deps: AuthDeps, input: LoginInput): Promise<LoginResult> {
  const now = new Date();
  // An unknown tenant gets the same 401, after the same hashing work, as an unknown login id.
  if (!(await tenantExists(deps.pool, input.tenantId))) {
    await verifySecret(input.password, await dummySecretHash());
    throw invalidCredentials();
  }
  const issued = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForLogin(client, input.loginId);
    if (!user) {
      // Same work as a real check, so an unknown login id does not answer faster.
      await verifySecret(input.password, await dummySecretHash());
      await repo.recordAuthEvent(client, null, 'login_failure');
      return null;
    }

    const matches = await verifySecret(
      input.password,
      user.password_hash ?? (await dummySecretHash()),
    );
    const locked = user.locked_until !== null && user.locked_until.getTime() > now.getTime();
    const active = user.status === 'active';

    if (!matches && !locked) {
      const failed = (user.failed_count ?? 0) + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        await repo.setFailedLogin(client, user.id, 0, new Date(now.getTime() + LOCKOUT_MS));
      } else {
        await repo.setFailedLogin(client, user.id, failed, user.locked_until);
      }
    }
    if (!matches || locked || !active) {
      await repo.recordAuthEvent(client, user.id, locked ? 'login_locked' : 'login_failure');
      return null;
    }

    await repo.setSuccessfulLogin(client, user.id);
    const { sessionId, refreshToken, expiresAt } = await openSession(client, {
      userId: user.id,
      deviceLabel: input.deviceLabel ?? null,
      userAgent: input.userAgent,
      now,
      deviceLimit: deps.deviceLimit,
    });
    await repo.recordAuthEvent(client, user.id, 'login_success');
    return {
      userId: user.id,
      sessionId,
      refreshToken,
      expiresAt,
      user: { id: user.id, loginId: user.login_id, name: user.name, email: user.email },
      mustChangePassword: user.must_change_password === true,
    };
  });

  if (!issued) {
    throw invalidCredentials();
  }
  const accessToken = await signAccessToken(deps.signingKey, {
    userId: issued.userId,
    sessionId: issued.sessionId,
    tenantId: input.tenantId,
  });
  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: issued.refreshToken,
    refreshTokenExpiresAt: issued.expiresAt.toISOString(),
    user: issued.user,
    mustChangePassword: issued.mustChangePassword,
  };
}

/**
 * Changes the signed-in user's password. The current password must match; the new one must meet the policy and differ
 * from the current one. Clears must_change_password and any failure count or lock, and revokes the user's other
 * sessions; the session that made the change stays open. Neither password is logged or returned.
 */
export async function changePassword(
  deps: AuthDeps,
  input: {
    tenantId: string;
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
  },
): Promise<void> {
  const now = new Date();
  const outcome = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForPasswordChange(client, input.userId);
    if (!user || user.status !== 'active') return 'invalid' as const;
    const matches = await verifySecret(
      input.currentPassword,
      user.password_hash ?? (await dummySecretHash()),
    );
    if (!matches || user.password_hash === null) {
      // Returned, not thrown, so the failure event commits.
      await repo.recordAuthEvent(client, user.id, 'password_change_failure');
      return 'invalid' as const;
    }
    assertPasswordPolicy(input.newPassword, user.login_id);
    if (input.newPassword === input.currentPassword) {
      throw new AppError('VALIDATION_ERROR', 400, 'Password does not meet the policy', {
        issues: [{ path: 'newPassword', message: 'must differ from the current password' }],
      });
    }
    const newHash = await hashSecret(input.newPassword);
    await repo.setNewPassword(client, user.id, newHash, now);
    await repo.revokeOtherSessions(client, user.id, input.sessionId);
    await repo.recordAuthEvent(client, user.id, 'password_changed');
    return 'changed' as const;
  });
  if (outcome === 'invalid') {
    throw new AppError('AUTH_INVALID_CURRENT_PASSWORD', 400, 'The current password is incorrect');
  }
}

/**
 * Exchanges a refresh token for a new pair. The old session is revoked and a new one takes its place
 * with the same expiry. Presenting a token that was already used or revoked revokes every session of that user.
 */
export async function refresh(
  deps: AuthDeps,
  input: { tenantId: string; refreshToken: string },
): Promise<TokenPair> {
  const now = new Date();
  const rotated = await withTenant(deps.pool, input.tenantId, async (client) => {
    const session = await repo.findSessionByRefreshHash(
      client,
      hashRefreshToken(input.refreshToken),
    );
    if (!session) {
      return null;
    }
    // ended because the user signed in on another device (the device limit): the login page says so
    if (session.revoked_at !== null && session.revoked_reason === 'device_limit') {
      throw new AppError('SESSION_REPLACED', 401, 'You signed in on another device, so this session has ended.');
    }
    if (session.revoked_at !== null) {
      // A token from a session that was replaced by a refresh is reuse, which looks like theft: every session ends.
      // A session the user signed out or revoked is only refused, so another device does not sign the user out.
      if (session.revoked_reason === 'rotated') {
        await repo.revokeAllSessions(client, session.user_id);
        await repo.recordAuthEvent(client, session.user_id, 'refresh_reuse');
      }
      return null;
    }
    if (
      session.status !== 'active' ||
      session.expires_at === null ||
      session.expires_at.getTime() <= now.getTime()
    ) {
      return null;
    }

    await repo.revokeSession(client, session.id, session.user_id, 'rotated');
    const refreshToken = newRefreshToken();
    const expiresAt = session.expires_at;
    const sessionId = await repo.insertSession(client, {
      userId: session.user_id,
      deviceLabel: session.device_label,
      deviceInfo: asRecord(session.device_info),
      refreshHash: hashRefreshToken(refreshToken),
      issuedAt: now,
      expiresAt,
    });
    await repo.recordAuthEvent(client, session.user_id, 'refresh');
    return { userId: session.user_id, sessionId, refreshToken, expiresAt };
  });

  if (!rotated) {
    throw new AppError(
      'AUTH_INVALID_REFRESH_TOKEN',
      401,
      'Refresh token is invalid, expired or revoked',
    );
  }
  const accessToken = await signAccessToken(deps.signingKey, {
    userId: rotated.userId,
    sessionId: rotated.sessionId,
    tenantId: input.tenantId,
  });
  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: rotated.expiresAt.toISOString(),
  };
}

/** Revokes the session behind the caller's access token. */
export async function logout(
  deps: AuthDeps,
  input: { tenantId: string; userId: string; sessionId: string },
): Promise<void> {
  await withTenant(deps.pool, input.tenantId, async (client) => {
    const revoked = await repo.revokeSession(client, input.sessionId, input.userId);
    if (revoked) {
      await repo.recordAuthEvent(client, input.userId, 'logout');
    }
  });
}

/** The user behind the caller's access token. */
export async function currentUser(
  deps: AuthDeps,
  input: { tenantId: string; userId: string },
): Promise<PublicUser> {
  const found = await withTenant(deps.pool, input.tenantId, (client) =>
    repo.findPublicUser(client, input.userId),
  );
  if (!found) {
    throw new AppError('AUTH_INVALID_TOKEN', 401, 'Access token is invalid or expired');
  }
  return found.user;
}
