import { describe, expect, it } from 'vitest'
import { gstinCheckChar, suggestGstin, taxIdErrors, taxIdWarnings, type TaxIdValues } from '@/modules/company/utils/taxIds'

// Company profile: local checks of PAN, GSTIN, CIN and TAN (no government lookup). Example numbers are fictional,
// except the two published GSTINs used to confirm the check-character rule.

const base: TaxIdValues = {
  legalName: 'VeloxIQ Infra Projects Pvt Ltd', pan: 'AAHCV1234K', gstin: '36AAHCV1234K1Z8',
  cin: 'U45200TG2019PTC134567', tan: 'HYDV01234B', state: 'Telangana',
}

describe('GSTIN check character', () => {
  it('matches published GSTINs', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V')
    expect(gstinCheckChar('29AAGCB7383J1Z')).toBe('4')
  })
})

describe('GSTIN pre-fill', () => {
  it('builds state code + PAN + 1 + Z + check character', () => {
    expect(suggestGstin('AAHCV1234K', 'Telangana')).toBe('36AAHCV1234K1Z8')
    expect(suggestGstin('AAPFU0939F', 'Maharashtra')).toBe('27AAPFU0939F1ZV')
  })

  it('waits for a valid PAN and a known state', () => {
    expect(suggestGstin('AAHCV1234', 'Telangana')).toBeUndefined()
    expect(suggestGstin('AAHCV1234K', '')).toBeUndefined()
  })
})

describe('errors that block the save', () => {
  it('accepts consistent numbers', () => {
    expect(taxIdErrors(base)).toEqual({})
    expect(taxIdWarnings(base)).toEqual({})
  })

  it('refuses a GSTIN of another PAN', () => {
    expect(taxIdErrors({ ...base, gstin: '36AAHCX1234K1Z8' }).gstin).toMatch(/belongs to PAN AAHCX1234K, not AAHCV1234K/)
  })

  it('refuses a wrong check character, and names the right one', () => {
    expect(taxIdErrors({ ...base, gstin: '36AAHCV1234K1Z5' }).gstin).toBe('The last character should be 8 for this GSTIN. Check it against your GST certificate.')
  })

  it('leaves a badly formatted number to the format rule', () => {
    expect(taxIdErrors({ ...base, gstin: '36AAHCV' })).toEqual({})
  })
})

describe('warnings that do not block the save', () => {
  it('flags a PAN that is not a company PAN, or does not start like the name', () => {
    expect(taxIdWarnings({ ...base, pan: 'AAHFV1234K', gstin: '' }).pan).toMatch(/a firm or LLP, not a company/)
    expect(taxIdWarnings({ ...base, pan: 'AAHCB1234K', gstin: '' }).pan).toMatch(/first letter of the legal name \(V\)/)
    expect(taxIdWarnings({ ...base, legalName: 'The Velox Company' }).pan).toBeUndefined()
  })

  it('flags a GSTIN from another state, and treats the old Daman and Diu code as its merged state', () => {
    const karnataka = `29AAHCV1234K1Z${gstinCheckChar('29AAHCV1234K1Z')}`
    expect(taxIdWarnings({ ...base, gstin: karnataka }).gstin).toMatch(/is for Karnataka, but the registered address is in Telangana/)
    const daman = `25AAHCV1234K1Z${gstinCheckChar('25AAHCV1234K1Z')}`
    expect(taxIdWarnings({ ...base, gstin: daman, state: 'Dadra and Nagar Haveli and Daman and Diu' }).gstin).toBeUndefined()
  })

  it('flags an unlikely CIN', () => {
    expect(taxIdWarnings({ ...base, cin: 'U45200TG2999PTC134567' }).cin).toMatch(/year of incorporation \(2999\)/)
    expect(taxIdWarnings({ ...base, cin: 'U45200TG2019XYZ134567' }).cin).toMatch(/XYZ is not a known company type/)
    expect(taxIdWarnings({ ...base, cin: 'L45200TG2019PTC134567' }).cin).toMatch(/listed company \(L\) is a public company/)
  })

  it('flags a TAN whose 4th character is not the name initial', () => {
    expect(taxIdWarnings({ ...base, tan: 'HYDA01234B' }).tan).toMatch(/first letter of the deductor's name \(V\)/)
  })
})
