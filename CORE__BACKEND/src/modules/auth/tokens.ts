import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { isValidTenantId } from '../../db/migrate.js';
import { AppError } from '../../core/errors.js';

/** Access token lifetime (Phase 4a design default). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh token lifetime. Fixed from login: rotation does not extend it (Phase 4a design default). */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ISSUER = 'velox-core';
export const AUDIENCE = 'velox-core';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  tenantId: string;
}

/**
 * Returns the HMAC key for access tokens. Without a configured secret a random key is used, so tokens
 * stop working after a restart. The caller decides how to report that.
 */
export function signingKeyFrom(secret: string | undefined, onEphemeral: () => void): Uint8Array {
  if (secret !== undefined) {
    return new TextEncoder().encode(secret);
  }
  onEphemeral();
  return randomBytes(32);
}

/** Signs a short-lived access token. `sub` is the user, `sid` the session, `tid` the tenant. */
export async function signAccessToken(
  key: Uint8Array,
  claims: AccessClaims,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: claims.sessionId, tid: claims.tenantId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/** The one 401 for every bad, expired or revoked access token. */
export function invalidAccessToken(): AppError {
  return new AppError('AUTH_INVALID_TOKEN', 401, 'Access token is invalid or expired');
}

/** Checks the signature, issuer, audience and expiry. Any failure is the same 401 for the client. */
export async function verifyAccessToken(key: Uint8Array, token: string): Promise<AccessClaims> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }));
  } catch {
    throw invalidAccessToken();
  }
  const { sub, sid, tid } = payload;
  if (typeof sub !== 'string' || typeof sid !== 'string' || typeof tid !== 'string') {
    throw invalidAccessToken();
  }
  if (!isValidTenantId(tid)) {
    throw invalidAccessToken();
  }
  return { userId: sub, sessionId: sid, tenantId: tid };
}

/** A new opaque refresh token: 256 random bits, base64url. It is returned once and never stored. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of the refresh token. This is what core_user_session.refresh_hash stores. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
