import { z } from 'zod';

/** The owner of an offer letter's file row. The frontend uses this fixed owner for every offer letter (files.ts). */
export const OFFER_LETTER_OWNER_TYPE = 'offer_letter';
export const OFFER_LETTER_OWNER_ID = '00000000-0000-4000-8000-00000000f0f1';

/** Body of POST /offer-letter/revisions: the file row the bytes were stored in, and its metadata. */
export const revisionCreateBody = z
  .object({
    fileId: z.uuid(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(127),
    sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type RevisionCreateInput = z.infer<typeof revisionCreateBody>;
