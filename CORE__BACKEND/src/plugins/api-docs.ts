import type { CoreApp } from '../http/app.js';

/** Swagger UI build served from jsDelivr. Pinned: a published version at least two weeks old. */
const SWAGGER_UI_VERSION = '5.34.1';

/**
 * Serves GET /docs, a browser page for trying every endpoint in the OpenAPI document. Development only:
 * in production the route does not exist.
 *
 * The page sends X-Tenant-Id (from ?tenant=..., default "acme") and an Idempotency-Key on every POST and
 * PATCH, so the tenant header and the key are not typed for each call. Sign in with Authorize, using the
 * accessToken from POST /auth/login.
 *
 * The global CSP forbids scripts. This route overrides it with a policy that allows only the Swagger UI
 * files from jsDelivr and the inline bootstrap script below. Other routes keep the strict policy.
 */
export function registerApiDocs(app: CoreApp, options: { production: boolean }): void {
  if (options.production) {
    return;
  }

  const cdn = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
  const csp = [
    "default-src 'none'",
    `script-src ${cdn}/swagger-ui-bundle.js 'unsafe-inline'`,
    `style-src ${cdn}/swagger-ui.css 'unsafe-inline'`,
    `img-src 'self' data: ${cdn}/`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VeloxIQ Core API</title>
  <link rel="stylesheet" href="${cdn}/swagger-ui.css">
  <style>body { margin: 0; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${cdn}/swagger-ui-bundle.js"></script>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var tenant = params.get('tenant') || 'acme';
      var writeMethods = { POST: true, PATCH: true };

      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        requestInterceptor: function (req) {
          req.headers['X-Tenant-Id'] = tenant;
          if (writeMethods[req.method] && !req.headers['Idempotency-Key']) {
            req.headers['Idempotency-Key'] = (window.crypto && crypto.randomUUID)
              ? crypto.randomUUID()
              : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
          }
          return req;
        },
      });
    })();
  </script>
</body>
</html>`;

  app.get('/docs', async (_request, reply) => {
    reply.header('Content-Security-Policy', csp);
    reply.type('text/html; charset=utf-8');
    return page;
  });
}
