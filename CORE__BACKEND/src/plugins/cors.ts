import type { CoreApp } from '../http/app.js';

// Browser access for the front end (CORS). Only the origins in CORS_ORIGINS get the headers. The API uses
// bearer tokens in the Authorization header, not cookies, so credentials are not allowed.

export const CORS_ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type, Idempotency-Key, X-Request-Id, X-Step-Up-Token, X-Tenant-Id';
/** Response headers the browser may read: the request ID (support reference) and Retry-After (429). */
export const CORS_EXPOSED_HEADERS = 'Retry-After, X-Request-Id';
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Adds CORS headers for allowed origins and answers preflight requests. Other origins get no CORS headers, so
 * the browser blocks their reads. Registered before the rate limit, so a 429 still carries the headers.
 */
export function registerCors(app: CoreApp, origins: readonly string[]): void {
  if (origins.length === 0) {
    return;
  }
  const allowed = new Set(origins);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !allowed.has(origin)) {
      return;
    }
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Expose-Headers', CORS_EXPOSED_HEADERS);

    const isPreflight =
      request.method === 'OPTIONS' &&
      request.headers['access-control-request-method'] !== undefined;
    if (isPreflight) {
      reply.header('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS);
      reply.header('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS);
      reply.header('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
      return reply.code(204).send();
    }
  });
}
