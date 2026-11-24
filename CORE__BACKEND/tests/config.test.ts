import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      SESSION_DEVICE_LIMIT: 1,
      APPROVAL_REMINDER_MINUTES: 15,
    });
  });

  it('coerces PORT from a string', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects an invalid PORT with a message that names the variable', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires JWT_SECRET in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('accepts a JWT_SECRET of at least 32 characters outside production', () => {
    expect(loadEnv({ JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toBe('x'.repeat(32));
  });

  it('rejects a JWT_SECRET shorter than 32 characters without printing it', () => {
    let message = '';
    try {
      loadEnv({ JWT_SECRET: 'short-secret-value' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain('short-secret-value');
  });
});
