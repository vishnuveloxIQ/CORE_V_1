import type { QuotationDocument, QuotationLine } from '@/modules/core-data'

/** Checks an approver makes on a vendor quotation before deciding. Pure functions of the quotation document. */

/** A quotation set at least this many vendors against one requirement should have been compared. */
export const MIN_QUOTATIONS = 3

const sameState = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The state name in a party's state text such as "Andhra Pradesh, Code: 37". */
const stateName = (s: string | undefined) => (s ?? '').split(',')[0]!.trim()

/**
 * Tax type check: goods supplied inside the vendor's state carry CGST + SGST; goods supplied to another state carry IGST.
 * A wrong type can block the buyer's input tax credit. Returns null when the vendor's state is not known.
 */
export function taxCheck(d: QuotationDocument): { ok: boolean; message: string } | null {
  const vendorState = stateName(d.vendor.state)
  if (!vendorState || !d.placeOfSupply) return null
  const inside = sameState(vendorState, d.placeOfSupply)
  const expected = inside ? 'CGST + SGST' : 'IGST'
  const charged = d.taxLabel.replace(/\s+/g, '').toUpperCase() === 'IGST' ? 'IGST' : 'CGST + SGST'
  const where = `The vendor is in ${vendorState} and the supply is to ${d.placeOfSupply}`
  return charged === expected
    ? { ok: true, message: `${where}, so ${expected} applies. The quotation charges ${charged}.` }
    : { ok: false, message: `${where}, so ${expected} should apply, but the quotation charges ${charged}. Ask the vendor to correct the tax type.` }
}

/** True when the payment terms ask for the whole amount in advance. */
export const isFullAdvance = (terms: string | null | undefined) => /100\s*%.*advance|advance.*100\s*%/i.test(terms ?? '')

/** Charges (transport, labour and so on) divided over the total quantity, per unit. */
const chargesPerUnit = (d: QuotationDocument) => (d.totalQty > 0 ? d.charges.reduce((n, c) => n + c.amount, 0) / d.totalQty : 0)

/** The rate of one line after sharing the charges over the quantity and adding tax: what a unit really costs. */
export const landedRate = (d: QuotationDocument, l: QuotationLine) => (l.rate + chargesPerUnit(d)) * (1 + d.taxRate / 100)

/** Which of the brand, standard and commercial terms the vendor did not state. */
export function missingTerms(d: QuotationDocument): string[] {
  const out: string[] = []
  if (d.lines.some((l) => !l.brand)) out.push('brand or make')
  if (d.lines.some((l) => !l.standard)) out.push('standard (such as an IS code)')
  const c = d.commercial ?? {}
  if (!c.deliveryPeriod) out.push('delivery period')
  if (!c.validity) out.push('quotation validity')
  // weight basis and a test certificate matter for goods sold by weight (steel, cement)
  if (/^(mt|ton|tonne|kg)$/i.test(d.qtyUnit)) {
    if (!c.weightBasis) out.push('weight basis')
    if (!c.testCertificate) out.push('test certificate')
  }
  return out
}
