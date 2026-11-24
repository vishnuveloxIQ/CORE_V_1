/** Replacement text for any redacted value. */
export const REDACTED = '[REDACTED]';

/**
 * Keys whose values must never reach logs or audit snapshots. Matched case-insensitively.
 * Keep this list in step with loggerRedactPaths() below, which is generated from it.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'password_hash',
  'pin',
  'pin_hash',
  'otp',
  'otp_secret',
  'secret',
  'secret_hash',
  'token',
  'access_token',
  'refresh_token',
  'refresh_hash',
  'pan',
  'gstin',
  'account_no',
  'account_number',
  'ifsc',
  // Password fields of the admin user routes and the change-password route (camelCase, as the API spells them).
  'temporaryPassword',
  'currentPassword',
  'newPassword',
];

const SENSITIVE_LOWER: readonly string[] = SENSITIVE_KEYS.map((key) => key.toLowerCase());
const SENSITIVE_SUFFIXES = ['_hash', '_secret', '_token'];

/** True for a key that must be redacted: listed above, or ending in _hash, _secret or _token. */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_LOWER.includes(lower) || SENSITIVE_SUFFIXES.some((s) => lower.endsWith(s));
}

/**
 * Pino redact paths for the app logger. Each sensitive key is matched at the top level,
 * one level down and two levels down, and HTTP credential headers are always redacted.
 */
export function loggerRedactPaths(): string[] {
  const paths = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'];
  for (const key of SENSITIVE_KEYS) {
    paths.push(key, `*.${key}`, `*.*.${key}`);
  }
  return paths;
}
