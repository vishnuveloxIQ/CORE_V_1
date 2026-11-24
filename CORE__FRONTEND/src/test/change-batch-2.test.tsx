import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/modules/auth'
import { loginPrefixFor, matchesCompanyPrefix, withCompanyPrefix } from '@/modules/auth/utils/tenants'
import { useCore } from '@/modules/core-data'
import { listCashLimitRows } from '@/modules/core-data/api/approvals'
import { wbsFrom } from '@/modules/core-data/api/projectParts'
import CustomPolicy from '@/modules/company/pages/CustomPolicy'
import { siteSchema } from '@/modules/projects/utils/site/schema'

// The second round of the 22 November change list: location coordinates, WBS status, the company login prefix,
// custom policy deletion and the cash limit rows name. Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const site = {
  code: 'CAMP-A', name: 'Camp A', addressLine: 'km 4', city: 'Suryapet', state: 'Telangana', pin: '508213',
  inCharge: 'Site Lead', phone: '9876543210', email: 'camp@example.com', status: 'Active' as const,
}

describe('location coordinates', () => {
  it('accepts both, or neither, within range', () => {
    expect(siteSchema.safeParse({ ...site, latitude: 17.385044, longitude: 78.486671 }).success).toBe(true)
    expect(siteSchema.safeParse({ ...site, latitude: null, longitude: null }).success).toBe(true)
    expect(siteSchema.safeParse({ ...site }).success).toBe(true)
  })

  it('refuses one without the other, out-of-range values and text', () => {
    const issues = (v: object) => (siteSchema.safeParse({ ...site, ...v }).error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`)
    expect(issues({ latitude: 17.38, longitude: null })).toEqual(['longitude: Enter the longitude too.'])
    expect(issues({ latitude: 95, longitude: 78 })[0]).toMatch(/^latitude: Latitude is between -90 and 90/)
    expect(issues({ latitude: Number.NaN, longitude: 78 })[0]).toMatch(/^latitude: Enter a number/)
  })
})

describe('WBS status', () => {
  it('reads the server status as Active or Inactive', () => {
    const base = { id: 'w1', code: '1', name: 'Earthwork', projectId: 'p1', parentWbsNodeId: null, rowVersion: 1 }
    expect(wbsFrom({ ...base, status: 'active' }).status).toBe('Active')
    expect(wbsFrom({ ...base, status: 'inactive' }).status).toBe('Inactive')
  })
})

describe('login IDs: the company prefix and 4 digits', () => {
  it('knows each company prefix, and completes 4 typed digits with it', () => {
    expect(loginPrefixFor('delta')).toBe('DELTA')
    expect(loginPrefixFor('acme')).toBe('VELOX')
    expect(loginPrefixFor('unknown')).toBeUndefined()
    expect(withCompanyPrefix('24', 'DELTA')).toBe('DELTA0024')
    expect(withCompanyPrefix('delta1024', 'DELTA')).toBe('DELTA1024')
  })

  it('accepts only the prefix followed by exactly 4 digits', () => {
    expect(matchesCompanyPrefix('DELTA1024', 'DELTA')).toBe(true)
    expect(matchesCompanyPrefix('delta1024', 'DELTA')).toBe(true)
    expect(matchesCompanyPrefix('BETA1024', 'DELTA')).toBe(false)
    expect(matchesCompanyPrefix('DELTA10245', 'DELTA')).toBe(false)
    expect(matchesCompanyPrefix('DELTAX024', 'DELTA')).toBe(false)
  })
})

describe('cash limit rows', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('are read from /cash-limit-rows', async () => {
    const fetch = vi.fn(() => reply(200, { data: [] }))
    vi.stubGlobal('fetch', fetch)
    await listCashLimitRows()
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toContain('/cash-limit-rows')
  })
})

describe('deleting a custom policy', () => {
  const POLICY = '11111111-1111-4111-8111-111111111111'
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuth.setState({ privileges: [] })
  })

  const setUp = () => {
    useCore.setState({
      customPolicies: [{ id: POLICY, name: 'Site safety allowance', description: 'Fictional allowance', fields: [{ id: 'f1', label: 'Amount', type: 'number', required: true }] } as never],
      customVersions: [{ id: 'v1', policyId: POLICY, version: 1, effectiveFrom: '2026-01-01', reason: 'First', createdBy: 'Admin', createdAt: '2026-01-01T00:00:00Z', values: { f1: 500 } } as never],
    })
  }
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={[`/policies/custom/${POLICY}`]}>
        <Routes>
          <Route path="/policies/custom/:id" element={<CustomPolicy />} />
          <Route path="/policies" element={<p>Policies list</p>} />
        </Routes>
      </MemoryRouter>,
    )

  it('asks first, then deletes on the server and returns to the list', async () => {
    setUp()
    useAuth.setState({ privileges: ['policies.manage'] })
    const deletes: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'DELETE') deletes.push(url)
      return reply(200, { data: { deleted: true } })
    }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete policy' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/its 1 field and all 1 version/)).toBeInTheDocument()
    expect(deletes).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete policy' }))
    expect(await screen.findByText('Policies list')).toBeInTheDocument()
    expect(deletes[0]).toContain(`/custom-policies/${POLICY}`)
    await waitFor(() => expect(useCore.getState().customPolicies.some((d) => d.id === POLICY)).toBe(false))
  })

  it('offers no delete without policies.manage', () => {
    setUp()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Delete policy' })).toBeNull()
  })
})
