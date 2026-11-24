import { api } from '@/shared/lib/api'

/**
 * Offer letter revision history (/offer-letter/revisions). Every upload of the offer letter is kept as a revision with
 * its number, file, uploader and date; nothing is deleted. Both calls need organisation.manage on the server.
 */

/** One revision as the server sends it (camelCase). */
export interface OfferLetterRevisionRecord {
  id: string
  revision: number
  fileId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  /** the uploader's name, else their login, else null */
  createdBy: string | null
  /** true when the file's bytes are stored (GET /files/{id}/content can serve them) */
  hasContent: boolean
}

/** One revision as the screen reads it. */
export interface OfferLetterRevision {
  id: string
  revision: number
  fileId: string
  fileName: string
  mimeType: string
  size: number
  /** null when the uploader is unknown: shown as "Unknown" */
  uploadedBy: string | null
  createdAt: string
  hasContent: boolean
}

/** Maps a server revision to the screen shape. The size is read as a number even if it arrives as text. */
export const offerLetterRevisionFrom = (r: OfferLetterRevisionRecord): OfferLetterRevision => ({
  id: r.id,
  revision: r.revision,
  fileId: r.fileId,
  fileName: r.fileName,
  mimeType: r.mimeType,
  size: Number(r.sizeBytes) || 0,
  uploadedBy: r.createdBy ?? null,
  createdAt: r.createdAt,
  hasContent: r.hasContent === true,
})

/** GET /offer-letter/revisions: newest first. Throws ApiError (403 without organisation.manage). */
export const listOfferLetterRevisions = async (): Promise<OfferLetterRevision[]> =>
  (await api<OfferLetterRevisionRecord[]>('GET', '/offer-letter/revisions')).map(offerLetterRevisionFrom)

/** POST /offer-letter/revisions: records the stored file as the next revision. The key makes a retry safe. */
export const addOfferLetterRevision = async (
  v: { fileId: string; fileName: string; mimeType: string; size: number },
  idempotencyKey?: string,
): Promise<OfferLetterRevision> =>
  offerLetterRevisionFrom(
    await api<OfferLetterRevisionRecord>('POST', '/offer-letter/revisions', {
      body: { fileId: v.fileId, fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.size },
      idempotencyKey,
    }),
  )
