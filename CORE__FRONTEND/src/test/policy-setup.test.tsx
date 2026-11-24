import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { POLICY_KEYS } from '@/modules/company/utils/meta'
import { saveFirstVersion, type SetupActions } from '@/modules/company/utils/setup'
import { policyTemplate } from '@/modules/company/utils/templates'
import { setTenantId } from '@/shared/lib/api'

// A new company has none of the six built-in policies: each opens on a standard template it can change and save as
// version 1. Holidays and shift timings also write their company rows, before the version.

describe('policy templates', () => {
  it('there is a template for each of the six built-in policies', () => {
    expect(POLICY_KEYS).toHaveLength(6)
    for (const key of POLICY_KEYS) expect(policyTemplate(key), key).toBeTruthy()
  })

  it('holiday dates fall in the chosen year; leave codes are unique; rules and timings are filled in', () => {
    const holidays = policyTemplate('holidays', 2027)
    expect(holidays.year).toBe(2027)
    expect(holidays.holidays.every((h) => h.date.startsWith('2027-'))).toBe(true)
    const codes = policyTemplate('leave').leaveTypes.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(policyTemplate('rules').rules.length).toBeGreaterThan(0)
    expect(policyTemplate('shifts').timings?.length).toBe(policyTemplate('shifts').shiftsPerDay)
    expect(policyTemplate('payment-threshold')).toEqual({ amount: 500000, currency: 'INR' })
  })

  it('each call gives a fresh copy, so editing one never changes the template', () => {
    const first = policyTemplate('leave')
    first.leaveTypes[0]!.annualDays = 99
    expect(policyTemplate('leave').leaveTypes[0]!.annualDays).not.toBe(99)
  })
})

describe('saving the first version', () => {
  const actions = () => {
    const calls: string[] = []
    const a: SetupActions = {
      savePolicyVersion: vi.fn(async (key: string) => void calls.push(`version:${key}`)) as SetupActions['savePolicyVersion'],
      saveHolidayRowsRemote: vi.fn(async () => void calls.push('holiday-rows')),
      saveShiftRowsRemote: vi.fn(async () => void calls.push('shift-rows')),
    }
    return { a, calls }
  }

  it('holidays and shifts write their rows first, then version 1; the others write the version only', async () => {
    for (const [key, expected] of [
      ['holidays', ['holiday-rows', 'version:holidays']],
      ['shifts', ['shift-rows', 'version:shifts']],
      ['leave', ['version:leave']],
      ['rules', ['version:rules']],
    ] as const) {
      const { a, calls } = actions()
      await saveFirstVersion(a, key, policyTemplate(key), '2026-11-21', 'Set up')
      expect(calls, key).toEqual(expected)
    }
  })

  it('a refused row (for example no company profile yet) stops before any version is written', async () => {
    const { a, calls } = actions()
    a.saveHolidayRowsRemote = vi.fn(async () => { throw new Error('Set up the company profile before adding this record') })
    await expect(saveFirstVersion(a, 'holidays', policyTemplate('holidays'), '2026-11-21', 'Set up')).rejects.toThrow(/company profile/)
    expect(calls).toEqual([])
  })
})

describe('an unset policy page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setTenantId('gamma')
    useAuth.setState({ user: 'GAMMA9999', profile: null, privileges: [], isAdmin: true, mustChangePassword: false })
    useCore.setState({ policies: [] })
  })

  it('opens the editor on the standard template instead of "Nothing to show"', async () => {
    window.location.hash = '#/policies/leave'
    render(<App />)
    expect(await screen.findByText(/set up this policy/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText(/has not set up leave policy yet/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing to show')).toBeNull()
    expect(screen.getByDisplayValue('Casual leave')).toBeInTheDocument()
  })
})
