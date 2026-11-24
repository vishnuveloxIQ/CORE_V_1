import { createApp, type CoreApp } from './http/app.js';
import type { Pool } from 'pg';
import { sampleOtpCodeFrom, type Env } from './config/env.js';
import type { RateLimitRule } from './core/rate-limit.js';
import { PostgresRateLimiter } from './core/rate-limit-store.js';
import { registerErrorHandler } from './core/error-handler.js';
import { registerHealthRoutes, type ReadinessCheck } from './core/health.js';
import { loggerRedactPaths, REDACTED } from './core/redaction.js';
import { registerAccessRoutes } from './modules/access/routes.js';
import { registerAuditLogRoutes } from './modules/audit-log/routes.js';
import { registerBoqRoutes } from './modules/boq/routes.js';
import { registerEquipmentUnitRoutes } from './modules/equipment-units/routes.js';
import { registerMaintenanceRoutes } from './modules/maintenance/routes.js';
import { registerIntegrationRoutes } from './modules/integration/routes.js';
import { registerSearchRoutes } from './modules/search/routes.js';
import { registerOfferLetterRoutes } from './modules/offer-letter/routes.js';
import { webauthnConfigFrom } from './modules/auth/passkey.js';
import { createSampleOtpDelivery, type OtpDelivery } from './modules/auth/password-reset.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { signingKeyFrom } from './modules/auth/tokens.js';
import { registerMastersRoutes } from './modules/masters/routes.js';
import { registerApprovalsRoutes } from './modules/approvals/routes.js';
import { registerRecordsRoutes } from './modules/records/routes.js';
import { registerPoliciesRoutes } from './modules/policies/routes.js';
import { registerOfflineRoutes } from './modules/offline/routes.js';
import { registerOrganisationRoutes } from './modules/organisation/routes.js';
import { registerProjectsRoutes } from './modules/projects/routes.js';
import { registerUomRoutes } from './modules/uoms/routes.js';
import { trustProxyFrom } from './config/trust-proxy.js';
import { registerApiDocs } from './plugins/api-docs.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerCors } from './plugins/cors.js';
import { registerGlobalRateLimit } from './plugins/rate-limit.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';
import { version } from './version.js';

export interface BuildAppOptions {
  env: Env;
  readinessChecks?: ReadinessCheck[];
  /** Receives log lines instead of stdout. Tests use it to check what gets logged. */
  logStream?: { write(line: string): void };
  /** Enables the auth routes. Without a pool the app has no login and no database access. */
  pool?: Pool | undefined;
  /** Sends password reset codes. Without it, the sample code is used outside production; otherwise reset answers 503. */
  otpDelivery?: OtpDelivery | undefined;
  /** Overrides the global per-IP limit. Tests use it to make the limit reachable. */
  globalRateLimit?: RateLimitRule | undefined;
}

/** Builds the Express app (through the HTTP layer in src/http/app.ts) without listening, so tests can call app.inject(). */
export function buildApp({
  env,
  readinessChecks = [],
  logStream,
  pool,
  otpDelivery,
  globalRateLimit,
}: BuildAppOptions): CoreApp {
  const app = createApp({
    trustProxy: trustProxyFrom(env.TRUST_PROXY),
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: loggerRedactPaths(), censor: REDACTED },
      stream: logStream,
    },
  });

  registerSecurityHeaders(app, { production: env.NODE_ENV === 'production' });
  registerCors(app, env.CORS_ORIGINS ?? []);
  registerGlobalRateLimit(app, {
    rule: globalRateLimit,
    limiter: pool ? new PostgresRateLimiter(pool) : undefined,
  });
  // Before registerOpenApi: its route hook must not list /docs in the OpenAPI document.
  registerApiDocs(app, { production: env.NODE_ENV === 'production' });
  registerOpenApi(app, { version });
  registerErrorHandler(app);
  registerHealthRoutes(app, readinessChecks);
  registerOfflineRoutes(app);
  if (pool) {
    const signingKey = signingKeyFrom(env.JWT_SECRET, () =>
      app.log.warn('JWT_SECRET is not set: using a random signing key, so tokens end at restart'),
    );
    // A real delivery wins; otherwise, outside production, the sample code (owner decision D10).
    const sampleCode = sampleOtpCodeFrom(env);
    const delivery = otpDelivery ?? (sampleCode ? createSampleOtpDelivery(sampleCode, app.log) : undefined);
    if (!otpDelivery && sampleCode) {
      app.log.warn('Password reset uses the sample one-time code: no email is sent (not for production)');
    }
    registerAuthRoutes(app, {
      pool,
      signingKey,
      otpDelivery: delivery,
      webauthn: webauthnConfigFrom(env),
      deviceLimit: env.SESSION_DEVICE_LIMIT,
    });
    registerAccessRoutes(app, { pool, signingKey });
    registerOrganisationRoutes(app, { pool, signingKey });
    registerProjectsRoutes(app, { pool, signingKey });
    registerBoqRoutes(app, { pool, signingKey });
    registerMastersRoutes(app, { pool, signingKey });
    registerPoliciesRoutes(app, { pool, signingKey });
    registerApprovalsRoutes(app, { pool, signingKey });
    registerRecordsRoutes(app, { pool, signingKey });
    registerAuditLogRoutes(app, { pool, signingKey });
    registerEquipmentUnitRoutes(app, { pool, signingKey });
    registerMaintenanceRoutes(app, { pool, signingKey });
    registerIntegrationRoutes(app, { pool, signingKey });
    registerSearchRoutes(app, { pool, signingKey });
    registerOfferLetterRoutes(app, { pool, signingKey });
    registerUomRoutes(app, { pool, signingKey });
  }
  return app;
}
