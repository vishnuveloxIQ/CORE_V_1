import { z } from 'zod';
import { parseTrustProxy } from './trust-proxy.js';

/** True only for a bare origin (scheme, host and port). A malformed value returns false instead of throwing. */
function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Optional until the app needs the database. Never log this value: it contains the password.
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must start with postgres:// or postgresql://')
      .optional(),
    // Used only by self-service registration to create a new company's schema (it needs schema-creation rights, which
    // the application login does not have). Optional: without it, registration is refused. Never log this value.
    PROVISION_DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must start with postgres:// or postgresql://')
      .optional(),
    // How long a locked account stays locked, and the length of the sign-in rate-limit window, in seconds. The default
    // is 15 minutes (production). Set it to 5 in development to stop waiting out a lock.
    AUTH_LOCK_SECONDS: z.coerce.number().int().min(1).max(86_400).default(900),
    // How long a password-reset code stays usable, in minutes. The default is 5 (production). Development sets 60
    // so a tester is not caught out by a code that expired while they were typing.
    OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
    // Signs access tokens (HS256). Never log this value. Required in production.
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    // WebAuthn relying party (Phase 4c). RP ID is the bare domain. Origins are comma-separated full URLs.
    // Defaults to localhost outside production; required in production.
    WEBAUTHN_RP_ID: z.string().trim().min(1).optional(),
    WEBAUTHN_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(z.url()).min(1, 'must list at least one origin'))
      .optional(),
    // Front-end origins allowed to call the API from a browser: full origins, comma-separated, no wildcard, no path.
    // Unset means no browser origin is allowed.
    CORS_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(
        z.array(z.url()).refine((origins) => origins.every(isOrigin), {
          message:
            'each entry must be an origin (scheme, host and port) with no path or trailing slash',
        }),
      )
      .optional(),
    // Most devices one user may be signed in on at once. Owner decision (2026-11-21): one active session per user, so a
    // new sign-in signs out the user's other session. Kept as a setting so a later decision can change it.
    SESSION_DEVICE_LIMIT: z.coerce.number().int().min(1).max(100).default(1),
    // How often the approval reminder sweep runs, in minutes (owner decision: remind, never escalate). 0 turns it off,
    // for example when an external scheduler runs `npm run approvals:remind` instead.
    APPROVAL_REMINDER_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),
    // Owner decision D10: until an email provider is chosen, password reset uses this fixed six-digit sample code
    // and sends nothing. Development uses 123456 when it is unset (see sampleOtpCodeFrom); production refuses it.
    SAMPLE_OTP_CODE: z
      .string()
      .regex(/^\d{6}$/, 'must be six digits')
      .optional(),
    // Load balancer addresses or CIDR ranges allowed to set X-Forwarded-For (Phase N decision 2). Unset means off.
    TRUST_PROXY: z
      .string()
      .optional()
      .superRefine((value, ctx) => {
        try {
          parseTrustProxy(value);
        } catch (err) {
          ctx.addIssue({
            code: 'custom',
            message: err instanceof Error ? err.message : 'is invalid',
          });
        }
      }),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'is required when NODE_ENV is production',
      });
    }
    if (env.NODE_ENV === 'production' && env.SAMPLE_OTP_CODE !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SAMPLE_OTP_CODE'],
        message: 'must not be set when NODE_ENV is production: production sends real codes',
      });
    }
    if (env.NODE_ENV === 'production' && env.WEBAUTHN_RP_ID === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEBAUTHN_RP_ID'],
        message: 'is required when NODE_ENV is production',
      });
    }
    if (env.NODE_ENV === 'production' && env.WEBAUTHN_ORIGINS === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEBAUTHN_ORIGINS'],
        message: 'is required when NODE_ENV is production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** The sample code used before production: the configured one, else 123456 in development, else none. */
export const DEFAULT_SAMPLE_OTP_CODE = '123456';
export function sampleOtpCodeFrom(env: Pick<Env, 'NODE_ENV' | 'SAMPLE_OTP_CODE'>): string | undefined {
  if (env.NODE_ENV === 'production') return undefined;
  return env.SAMPLE_OTP_CODE ?? (env.NODE_ENV === 'development' ? DEFAULT_SAMPLE_OTP_CODE : undefined);
}

/** Parses and validates environment variables. Throws on invalid input so the process fails fast. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
