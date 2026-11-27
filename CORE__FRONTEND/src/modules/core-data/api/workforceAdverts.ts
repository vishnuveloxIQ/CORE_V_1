import { api } from '@/shared/lib/api'

/**
 * Workforce adverts (API 1.19.0): head office advertises the workers a project needs to its registered sub-contractors.
 * Drafts are edited freely; publishing queues one message per active sub-contractor with a mail ID; a published advert
 * cannot change except that it can be closed with a reason. Interests and discussion steps are recorded by head office.
 */
export type AdvertStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'
export type InterestStatus = 'CONTACTED' | 'IN_DISCUSSION' | 'AGREED' | 'DECLINED'

export interface AdvertRecord {
  id: string
  code: string
  title: string
  projectId: string
  state: string | null
  description: string | null
  requiredFrom: string
  requiredTo: string | null
  closesAt: string | null
  status: AdvertStatus
  publishedAt: string | null
  closedAt: string | null
  closedReason: string | null
  rowVersion: number
}

export interface RequirementRecord {
  id: string
  advertId: string
  workerType: string
  trade: string
  notes: string | null
  rowVersion: number
}

export interface MailRecord {
  id: string
  advertId: string
  subContractorId: string
  toAddress: string
  subject: string
  body: string
  status: 'QUEUED'
}

export interface InterestRecord {
  id: string
  advertId: string
  /** the registered sub-contractor, or null for a contractor who is not registered */
  subContractorId: string | null
  firmName: string | null
  contactName: string | null
  mailId: string | null
  phone: string | null
  source: 'REGISTERED'
  status: InterestStatus
  reason: string | null
  rowVersion: number
}

export interface StepRecord {
  id: string
  interestId: string
  remarks: string
  createdAt: string
}

export type AdvertDraft = Omit<AdvertRecord, 'id' | 'code' | 'status' | 'publishedAt' | 'closedAt' | 'closedReason' | 'rowVersion'>

const qs = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const listAdverts = () => api<AdvertRecord[]>('GET', '/workforce-adverts')
export const createAdvert = (d: Partial<AdvertDraft> & { title: string; projectId: string; requiredFrom: string }, idempotencyKey?: string) =>
  api<AdvertRecord>('POST', '/workforce-adverts', { body: d, idempotencyKey })
export const updateAdvert = (id: string, rowVersion: number, patch: Partial<AdvertDraft> & { status?: AdvertStatus; closedReason?: string }, idempotencyKey?: string) =>
  api<AdvertRecord>('PATCH', `/workforce-adverts/${encodeURIComponent(id)}`, { body: { ...patch, rowVersion }, idempotencyKey })
export const deleteAdvert = (id: string) => api<{ deleted: true }>('DELETE', `/workforce-adverts/${encodeURIComponent(id)}`)

export const listRequirements = (advertId: string) => api<RequirementRecord[]>('GET', `/workforce-advert-requirements${qs({ advertId })}`)
export const createRequirement = (d: Omit<RequirementRecord, 'id' | 'rowVersion'>, idempotencyKey?: string) =>
  api<RequirementRecord>('POST', '/workforce-advert-requirements', { body: d, idempotencyKey })
export const deleteRequirement = (id: string) => api<{ deleted: true }>('DELETE', `/workforce-advert-requirements/${encodeURIComponent(id)}`)

export const listMail = (advertId: string) => api<MailRecord[]>('GET', `/advert-mail${qs({ advertId })}`)

export const listInterests = (advertId: string) => api<InterestRecord[]>('GET', `/contractor-interests${qs({ advertId })}`)
/** Record a response: a registered sub-contractor, or a contractor who is not registered (its firm name is required). */
export interface InterestInput { subContractorId?: string; firmName?: string; contactName?: string; mailId?: string; phone?: string }
export const createInterest = (advertId: string, input: InterestInput, idempotencyKey?: string) =>
  api<InterestRecord>('POST', '/contractor-interests', { body: { advertId, ...input }, idempotencyKey })
export const updateInterest = (id: string, rowVersion: number, patch: { status?: InterestStatus; reason?: string | null }, idempotencyKey?: string) =>
  api<InterestRecord>('PATCH', `/contractor-interests/${encodeURIComponent(id)}`, { body: { ...patch, rowVersion }, idempotencyKey })

export const listSteps = (interestId: string) => api<StepRecord[]>('GET', `/interest-steps${qs({ interestId })}`)
export const createStep = (interestId: string, remarks: string, idempotencyKey?: string) =>
  api<StepRecord>('POST', '/interest-steps', { body: { interestId, remarks }, idempotencyKey })

export const INTEREST_LABEL: Record<InterestStatus, string> = {
  CONTACTED: 'Contacted', IN_DISCUSSION: 'In discussion', AGREED: 'Agreed', DECLINED: 'Declined',
}
export const ADVERT_LABEL: Record<AdvertStatus, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', CLOSED: 'Closed' }
