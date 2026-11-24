import { randomBytes, randomUUID } from 'node:crypto';
import type { CoreApp } from '../../src/http/app.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashSecret } from '../../src/core/password.js';
import { webauthnConfigFrom } from '../../src/modules/auth/passkey.js';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../db/helpers.js';
import { VirtualAuthenticator } from './virtual-authenticator.js';

const TENANT = 'acme';
const PASSWORD = 'Correct-Horse-Battery-9';
const JWT_SECRET = 'passkey-test-secret-with-at-least-32-characters';
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3000';
const SLOW_TEST_MS = 30_000;

/** Each test uses its own login id, so tests do not depend on each other's rows. */
function uniqueLogin(): string {
  return `pk-${randomUUID().slice(0, 8)}`;
}

describe('webauthn configuration (phase 4c)', () => {
  it('defaults to localhost and the app port outside production', () => {
    expect(webauthnConfigFrom(loadEnv({ NODE_ENV: 'test' }))).toEqual({
      rpId: 'localhost',
      origins: ['http://localhost:3000'],
    });
  });

  it('reads the RP ID and a comma-separated origin list', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      WEBAUTHN_RP_ID: 'core.example.com',
      WEBAUTHN_ORIGINS: 'https://core.example.com, https://admin.example.com',
    });
    expect(webauthnConfigFrom(env)).toEqual({
      rpId: 'core.example.com',
      origins: ['https://core.example.com', 'https://admin.example.com'],
    });
  });

  it('requires the RP ID and origins in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET })).toThrow(/WEBAUTHN_RP_ID/);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET, WEBAUTHN_RP_ID: RP_ID })).toThrow(
      /WEBAUTHN_ORIGINS/,
    );
  });

  it('rejects an origin that is not a URL', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', WEBAUTHN_ORIGINS: 'not a url' })).toThrow(
      /WEBAUTHN_ORIGINS/,
    );
  });
});

// Integration tests for Phase 4c: passkey registration, passkey sign-in, removal and the limits on sign-in.
describe.skipIf(!TEST_DATABASE_URL)('passkeys (phase 4c)', { timeout: SLOW_TEST_MS }, () => {
  let db: TestDatabase;
  let app: CoreApp | undefined;
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET,
    WEBAUTHN_RP_ID: RP_ID,
    WEBAUTHN_ORIGINS: ORIGIN,
  });

  beforeAll(async () => {
    db = await createTestDatabase(TEST_DATABASE_URL!, [TENANT]);
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  // A fresh app per test gives each test its own rate-limit counters.
  beforeEach(() => {
    app = buildApp({ env, pool: db.pool });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function seedUser(loginId: string): Promise<string> {
    const hash = await hashSecret(PASSWORD);
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO tenant_acme.core_user (login_id, name, status, password_hash, failed_count)
         VALUES ($1, 'Passkey User', 'active', $2, 0)
         RETURNING id`,
      [loginId, hash],
    );
    return rows[0]!.id;
  }

  async function signInWithPassword(loginId: string): Promise<string> {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.accessToken as string;
  }

  function registerOptions(token: string | null) {
    return app!.inject({
      method: 'POST',
      url: '/auth/passkeys/register/options',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function registerVerify(token: string, response: unknown, label?: string) {
    return app!.inject({
      method: 'POST',
      url: '/auth/passkeys/register/verify',
      headers: { authorization: `Bearer ${token}` },
      payload: { response, label },
    });
  }

  /** Full registration: options, a virtual authenticator answer, verify. */
  async function registerPasskey(
    token: string,
    authenticator: VirtualAuthenticator,
    label?: string,
  ) {
    const options = await registerOptions(token);
    expect(options.statusCode).toBe(200);
    const challenge = options.json().data.challenge as string;
    return registerVerify(token, authenticator.register({ challenge, origin: ORIGIN }), label);
  }

  function listPasskeys(token: string) {
    return app!.inject({
      method: 'GET',
      url: '/auth/passkeys',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function loginOptions(loginId: string) {
    return app!.inject({
      method: 'POST',
      url: '/auth/passkeys/login/options',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId },
    });
  }

  function loginVerify(loginId: string, response: unknown) {
    return app!.inject({
      method: 'POST',
      url: '/auth/passkeys/login/verify',
      headers: { 'x-tenant-id': TENANT },
      payload: { loginId, response },
    });
  }

  /** Full sign-in: options, a virtual authenticator answer, verify. */
  async function signInWithPasskey(
    loginId: string,
    authenticator: VirtualAuthenticator,
    overrides: {
      challenge?: string;
      origin?: string;
      userVerified?: boolean;
      signCount?: number;
    } = {},
  ) {
    const options = await loginOptions(loginId);
    expect(options.statusCode).toBe(200);
    const challenge = overrides.challenge ?? (options.json().data.challenge as string);
    const response = authenticator.assert({
      challenge,
      origin: overrides.origin ?? ORIGIN,
      userVerified: overrides.userVerified,
      signCount: overrides.signCount,
    });
    return loginVerify(loginId, response);
  }

  /** Registers a passkey for a new user and returns the user's token and the authenticator. */
  async function userWithPasskey(label = 'Laptop') {
    const loginId = uniqueLogin();
    await seedUser(loginId);
    const token = await signInWithPassword(loginId);
    const authenticator = new VirtualAuthenticator(RP_ID);
    const registered = await registerPasskey(token, authenticator, label);
    expect(registered.statusCode).toBe(201);
    return { loginId, token, authenticator };
  }

  async function eventsFor(loginId: string): Promise<string[]> {
    const { rows } = await db.pool.query<{ event_type: string }>(
      `SELECT a.event_type FROM tenant_acme.core_auth_activity a
         JOIN tenant_acme.core_user u ON u.id = a.user_id
         WHERE u.login_id = $1 ORDER BY a.occurred_at, a.created_at`,
      [loginId],
    );
    return rows.map((r) => r.event_type);
  }

  async function expireChallenges(): Promise<void> {
    await db.pool.query(
      `UPDATE tenant_acme.core_auth_activity SET expires_at = now() - interval '1 minute'
         WHERE event_type = 'passkey_challenge'`,
    );
  }

  describe('registration', () => {
    it('registers a passkey for the signed-in user and lists it', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      const authenticator = new VirtualAuthenticator(RP_ID);

      const registered = await registerPasskey(token, authenticator, 'Work laptop');
      expect(registered.statusCode).toBe(201);
      expect(registered.json().data.label).toBe('Work laptop');

      const list = await listPasskeys(token);
      expect(list.statusCode).toBe(200);
      const passkeys = list.json().data.passkeys as Array<{ id: string; label: string }>;
      expect(passkeys).toHaveLength(1);
      expect(passkeys[0]!.label).toBe('Work laptop');
      expect(await eventsFor(loginId)).toContain('passkey_registered');
    });

    it('requires a session to start or finish a registration', async () => {
      const options = await registerOptions(null);
      expect(options.statusCode).toBe(401);
    });

    it('refuses a registration answer that was already used', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      const authenticator = new VirtualAuthenticator(RP_ID);
      const options = await registerOptions(token);
      const response = authenticator.register({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
      });

      expect((await registerVerify(token, response)).statusCode).toBe(201);
      expect((await registerVerify(token, response)).statusCode).toBe(400);
    });

    it('refuses a registration answer for a different challenge', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      await registerOptions(token);
      const response = new VirtualAuthenticator(RP_ID).register({
        challenge: randomBytes(32).toString('base64url'),
        origin: ORIGIN,
      });

      const res = await registerVerify(token, response);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('PASSKEY_REGISTRATION_FAILED');
    });

    it('refuses a registration whose challenge has expired', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      const options = await registerOptions(token);
      const response = new VirtualAuthenticator(RP_ID).register({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
      });
      await expireChallenges();

      expect((await registerVerify(token, response)).statusCode).toBe(400);
    });

    it('refuses a registration from another origin', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      const options = await registerOptions(token);
      const response = new VirtualAuthenticator(RP_ID).register({
        challenge: options.json().data.challenge,
        origin: 'https://evil.example',
      });

      expect((await registerVerify(token, response)).statusCode).toBe(400);
    });

    it('refuses a registration without user verification', async () => {
      const loginId = uniqueLogin();
      await seedUser(loginId);
      const token = await signInWithPassword(loginId);
      const options = await registerOptions(token);
      const response = new VirtualAuthenticator(RP_ID).register({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
        userVerified: false,
      });

      expect((await registerVerify(token, response)).statusCode).toBe(400);
    });

    it('refuses a credential that another user already registered', async () => {
      const first = await userWithPasskey('First');
      const secondLogin = uniqueLogin();
      await seedUser(secondLogin);
      const secondToken = await signInWithPassword(secondLogin);

      // The same authenticator (same credential ID) answers for the second user.
      const res = await registerPasskey(secondToken, first.authenticator, 'Copy');
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PASSKEY_ALREADY_REGISTERED');
    });
  });

  describe('sign-in', () => {
    it('signs in with a passkey and returns a session that works', async () => {
      const { loginId, authenticator } = await userWithPasskey();

      const res = await signInWithPasskey(loginId, authenticator);
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.accessToken).toEqual(expect.any(String));
      expect(data.refreshToken).toEqual(expect.any(String));
      expect(data.user.loginId).toBe(loginId);

      const me = await app!.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${data.accessToken}` },
      });
      expect(me.statusCode).toBe(200);
      expect(await eventsFor(loginId)).toContain('passkey_login_success');
    });

    it('refuses a replayed sign-in', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const options = await loginOptions(loginId);
      const response = authenticator.assert({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
      });

      expect((await loginVerify(loginId, response)).statusCode).toBe(200);
      expect((await loginVerify(loginId, response)).statusCode).toBe(401);
    });

    it('refuses a sign-in for a different challenge', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const res = await signInWithPasskey(loginId, authenticator, {
        challenge: randomBytes(32).toString('base64url'),
      });
      expect(res.statusCode).toBe(401);
    });

    it('refuses a sign-in whose challenge has expired', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const options = await loginOptions(loginId);
      const response = authenticator.assert({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
      });
      await expireChallenges();

      expect((await loginVerify(loginId, response)).statusCode).toBe(401);
    });

    it('refuses a sign-in from another origin', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const res = await signInWithPasskey(loginId, authenticator, {
        origin: 'https://evil.example',
      });
      expect(res.statusCode).toBe(401);
    });

    it('refuses a sign-in without user verification', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const res = await signInWithPasskey(loginId, authenticator, { userVerified: false });
      expect(res.statusCode).toBe(401);
    });

    it('refuses a sign-in with a bad signature', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      const options = await loginOptions(loginId);
      const response = authenticator.assert({
        challenge: options.json().data.challenge,
        origin: ORIGIN,
      });
      response.response.signature = Buffer.alloc(70, 1).toString('base64url');

      expect((await loginVerify(loginId, response)).statusCode).toBe(401);
    });

    it('refuses a counter that goes backwards', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      expect((await signInWithPasskey(loginId, authenticator, { signCount: 5 })).statusCode).toBe(
        200,
      );

      const rewound = await signInWithPasskey(loginId, authenticator, { signCount: 3 });
      expect(rewound.statusCode).toBe(401);
    });

    it('accepts an authenticator that does not count', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      expect((await signInWithPasskey(loginId, authenticator, { signCount: 0 })).statusCode).toBe(
        200,
      );
      expect((await signInWithPasskey(loginId, authenticator, { signCount: 0 })).statusCode).toBe(
        200,
      );
    });

    it('answers an unknown login id the same way as a wrong passkey', async () => {
      const { loginId } = await userWithPasskey();
      const unknown = await loginOptions(uniqueLogin());
      expect(unknown.statusCode).toBe(200);
      expect(unknown.json().data.allowCredentials).toHaveLength(1);

      const unknownSignIn = await loginVerify(
        uniqueLogin(),
        new VirtualAuthenticator(RP_ID).assert({
          challenge: unknown.json().data.challenge,
          origin: ORIGIN,
        }),
      );
      const wrongPasskey = await signInWithPasskey(loginId, new VirtualAuthenticator(RP_ID), {});

      expect(unknownSignIn.statusCode).toBe(401);
      expect(wrongPasskey.statusCode).toBe(401);
      expect(unknownSignIn.json().error).toEqual(wrongPasskey.json().error);
    });

    it('refuses a sign-in for a locked account', async () => {
      const { loginId, authenticator } = await userWithPasskey();
      await db.pool.query(
        `UPDATE tenant_acme.core_user SET locked_until = now() + interval '10 minutes'
           WHERE login_id = $1`,
        [loginId],
      );
      expect((await signInWithPasskey(loginId, authenticator)).statusCode).toBe(401);
    });

    it('counts sign-in options against the password login limit', async () => {
      const loginId = uniqueLogin();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await loginOptions(loginId)).statusCode).toBe(200);
      }
      const blocked = await loginOptions(loginId);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('RATE_LIMITED');
    });
  });

  describe('removal', () => {
    it('removes a passkey when the account still has a password', async () => {
      const { loginId, token } = await userWithPasskey();
      const passkeys = (await listPasskeys(token)).json().data.passkeys as Array<{ id: string }>;

      const removed = await app!.inject({
        method: 'DELETE',
        url: `/auth/passkeys/${passkeys[0]!.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(removed.statusCode).toBe(200);
      expect((await listPasskeys(token)).json().data.passkeys).toHaveLength(0);
      expect(await eventsFor(loginId)).toContain('passkey_removed');
    });

    it('refuses to remove the last sign-in method', async () => {
      const { loginId, token } = await userWithPasskey();
      await db.pool.query(
        `UPDATE tenant_acme.core_user SET password_hash = NULL WHERE login_id = $1`,
        [loginId],
      );
      const passkeys = (await listPasskeys(token)).json().data.passkeys as Array<{ id: string }>;

      const res = await app!.inject({
        method: 'DELETE',
        url: `/auth/passkeys/${passkeys[0]!.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PASSKEY_LAST_SIGN_IN_METHOD');
      expect((await listPasskeys(token)).json().data.passkeys).toHaveLength(1);
    });

    it("does not remove another user's passkey", async () => {
      const owner = await userWithPasskey();
      const other = await userWithPasskey('Other');
      const passkeys = (await listPasskeys(owner.token)).json().data.passkeys as Array<{
        id: string;
      }>;

      const res = await app!.inject({
        method: 'DELETE',
        url: `/auth/passkeys/${passkeys[0]!.id}`,
        headers: { authorization: `Bearer ${other.token}` },
      });
      expect(res.statusCode).toBe(404);
      expect((await listPasskeys(owner.token)).json().data.passkeys).toHaveLength(1);
    });
  });
});
