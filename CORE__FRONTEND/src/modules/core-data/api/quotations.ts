import { api } from '@/shared/lib/api'

/**
 * Quotation approval (API 1.21.0, /quotations). Reads need a signed-in user; the decision (PATCH) needs approvals.manage.
 * A quotation is a vendor's supply quotation. It starts PENDING and is decided once: APPROVED, or REJECTED with a reason.
 */
export type QuotationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface QuotationParty {
  name: string
  address: string[]
  gstin?: string
  state?: string
  email?: string
}
export interface QuotationLine {
  no: number
  description: string
  /** extra lines under the description (colour, size, box and so on) */
  details: string[]
  hsn: string
  quantity: number
  unit: string
  rate: number
  per: string
  amount: number
  /** the make, and the standard it conforms to (for example IS 1786:2008); blank when the vendor did not state it */
  brand?: string
  standard?: string
}
export interface QuotationCharge { label: string; hsn: string; amount: number }
export interface QuotationHsnRow { hsn: string; taxable: number; rate: number; tax: number }

/** The quotation as the vendor sent it: kept whole by the server. */
export interface QuotationDocument {
  vendor: QuotationParty
  /** where the goods go (Ship to) */
  consignee: QuotationParty
  /** who is billed (Bill to) */
  buyer: QuotationParty
  placeOfSupply: string
  refs: { reference: string; dated: string; dispatchedThrough: string; destination: string }
  termsOfPayment: string
  lines: QuotationLine[]
  charges: QuotationCharge[]
  /** IGST, or CGST + SGST */
  taxLabel: string
  taxRate: number
  taxAmount: number
  taxable: number
  totalQty: number
  qtyUnit: string
  total: number
  words: string
  taxWords: string
  hsnSummary: QuotationHsnRow[]
  terms: string[]
  declaration: string
  bank: { holder: string; bank: string; account: string; branchIfsc: string }
  /** commercial terms the vendor stated; a missing key means it did not state it */
  commercial?: { deliveryPeriod?: string; validity?: string; weightBasis?: string; testCertificate?: string }
  /** quotations for the same requirement share a key, so they can be compared */
  comparison?: { key: string; title: string }
}

export interface QuotationRecord {
  id: string
  ref: string
  vendorName: string
  buyerName: string
  projectName: string | null
  destination: string | null
  quotationDate: string
  validUntil: string | null
  paymentTerms: string | null
  /** the total including tax, in rupees */
  amount: number
  document: QuotationDocument
  status: QuotationStatus
  reason: string | null
  decidedAt: string | null
  rowVersion: number
}

const path = (id: string) => `/quotations/${encodeURIComponent(id)}`

export const listQuotations = (status?: QuotationStatus) =>
  api<QuotationRecord[]>('GET', status ? `/quotations?status=${status}` : '/quotations')
export const getQuotation = (id: string) => api<QuotationRecord>('GET', path(id))
/** The note is optional, and kept with the approval (for example why a 100% advance payment is accepted). */
export const approveQuotation = (id: string, rowVersion: number, note?: string) =>
  api<QuotationRecord>('PATCH', path(id), { body: { status: 'APPROVED', ...(note ? { reason: note } : {}), rowVersion } })
export const rejectQuotation = (id: string, rowVersion: number, reason: string) =>
  api<QuotationRecord>('PATCH', path(id), { body: { status: 'REJECTED', reason, rowVersion } })
