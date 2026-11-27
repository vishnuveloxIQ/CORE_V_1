import type { Pool } from 'pg';
import type { CoreApp } from '../../http/app.js';
import { AppError } from '../../core/errors.js';
import { parseInput } from '../../core/validation.js';
import { ok } from '../../core/response.js';
import { PostgresRateLimiter } from '../../core/rate-limit-store.js';
import { registerBody, registrationOtpBody } from './schema.js';
import { issueRegistrationOtp, registerCompany } from './service.js';

export interface RegistrationRouteOptions {
  /** The application connection (core_app_login). */
  pool: Pool;
  /** The schema-creation connection (PROVISION_DATABASE_URL). Undefined means registration is not set up. */
  provisionPool?: Pool | undefined;
  /** NODE_ENV, so codes are never shown outside development. */
  environment: string;
}

/** Per client address, shared through PostgreSQL so the limit holds across instances. */
const IP_RULE = { limit: 20, windowMs: 15 * 60 * 1000 };
const REGISTER_IP_RULE = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * Self-service registration (public): POST /auth/register/otp sends a code to an email address or a mobile number;
 * POST /auth/register creates the company, its first administrator and its directory entry.
 */
export function registerRegistrationRoutes(app: CoreApp, options: RegistrationRouteOptions): void {
  const limiter = new PostgresRateLimiter(options.pool);

  app.post('/auth/register/otp', { config: { openapi: { summary: 'POST /auth/register/otp', body: registrationOtpBody } } }, async (request, reply) => {
    const body = parseInput(registrationOtpBody, request.body);
    const decision = await limiter.hit(`register-otp:ip:${request.ip}`, IP_RULE);
    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Try again later.', {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
    const result = await issueRegistrationOtp(options.pool, request.log, options.environment, body);
    return ok(result);
  });

  app.post('/auth/register', { config: { openapi: { summary: 'POST /auth/register', body: registerBody } } }, async (request, reply) => {
    const body = parseInput(registerBody, request.body);
    const decision = await limiter.hit(`register:ip:${request.ip}`, REGISTER_IP_RULE);
    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Try again later.', {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
    const result = await registerCompany(options.pool, options.provisionPool, body);
    return reply.code(201).send(ok(result));
  });
}
