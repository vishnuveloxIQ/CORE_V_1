import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

const app = buildApp({ env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });

afterAll(async () => {
  await app.close();
});

const validOperation = {
  clientDeviceKey: 'device-1',
  clientOperationKey: 'op-1',
  operationType: 'attendance.punch',
  capturedAt: '2026-11-19T08:30:00Z',
  payload: { lat: 12.97, lng: 77.59 },
};

describe('POST /offline-operations skeleton', () => {
  it('returns 400 for an invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/offline-operations',
      payload: { ...validOperation, capturedAt: 'yesterday' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 501 for a valid body until authentication exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/offline-operations',
      payload: validOperation,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_IMPLEMENTED' } });
  });
});
