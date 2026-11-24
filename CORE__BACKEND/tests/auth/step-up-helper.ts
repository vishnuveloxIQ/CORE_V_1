import type { CoreApp } from '../../src/http/app.js';
import { expect } from 'vitest';
import { VirtualAuthenticator } from './virtual-authenticator.js';

// Test helper for protected routes (grants, geo-fence zones). The first time a user needs a step-up token, the
// helper registers a virtual passkey for them, then runs the step-up options and verify calls. Tokens are cached
// per access token, and the virtual authenticator per user, so a test can call stepUpToken() as often as it likes.

export const STEP_UP_RP_ID = 'localhost';
export const STEP_UP_ORIGIN = 'http://localhost:3000';

const authenticators = new Map<string, VirtualAuthenticator>();
const tokens = new Map<string, string>();

/** The routes that need a step-up token: grants and revokes, and geo-fence zone writes. Reads never need one. */
export function needsStepUp(method: string, url: string): boolean {
  if (method === 'GET') return false;
  return (
    /^\/access\/users\/[^/]+\/grants$/.test(url) ||
    /^\/access\/grants\/[^/]+$/.test(url) ||
    /^\/geo-zones(\/[^/]+)?$/.test(url)
  );
}

/** The user id the access token names (its `sub` claim). The helper only reads it; the server checks the signature. */
function userIdOf(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as { sub: string };
  return payload.sub;
}

/** The virtual passkey enrolled for the user behind this access token, or undefined before the first step-up. */
export function authenticatorFor(accessToken: string): VirtualAuthenticator | undefined {
  return authenticators.get(userIdOf(accessToken));
}

/** A step-up token for the signed-in user behind this access token, enrolling a virtual passkey when needed. */
export async function stepUpToken(app: CoreApp, accessToken: string): Promise<string> {
  const cached = tokens.get(accessToken);
  if (cached) return cached;

  const userId = userIdOf(accessToken);
  let authenticator = authenticators.get(userId);
  if (!authenticator) {
    const options = await app.inject({
      method: 'POST',
      url: '/auth/passkeys/register/options',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(options.statusCode).toBe(200);
    const created = new VirtualAuthenticator(STEP_UP_RP_ID);
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/passkeys/register/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        response: created.register({ challenge: options.json().data.challenge as string, origin: STEP_UP_ORIGIN }),
        label: 'Test device',
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    authenticators.set(userId, created);
    authenticator = created;
  }

  const options = await app.inject({
    method: 'POST',
    url: '/auth/step-up/options',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(options.statusCode, options.body).toBe(200);
  const response = authenticator.assert({
    challenge: options.json().data.challenge as string,
    origin: STEP_UP_ORIGIN,
  });
  const verified = await app.inject({
    method: 'POST',
    url: '/auth/step-up/verify',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { response },
  });
  expect(verified.statusCode, verified.body).toBe(200);
  const token = verified.json().data.stepUpToken as string;
  tokens.set(accessToken, token);
  return token;
}
