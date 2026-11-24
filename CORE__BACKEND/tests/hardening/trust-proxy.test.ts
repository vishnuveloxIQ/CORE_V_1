import type { CoreApp } from '../../src/http/app.js';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { parseTrustProxy } from '../../src/config/trust-proxy.js';

// Phase N decision 2: trust proxy is off unless TRUST_PROXY lists the load balancers. Example addresses are fictional
// (RFC 5737 documentation ranges and private ranges).

const base = { NODE_ENV: 'test', LOG_LEVEL: 'silent' } as const;

describe('TRUST_PROXY parsing (hardening)', () => {
  it('is off when unset or blank', () => {
    expect(parseTrustProxy(undefined)).toEqual([]);
    expect(parseTrustProxy('  ')).toEqual([]);
  });

  it('accepts IP addresses and CIDR ranges, comma-separated', () => {
    expect(parseTrustProxy('10.0.0.5, 192.0.2.0/24 ,2001:db8::/32')).toEqual([
      '10.0.0.5',
      '192.0.2.0/24',
      '2001:db8::/32',
    ]);
  });

  it.each(['0.0.0.0/0', 'loopback', 'not-an-ip', '10.0.0.0/33', '10.0.0.0/8/8', '10.0.0.0/'])(
    'refuses %s',
    (value) => {
      expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY/);
      expect(() => loadEnv({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    },
  );
});

describe('client address with trust proxy (hardening)', () => {
  const probe = (app: CoreApp) =>
    app.get('/__client-address', async (request) => ({ ip: request.ip }));

  it('uses the forwarded address only when the socket is a listed proxy', async () => {
    const app = buildApp({ env: loadEnv({ ...base, TRUST_PROXY: '10.0.0.0/8' }) });
    probe(app);
    try {
      const fromProxy = await app.inject({
        method: 'GET',
        url: '/__client-address',
        remoteAddress: '10.1.2.3',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      expect(fromProxy.json()).toEqual({ ip: '203.0.113.9' });

      const spoofed = await app.inject({
        method: 'GET',
        url: '/__client-address',
        remoteAddress: '198.51.100.7',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      expect(spoofed.json()).toEqual({ ip: '198.51.100.7' });
    } finally {
      await app.close();
    }
  });

  it('ignores forwarded headers when TRUST_PROXY is unset', async () => {
    const app = buildApp({ env: loadEnv(base) });
    probe(app);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__client-address',
        remoteAddress: '10.1.2.3',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      expect(res.json()).toEqual({ ip: '10.1.2.3' });
    } finally {
      await app.close();
    }
  });
});
