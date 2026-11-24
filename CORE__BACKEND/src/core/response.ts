export interface SuccessBody<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Success envelope: { data, meta? }. */
export function ok<T>(data: T, meta?: Record<string, unknown>): SuccessBody<T> {
  return meta === undefined ? { data } : { data, meta };
}

/** Error envelope: { error: { code, message, details? } }. */
export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
