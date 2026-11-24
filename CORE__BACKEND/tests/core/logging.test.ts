import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

describe('log redaction', () => {
  it('never writes secrets from headers or log objects to the log', async () => {
    const lines: string[] = [];
    const app = buildApp({
      env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info' }),
      logStream: { write: (line: string) => lines.push(line) },
    });
    app.get('/log', async (request) => {
      request.log.info(
        {
          password: 'hunter2',
          pin_hash: 'pinhashvalue',
          nested: { refresh_token: 'refreshvalue', pan: 'ABCDE1234F' },
          visible: 42,
        },
        'login attempt',
      );
      return { data: 'logged' };
    });

    await app.inject({
      method: 'GET',
      url: '/log',
      headers: { authorization: 'Bearer bearersecret', cookie: 'session=cookiesecret' },
    });
    await app.close();

    const output = lines.join('\n');
    expect(output).toContain('login attempt');
    expect(output).toContain('"visible":42');
    expect(output).toContain('[REDACTED]');
    for (const secret of [
      'hunter2',
      'pinhashvalue',
      'refreshvalue',
      'ABCDE1234F',
      'bearersecret',
      'cookiesecret',
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
