import type { HttpError, CoreApp } from '../http/app.js';
import { AppError } from './errors.js';
import { errorBody } from './response.js';

/**
 * One global handler for every error. Client-facing text is limited to AppError messages and
 * the HTTP layer's own 4xx messages. Anything else becomes a generic 500; the real error is logged server-side only.
 */
export function registerErrorHandler(app: CoreApp): void {
  app.setErrorHandler((error: HttpError, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.status).send(errorBody(error.code, error.message, error.details));
      return;
    }

    const status = error.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      reply.code(status).send(errorBody('REQUEST_ERROR', error.message));
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', 'Route not found'));
  });
}
