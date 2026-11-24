import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCore } from '@/modules/core-data'
import * as seed from '@/modules/core-data/data/seed'
import CompanyProfile from '@/modules/company/pages/CompanyProfile'
import { gstinCheckChar, suggestGstin } from '@/modules/company/utils/taxIds'

// Company profile form: the GSTIN is pre-filled from the PAN and state, GSTIN, CIN and TAN are typed in, and a GSTIN
// that cannot belong to the PAN blocks the save. Example data is fictional.

const input = (name: string) => {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!el) throw new Error(`no input ${name}`)
  return el
}
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } })

describe('company profile tax numbers', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  const update = vi.fn(async () => {})
  beforeEach(() => {
    const s = useCore.getState()
    saved = { company: s.company, loadOrganisation: s.loadOrganisation, updateCompanyRemote: s.updateCompanyRemote }
    update.mockClear()
    useCore.setState({ company: { ...seed.COMPANY, gstin: '' }, loadOrganisation: vi.fn(async () => {}), updateCompanyRemote: update })
  })
  afterEach(() => useCore.setState(saved))

  const openForm = async () => {
    render(<MemoryRouter><CompanyProfile /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
  }

  it('fills an empty GSTIN from the PAN and state, follows a PAN change, and the three numbers can be typed in', async () => {
    await openForm()
    await waitFor(() => expect(input('gstin').value).toBe('36AAHCV1234K1Z8'))
    expect(screen.getByText(/Filled in from the PAN and the state/)).toBeInTheDocument()
    for (const name of ['gstin', 'cin', 'tan']) expect(input(name).readOnly).toBe(false)

    type('pan', 'AAHCV5678K')
    await waitFor(() => expect(input('gstin').value).toBe(suggestGstin('AAHCV5678K', 'Telangana')))
  })

  it('never replaces a GSTIN the user typed', async () => {
    useCore.setState({ company: { ...seed.COMPANY } })
    await openForm()
    const own = `36AAHCV1234K2Z${gstinCheckChar('36AAHCV1234K2Z')}`
    type('gstin', own)
    type('pan', 'AAHCV5678K')
    await new Promise((r) => setTimeout(r, 20))
    expect(input('gstin').value).toBe(own)
  })

  it('blocks the save when the GSTIN belongs to another PAN, and saves once it matches', async () => {
    useCore.setState({ company: { ...seed.COMPANY } })
    await openForm()
    type('gstin', '36AAHCX1234K1Z8')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/belongs to PAN AAHCX1234K, not AAHCV1234K/)).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()

    type('gstin', '36AAHCV1234K1Z8')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })

  it('warns, without blocking, when the PAN is not a company PAN', async () => {
    useCore.setState({ company: { ...seed.COMPANY } })
    await openForm()
    type('pan', 'AAHFV1234K')
    expect(await screen.findByText(/a firm or LLP, not a company/)).toBeInTheDocument()
  })
})
