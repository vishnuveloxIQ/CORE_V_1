/**
 * An error the API can show to a client. `code` is a stable identifier, `message` is safe to display,
 * and `details` must never contain secrets, SQL or stack traces.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
