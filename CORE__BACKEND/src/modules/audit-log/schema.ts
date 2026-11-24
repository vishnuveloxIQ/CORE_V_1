import { z } from 'zod';

/** The action filter takes the frontend verbs. They map to the stored op: created is INSERT, and so on. */
export const AUDIT_ACTIONS = ['created', 'updated', 'deleted'] as const;

/** The modules whose activity the trail holds: CORE itself and the four modules that send entries to it. */
export const AUDIT_MODULES = ['core', 'hrms', 'pm', 'pms', 'stores'] as const;

/**
 * GET /audit-log query. from and to are calendar dates (YYYY-MM-DD) matched on the change time, inclusive, in UTC.
 * entityType is a table name such as core_vendor. actor matches the actor's name or login, case-insensitively.
 * limit defaults to 50 and is at most 200. offset is the number of rows to skip.
 */
export const auditListQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    entityType: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z_]+$/, 'must be a table name in lower case, for example core_vendor')
      .optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    module: z.enum(AUDIT_MODULES).optional(),
    actor: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

export type AuditListQuery = z.infer<typeof auditListQuery>;

/**
 * POST /audit-log/external: one entry from another module's own audit trail (a sign-in in HRMS, a request raised in
 * PMS). CORE stores it in the same tamper-evident chain as its own entries and shows it in the trail. summary is the
 * sentence a reader sees; details are extra fields kept with the entry. Secrets must not be sent: sensitive keys are
 * redacted on the way in, as for CORE's own entries.
 */
export const externalAuditBody = z
  .object({
    sourceModule: z.enum(['hrms', 'pm', 'pms', 'stores']),
    action: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z_]+$/, 'lower-case words joined by underscores, for example signed_in'),
    entityType: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z_]+$/, 'lower-case words joined by underscores, for example leave_request'),
    recordRef: z.string().trim().min(1).max(100).nullable().optional(),
    actorName: z.string().trim().min(1).max(200),
    actorLogin: z.string().trim().min(1).max(100).nullable().optional(),
    summary: z.string().trim().min(1).max(300),
    occurredAt: z.iso.datetime(),
    // the sending module's own correlation id, so one action can be followed across systems; CORE's request id is used when absent
    correlationId: z.string().trim().min(1).max(100).nullable().optional(),
    details: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type ExternalAuditInput = z.infer<typeof externalAuditBody>;

/**
 * The sign-in and access events GET /audit-log/auth-events shows. otp_issued and passkey_challenge are left out:
 * they are internal rows that hold a code hash or a challenge, not events a reader needs.
 */
export const AUTH_EVENT_TYPES = [
  'login_success',
  'login_failure',
  'login_locked',
  'refresh',
  'refresh_reuse',
  'logout',
  'otp_verified',
  'otp_failed',
  'password_reset',
  'password_admin_reset',
  'password_changed',
  'password_change_failure',
  'passkey_login_success',
  'passkey_login_failure',
  'passkey_registered',
  'passkey_removed',
  'session_revoked',
  'session_limit_revoked',
  'step_up_success',
  'step_up_failure',
  'access_denied',
] as const;

/** GET /audit-log/auth-events query. from, to, actor, limit and offset behave as in auditListQuery. */
export const authEventsQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    eventType: z.enum(AUTH_EVENT_TYPES).optional(),
    module: z.enum(AUDIT_MODULES).optional(),
    actor: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

export type AuthEventsQuery = z.infer<typeof authEventsQuery>;
