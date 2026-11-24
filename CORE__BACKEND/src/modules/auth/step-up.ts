import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { CoreRequest } from '../../http/app.js';
import { jwtVerify, SignJWT } from 'jose';
import { withTenant } from '../../db/tenant.js';
import { AppError } from '../../core/errors.js';
import { dummySecretHash, verifySecret } from '../../core/password.js';
import { authOf } from '../../core/resource.js';
import { AUDIENCE, ISSUER } from './tokens.js';
import { checkAssertion, type PasskeyDeps, PASSKEY_CHALLENGE_TTL_MS } from './passkey.js';
import * as repo from './repo.js';

/**
 * Step-up: a protected action (grants, geo-fence zones) needs a fresh check, not just a signed-in session.
 * The user answers a passkey challenge (or, where the route allows it, re-enters their password), and the server
 * returns a short-lived step-up token that records which method was used (`amr`). Protected routes read it from the
 * X-Step-Up-Token header. The token is bound to the user, the session and the tenant, and it cannot be used as an
 * access token (it carries its own scope claim).
 *
 * Which routes accept a password check: geo-fence zone writes. Privilege grants and revokes stay passkey-only,
 * because a password alone must not be enough to hand out access.
 */
export const STEP_UP_TTL_SECONDS = 5 * 60;
export const STEP_UP_HEADER = 'x-step-up-token';
const STEP_UP_PURPOSE = 'step_up';
const STEP_UP_SCOPE = 'step-up';

/** How the user proved it was them. A token issued before this claim existed came from a passkey. */
export type StepUpMethod = 'passkey' | 'password';

function stepUpRequired(): AppError {
  return new AppError('STEP_UP_REQUIRED', 401, 'Verify your identity to continue');
}

/** Signs a step-up token for one user, session and tenant. */
async function signStepUpToken(
  key: Uint8Array,
  claims: { userId: string; sessionId: string; tenantId: string; method: StepUpMethod },
): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sid: claims.sessionId, tid: claims.tenantId, scp: STEP_UP_SCOPE, amr: claims.method })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + STEP_UP_TTL_SECONDS)
    .sign(key);
  return { token, expiresAt: new Date((now + STEP_UP_TTL_SECONDS) * 1000) };
}

/** Checks a step-up token against the request's signed-in user, session and tenant. Any failure is STEP_UP_REQUIRED. */
async function verifyStepUpToken(
  key: Uint8Array,
  token: string,
  expected: { userId: string; sessionId: string; tenantId: string },
  allowed: readonly StepUpMethod[],
): Promise<void> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }));
  } catch {
    throw stepUpRequired();
  }
  if (
    payload['scp'] !== STEP_UP_SCOPE ||
    payload['sub'] !== expected.userId ||
    payload['sid'] !== expected.sessionId ||
    payload['tid'] !== expected.tenantId
  ) {
    throw stepUpRequired();
  }
  // a token with no method claim was issued by a passkey check, before password step-up existed
  const method: StepUpMethod = payload['amr'] === 'password' ? 'password' : 'passkey';
  if (!allowed.includes(method)) {
    throw stepUpRequired();
  }
}

/**
 * A preHandler for protected routes: the request must carry a valid step-up token for this user and session.
 * By default only a passkey check counts; `allowPassword` also accepts a password check.
 */
export function requireStepUp(deps: { signingKey: Uint8Array }, options: { allowPassword?: boolean } = {}) {
  const allowed: readonly StepUpMethod[] = options.allowPassword ? ['passkey', 'password'] : ['passkey'];
  return async (request: CoreRequest): Promise<void> => {
    const auth = authOf(request);
    const header = request.headers[STEP_UP_HEADER];
    if (typeof header !== 'string' || header.length === 0) {
      throw stepUpRequired();
    }
    await verifyStepUpToken(deps.signingKey, header, auth, allowed);
  };
}

/** Passkey challenge for a step-up check. The user must have a passkey; otherwise they are told to add one. */
export async function stepUpOptions(
  deps: PasskeyDeps,
  input: { tenantId: string; userId: string },
) {
  const now = new Date();
  return withTenant(deps.pool, input.tenantId, async (client) => {
    const passkeys = await repo.listPasskeys(client, input.userId);
    if (passkeys.length === 0) {
      throw new AppError('STEP_UP_NO_PASSKEY', 409, 'Add a passkey first. Step-up checks need one.');
    }
    const options = await generateAuthenticationOptions({
      rpID: deps.webauthn.rpId,
      allowCredentials: passkeys.map((row) => ({ id: row.credential_key })),
      userVerification: 'required',
    });
    await repo.closeOpenChallenges(client, input.userId, STEP_UP_PURPOSE, now);
    await repo.insertChallenge(client, {
      userId: input.userId,
      purpose: STEP_UP_PURPOSE,
      challenge: options.challenge,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS),
    });
    return options;
  });
}

/**
 * Checks the passkey answer for a step-up challenge and returns a step-up token. The challenge is used up whatever
 * the outcome, and a counter that did not go up is refused, as in passkey sign-in.
 */
export async function stepUpVerify(
  deps: PasskeyDeps,
  input: { tenantId: string; userId: string; sessionId: string; response: AuthenticationResponseJSON },
): Promise<{ stepUpToken: string; expiresAt: string }> {
  const now = new Date();
  const passed = await withTenant(deps.pool, input.tenantId, async (client) => {
    const challenge = await repo.findOpenChallenge(client, input.userId, STEP_UP_PURPOSE, now);
    if (challenge) {
      await repo.markChallengeUsed(client, challenge.id, now);
    }
    const passkey = challenge
      ? await repo.findPasskeyByCredential(client, input.userId, input.response.id)
      : null;
    if (!challenge || !passkey) {
      await repo.recordAuthEvent(client, input.userId, 'step_up_failure');
      return false;
    }
    const newCounter = await checkAssertion(deps, input.response, challenge.challenge, passkey);
    const stored = Number(passkey.sign_count);
    const counterRewound = newCounter !== null && stored > 0 && newCounter > 0 && newCounter <= stored;
    if (newCounter === null || counterRewound) {
      await repo.recordAuthEvent(client, input.userId, 'step_up_failure');
      return false;
    }
    await repo.updatePasskeySignCount(client, passkey.id, newCounter > 0 ? newCounter : stored);
    await repo.recordAuthEvent(client, input.userId, 'step_up_success');
    return true;
  });
  if (!passed) {
    throw new AppError('STEP_UP_FAILED', 401, 'The passkey check did not pass');
  }
  const { token, expiresAt } = await signStepUpToken(deps.signingKey, {
    userId: input.userId,
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    method: 'passkey',
  });
  return { stepUpToken: token, expiresAt: expiresAt.toISOString() };
}

/**
 * Step-up by password: the signed-in user types their password again. The token it returns says `password`, so it
 * opens only the routes that accept a password check (geo-fence zones), never privilege grants. A wrong password,
 * an inactive user or a user with no password all answer the same 401, and the failure is recorded. The route
 * limits attempts per user, so a stolen access token cannot be used to guess the password.
 */
export async function stepUpPassword(
  deps: Pick<PasskeyDeps, 'pool' | 'signingKey'>,
  input: { tenantId: string; userId: string; sessionId: string; password: string },
): Promise<{ stepUpToken: string; expiresAt: string }> {
  const passed = await withTenant(deps.pool, input.tenantId, async (client) => {
    const user = await repo.findUserForPasswordChange(client, input.userId);
    // the same hashing work whether or not there is a real hash to check
    const matches = await verifySecret(input.password, user?.password_hash ?? (await dummySecretHash()));
    if (!user || user.status !== 'active' || user.password_hash === null || !matches) {
      // returned, not thrown, so the failure event commits
      await repo.recordAuthEvent(client, input.userId, 'step_up_failure', 'password');
      return false;
    }
    await repo.recordAuthEvent(client, user.id, 'step_up_success', 'password');
    return true;
  });
  if (!passed) {
    throw new AppError('STEP_UP_FAILED', 401, 'The password check did not pass');
  }
  const { token, expiresAt } = await signStepUpToken(deps.signingKey, {
    userId: input.userId,
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    method: 'password',
  });
  return { stepUpToken: token, expiresAt: expiresAt.toISOString() };
}
