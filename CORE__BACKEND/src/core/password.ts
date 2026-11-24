import { randomBytes, randomInt } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { z } from 'zod';
import { AppError } from './errors.js';

/** Length of a server-generated temporary password. Above the policy minimum. */
export const TEMPORARY_PASSWORD_LENGTH = 16;

// Character classes for temporary passwords. Look-alike characters (0, O, 1, l, I) are left out so a password read
// aloud or copied by hand is typed correctly.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '@#%+=?!';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(chars: string): string {
  return chars.charAt(randomInt(0, chars.length));
}

/**
 * A temporary password from a cryptographic random source: 16 characters with at least one upper case letter, lower
 * case letter, digit and symbol, shuffled. The caller hashes it, returns it once, and never logs or stores it.
 */
export function generateTemporaryPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < TEMPORARY_PASSWORD_LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/**
 * argon2id settings for passwords and PINs (Phase 4a design defaults, proposed 2026-11-19).
 * Stored inside each encoded hash, so existing hashes keep verifying if these change later.
 */
export const ARGON2_PARAMS = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const SALT_BYTES = 16;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'must be 4 to 6 digits');

/**
 * Checks a new password against the policy: length, and not the same as the login id.
 * Throws a 400 VALIDATION_ERROR. The password is never part of the error.
 */
export function assertPasswordPolicy(password: string, loginId: string): void {
  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 400, 'Password does not meet the policy', {
      issues: [{ path: 'password', message: result.error.issues[0]?.message ?? 'invalid' }],
    });
  }
  if (password.toLowerCase() === loginId.toLowerCase()) {
    throw new AppError('VALIDATION_ERROR', 400, 'Password does not meet the policy', {
      issues: [{ path: 'password', message: 'must differ from the login id' }],
    });
  }
}

/** Hashes a password or PIN with argon2id. The result is the encoded string that is stored. */
export async function hashSecret(secret: string): Promise<string> {
  return argon2id({
    password: secret,
    salt: randomBytes(SALT_BYTES),
    outputType: 'encoded',
    ...ARGON2_PARAMS,
  });
}

/** True when the secret matches the encoded hash. A malformed hash returns false instead of throwing. */
export async function verifySecret(secret: string, encodedHash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: secret, hash: encodedHash });
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A hash that matches no real secret. Login verifies against it when the login id is unknown,
 * so an unknown login takes about as long as a wrong password.
 */
export function dummySecretHash(): Promise<string> {
  dummyHash ??= hashSecret(randomBytes(32).toString('hex'));
  return dummyHash;
}
