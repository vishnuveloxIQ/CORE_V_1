import type { ZodType } from 'zod';
import { AppError } from './errors.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validates untrusted input with a Zod schema at the route boundary.
 * Failures become a 400 VALIDATION_ERROR listing the field paths and messages. The rejected values are not echoed back.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  throw new AppError('VALIDATION_ERROR', 400, 'Request validation failed', { issues });
}
