import { randomInt } from 'node:crypto';
import type { Pool } from 'pg';
import { AppError } from '../../core/errors.js';
import {
  assertPasswordPolicy,
  dummySecretHash,
  hashSecret,
  verifySecret,
} from '../../core/password.js';
import { tenantExists, withTenant } from '../../db/tenant.js';
import * as repo from './repo.js';

/** The only one-time code purpose in Phase 4b. */
export const OTP_PURPOSE_PASSWORD_RESET = 'password_reset';
/** How long a code stays usable (Phase 4b design default). */
export const OTP_TTL_MS = 5 * 60 * 1000;
/** Wrong tries before a code is burned (Phase 4b design default). */
export const OTP_MAX_ATTEMPTS = 5;

export interface OtpMessage {
  tenantId: string;
  userId: string;
  loginId: string;
  purpose: typeof OTP_PURPOSE_PASSWORD_RESET;
  /** The plain code. The delivery adapter sends it and must never log or store it. */
  code: string;
  expiresAt: Date;
  email: string | null;
  phone: string | null;
}

/**
 * Sends a one-time code over a channel the platform chooses (email or SMS). Until a provider is chosen
 * the app is given no delivery port, and the reset routes answer 503.
 */
export interface OtpDelivery {
  send(message: OtpMessage): Promise<void>;
  /**
   * Set only by the sample delivery used before production (owner decision D10): every reset uses this fixed code
   * instead of a random one, nothing is sent, and the account needs no email or phone.
   */
  readonly sampleCode?: string | undefined;
}

/**
 * The delivery used until an email provider is chosen (owner decision D10, 2026-11-21): no message is sent, and
 * the code is the published sample code. The environment check refuses it in production. The log line names the
 * login so a tester can see the request arrived; the code is not logged.
 */
export function createSampleOtpDelivery(
  code: string,
  log: { info(fields: object, message: string): void },
): OtpDelivery {
  return {
    sampleCode: code,
    async send(message) {
      log.info({ loginId: message.loginId, purpose: message.purpose }, 'sample one-time code issued; no message sent');
    },
  };
}

/** A six-digit code with leading zeros kept, from a cryptographic random source. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface PasswordResetDeps {
  pool: Pool;
}

export interface RequestResetDeps extends PasswordResetDeps {
  delivery: OtpDelivery;
  /** How long the code stays usable, in ms (OTP_TTL_MINUTES). Unset means OTP_TTL_MS. */
  otpTtlMs?: number | undefined;
}

/**
 * Starts a reset. The caller always gets the same answer, so the response does not show whether the
 * login id exists or can receive a code. An unknown login id still does the hashing work, so it does
 * not answer faster.
 */
export async function requestPasswordReset(
  deps: RequestResetDeps,
  input: { tenantId: string; loginId: string },
): Promise<void> {
  const now = new Date();
  const code = deps.delivery.sampleCode ?? generateOtp();
  const secretHash = await hashSecret(code);
  // An unknown tenant gets the same silent answer as an unknown login id (the hashing above is the same work).
  if (!(await tenantExists(deps.pool, input.tenantId))) {
    return;
  }

  const issued = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForReset(client, input.loginId);
    const unreachable = !!user && user.email === null && user.phone === null && deps.delivery.sampleCode === undefined;
    if (!user || user.status !== 'active' || unreachable) {
      return null;
    }
    await repo.closeOpenOtps(client, user.id, OTP_PURPOSE_PASSWORD_RESET, now);
    const expiresAt = new Date(now.getTime() + (deps.otpTtlMs ?? OTP_TTL_MS));
    await repo.insertOtp(client, {
      userId: user.id,
      purpose: OTP_PURPOSE_PASSWORD_RESET,
      secretHash,
      issuedAt: now,
      expiresAt,
    });
    return {
      userId: user.id,
      loginId: user.login_id,
      email: user.email,
      phone: user.phone,
      expiresAt,
    };
  });
  if (!issued) {
    return;
  }

  try {
    await deps.delivery.send({
      tenantId: input.tenantId,
      userId: issued.userId,
      loginId: issued.loginId,
      purpose: OTP_PURPOSE_PASSWORD_RESET,
      code,
      expiresAt: issued.expiresAt,
      email: issued.email,
      phone: issued.phone,
    });
  } catch {
    throw new AppError(
      'OTP_DELIVERY_UNAVAILABLE',
      503,
      'The code could not be sent. Try again later.',
    );
  }
}

/**
 * Sets a new password with a code from requestPasswordReset. The password policy is checked before the
 * code is used, so a weak password does not burn a try. Success clears failures and locks and revokes
 * every session. It returns no tokens, so the user logs in again.
 */
export async function confirmPasswordReset(
  deps: PasswordResetDeps,
  input: { tenantId: string; loginId: string; code: string; newPassword: string },
): Promise<void> {
  assertPasswordPolicy(input.newPassword, input.loginId);
  const newHash = await hashSecret(input.newPassword);
  const now = new Date();

  const reset = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForReset(client, input.loginId);
    const otp =
      user && user.status === 'active'
        ? await repo.findOpenOtp(client, user.id, OTP_PURPOSE_PASSWORD_RESET, now)
        : null;
    if (!user || !otp) {
      // Same work as a real check, so an unknown login id does not answer faster.
      await verifySecret(input.code, await dummySecretHash());
      return false;
    }

    const matches = await verifySecret(input.code, otp.secret_hash);
    if (!matches) {
      const attempts = otp.attempts + 1;
      const burned = attempts >= OTP_MAX_ATTEMPTS;
      await repo.recordOtpAttempt(client, otp.id, attempts, burned ? now : null);
      await repo.recordAuthEvent(client, user.id, 'otp_failed', OTP_PURPOSE_PASSWORD_RESET);
      return false;
    }

    await repo.recordOtpAttempt(client, otp.id, otp.attempts + 1, now);
    await repo.recordAuthEvent(client, user.id, 'otp_verified', OTP_PURPOSE_PASSWORD_RESET);
    await repo.setNewPassword(client, user.id, newHash, now);
    await repo.revokeAllSessions(client, user.id);
    await repo.recordAuthEvent(client, user.id, 'password_reset', OTP_PURPOSE_PASSWORD_RESET);
    return true;
  });

  if (!reset) {
    throw new AppError('AUTH_INVALID_OTP', 400, 'Code is invalid or has expired');
  }
}
