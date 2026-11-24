import { AppError } from './errors.js';

/**
 * The row with this id from the module's list, or the 404 a single-record read gives. The single-record routes read
 * the same rows as their list, so a detail answer has the same shape as a list item.
 */
export function rowById<T extends { id: unknown }>(rows: readonly T[], id: string, label: string): T {
  const found = rows.find((row) => row.id === id);
  if (!found) {
    throw new AppError('NOT_FOUND', 404, `${label} not found`);
  }
  return found;
}
