import type { CoreApp } from '../../http/app.js';
import { AppError } from '../../core/errors.js';
import { parseInput } from '../../core/validation.js';
import { offlineOperationSchema } from './schema.js';

/**
 * POST /offline-operations is a skeleton. The body is validated, then the request is refused with 501:
 * storing an operation needs a verified tenant from the session, which arrives with Phase 4 auth.
 */
export function registerOfflineRoutes(app: CoreApp): void {
  app.post('/offline-operations', { config: { openapi: { summary: 'POST /offline-operations', body: offlineOperationSchema } } }, async (request) => {
    parseInput(offlineOperationSchema, request.body);
    throw new AppError(
      'NOT_IMPLEMENTED',
      501,
      'Offline sync needs an authenticated tenant; it arrives with Phase 4',
    );
  });
}
