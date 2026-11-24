import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/core/errors.js';
import {
  assertPasswordPolicy,
  dummySecretHash,
  hashSecret,
  pinSchema,
  verifySecret,
} from '../../src/core/password.js';

describe('argon2id hashing', () => {
  it('stores an encoded argon2id hash with the configured settings', async () => {
    const hash = await hashSecret('correct horse battery');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });

  it('uses a fresh salt, so the same secret gives different hashes', async () => {
    const a = await hashSecret('same secret value');
    const b = await hashSecret('same secret value');
    expect(a).not.toBe(b);
  });

  it('verifies the right secret and rejects the wrong one', async () => {
    const hash = await hashSecret('correct horse battery');
    expect(await verifySecret('correct horse battery', hash)).toBe(true);
    expect(await verifySecret('correct horse batterx', hash)).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifySecret('anything', 'not-a-hash')).toBe(false);
  });

  it('computes the dummy hash once and it matches no realistic secret', async () => {
    const first = await dummySecretHash();
    expect(first).toBe(await dummySecretHash());
    expect(await verifySecret('123456', first)).toBe(false);
  });
});

describe('password policy', () => {
  it('rejects a password shorter than 12 characters', () => {
    expect(() => assertPasswordPolicy('x'.repeat(11), 'pavan')).toThrow(AppError);
  });

  it('accepts a password of exactly 12 characters', () => {
    expect(() => assertPasswordPolicy('x'.repeat(12), 'pavan')).not.toThrow();
  });

  it('rejects a password longer than 128 characters', () => {
    expect(() => assertPasswordPolicy('x'.repeat(129), 'pavan')).toThrow(AppError);
  });

  it('rejects a password equal to the login id, ignoring case', () => {
    expect(() => assertPasswordPolicy('Pavan.Login01', 'pavan.login01')).toThrow(AppError);
  });

  it('does not put the password in the error', () => {
    try {
      assertPasswordPolicy('short', 'pavan');
      expect.unreachable();
    } catch (err) {
      expect(JSON.stringify((err as AppError).details)).not.toContain('short');
    }
  });
});

describe('PIN format', () => {
  it.each(['1234', '123456', '000000'])('accepts %s', (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(true);
  });

  it.each(['123', '1234567', '12a4', ' 1234', ''])('rejects %j', (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });
});
