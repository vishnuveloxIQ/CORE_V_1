import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { CoreApp, CoreReply, CoreRequest } from '../../http/app.js';
import type { Pool } from 'pg';
import { AppError } from '../../core/errors.js';
import { type RateLimiter, type RateLimitRule } from '../../core/rate-limit.js';
import { PostgresRateLimiter } from '../../core/rate-limit-store.js';
import { ok } from '../../core/response.js';
import { parseInput } from '../../core/validation.js';
import { createRequireAuth } from '../../plugins/auth.js';
import { z } from 'zod';
import { idParamsSchema } from '../../core/resource.js';
import { listSessions, revokeSession } from './sessions.js';
import { stepUpOptions, stepUpPassword, stepUpVerify } from './step-up.js';
import {
  passkeyList,
  passkeyLogin,
  passkeyLoginOptions,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyRemove,
  type PasskeyDeps,
  type WebAuthnConfig,
} from './passkey.js';
import { confirmPasswordReset, type OtpDelivery, requestPasswordReset } from './password-reset.js';
import {
  changePasswordBodySchema,
  loginBodySchema,
  passkeyIdParamsSchema,
  passkeyLoginOptionsBodySchema,
  passkeyLoginVerifyBodySchema,
  passkeyRegisterVerifyBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  refreshBodySchema,
  tenantFromHeader,
} from './schema.js';
import { changePassword, currentUser, login, logout, refresh } from './service.js';
import type { AccessClaims } from './tokens.js';

export interface AuthRouteOptions {
  pool: Pool;
  signingKey: Uint8Array;
  /** Sends reset codes. Without it the reset request route answers 503. */
  otpDelivery?: OtpDelivery | undefined;
  /** Relying party for passkeys (Phase 4c). */
  webauthn: WebAuthnConfig;
  /** Most devices per user (SESSION_DEVICE_LIMIT). Unset means no limit. */
  deviceLimit?: number | undefined;
}

const WINDOW_MS = 15 * 60 * 1000;

/** Fixed-window limits (Phase 4b design defaults). Per process until a shared store exists. */
export const RATE_LIMITS = {
  loginPerIp: { limit: 100, windowMs: WINDOW_MS },
  loginPerLoginId: { limit: 10, windowMs: WINDOW_MS },
  resetRequestPerIp: { limit: 20, windowMs: WINDOW_MS },
  resetRequestPerLoginId: { limit: 3, windowMs: WINDOW_MS },
  resetConfirmPerLoginId: { limit: 10, windowMs: WINDOW_MS },
  changePasswordPerUser: { limit: 10, windowMs: WINDOW_MS },
  stepUpPasswordPerUser: { limit: 10, windowMs: WINDOW_MS },
} as const satisfies Record<string, RateLimitRule>;

function authOf(request: CoreRequest): AccessClaims {
  if (!request.auth) {
    throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
  }
  return request.auth;
}

/**
 * Counts every check, then refuses if any is over its limit. All checks are counted, so one blocked key
 * does not stop the others from counting. The 429 does not show whether the login id exists.
 */
async function enforceLimits(
  limiter: RateLimiter,
  reply: CoreReply,
  checks: ReadonlyArray<readonly [string, RateLimitRule]>,
): Promise<void> {
  const decisions = [];
  for (const [key, rule] of checks) {
    decisions.push(await limiter.hit(key, rule));
  }
  const blocked = decisions.filter((decision) => !decision.allowed);
  if (blocked.length === 0) {
    return;
  }
  const retryAfterSeconds = Math.max(...blocked.map((decision) => decision.retryAfterSeconds));
  reply.header('Retry-After', String(retryAfterSeconds));
  throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Try again later.', {
    retryAfterSeconds,
  });
}

/**
 * POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /auth/me,
 * POST /auth/password-reset/request, POST /auth/password-reset/confirm.
 */
export function registerAuthRoutes(app: CoreApp, options: AuthRouteOptions): void {
  const requireAuth = createRequireAuth(options);
  // Open to a user who must still change a temporary password: sign out, read the user, change the password.
  const requireAuthPending = createRequireAuth(options, { allowPasswordChangePending: true });
  // Shared through PostgreSQL, so the login and reset limits hold across instances (Phase N decision 3).
  const limiter = new PostgresRateLimiter(options.pool);

  app.post('/auth/login', { config: { openapi: { summary: 'POST /auth/login', body: loginBodySchema } } }, async (request, reply) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(loginBodySchema, request.body);
    await enforceLimits(limiter, reply, [
      [`login:ip:${request.ip}`, RATE_LIMITS.loginPerIp],
      [`login:id:${tenantId}:${body.loginId.toLowerCase()}`, RATE_LIMITS.loginPerLoginId],
    ]);
    const agent = request.headers['user-agent'];
    const result = await login(options, {
      tenantId,
      loginId: body.loginId,
      password: body.password,
      deviceLabel: body.deviceLabel,
      userAgent: typeof agent === 'string' ? agent : undefined,
    });
    return ok(result);
  });

  app.post('/auth/refresh', { config: { openapi: { summary: 'POST /auth/refresh', body: refreshBodySchema } } }, async (request) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(refreshBodySchema, request.body);
    return ok(await refresh(options, { tenantId, refreshToken: body.refreshToken }));
  });

  app.post('/auth/logout', { config: { openapi: { summary: 'POST /auth/logout' } }, preHandler: requireAuthPending }, async (request) => {
    const auth = authOf(request);
    await logout(options, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      sessionId: auth.sessionId,
    });
    return ok({ loggedOut: true });
  });

  app.get('/auth/me', { preHandler: requireAuthPending }, async (request) => {
    const auth = authOf(request);
    const user = await currentUser(options, { tenantId: auth.tenantId, userId: auth.userId });
    return ok({ user });
  });

  // Changes the signed-in user's password; also how a temporary password is replaced. Limited per user, so a stolen
  // access token cannot be used to guess the current password.
  app.post('/auth/change-password', { config: { openapi: { summary: 'POST /auth/change-password', body: changePasswordBodySchema } }, preHandler: requireAuthPending }, async (request, reply) => {
    const auth = authOf(request);
    const body = parseInput(changePasswordBodySchema, request.body);
    await enforceLimits(limiter, reply, [
      [`change-password:id:${auth.tenantId}:${auth.userId}`, RATE_LIMITS.changePasswordPerUser],
    ]);
    await changePassword(options, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      sessionId: auth.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    return ok({ passwordChanged: true, mustChangePassword: false });
  });

  app.post('/auth/password-reset/request', { config: { openapi: { summary: 'POST /auth/password-reset/request', body: passwordResetRequestBodySchema } } }, async (request, reply) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(passwordResetRequestBodySchema, request.body);
    const delivery = options.otpDelivery;
    if (!delivery) {
      throw new AppError('OTP_DELIVERY_UNAVAILABLE', 503, 'Password reset is not available yet');
    }
    const loginKey = body.loginId.toLowerCase();
    await enforceLimits(limiter, reply, [
      [`reset-request:ip:${request.ip}`, RATE_LIMITS.resetRequestPerIp],
      [`reset-request:id:${tenantId}:${loginKey}`, RATE_LIMITS.resetRequestPerLoginId],
    ]);
    await requestPasswordReset(
      { pool: options.pool, delivery },
      { tenantId, loginId: body.loginId },
    );
    reply.code(202);
    return ok({ accepted: true });
  });

  app.post('/auth/password-reset/confirm', { config: { openapi: { summary: 'POST /auth/password-reset/confirm', body: passwordResetConfirmBodySchema } } }, async (request, reply) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(passwordResetConfirmBodySchema, request.body);
    await enforceLimits(limiter, reply, [
      [
        `reset-confirm:id:${tenantId}:${body.loginId.toLowerCase()}`,
        RATE_LIMITS.resetConfirmPerLoginId,
      ],
    ]);
    await confirmPasswordReset(
      { pool: options.pool },
      {
        tenantId,
        loginId: body.loginId,
        code: body.code,
        newPassword: body.newPassword,
      },
    );
    return ok({ passwordReset: true });
  });

  // Passkey routes (Phase 4c). Login options and verify share the password login limits.
  const passkeys: PasskeyDeps = options;

  app.post('/auth/passkeys/register/options', { config: { openapi: { summary: 'POST /auth/passkeys/register/options' } }, preHandler: requireAuth }, async (request) => {
    const auth = authOf(request);
    const challenge = await passkeyRegisterOptions(passkeys, {
      tenantId: auth.tenantId,
      userId: auth.userId,
    });
    return ok(challenge);
  });

  app.post(
    '/auth/passkeys/register/verify',
    {
      preHandler: requireAuth,
      config: { openapi: { summary: 'POST /auth/passkeys/register/verify', body: passkeyRegisterVerifyBodySchema } },
    },
    async (request, reply) => {
      const auth = authOf(request);
      const body = parseInput(passkeyRegisterVerifyBodySchema, request.body);
      const passkey = await passkeyRegisterVerify(passkeys, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        response: body.response as RegistrationResponseJSON,
        label: body.label ?? null,
      });
      reply.code(201);
      return ok(passkey);
    },
  );

  app.get('/auth/passkeys', { preHandler: requireAuth }, async (request) => {
    const auth = authOf(request);
    const list = await passkeyList(passkeys, { tenantId: auth.tenantId, userId: auth.userId });
    return ok({ passkeys: list });
  });

  // Device sessions: the signed-in user's own live sessions, and revoking one of them.
  app.get('/auth/sessions', { preHandler: requireAuth }, async (request) => {
    const auth = authOf(request);
    const sessions = await listSessions(options, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      currentSessionId: auth.sessionId,
    });
    return ok({ sessions });
  });

  app.delete(
    '/auth/sessions/:id',
    { preHandler: requireAuth, config: { openapi: { summary: 'DELETE /auth/sessions/:id' } } },
    async (request) => {
      const auth = authOf(request);
      const { id } = parseInput(idParamsSchema, request.params);
      await revokeSession(options, { tenantId: auth.tenantId, userId: auth.userId, sessionId: id });
      return ok({ revoked: true });
    },
  );

  // Step-up: a passkey check that unlocks protected actions (grants, geo-fence zones) for five minutes.
  app.post('/auth/step-up/options', { preHandler: requireAuth, config: { openapi: { summary: 'POST /auth/step-up/options' } } }, async (request) => {
    const auth = authOf(request);
    return ok(await stepUpOptions(passkeys, { tenantId: auth.tenantId, userId: auth.userId }));
  });

  const stepUpVerifyBody = z.object({
    response: z.object({
      id: z.string().min(1).max(1024),
      rawId: z.string().min(1).max(1024),
      type: z.literal('public-key'),
      clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
      response: z.object({
        clientDataJSON: z.string().min(1),
        authenticatorData: z.string().min(1),
        signature: z.string().min(1),
        userHandle: z.string().nullable().optional(),
      }),
    }),
  });

  app.post(
    '/auth/step-up/verify',
    {
      preHandler: requireAuth,
      config: { openapi: { summary: 'POST /auth/step-up/verify', body: stepUpVerifyBody } },
    },
    async (request) => {
      const auth = authOf(request);
      const body = parseInput(stepUpVerifyBody, request.body);
      const result = await stepUpVerify(passkeys, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: auth.sessionId,
        response: body.response as unknown as AuthenticationResponseJSON,
      });
      return ok(result);
    },
  );

  // Step-up by password: the signed-in user types their password again. The token it returns opens only the routes
  // that accept a password check (geo-fence zones), not privilege grants. Limited per user, so a stolen access token
  // cannot be used to guess the password.
  const stepUpPasswordBody = z.object({ password: z.string().min(1).max(256) }).strict();
  app.post(
    '/auth/step-up/password',
    {
      preHandler: requireAuth,
      config: { openapi: { summary: 'POST /auth/step-up/password', body: stepUpPasswordBody } },
    },
    async (request, reply) => {
      const auth = authOf(request);
      const body = parseInput(stepUpPasswordBody, request.body);
      await enforceLimits(limiter, reply, [
        [`step-up-password:id:${auth.tenantId}:${auth.userId}`, RATE_LIMITS.stepUpPasswordPerUser],
      ]);
      const result = await stepUpPassword(options, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: auth.sessionId,
        password: body.password,
      });
      return ok(result);
    },
  );

  app.delete('/auth/passkeys/:id', { config: { openapi: { summary: 'DELETE /auth/passkeys/:id' } }, preHandler: requireAuth }, async (request) => {
    const auth = authOf(request);
    const params = parseInput(passkeyIdParamsSchema, request.params);
    await passkeyRemove(passkeys, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      passkeyId: params.id,
    });
    return ok({ removed: true });
  });

  app.post('/auth/passkeys/login/options', { config: { openapi: { summary: 'POST /auth/passkeys/login/options', body: passkeyLoginOptionsBodySchema } } }, async (request, reply) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(passkeyLoginOptionsBodySchema, request.body);
    await enforceLimits(limiter, reply, [
      [`login:ip:${request.ip}`, RATE_LIMITS.loginPerIp],
      [`login:id:${tenantId}:${body.loginId.toLowerCase()}`, RATE_LIMITS.loginPerLoginId],
    ]);
    const challenge = await passkeyLoginOptions(passkeys, { tenantId, loginId: body.loginId });
    return ok(challenge);
  });

  app.post('/auth/passkeys/login/verify', { config: { openapi: { summary: 'POST /auth/passkeys/login/verify', body: passkeyLoginVerifyBodySchema } } }, async (request) => {
    const tenantId = tenantFromHeader(request.headers['x-tenant-id']);
    const body = parseInput(passkeyLoginVerifyBodySchema, request.body);
    const agent = request.headers['user-agent'];
    const result = await passkeyLogin(passkeys, {
      tenantId,
      loginId: body.loginId,
      response: body.response as AuthenticationResponseJSON,
      deviceLabel: body.deviceLabel,
      userAgent: typeof agent === 'string' ? agent : undefined,
    });
    return ok(result);
  });
}
