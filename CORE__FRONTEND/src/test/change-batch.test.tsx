import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { addMonths, meterHours, nextDue } from '@/modules/core-data/api/maintenance'
import * as seed from '@/modules/core-data/data/seed'
import CompanyProfile from '@/modules/company/pages/CompanyProfile'
import { locationsText, modulesText, projectsText, workplaceOf } from '@/modules/organisation/utils/workplace'
import { ProjectForm } from '@/modules/projects/components/ProjectForm'
import AvailableMaterials from '@/modules/resources/pages/AvailableMaterials'
import Vendors from '@/modules/resources/pages/Vendors'
import { StatTile } from '@/shared/ui/StatTile'

// The 22 November change list: maintenance due dates, where employees work, the project ID, available materials,
// vendors, clickable cards and the company profile. Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('maintenance: when a service is next due', () => {
  it('adds months, keeping the day or the month end', () => {
    expect(addMonths('2026-09-01', 3)).toBe('2026-12-01')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
  })

  it('is due by months or hours, whichever comes first', () => {
    const every = { intervalMonths: 3, intervalHours: 500, lastServiceDate: '2026-09-01', lastServiceHours: 1000 }
    expect(nextDue(every, '2026-10-01', 1100)).toEqual({ state: 'ok', date: '2026-12-01', hours: 1500 })
    expect(nextDue(every, '2026-11-25', 1100).state).toBe('due-soon')
    expect(nextDue(every, '2026-10-01', 1460).state).toBe('due-soon')
    expect(nextDue(every, '2026-10-01', 1501).state).toBe('overdue')
    expect(nextDue(every, '2026-12-02', 1100).state).toBe('overdue')
  })

  it('cannot say without a last service', () => {
    expect(nextDue({ intervalMonths: 3, intervalHours: null, lastServiceDate: null, lastServiceHours: null }, '2026-10-01').state).toBe('unknown')
    expect(meterHours('1,250.5')).toBe(1250.5)
    expect(meterHours('about 900')).toBeUndefined()
  })
})

describe('where an employee works', () => {
  const projects = [
    { ...seed.PROJECTS[0]!, id: 'p1', code: 'NH-44', name: 'Highway' },
    { ...seed.PROJECTS[0]!, id: 'p2', code: 'BR-02', name: 'Bridge' },
  ]
  const sites = [
    { ...seed.SITES[0]!, id: 's1', code: 'CAMP-A', name: 'Camp A', projectId: 'p1' },
    { ...seed.SITES[0]!, id: 's2', code: 'CAMP-B', name: 'Camp B', projectId: 'p2' },
  ]

  it('lists the projects in scope and their locations, or all of them for a company-wide person', () => {
    const one = workplaceOf({ scopeType: 'Project', scopeIds: ['p1'] }, projects, sites)
    expect(projectsText(one)).toBe('NH-44')
    expect(locationsText(one)).toBe('Camp A')
    const all = workplaceOf({ scopeType: 'Company', scopeIds: [] }, projects, sites)
    expect([projectsText(all), locationsText(all)]).toEqual(['All projects', 'All locations'])
    expect(modulesText({ role: 'Module head', modules: ['HRMS', 'PMS'] })).toBe('HRMS, PMS')
    expect(modulesText({ role: 'Approver', modules: [] })).toBe('Approvals (all modules)')
  })
})

describe('summary cards', () => {
  it('a card with a destination is a link; one without stays plain', () => {
    render(<MemoryRouter><StatTile label="Active projects" value={3} icon="hardhat" to="/projects" actionLabel="Open projects" /><StatTile label="Inactive" value={1} icon="userX" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Active Projects: 3. Open projects' })).toHaveAttribute('href', '/projects')
    expect(screen.queryByRole('link', { name: /Inactive/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Inactive/ })).toBeNull()
  })
})

describe('screens', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  beforeEach(() => {
    const s = useCore.getState()
    saved = { company: s.company, stock: s.stock, stores: s.stores, materials: s.materials, sites: s.sites, projects: s.projects, loadOrganisation: s.loadOrganisation }
  })
  afterEach(() => {
    useCore.setState(saved)
    useAuth.setState({ privileges: [] })
    vi.unstubAllGlobals()
  })

  it('available materials adds up free stock across stores and leaves out what is all reserved', () => {
    useCore.setState({
      materials: [
        { ...seed.MATERIALS[0]!, id: 'm1', code: 'CEM', name: 'Cement', uom: 'Bag' },
        { ...seed.MATERIALS[0]!, id: 'm2', code: 'STL', name: 'Steel', uom: 'MT' },
      ],
      stores: [
        { ...seed.STORES[0]!, id: 'st1', name: 'Main store', projectId: 'p1', location: 'Camp A' },
        { ...seed.STORES[0]!, id: 'st2', name: 'Camp store', projectId: 'p2' },
      ],
      sites: [{ ...seed.SITES[0]!, id: 's1', name: 'Camp A' }, { ...seed.SITES[0]!, id: 's2', name: 'Camp B' }],
      stock: [
        { id: 'k1', storeId: 'st1', materialId: 'm1', qty: 100, reserved: 40, updatedAt: '2026-11-20T10:00:00Z' },
        { id: 'k2', storeId: 'st2', materialId: 'm1', qty: 30, reserved: 0, updatedAt: '2026-11-20T10:00:00Z' },
        { id: 'k3', storeId: 'st1', materialId: 'm2', qty: 5, reserved: 5, updatedAt: '2026-11-20T10:00:00Z' },
      ],
    })
    render(<MemoryRouter><AvailableMaterials /></MemoryRouter>)
    expect(screen.getAllByText('90 Bag').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Main store (Camp A): 60 Bag').length).toBeGreaterThan(0)
    expect(screen.queryByText('Steel')).toBeNull()
  })

  it('the project ID can be set on a new project but not changed afterwards', () => {
    const project = { ...seed.PROJECTS[0]!, rowVersion: 1 }
    const { unmount } = render(<MemoryRouter><ProjectForm project={project} onCancel={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
    expect(screen.getByLabelText(/^Project ID/)).toHaveAttribute('readonly')
    unmount()
    render(<MemoryRouter><ProjectForm onCancel={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
    expect(screen.getByLabelText(/^Project ID/)).not.toHaveAttribute('readonly')
  })

  it('the company profile shows the logo inside the legal identity card, under "Company legal name"', () => {
    useCore.setState({ company: { ...seed.COMPANY }, loadOrganisation: vi.fn(async () => {}) })
    render(<MemoryRouter><CompanyProfile /></MemoryRouter>)
    const card = screen.getByText(/^legal identity$/i).closest('section, article, .card, .panel') as HTMLElement
    expect(within(card).getByText('Company legal name')).toBeInTheDocument()
    expect(within(card).getByText(/Company logo/)).toBeInTheDocument()
    expect(screen.queryByText('Logo', { selector: 'h2,h3' })).toBeNull()
  })

  describe('company logo preview', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    beforeEach(() => {
      useCore.setState({ company: { ...seed.COMPANY, logo: PNG }, loadOrganisation: vi.fn(async () => {}) })
    })

    it('opens a preview dialog from the logo in the normal view, and closes it', async () => {
      render(<MemoryRouter><CompanyProfile /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: /preview company logo/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('img', { name: 'Company logo' })).toHaveAttribute('src', PNG)
      fireEvent.click(within(dialog).getByRole('button', { name: /close dialog/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('opens the same preview from the logo while the profile is being edited', async () => {
      render(<MemoryRouter><CompanyProfile /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }))
      fireEvent.click(await screen.findByRole('button', { name: /preview company logo/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('img', { name: 'Company logo' })).toHaveAttribute('src', PNG)
    })

    it('has nothing to preview when the company has no logo', () => {
      useCore.setState({ company: { ...seed.COMPANY, logo: '' } })
      render(<MemoryRouter><CompanyProfile /></MemoryRouter>)
      expect(screen.queryByRole('button', { name: /preview company logo/i })).toBeNull()
    })
  })

  it('adds a vendor with the fields the API takes', async () => {
    useAuth.setState({ privileges: ['masters.manage'] })
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        posts.push(body)
        return reply(201, { data: { id: 'v1', status: 'active', registeredBy: null, verifiedAt: null, rowVersion: 1, email: null, phone: null, address: null, ...body } })
      }
      return reply(200, { data: [] })
    }))
    render(<MemoryRouter><Vendors /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'New vendor' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Vendor name/), { target: { value: 'Fictional Hire Co' } })
    fireEvent.change(within(dialog).getByLabelText(/Vendor code/), { target: { value: 'ven-0042' } })
    fireEvent.change(within(dialog).getByLabelText('PAN'), { target: { value: 'AAHCF1234K' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add vendor' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ code: 'VEN-0042', name: 'Fictional Hire Co', pan: 'AAHCF1234K', status: 'active', gstin: null })
    expect(await screen.findByText('Fictional Hire Co')).toBeInTheDocument()
  })
})
