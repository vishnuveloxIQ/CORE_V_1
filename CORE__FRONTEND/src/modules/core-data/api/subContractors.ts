import { api } from '@/shared/lib/api'

/**
 * Sub-contractor registrations (API 1.17.0, /sub-contractors). Reads need a signed-in user; writes need
 * projects.manage. Each row is the sub-contract details of one firm under a project, and the agreement or work order
 * document is a file row (agreementFileId) uploaded through /files.
 */
export interface SubContractorRecord {
  id: string
  projectId: string
  siteName: string | null
  projectName: string | null
  firmName: string
  ownerName: string
  address: string | null
  mailId: string | null
  phone: string | null
  gstNumber: string | null
  panNumber: string | null
  workOrderDate: string | null
  workContractTitle: string
  workContractPeriod: string | null
  scopeAnnexure: string | null
  consumablesTerms: string | null
  shedTentMaterial: string | null
  safetyItems: string | null
  otherConditions: string | null
  agreementFileId: string | null
  status: SubContractorStatus
  rowVersion: number
}

export type SubContractorStatus = 'active' | 'inactive'

/** The writable detail fields. Empty text is sent as null. The agreement document is attached separately (agreementFileId). */
export type SubContractorDraft = Omit<SubContractorRecord, 'id' | 'projectId' | 'rowVersion' | 'agreementFileId' | 'siteName'>

const path = (id: string) => `/sub-contractors/${encodeURIComponent(id)}`

/** Every registration, or only one project's when a project id is given. */
export const listSubContractors = (projectId?: string) =>
  api<SubContractorRecord[]>('GET', projectId ? `/sub-contractors?projectId=${encodeURIComponent(projectId)}` : '/sub-contractors')
export const createSubContractor = (projectId: string, d: SubContractorDraft, idempotencyKey?: string) =>
  api<SubContractorRecord>('POST', '/sub-contractors', { body: { projectId, ...d }, idempotencyKey })
export const updateSubContractor = (id: string, rowVersion: number, d: Partial<SubContractorDraft> & { agreementFileId?: string | null }, idempotencyKey?: string) =>
  api<SubContractorRecord>('PATCH', path(id), { body: { ...d, rowVersion }, idempotencyKey })
