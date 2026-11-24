import { api, apiBlob } from '@/shared/lib/api'
import type { OfferLetterFile } from '../types'

/**
 * File metadata (/files) and document templates (/document-templates). Bytes go through /files/{id}/content
 * (PNG, JPEG, WebP, PDF, Word; 2 MB). Offer letters and the logo use these routes.
 */
const enc = encodeURIComponent

/** Stores the bytes of a file row. Replacing the content is allowed. */
export const uploadFileContent = (id: string, blob: Blob, contentType: string, idempotencyKey?: string) =>
  api<{ id: string; sizeBytes: number; sha256: string }>('PUT', `/files/${enc(id)}/content`, { raw: { body: blob, contentType }, idempotencyKey })

/** Content types /files/{id}/content accepts, and the size limit (2 MB). */
export const UPLOAD_TYPES: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'application/pdf': 'PDF',
  'application/msword': 'Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
}
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
/** The content type to send: the browser's when it is allowed, else one from the file extension; '' when not allowed. */
export const uploadTypeOf = (name: string, type: string) =>
  UPLOAD_TYPES[type] ? type : BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
/** Why a file cannot be uploaded, or '' when it can. */
export const uploadProblem = (name: string, type: string, size: number) => {
  if (!uploadTypeOf(name, type)) return `${name} is not a PNG, JPEG, WebP, PDF or Word file.`
  if (size > MAX_UPLOAD_BYTES) return `${name} is larger than 2 MB.`
  if (size === 0) return `${name} is empty.`
  return ''
}

/** Reads the bytes of a file row. Requires sign-in; private files only for their creator or records managers. */
export const fetchFileContent = (id: string) => apiBlob(`/files/${enc(id)}/content`)

export interface FileRecord {
  id: string; ownerType: string; ownerId: string; fileName: string; contentType: string; sizeBytes: number
  objectKey: string; visibility: 'private' | 'team' | 'company'; rowVersion: number
}
export interface FileDetails { ownerType: string; ownerId: string; fileName: string; contentType: string; sizeBytes: number; objectKey: string; visibility?: FileRecord['visibility'] }

export const listFiles = (filter?: { ownerType?: string; ownerId?: string }) => {
  const q = new URLSearchParams()
  if (filter?.ownerType) q.set('ownerType', filter.ownerType)
  if (filter?.ownerId) q.set('ownerId', filter.ownerId)
  const s = q.toString()
  return api<FileRecord[]>('GET', `/files${s ? `?${s}` : ''}`)
}
export const createFile = (v: FileDetails, idempotencyKey?: string) => api<FileRecord>('POST', '/files', { body: v, idempotencyKey })
export const updateFile = (id: string, rowVersion: number, v: Partial<FileDetails>, idempotencyKey?: string) =>
  api<FileRecord>('PATCH', `/files/${enc(id)}`, { body: { ...v, rowVersion }, idempotencyKey })
export const deleteFile = (id: string) => api<{ deleted: boolean }>('DELETE', `/files/${enc(id)}`)

export interface DocumentTemplateRecord {
  id: string; code: string; name: string; templateVersion: string; status: 'draft' | 'active' | 'retired'
  fileId: string | null; fileName: string | null; mimeType: string | null; sizeBytes: number | null; revision: number
  updatedAt?: string; rowVersion: number
}
export interface TemplateDetails { code: string; name: string; templateVersion: string; status: DocumentTemplateRecord['status']; fileId: string; fileName: string; mimeType: string; sizeBytes: number; revision: number }

export const listDocumentTemplates = () => api<DocumentTemplateRecord[]>('GET', '/document-templates')
export const createDocumentTemplate = (v: TemplateDetails, idempotencyKey?: string) =>
  api<DocumentTemplateRecord>('POST', '/document-templates', { body: v, idempotencyKey })
export const updateDocumentTemplate = (id: string, rowVersion: number, v: Partial<TemplateDetails>, idempotencyKey?: string) =>
  api<DocumentTemplateRecord>('PATCH', `/document-templates/${enc(id)}`, { body: { ...v, rowVersion }, idempotencyKey })
export const deleteDocumentTemplate = (id: string) => api<{ deleted: boolean }>('DELETE', `/document-templates/${enc(id)}`)

/** The template code of the one offer letter format. */
export const OFFER_LETTER_CODE = 'OFFER_LETTER'
/** Owner of the offer letter's file row: the tenant has one offer letter format, so one fixed owner id. */
export const OFFER_LETTER_OWNER_ID = '00000000-0000-4000-8000-00000000f0f1'

/** An offer letter read from its template. The bytes are not in the API, so dataUrl is kept from `prev` when it is the same file. */
export const offerLetterFrom = (t: DocumentTemplateRecord, prev: OfferLetterFile | null, by: string): OfferLetterFile => ({
  fileId: t.fileId ?? t.id,
  fileName: t.fileName ?? t.name,
  mimeType: t.mimeType ?? 'application/pdf',
  size: t.sizeBytes ?? 0,
  // bytes are read from /files/{id}/content after the load (useCore.loadOrganisation); kept while the file is the same
  dataUrl: prev && prev.fileId === t.fileId ? prev.dataUrl : '',
  revision: t.revision,
  updatedAt: (t.updatedAt ?? new Date().toISOString()).slice(0, 19),
  updatedBy: prev?.updatedBy ?? by,
  templateId: t.id,
  templateRowVersion: t.rowVersion,
})
