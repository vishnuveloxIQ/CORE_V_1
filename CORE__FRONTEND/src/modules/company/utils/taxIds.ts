/**
 * Local checks for a company's Indian tax and registration numbers (owner decision, 2026-11-21: no lookup on the
 * government sites, which block automatic queries). Nothing here leaves the browser.
 *
 * What can be known from the PAN alone:
 * - GSTIN = state code (2 digits) + PAN (10) + registration number in that state (1 character, usually 1) + Z +
 *   a check character. So the GSTIN can be pre-filled from the PAN and the state, and fully checked.
 * - CIN and TAN are issued separately and contain no part of the PAN. They are checked for format and for
 *   consistency with the company's name, never derived.
 */

export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const CIN_RE = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/
export const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/

/** GST state codes, by the state names the company profile offers. */
export const GST_STATE_CODE: Readonly<Record<string, string>> = {
  'Jammu and Kashmir': '01',
  'Himachal Pradesh': '02',
  Punjab: '03',
  Chandigarh: '04',
  Uttarakhand: '05',
  Haryana: '06',
  Delhi: '07',
  Rajasthan: '08',
  'Uttar Pradesh': '09',
  Bihar: '10',
  Sikkim: '11',
  'Arunachal Pradesh': '12',
  Nagaland: '13',
  Manipur: '14',
  Mizoram: '15',
  Tripura: '16',
  Meghalaya: '17',
  Assam: '18',
  'West Bengal': '19',
  Jharkhand: '20',
  Odisha: '21',
  Chhattisgarh: '22',
  'Madhya Pradesh': '23',
  Gujarat: '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Maharashtra: '27',
  Karnataka: '29',
  Goa: '30',
  Lakshadweep: '31',
  Kerala: '32',
  'Tamil Nadu': '33',
  Puducherry: '34',
  'Andaman and Nicobar Islands': '35',
  Telangana: '36',
  'Andhra Pradesh': '37',
  Ladakh: '38',
}

/** Codes still found on GSTINs issued before a merger: 25 (Daman and Diu) is now part of 26. */
const FORMER_CODES: Readonly<Record<string, string>> = { '25': '26' }

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The GSTIN check character for its first 14 characters (GSTN's base-36 weighted checksum). */
export function gstinCheckChar(first14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i += 1) {
    const product = BASE36.indexOf(first14[i]!) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return BASE36[(36 - (sum % 36)) % 36]!
}

/**
 * The GSTIN a company most likely holds in its registered state: the state code, the PAN, registration number 1,
 * Z and the check character. Undefined until the PAN is valid and the state is known. The registration number is a
 * guess (a second registration in the same state is 2, and so on), so the screen asks the user to confirm it.
 */
export function suggestGstin(pan: string, state: string): string | undefined {
  const code = GST_STATE_CODE[state]
  if (!code || !PAN_RE.test(pan)) return undefined
  const first14 = `${code}${pan}1Z`
  return first14 + gstinCheckChar(first14)
}

/** What the 4th character of a PAN says about its holder. */
const PAN_HOLDER: Readonly<Record<string, string>> = {
  C: 'a company', P: 'an individual', H: 'a Hindu undivided family', F: 'a firm or LLP', A: 'an association of persons',
  T: 'a trust', B: 'a body of individuals', L: 'a local authority', J: 'an artificial juridical person', G: 'a government body',
}

/** CIN ownership codes (the three letters before the registration number). */
const CIN_OWNERSHIP = new Set(['PLC', 'PTC', 'OPC', 'GOI', 'SGC', 'GAP', 'GAT', 'NPL', 'FLC', 'FTC', 'ULL', 'ULT'])

/** The first letter of a legal name, ignoring a leading "M/s" or "The". */
function initialOf(name: string): string | undefined {
  const cleaned = name.trim().toUpperCase().replace(/^(M\/S\.?|MESSRS\.?)\s+/, '').replace(/^THE\s+/, '')
  return /[A-Z]/.exec(cleaned)?.[0]
}

export interface TaxIdValues {
  legalName: string
  pan: string
  gstin: string
  cin: string
  tan: string
  state: string
}

type Field = 'pan' | 'gstin' | 'cin' | 'tan'

/**
 * Mistakes that make a number wrong for certain: a GSTIN for another PAN, or a GSTIN whose check character does not
 * match. Only numbers that already have the right format are checked; the format rule reports the rest.
 */
export function taxIdErrors(v: TaxIdValues): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {}
  if (GSTIN_RE.test(v.gstin)) {
    if (PAN_RE.test(v.pan) && v.gstin.slice(2, 12) !== v.pan) {
      out.gstin = `This GSTIN belongs to PAN ${v.gstin.slice(2, 12)}, not ${v.pan}. Characters 3 to 12 of a GSTIN are the PAN.`
    } else {
      const expected = gstinCheckChar(v.gstin.slice(0, 14))
      if (v.gstin[14] !== expected) out.gstin = `The last character should be ${expected} for this GSTIN. Check it against your GST certificate.`
    }
  }
  return out
}

/**
 * Things that are probably wrong but can be right: the user is told, and can still save. For example, a GSTIN from
 * another state is valid for a company registered in more than one state.
 */
export function taxIdWarnings(v: TaxIdValues): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {}
  const initial = initialOf(v.legalName)

  if (PAN_RE.test(v.pan)) {
    const holder = v.pan[3]!
    if (holder !== 'C') {
      out.pan = `The 4th character (${holder}) shows the PAN of ${PAN_HOLDER[holder] ?? 'an unknown holder type'}, not a company (C).`
    } else if (initial && v.pan[4] !== initial) {
      out.pan = `The 5th character (${v.pan[4]}) is usually the first letter of the legal name (${initial}).`
    }
  }

  if (GSTIN_RE.test(v.gstin) && !taxIdErrors(v).gstin) {
    const code = FORMER_CODES[v.gstin.slice(0, 2)] ?? v.gstin.slice(0, 2)
    const stateCode = GST_STATE_CODE[v.state]
    if (stateCode && code !== stateCode) {
      const other = Object.entries(GST_STATE_CODE).find(([, c]) => c === code)?.[0] ?? `state code ${code}`
      out.gstin = `This GSTIN is for ${other}, but the registered address is in ${v.state}. Use the GSTIN of the registered state if you have one.`
    }
  }

  if (CIN_RE.test(v.cin)) {
    const year = Number(v.cin.slice(8, 12))
    const ownership = v.cin.slice(12, 15)
    if (year < 1850 || year > new Date().getFullYear()) out.cin = `The year of incorporation (${year}) does not look right.`
    else if (!CIN_OWNERSHIP.has(ownership)) out.cin = `${ownership} is not a known company type (for example PLC, PTC or OPC).`
    else if (v.cin[0] === 'L' && ownership !== 'PLC') out.cin = `A listed company (L) is a public company (PLC), but this CIN says ${ownership}.`
  }

  if (TAN_RE.test(v.tan) && initial && v.tan[3] !== initial) {
    out.tan = `The 4th character (${v.tan[3]}) is usually the first letter of the deductor's name (${initial}).`
  }
  return out
}
