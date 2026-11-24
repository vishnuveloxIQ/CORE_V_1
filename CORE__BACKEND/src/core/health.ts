import type { CoreApp } from '../http/app.js';

export interface ReadinessCheck {
  name: string;
  run: () => Promise<void>;
}

/**
 * GET /health       liveness: the process is up.
 * GET /health/ready readiness: every registered check passes (503 otherwise).
 * Error text from checks is never returned; it could contain connection details.
 */
export function registerHealthRoutes(
  app: CoreApp,
  checks: readonly ReadinessCheck[],
): void {
  app.get('/health', async () => ({ data: { status: 'ok' } }));

  app.get('/health/ready', async (_request, reply) => {
    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          await check.run();
          return { name: check.name, status: 'ok' as const };
        } catch {
          app.log.warn({ check: check.name }, 'readiness check failed');
          return { name: check.name, status: 'fail' as const };
        }
      }),
    );
    const ready = results.every((result) => result.status === 'ok');
    reply.code(ready ? 200 : 503);
    return { data: { status: ready ? 'ok' : 'fail', checks: results } };
  });
}
