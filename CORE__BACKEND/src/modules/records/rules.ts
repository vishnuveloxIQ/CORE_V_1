/** Pure rules for the records tables (Phase 5f). No database access. */

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** A file checksum is 64 lowercase hex characters (design point b). */
export function isSha256(value: string): boolean {
  return SHA256_PATTERN.test(value);
}

/** Largest file the content routes accept, in bytes (2 MB). Checked before the bytes are stored. */
export const FILE_CONTENT_MAX_BYTES = 2 * 1024 * 1024;

/** Media types the content routes accept. Anything else is refused with UNSUPPORTED_FILE_TYPE. */
export const FILE_CONTENT_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** The media type of a Content-Type header or stored value: parameters dropped, trimmed, lowercase. */
export function mediaTypeOf(value: string | undefined): string {
  return (value ?? '').split(';')[0]!.trim().toLowerCase();
}

export function isAllowedFileContentType(mediaType: string): boolean {
  return FILE_CONTENT_TYPES.includes(mediaType);
}

const CLOSING_GRIEVANCE_STATUSES: readonly string[] = ['resolved', 'closed'];

/**
 * The closed-at value for a grievance in a given status (design point d). A resolved or closed grievance keeps the
 * time it was first closed, so moving between the two does not restart the clock. Any other status clears it.
 */
export function closedAtFor(
  status: string,
  currentClosedAt: Date | string | null,
  now: Date,
): Date | string | null {
  if (!CLOSING_GRIEVANCE_STATUSES.includes(status)) return null;
  return currentClosedAt ?? now;
}

/** An import batch takes rows and can be submitted only while it is a draft (design point g). */
export function isDraft(status: string): boolean {
  return status === 'draft';
}
