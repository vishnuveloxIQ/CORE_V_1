import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import { tenantExists, withTenant } from '../../db/tenant.js';
import * as repo from './repo.js';
import type { PasskeyRow, PublicUser } from './repo.js';
import { openSession, tokenPairFor, type LoginResult } from './service.js';

/** How long a WebAuthn challenge stays usable (Phase 4c design default). */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Shown by the authenticator when it asks the user to confirm. */
export const RP_NAME = 'VeloxIQ Core';

export interface WebAuthnConfig {
  /** The bare domain the credentials are bound to, for example localhost or core.example.com. */
  rpId: string;
  /** Full origins allowed to call the ceremony, for example https://core.example.com. */
  origins: string[];
}

export interface PasskeyDeps {
  pool: Pool;
  signingKey: Uint8Array;
  webauthn: WebAuthnConfig;
  /** Most devices per user. Unset means no limit. */
  deviceLimit?: number | undefined;
}

export interface PasskeyView {
  id: string;
  label: string | null;
  createdAt: string;
}

/**
 * Reads the relying party from the environment. Outside production the defaults are localhost and the
 * app's own port, so local development needs no setup. Production requires both values (see env.ts).
 */
export function webauthnConfigFrom(
  env: Pick<Env, 'PORT' | 'WEBAUTHN_RP_ID' | 'WEBAUTHN_ORIGINS'>,
): WebAuthnConfig {
  return {
    rpId: env.WEBAUTHN_RP_ID ?? 'localhost',
    origins: env.WEBAUTHN_ORIGINS ?? [`http://localhost:${env.PORT}`],
  };
}

/** Base64url text for bytes, the form credential IDs and public keys take in the database. */
function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(text, 'base64url'));
}

/** The WebAuthn user handle is the 16 bytes of the user id (a uuid). */
function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(userId.replace(/-/g, ''), 'hex'));
}

function toView(row: PasskeyRow): PasskeyView {
  return { id: row.id, label: row.label, createdAt: row.created_at.toISOString() };
}

/**
 * Starts a registration for the signed-in user. Existing passkeys are excluded, so the same device is
 * not registered twice. Only the newest register challenge can be answered.
 */
export async function passkeyRegisterOptions(
  deps: PasskeyDeps,
  input: { tenantId: string; userId: string },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const now = new Date();
  return withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findPublicUser(client, input.userId);
    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 401, 'Access token is invalid or expired');
    }
    const existing = await repo.listPasskeys(client, input.userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: deps.webauthn.rpId,
      userName: user.user.loginId,
      userID: userHandle(input.userId),
      attestationType: 'none',
      excludeCredentials: existing.map((row) => ({ id: row.credential_key })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await repo.closeOpenChallenges(client, input.userId, 'register', now);
    await repo.insertChallenge(client, {
      userId: input.userId,
      purpose: 'register',
      challenge: options.challenge,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS),
    });
    return options;
  });
}

/**
 * Checks the registration answer against the open challenge and stores the credential. The challenge
 * is used up whether or not the answer verifies. A credential already stored for any user is refused.
 */
export async function passkeyRegisterVerify(
  deps: PasskeyDeps,
  input: {
    tenantId: string;
    userId: string;
    response: RegistrationResponseJSON;
    label: string | null;
  },
): Promise<PasskeyView> {
  const now = new Date();
  const stored = await withTenant(deps.pool, input.tenantId, async (client) => {
    const challenge = await repo.findOpenChallenge(client, input.userId, 'register', now);
    if (!challenge) {
      return null;
    }
    await repo.markChallengeUsed(client, challenge.id, now);

    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: deps.webauthn.origins,
        expectedRPID: deps.webauthn.rpId,
        requireUserVerification: true,
      });
    } catch {
      return null;
    }
    if (!verified.verified) {
      return null;
    }

    const { credential } = verified.registrationInfo;
    let id: string;
    try {
      id = await repo.insertPasskey(client, {
        userId: input.userId,
        credentialKey: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        signCount: credential.counter,
        label: input.label,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('PASSKEY_ALREADY_REGISTERED', 409, 'This passkey is already registered');
      }
      throw err;
    }
    await repo.recordAuthEvent(client, input.userId, 'passkey_registered');
    return { id, label: input.label, created_at: now, credential_key: credential.id };
  });

  if (!stored) {
    throw new AppError('PASSKEY_REGISTRATION_FAILED', 400, 'The passkey could not be registered');
  }
  return { id: stored.id, label: stored.label, createdAt: stored.created_at.toISOString() };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

export async function passkeyList(
  deps: PasskeyDeps,
  input: { tenantId: string; userId: string },
): Promise<PasskeyView[]> {
  const rows = await withTenant(deps.pool, input.tenantId, (client) =>
    repo.listPasskeys(client, input.userId),
  );
  return rows.map(toView);
}

/**
 * Removes one of the user's passkeys. Refused when it is the last sign-in method, so the account
 * keeps a password or another passkey.
 */
export async function passkeyRemove(
  deps: PasskeyDeps,
  input: { tenantId: string; userId: string; passkeyId: string },
): Promise<void> {
  await withTenant(deps.pool, input.tenantId, async (client) => {
    const passkeys = await repo.listPasskeys(client, input.userId);
    if (!passkeys.some((row) => row.id === input.passkeyId)) {
      throw new AppError('PASSKEY_NOT_FOUND', 404, 'Passkey not found');
    }
    const hasPassword = await repo.userHasPassword(client, input.userId);
    if (!hasPassword && passkeys.length === 1) {
      throw new AppError(
        'PASSKEY_LAST_SIGN_IN_METHOD',
        409,
        'Set a password or add another passkey before removing this one',
      );
    }
    await repo.deletePasskey(client, input.userId, input.passkeyId);
    await repo.recordAuthEvent(client, input.userId, 'passkey_removed');
  });
}

/**
 * Starts a sign-in for a login id. A user with no usable passkey gets the same response shape, with a
 * random credential ID that never verifies, so the answer does not show whether the login id exists.
 */
export async function passkeyLoginOptions(
  deps: PasskeyDeps,
  input: { tenantId: string; loginId: string },
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const now = new Date();
  // An unknown tenant gets the same response shape as an unknown login id: a random credential, nothing stored.
  if (!(await tenantExists(deps.pool, input.tenantId))) {
    return generateAuthenticationOptions({
      rpID: deps.webauthn.rpId,
      allowCredentials: [{ id: toBase64Url(randomBytes(32)) }],
      userVerification: 'required',
    });
  }
  return withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForLogin(client, input.loginId);
    const usable = user !== null && user.status === 'active';
    const passkeys = user && usable ? await repo.listPasskeys(client, user.id) : [];

    const allowCredentials =
      passkeys.length > 0
        ? passkeys.map((row) => ({ id: row.credential_key }))
        : [{ id: toBase64Url(randomBytes(32)) }];
    const options = await generateAuthenticationOptions({
      rpID: deps.webauthn.rpId,
      allowCredentials,
      userVerification: 'required',
    });

    if (user && usable && passkeys.length > 0) {
      await repo.closeOpenChallenges(client, user.id, 'login', now);
      await repo.insertChallenge(client, {
        userId: user.id,
        purpose: 'login',
        challenge: options.challenge,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS),
      });
    }
    return options;
  });
}

/**
 * Checks a passkey sign-in and opens a session. Every failure returns the same 401. The challenge is
 * used up whatever the outcome. The counter check refuses a credential whose counter did not go up,
 * which points to a cloned authenticator. A counter of zero means the authenticator does not count.
 */
export async function passkeyLogin(
  deps: PasskeyDeps,
  input: {
    tenantId: string;
    loginId: string;
    response: AuthenticationResponseJSON;
    deviceLabel?: string | undefined;
    userAgent?: string | undefined;
  },
): Promise<LoginResult> {
  const now = new Date();
  const issued = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForLogin(client, input.loginId);
    if (!user) {
      await repo.recordAuthEvent(client, null, 'passkey_login_failure');
      return null;
    }
    const locked = user.locked_until !== null && user.locked_until.getTime() > now.getTime();

    const challenge = await repo.findOpenChallenge(client, user.id, 'login', now);
    if (challenge) {
      await repo.markChallengeUsed(client, challenge.id, now);
    }
    const passkey = challenge
      ? await repo.findPasskeyByCredential(client, user.id, input.response.id)
      : null;
    if (!challenge || !passkey || user.status !== 'active' || locked) {
      await repo.recordAuthEvent(client, user.id, 'passkey_login_failure');
      return null;
    }

    const newCounter = await checkAssertion(deps, input.response, challenge.challenge, passkey);
    const stored = Number(passkey.sign_count);
    const counterRewound =
      newCounter !== null && stored > 0 && newCounter > 0 && newCounter <= stored;
    if (newCounter === null || counterRewound) {
      await repo.recordAuthEvent(client, user.id, 'passkey_login_failure');
      return null;
    }

    // A zero counter means the authenticator does not count, so the stored value stays.
    await repo.updatePasskeySignCount(client, passkey.id, newCounter > 0 ? newCounter : stored);
    await repo.setSuccessfulLogin(client, user.id);
    const session = await openSession(client, {
      userId: user.id,
      deviceLabel: input.deviceLabel ?? null,
      userAgent: input.userAgent,
      now,
      deviceLimit: deps.deviceLimit,
    });
    await repo.recordAuthEvent(client, user.id, 'passkey_login_success');
    const publicUser: PublicUser = {
      id: user.id,
      loginId: user.login_id,
      name: user.name,
      email: user.email,
    };
    return {
      userId: user.id,
      ...session,
      user: publicUser,
      mustChangePassword: user.must_change_password === true,
    };
  });

  if (!issued) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 401, 'Login id or passkey is incorrect');
  }
  const pair = await tokenPairFor(deps.signingKey, {
    tenantId: input.tenantId,
    userId: issued.userId,
    sessionId: issued.sessionId,
    refreshToken: issued.refreshToken,
    expiresAt: issued.expiresAt,
  });
  return { ...pair, user: issued.user, mustChangePassword: issued.mustChangePassword };
}

/** The new counter when the assertion verifies, or null. The library rejects malformed input by throwing. */
export async function checkAssertion(
  deps: PasskeyDeps,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  passkey: PasskeyRow,
): Promise<number | null> {
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: deps.webauthn.origins,
      expectedRPID: deps.webauthn.rpId,
      credential: {
        id: passkey.credential_key,
        publicKey: fromBase64Url(passkey.public_key),
        counter: Number(passkey.sign_count),
      },
      requireUserVerification: true,
    });
    return result.verified ? result.authenticationInfo.newCounter : null;
  } catch {
    return null;
  }
}
