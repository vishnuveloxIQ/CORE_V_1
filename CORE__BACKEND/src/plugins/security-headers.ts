import type { CoreApp } from '../http/app.js';

/**
 * Adds fixed security headers to every response (Phase N, design default a). This is a JSON API, so the
 * CSP forbids everything. Strict-Transport-Security is sent only in production, where TLS is expected.
 */
export function registerSecurityHeaders(
  app: CoreApp,
  options: { production: boolean },
): void {
  const headers: Array<[string, string]> = [
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'no-referrer'],
    ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"],
    ['Cross-Origin-Resource-Policy', 'same-origin'],
    ['Cache-Control', 'no-store'],
  ];
  if (options.production) {
    headers.push(['Strict-Transport-Security', 'max-age=31536000']);
  }

  app.addHook('onRequest', async (_request, reply) => {
    for (const [name, value] of headers) {
      reply.header(name, value);
    }
    reply.removeHeader('X-Powered-By');
  });
}
