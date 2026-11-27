import { z } from 'zod';
import { isValidTenantId } from '../../db/migrate.js';
import { AppError } from '../../core/errors.js';

/** The signed-in administrator's own name, email and mobile number (ten digits, India, as at registration). */
export const ownDetailsBodySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(200),
  email: z.email('Enter a valid email address.').max(254),
  phone: z.string().regex(/^\d{10}$/, 'Enter the 10-digit mobile number.'),
});

export const loginBodySchema = z.object({
  loginId: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
  deviceLabel: z.string().trim().max(100).optional(),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).max(200),
});

export const passwordResetRequestBodySchema = z.object({
  loginId: z.string().trim().min(1).max(254),
});

/** The new password is checked against the policy in the service, after this shape check. */
export const passwordResetConfirmBodySchema = z.object({
  loginId: z.string().trim().min(1).max(254),
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
  newPassword: z.string().min(1).max(256),
});

/** POST /auth/change-password. The new password is checked against the policy in the service, after this shape check. */
export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
  })
  .strict();

const base64UrlText = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+$/, 'must be base64url text');

/** Shape of the browser's registration answer. The library does the cryptographic checks. */
const registrationResponseSchema = z.object({
  id: base64UrlText,
  rawId: base64UrlText,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.object({
    clientDataJSON: base64UrlText,
    attestationObject: base64UrlText,
    transports: z.array(z.string().min(1).max(32)).max(10).optional(),
  }),
});

/** Shape of the browser's sign-in answer. The library does the cryptographic checks. */
const authenticationResponseSchema = z.object({
  id: base64UrlText,
  rawId: base64UrlText,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.object({
    clientDataJSON: base64UrlText,
    authenticatorData: base64UrlText,
    signature: base64UrlText,
    userHandle: z.string().max(1024).nullish(),
  }),
});

export const passkeyRegisterVerifyBodySchema = z.object({
  response: registrationResponseSchema,
  label: z.string().trim().min(1).max(100).optional(),
});

export const passkeyLoginOptionsBodySchema = z.object({
  loginId: z.string().trim().min(1).max(254),
});

export const passkeyLoginVerifyBodySchema = z.object({
  loginId: z.string().trim().min(1).max(254),
  response: authenticationResponseSchema,
  deviceLabel: z.string().trim().max(100).optional(),
});

export const passkeyIdParamsSchema = z.object({
  id: z.uuid(),
});

/**
 * Reads the tenant for login and refresh from the X-Tenant-Id header. Those requests have no
 * token yet, so the tenant comes from the request. Every other route takes it from the verified token.
 */
export function tenantFromHeader(value: unknown): string {
  if (typeof value !== 'string' || !isValidTenantId(value)) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'X-Tenant-Id header is required and must be a valid tenant id',
    );
  }
  return value;
}
