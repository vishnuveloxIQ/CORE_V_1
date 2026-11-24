import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import App from '@/app/App'
import { NAV, NOTIFICATIONS } from '@/modules/shell'
import { ROUTES } from '@/app/routes'
import { useAuth } from '@/modules/auth'
import { chainFor, useCore } from '@/modules/core-data'
import * as seed from '@/modules/core-data/data/seed'
import { roleRules } from '@/modules/organisation'

// a Tenant Admin holds every manage privilege, so the create and edit controls are shown
const ADMIN_PRIVILEGES = ['access.manage', 'organisation.manage', 'projects.manage', 'masters.manage', 'policies.manage', 'approvals.manage', 'records.manage']
const signedIn = () => { useAuth.setState({ user: 'admin', isAdmin: true, privileges: ADMIN_PRIVILEGES, lockedUntil: 0 }); window.location.hash = '#/' }
const signedOutAuth = { user: null, profile: null, privileges: [], isAdmin: false, lockedUntil: 0, mustChangePassword: false }

/** Answers fetch like the Core API: { data } on success, { error } otherwise. */
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }))
/** API tests change the shared store; put the sample data back so later screen tests see what they expect. */
const keepSeed = () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  beforeEach(() => { const s = useCore.getState(); saved = { projects: s.projects, sites: s.sites, stores: s.stores, projectsSource: s.projectsSource, sitesLoad: s.sitesLoad, storesLoad: s.storesLoad } })
  afterEach(() => useCore.setState(saved))
}
/** Replaces store actions for one test (e.g. a remote save answered as the server would) and puts them back after it. */
const stubActions = () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  afterEach(() => { useCore.setState(saved); saved = {} })
  return (actions: Partial<ReturnType<typeof useCore.getState>>) => {
    const s = useCore.getState()
    for (const k of Object.keys(actions) as (keyof typeof actions)[]) if (!(k in saved)) Object.assign(saved, { [k]: s[k] })
    useCore.setState(actions)
  }
}
const tokens = { accessToken: 'at', accessTokenExpiresIn: 900, refreshToken: 'rt', refreshTokenExpiresAt: '2026-12-01T00:00:00Z' }

/**
 * These screen tests were written against the sample records the store used to start with. The store no longer
 * loads them, so this file puts the same records in place once, here, and the tests read them as before.
 */
useCore.setState({
  company: seed.COMPANY, policies: seed.POLICIES, projects: seed.PROJECTS, sites: seed.SITES, stores: seed.STORES, materials: seed.MATERIALS,
  stock: seed.STOCK, planLines: seed.PLAN_LINES, peoplePlan: seed.PEOPLE_PLAN, materialPlan: seed.MATERIAL_PLAN, units: seed.UNITS,
  assignments: seed.ASSIGNMENTS, cashLimits: seed.CASH_LIMITS, users: seed.USERS, chains: seed.CHAINS,
  requests: seed.REQUESTS.map((r) => ({ ...r, chainId: r.chainId ?? chainFor(seed.CHAINS, seed.PROJECTS, r.type, r.chainageId)?.id })),
  grievances: seed.GRIEVANCES, tickets: seed.TICKETS, departments: seed.DEPARTMENTS, roles: seed.ROLES,
  // the sign-in read of GET /equipment-units fails offline and would empty the register; keep the sample units here
  loadUnits: async () => undefined,
  // GET /uoms as the dev server answers it (codes and names); the offline read would empty the list
  uoms: [['Bag (50 kg)', 'Bag (50 kg)'], ['Cum', 'Cubic metre'], ['KG', 'Kilogram'], ['LTR', 'Litre'], ['MT', 'Metric tonne'], ['NOS', 'Numbers'], ['Rmt', 'Running metre']]
    .map(([code, name], i) => ({ id: `00000000-0000-4000-8000-0000000000${10 + i}`, code, name, rowVersion: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })),
  loadUoms: async () => undefined,
})

describe('sign in', () => {
  beforeEach(() => { useAuth.setState(signedOutAuth); window.location.hash = '#/' })

  it('sends a signed-out visitor to the login page and keeps where they were going', async () => {
    window.location.hash = '#/approvals'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /login/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(window.location.hash).toContain('role=admin')
    expect(window.location.hash).toContain('next=%2Fapprovals')
  })

  it('signs in through the Core API: refuses a wrong password, then accepts the right one', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/login')) {
        const { password } = JSON.parse(String(init.body)) as { password: string }
        return password === 'right-password'
          ? reply(200, { data: { ...tokens, user: { id: 'u1', loginId: 'sweep.ops', name: 'Sweep Ops', email: null } } })
          : reply(401, { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Login id or password is incorrect' } })
      }
      if (url.endsWith('/auth/me/access')) return reply(200, { data: { userId: 'u1', suspended: false, grants: [], suspensions: [], privileges: [{ privilege: 'access.manage', source: 'role' }] } })
      return Promise.reject(new TypeError('offline'))
    }))
    const user = userEvent.setup()
    window.location.hash = '#/login?role=admin'
    render(<App />)
    const id = await screen.findByLabelText(/login id/i, {}, { timeout: 5000 })
    const pw = screen.getByLabelText(/^password/i)
    // the company comes from the login ID prefix (ACME → acme), so the form needs a company login
    await user.type(id, 'ACME9999')
    await user.type(pw, 'wrong-password')
    await user.click(screen.getByRole('button', { name: /^login$/i }))
    expect(await screen.findByText(/login id or password is wrong/i)).toBeInTheDocument()
    expect(useAuth.getState().user).toBeNull()

    await user.clear(pw)
    await user.type(pw, 'right-password')
    await user.click(screen.getByRole('button', { name: /^login$/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(useAuth.getState().user).toBe('sweep.ops')
    expect(useAuth.getState().isAdmin).toBe(true)
    // the tenant header goes on every call; the access token on protected ones
    const login = calls.find((c) => c.url.endsWith('/auth/login'))!
    expect((login.init.headers as Record<string, string>)['X-Tenant-Id']).toBeTruthy()
    const access = calls.find((c) => c.url.endsWith('/auth/me/access'))!
    expect((access.init.headers as Record<string, string>).Authorization).toBe('Bearer at')
  })

  it('waits as long as the server says after too many attempts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { 'Retry-After': '30' })))
    expect(await useAuth.getState().login('sweep.ops', 'nope')).toBe('locked')
    expect(useAuth.getState().lockedUntil).toBeGreaterThan(Date.now() + 25_000)
    // while locked, no request is sent at all
    expect(await useAuth.getState().login('sweep.ops', 'nope')).toBe('locked')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('reports an unreachable server instead of a wrong password', async () => {
    expect(await useAuth.getState().login('sweep.ops', 'any')).toBe('offline')
  })

  it('sends a user with a temporary password to change it first, then on to the dashboard', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/login')) return reply(200, { data: { ...tokens, user: { id: 'u1', loginId: 'ACME1001', name: 'New Admin', email: null }, mustChangePassword: true } })
      if (url.endsWith('/auth/me/access')) return reply(200, { data: { privileges: [{ privilege: 'access.manage', source: 'role' }] } })
      if (url.endsWith('/auth/change-password')) return reply(200, { data: { changed: true } })
      return Promise.reject(new TypeError('offline'))
    }))
    const user = userEvent.setup()
    window.location.hash = '#/login?role=admin'
    render(<App />)
    await user.type(await screen.findByLabelText(/login id/i, {}, { timeout: 5000 }), 'ACME1001')
    await user.type(screen.getByLabelText(/^password/i), 'Temp-pass-123')
    await user.click(screen.getByRole('button', { name: /^login$/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /change password/i }, { timeout: 5000 })).toBeInTheDocument()
    // nothing protected is read while the change is pending
    expect(calls.some((c) => /\/(projects|users|approval-requests)/.test(c.url))).toBe(false)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'Temp-pass-123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'short' } })
    await user.click(screen.getByRole('button', { name: /^change password$/i }))
    expect(await screen.findByText(/at least 12 characters\.$/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'A-much-longer-pass-1' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'A-much-longer-pass-1' } })
    await user.click(screen.getByRole('button', { name: /^change password$/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(useAuth.getState().mustChangePassword).toBe(false)
    const change = calls.find((c) => c.url.endsWith('/auth/change-password'))!
    expect(JSON.parse(String(change.init.body))).toEqual({ currentPassword: 'Temp-pass-123', newPassword: 'A-much-longer-pass-1' })
  })

  it('a 403 PASSWORD_CHANGE_REQUIRED from any call sends the signed-in user to change the password', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(403, { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password first' } })))
    useAuth.setState({ user: 'admin', isAdmin: true, privileges: ADMIN_PRIVILEGES, lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/dashboard'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /change password/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(useAuth.getState().mustChangePassword).toBe(true)
    useAuth.setState({ mustChangePassword: false })
  })
})

describe('projects API', () => {
  keepSeed()
  beforeEach(() => { signedIn() })

  it('creates a project with an Idempotency-Key and maps the record back', async () => {
    let sent: { headers: Record<string, string>; body: Record<string, unknown> } | null = null
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/projects') && init.method === 'POST') {
        sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> }
        return reply(201, { data: { id: '0b8e5f7e-1111-4111-8111-111111111111', code: 'RD-SRK', name: 'Srikakulam bypass', status: 'inactive', client: 'SRD', startDate: '2027-02-01', endDate: '2028-06-30', valueAmount: 125, description: null, rowVersion: 1 } })
      }
      return Promise.reject(new TypeError('offline'))
    }))
    const p = await useCore.getState().createProjectRemote({ code: 'RD-SRK', name: 'Srikakulam bypass', client: 'SRD', startDate: '2027-02-01', endDate: '2028-06-30', status: 'Completed', value: 125, description: '' })
    expect(sent!.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent!.body).toMatchObject({ code: 'RD-SRK', status: 'inactive', valueAmount: 125, description: null })
    expect(p).toMatchObject({ code: 'RD-SRK', status: 'Completed', value: 125, description: '', rowVersion: 1, milestones: [] })
    expect(useCore.getState().projects.some((x) => x.id === p.id)).toBe(true)
  })

  it('sends the row version on update and surfaces a version conflict', async () => {
    const id = '0b8e5f7e-2222-4222-8222-222222222222'
    useCore.setState((s) => ({ projects: [{ ...s.projects[0], id, rowVersion: 3 }, ...s.projects] }))
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return reply(409, { error: { code: 'VERSION_CONFLICT', message: 'The record was changed by someone else' } })
    }))
    const p = useCore.getState().projects[0]
    await expect(useCore.getState().updateProjectRemote(id, { ...p, status: 'Active' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 })
    expect(body.rowVersion).toBe(3)
  })
})

describe('project parts API', () => {
  keepSeed()
  const pid = '0b8e5f7e-3333-4333-8333-333333333333'
  const wbsId = '0b8e5f7e-4444-4444-8444-444444444444'
  beforeEach(() => {
    signedIn()
    useCore.setState((s) => ({ projects: [{ ...s.projects[0], id: pid, rowVersion: 1, milestones: [], wbs: [], zones: [], chainage: { startKm: 0, endKm: 0, markers: [] }, locationIds: [] }, ...s.projects.filter((p) => p.id !== pid)] }))
  })
  const project = () => useCore.getState().projects.find((p) => p.id === pid)!

  it('reads milestones, WBS, markers, zones and locations for one project', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      urls.push(url)
      if (url.includes('/wbs-nodes')) return reply(200, { data: [{ id: wbsId, code: '1', name: 'Earthwork', projectId: pid, parentWbsNodeId: null, status: 'active', rowVersion: 1 }] })
      if (url.includes('/milestones')) return reply(200, { data: [{ id: 'm1', projectId: pid, name: 'Survey', dueDate: '2027-01-10', weight: 20, status: 'achieved', rowVersion: 2 }] })
      if (url.includes('/chainage-markers')) return reply(200, { data: [{ id: 'k1', code: 'CH-12.5', label: 'Camp', projectId: pid, chainageKm: 12.5, wbsNodeId: wbsId, rowVersion: 1 }] })
      if (url.includes('/geo-zones')) return reply(200, { data: [{ id: 'z1', projectId: pid, label: 'Main', zoneType: 'attendance', shape: 'circle', centerLat: 17.1, centerLng: 79.6, radiusM: 300, points: null, bufferM: null, version: 2, rowVersion: 3, updatedAt: '2026-11-20T08:00:00Z' }] })
      if (url.includes('/locations')) return reply(200, { data: [{ id: 'l1', code: 'CAMP-A', name: 'Camp A', projectId: pid, status: 'active', addressLine: 'Km 12', city: 'Suryapet', state: 'Telangana', pin: '508213', inCharge: 'K. Raju', phone: '9848012345', email: null, rowVersion: 1 }] })
      return Promise.reject(new TypeError('offline'))
    }))
    await useCore.getState().loadProjectParts(pid)
    expect(urls.every((u) => u.endsWith(`?projectId=${pid}`))).toBe(true)
    const p = project()
    expect(p.milestones[0]).toMatchObject({ name: 'Survey', due: '2027-01-10', weight: 20, status: 'Done', rowVersion: 2 })
    expect(p.wbs[0]).toMatchObject({ code: '1', parentId: null })
    expect(p.chainage.markers[0]).toMatchObject({ km: 12.5, label: 'Camp', wbsCode: '1' })
    // the server keeps no range, so it is widened to cover the markers
    expect(p.chainage.startKm).toBeLessThanOrEqual(12.5)
    expect(p.chainage.endKm).toBeGreaterThan(12.5)
    expect(p.zones[0]).toMatchObject({ shape: 'Radius', radiusM: 300, purpose: 'Attendance', version: 2 })
    expect(p.locationIds).toEqual(['l1'])
    expect(useCore.getState().sites.find((s) => s.id === 'l1')).toMatchObject({ code: 'CAMP-A', projectId: pid, status: 'Active' })
    expect(useCore.getState().partsLoad[pid]).toBe('ready')
  })

  it('sends each zone shape with only its own fields', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      bodies.push(body)
      return reply(201, { data: { id: `z${bodies.length}`, projectId: pid, label: body.label, zoneType: body.zoneType, shape: body.shape, centerLat: body.centerLat, centerLng: body.centerLng, radiusM: body.radiusM, points: body.points, bufferM: body.bufferM, version: 1, rowVersion: 1, updatedAt: '2026-11-20T08:00:00Z' } })
    }))
    const base = { type: 'Other' as const, centerLat: 17, centerLng: 79, radiusM: 400, points: [[17, 79], [17.1, 79.1], [17.2, 79]] as [number, number][], bufferM: 50 }
    await useCore.getState().saveZoneDraft(pid, { ...base, label: 'Circle', shape: 'Radius', purpose: 'Attendance' })
    await useCore.getState().saveZoneDraft(pid, { ...base, label: 'Road', shape: 'Linear', purpose: 'Equipment' })
    expect(bodies[0]).toMatchObject({ projectId: pid, shape: 'circle', zoneType: 'attendance', radiusM: 400, points: null, bufferM: null })
    expect(bodies[1]).toMatchObject({ shape: 'corridor', zoneType: 'equipment', radiusM: null, bufferM: 50 })
    expect(project().zones.map((z) => z.purpose)).toEqual(['Attendance', 'Equipment'])
  })

  it('creates a marker with a CH code and the WBS node id, and a milestone with the API status', async () => {
    useCore.setState((s) => ({ projects: s.projects.map((p) => (p.id === pid ? { ...p, wbs: [{ id: wbsId, code: '1', name: 'Earthwork', parentId: null, rowVersion: 1 }] } : p)) }))
    const sent: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      sent.push(body)
      if (url.endsWith('/chainage-markers')) return reply(201, { data: { id: 'k9', code: body.code, label: body.label, projectId: pid, chainageKm: body.chainageKm, wbsNodeId: body.wbsNodeId, rowVersion: 1 } })
      return reply(201, { data: { id: 'm9', projectId: pid, name: body.name, dueDate: body.dueDate, weight: body.weight, status: body.status, rowVersion: 1 } })
    }))
    expect(await useCore.getState().addMarkers(pid, [{ km: 14.25, label: 'Bridge', wbsCode: '1' }])).toEqual([])
    await useCore.getState().saveMilestone(pid, { name: 'Handover', due: '2027-06-30', weight: 30, status: 'In progress' })
    expect(sent[0]).toMatchObject({ projectId: pid, code: 'CH-14.25', chainageKm: 14.25, wbsNodeId: wbsId })
    expect(sent[1]).toMatchObject({ projectId: pid, name: 'Handover', dueDate: '2027-06-30', weight: 30, status: 'pending' })
    expect(project().chainage.markers[0]).toMatchObject({ id: 'k9', km: 14.25, wbsCode: '1' })
    expect(project().milestones[0]).toMatchObject({ id: 'm9', status: 'Not started' })
  })

  it('refuses to change a project that was not read from the server, and keeps nothing in the browser', async () => {
    const sample = useCore.getState().projects.find((p) => p.rowVersion === undefined)!
    await expect(useCore.getState().addWbsNode(sample.id, { code: '99', name: 'Local item', parentId: null })).rejects.toMatchObject({ code: 'NOT_SAVED' })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(useCore.getState().projects.find((p) => p.id === sample.id)!.wbs.some((n) => n.code === '99')).toBe(false)
  })
})

describe('locations and stores API', () => {
  keepSeed()
  const pid = '0b8e5f7e-5555-4555-8555-555555555555'
  const loc = { id: 'l7', code: 'CAMP-Z', name: 'Camp Z', projectId: pid, status: 'inactive', addressLine: 'Km 40', city: 'Kodad', state: 'Telangana', pin: '508206', inCharge: 'N. Reddy', phone: '9811122200', email: null, rowVersion: 4 }
  beforeEach(() => {
    signedIn()
    useCore.setState((s) => ({ projects: [{ ...s.projects[0], id: pid, code: 'PZ', rowVersion: 1, locationIds: [], chainage: { startKm: 0, endKm: 0, markers: [{ id: 'k1', km: 3, label: 'Old', wbsCode: '1.1' }] } }, ...s.projects.filter((p) => p.id !== pid)] }))
  })

  it('reads locations, stores and markers and links them to the API projects', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/locations')) return reply(200, { data: [loc] })
      if (url.endsWith('/stores')) return reply(200, { data: [{ id: 's7', code: 'STR-Z', name: 'Camp Z store', locationId: 'l7', status: 'active', locationText: 'Near gate 2', keeper: 'S. Babu', phone: '9844400011', chainageMarkerId: 'k1', rowVersion: 2 }] })
      if (url.endsWith('/chainage-markers')) return reply(200, { data: [{ id: 'k1', code: 'CH-3', label: 'Gate', projectId: pid, chainageKm: 3, wbsNodeId: null, rowVersion: 1 }, { id: 'k2', code: 'CH-9', label: 'Bridge', projectId: pid, chainageKm: 9, wbsNodeId: null, rowVersion: 1 }] })
      return Promise.reject(new TypeError('offline'))
    }))
    await Promise.all([useCore.getState().loadSites(), useCore.getState().loadStores()])
    const st = useCore.getState()
    expect(st.sites).toEqual([expect.objectContaining({ id: 'l7', status: 'Inactive', email: '', projectId: pid, rowVersion: 4 })])
    expect(st.stores).toEqual([expect.objectContaining({ id: 's7', chainageId: 'k1', locationId: 'l7', location: 'Near gate 2', status: 'Active', rowVersion: 2 })])
    const p = st.projects.find((x) => x.id === pid)!
    expect(p.locationIds).toEqual(['l7'])
    // the full marker list has no WBS nodes, so a marker already known keeps its WBS code
    expect(p.chainage.markers.map((m) => [m.code, m.wbsCode])).toEqual([['CH-3', '1.1'], ['CH-9', '']])
  })

  it('creates a store with the API field names and refuses a stale edit', async () => {
    const calls: { method?: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      calls.push({ method: init.method, body })
      return init.method === 'POST'
        ? reply(201, { data: { id: 's8', code: body.code, name: body.name, locationId: body.locationId, status: body.status, locationText: body.locationText, keeper: body.keeper, phone: body.phone, chainageMarkerId: body.chainageMarkerId, rowVersion: 1 } })
        : reply(409, { error: { code: 'VERSION_CONFLICT', message: 'The record changed since you read it. Reload it and try again' } })
    }))
    const details = { code: 'STR-N', name: 'New store', chainageId: 'k1', locationId: 'l7', location: 'Yard 3', keeper: 'R. Rao', phone: '9844400012', status: 'Active' as const }
    const created = await useCore.getState().createStoreRemote(details)
    expect(calls[0].body).toEqual({ code: 'STR-N', name: 'New store', locationId: 'l7', status: 'active', locationText: 'Yard 3', keeper: 'R. Rao', phone: '9844400012', chainageMarkerId: 'k1' })
    await expect(useCore.getState().updateStoreRemote(created.id, { ...details, name: 'Renamed' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(calls[1]).toMatchObject({ method: 'PATCH', body: { name: 'Renamed', rowVersion: 1 } })
  })

  it('creates a location for one project and adds it to that project', async () => {
    let sent: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>
      return reply(201, { data: { ...loc, id: 'l8', status: 'active' } })
    }))
    const site = await useCore.getState().createSiteRemote(pid, { code: 'CAMP-Z', name: 'Camp Z', addressLine: 'Km 40', city: 'Kodad', state: 'Telangana', pin: '508206', inCharge: 'N. Reddy', phone: '9811122200', email: '', status: 'Active' })
    expect(sent).toMatchObject({ projectId: pid, code: 'CAMP-Z', status: 'active', email: null })
    expect(useCore.getState().projects.find((p) => p.id === pid)!.locationIds).toContain(site.id)
  })
})

describe('public pages', () => {
  beforeEach(() => { useAuth.setState(signedOutAuth); window.location.hash = '#/' })

  it('opens on the home page with Register and Login only', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /run your construction business/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^register$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /^login$/i }).length).toBeGreaterThan(0)
    for (const name of [/products/i, /services/i, /pricing/i, /contact/i]) expect(screen.queryByRole('link', { name })).toBeNull()
  })

  it('offers login as user or admin', async () => {
    window.location.hash = '#/login'
    render(<App />)
    expect(await screen.findByRole('link', { name: /login as user/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /login as admin/i })).toBeInTheDocument()
  })

  it('shows user-focused copy on the user login, without CORE wording', async () => {
    window.location.hash = '#/login?role=user'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /user login/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByLabelText(/^login id/i)).toBeInTheDocument()
    expect(screen.queryByText(/tenant admin/i)).toBeNull()
  })

  it('shows the registration form', async () => {
    window.location.hash = '#/register'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /registration/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^register$/i })).toBeInTheDocument()
  })
})

describe('CORE screens', () => {
  beforeEach(signedIn)

  it('every menu entry has a registered route', () => {
    const paths = new Set(ROUTES.map((r) => r.path))
    for (const g of NAV) for (const i of g.items) expect(paths.has(i.to), i.to).toBe(true)
  })

  it('every route with params has a sample URL', () => {
    for (const r of ROUTES) if (r.path.includes(':')) expect(r.sample, r.path).toBeTruthy()
  })

  it('every route renders inside the frame without errors', async () => {
    for (const { path, sample } of ROUTES) {
      const url = sample ?? path
      window.location.hash = `#${url}`
      const { unmount } = render(<App />)
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('contentinfo')).toBeInTheDocument()
      const h1 = await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })
      expect(h1.textContent?.length, url).toBeGreaterThan(0)
      expect(h1.textContent, url).not.toMatch(/not found/i)
      expect(screen.queryByText(/something went wrong/i), url).toBeNull()
      unmount()
    }
  })

  it('unknown address shows not-found inside the frame', async () => {
    window.location.hash = '#/nope'
    render(<App />)
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument()
  })

  it('a missing record shows a not-found state, not a crash', async () => {
    window.location.hash = '#/approvals/REQ-0000'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /request not found/i }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('every list page has a quick action button at the top right', async () => {
    const pages = ['/dashboard', '/approvals', '/grievances', '/job-openings', '/company', '/policies', '/projects', '/sites', '/stores', '/materials', '/stock', '/equipment/planning', '/equipment/register', '/approval-matrix', '/audit', '/organogram', '/departments']
    for (const path of pages) {
      window.location.hash = `#${path}`
      const { container, unmount } = render(<App />)
      await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })
      expect(container.querySelector('.ph .head-actions .btn.primary'), path).not.toBeNull()
      unmount()
    }
  })
})

describe('approval clarification, decision and job publishing', () => {
  beforeEach(signedIn)
  const reqId = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'
  const record = (over: Record<string, unknown> = {}) => ({
    id: reqId, code: 'REQ-9001', requestType: 'Job opening', module: 'HRMS', title: 'Site engineer', amount: null, status: 'pending', emergency: false,
    locationId: null, chainageMarkerId: 'CH-1', raisedById: 'raiser-1', raisedByName: 'Raiser', raisedAt: '2026-11-01T10:00:00Z',
    chainId: null, matrixVersionId: null, matrixVersion: 1, currentLevel: 1, assignedActorId: null, decidedAt: null,
    payloadJson: { kind: 'job', position: 'Site engineer', openings: 2, ctcMin: 500000, ctcMax: 800000, experience: '3 years', postedOnHrms: true },
    publishedLocationId: null, publishedAt: null, rowVersion: 3, ...over,
  })
  let saved: ReturnType<typeof useCore.getState>['requests'] = []
  beforeEach(() => { saved = useCore.getState().requests })
  afterEach(() => useCore.setState({ requests: saved }))

  it('clarify and respond send their action with the comment; the approver choice goes in decision', async () => {
    const bodies: Record<string, unknown>[] = []
    let next = record()
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith(`/approval-requests/${reqId}/actions`) && init.method === 'POST') {
        const b = JSON.parse(String(init.body)) as Record<string, unknown>
        bodies.push(b)
        next = record({ status: b.action === 'clarify' ? 'clarification_requested' : b.action === 'approve' ? 'approved' : 'pending', rowVersion: Number(b.rowVersion) + 1 })
        return reply(200, { data: next })
      }
      if (url.endsWith(`/approval-requests/${reqId}/actions`)) return reply(200, { data: [] })
      return Promise.reject(new TypeError('offline'))
    }))
    const { requestFrom } = await import('@/modules/core-data/api/approvals')
    useCore.setState({ requests: [requestFrom(record() as never)] })
    const s = () => useCore.getState()
    await s().clarifyRemote(reqId, 'clarify', 'Which site?')
    expect(s().requests[0].status).toBe('Clarification requested')
    await s().clarifyRemote(reqId, 'respond', 'Site 4')
    expect(s().requests[0].status).toBe('Pending')
    await s().decide(reqId, 'Approved', 'ok', undefined, 'Head Office posts and sends candidate')
    expect(bodies).toEqual([
      { action: 'clarify', comment: 'Which site?', rowVersion: 3 },
      { action: 'respond', comment: 'Site 4', rowVersion: 4 },
      { action: 'approve', comment: 'ok', decision: 'Head Office posts and sends candidate', rowVersion: 5 },
    ])
  })

  it('while a clarification is open, approve, reject and clarify are disabled', async () => {
    const { requestFrom } = await import('@/modules/core-data/api/approvals')
    useCore.setState({ requests: [requestFrom(record({ status: 'clarification_requested' }) as never)] })
    window.location.hash = `#/approvals/${reqId}`
    render(<App />)
    expect(await screen.findByRole('heading', { level: 2, name: /clarification requested/i }, { timeout: 5000 })).toBeInTheDocument()
    for (const name of [/^approve$/i, /^reject$/i, /^clarify$/i]) expect(screen.getByRole('button', { name })).toBeDisabled()
  })

  it('publishes an approved job opening to a location with its row version', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith(`/approval-requests/${reqId}/publish`)) {
        const b = JSON.parse(String(init.body)) as Record<string, unknown>
        bodies.push(b)
        return reply(200, { data: record({ status: 'approved', publishedLocationId: b.locationId, publishedAt: '2026-11-20T09:00:00Z', rowVersion: 4 }) })
      }
      return Promise.reject(new TypeError('offline'))
    }))
    const { requestFrom } = await import('@/modules/core-data/api/approvals')
    useCore.setState({ requests: [requestFrom(record({ status: 'approved' }) as never)] })
    await useCore.getState().publishJobRemote(reqId, 'loc-1')
    expect(bodies).toEqual([{ locationId: 'loc-1', rowVersion: 3 }])
    expect(useCore.getState().requests[0]).toMatchObject({ publishedLocationId: 'loc-1', publishedAt: '2026-11-20T09:00:00Z', rowVersion: 4 })
  })
})

describe('approvals filters and breadcrumb', () => {
  beforeEach(signedIn)

  it('category chips filter the list and can be combined; cards are not filters', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/approvals'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /approvals/i }, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /^filter:/i })).toBeNull()
    const shown = () => Number(screen.getByText(/^Showing \d+ records?$/).textContent?.match(/\d+/)?.[0])
    const all = shown()
    const chips = screen.getByRole('group', { name: /filter by categories/i })
    await user.click(within(chips).getByRole('button', { name: /^employee actions/i }))
    const employee = shown()
    expect(employee).toBeGreaterThan(0)
    expect(employee).toBeLessThan(all)
    await user.click(within(chips).getByRole('button', { name: /^payments and loans/i }))
    expect(shown()).toBeGreaterThan(employee)
    expect(within(chips).getByRole('button', { name: /^payments and loans/i })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(chips).getByRole('button', { name: /^all/i }))
    expect(shown()).toBe(all)
  })

  it('a ?category= link preselects that chip', async () => {
    window.location.hash = '#/approvals?category=Equipment+and+material'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /approvals/i }, { timeout: 5000 })
    const chips = screen.getByRole('group', { name: /filter by categories/i })
    expect(within(chips).getByRole('button', { name: /^equipment and material/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tabs read Pending, Approved and All', async () => {
    window.location.hash = '#/approvals'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /approvals/i }, { timeout: 5000 })
    const tabs = screen.getByRole('group', { name: /^show$/i })
    for (const t of ['Pending', 'Approved', 'All']) expect(within(tabs).getByRole('button', { name: t })).toBeInTheDocument()
  })

  it('breadcrumb links back to the parent page on a detail screen', async () => {
    window.location.hash = '#/projects/P-101'
    render(<App />)
    await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })
    const crumbs = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(crumbs.querySelector('a[href="#/projects"]')?.textContent).toBe('Projects')
    expect(crumbs.querySelector('a[href="#/dashboard"]')).not.toBeNull()
  })
})

describe('table sorting and dashboard order', () => {
  beforeEach(signedIn)

  it('dashboard lists emergency requests first', async () => {
    window.location.hash = '#/dashboard'
    render(<App />)
    const heading = await screen.findByRole('heading', { name: /awaiting approvals/i }, { timeout: 5000 })
    const panel = heading.closest('section') as HTMLElement
    const flags = within(panel).getAllByRole('row').slice(1).map((r) => /emergency/i.test(r.textContent ?? ''))
    const firstNormal = flags.indexOf(false)
    if (firstNormal >= 0) expect(flags.slice(firstNormal).some(Boolean)).toBe(false)
  })

  it('clicking a heading sorts ascending, descending, then back to the original order', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/approvals'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /approvals/i }, { timeout: 5000 })
    const ids = () => within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent ?? '')
    const original = ids()
    const th = screen.getAllByRole('columnheader').find((h) => h.querySelector('.th-sort')) as HTMLElement
    const btn = th.querySelector('.th-sort') as HTMLElement
    await user.click(btn)
    expect(th).toHaveAttribute('aria-sort', 'ascending')
    const asc = ids()
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })))
    await user.click(btn)
    expect(th).toHaveAttribute('aria-sort', 'descending')
    expect(ids()).toEqual([...asc].reverse())
    await user.click(btn)
    expect(th).toHaveAttribute('aria-sort', 'none')
    expect(ids()).toEqual(original)
  })
})

describe('CORE users', () => {
  beforeEach(signedIn)
  // set the whole value at once; per-key typing and paste can drop characters in jsdom under load
  const fillWith = (user: ReturnType<typeof userEvent.setup>) => async (el: HTMLElement, v: string) => {
    await user.click(el)
    fireEvent.change(el, { target: { value: v } })
    expect((el as HTMLInputElement).value).toBe(v)
  }

  it('creates a user through POST /users and shows the temporary password once, without storing it', async () => {
    const saved = useCore.getState().users
    const secret = 'Tmp-Only-Once-42'
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/users') && init.method === 'POST') {
        calls.push({ url, init })
        const b = JSON.parse(String(init.body)) as Record<string, unknown>
        return reply(201, { data: { id: '0b7c8a52-1d3e-4f6a-9b2c-3d4e5f6a7b8c', ...b, status: 'active', suspended: false, mustChangePassword: true, lastLoginAt: null, createdAt: '2026-11-20T10:00:00Z', rowVersion: 1, temporaryPassword: secret } })
      }
      return Promise.reject(new TypeError('offline'))
    }))
    const user = userEvent.setup()
    const fill = fillWith(user)
    window.location.hash = '#/users/new'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /new user/i }, { timeout: 5000 })
    await fill(screen.getByLabelText(/full name/i), 'Meena Joshi')
    await fill(screen.getByLabelText(/designation/i), 'Vice president, finance')
    await fill(screen.getByLabelText(/^email/i), 'meena.joshi@veloxiq.example')
    await fill(screen.getByLabelText(/mobile/i), '9811100099')
    await user.click(screen.getByRole('radio', { name: /high-level approver/i }))
    const create = screen.getByRole('button', { name: /create user/i })
    expect(create).toBeEnabled()
    expect(create).not.toHaveAttribute('title')
    await user.click(create)
    const dialog = await screen.findByRole('dialog', { name: /user created/i }, { timeout: 5000 })
    expect(within(dialog).getByText(secret)).toBeInTheDocument()
    expect(within(dialog).getByText(/will not be shown again/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(body).toMatchObject({ name: 'Meena Joshi', role: 'approver', modules: [], scopeType: 'company', scopeIds: [] })
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy()
    // the password is shown, never kept: not in the store and not in browser storage
    expect(useCore.getState().users.some((u) => u.name === 'Meena Joshi')).toBe(true)
    expect(JSON.stringify(useCore.getState())).not.toContain(secret)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(secret)
    expect(JSON.stringify({ ...localStorage })).not.toContain(secret)
    await user.click(within(dialog).getByRole('button', { name: /^done$/i }))
    expect(screen.queryByText(secret)).not.toBeInTheDocument()
    useCore.setState({ users: saved })
  })

  it('user chips filter the list', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/users'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /users and roles/i }, { timeout: 5000 })
    await user.click(within(screen.getByRole('group', { name: /filter by user types/i })).getByRole('button', { name: /^high-level approvers/i }))
    const approvers = useCore.getState().users.filter((u) => u.role === 'Approver' && u.status === 'Active').length
    expect(screen.getByText(new RegExp(`^Showing ${approvers} records?$`))).toBeInTheDocument()
  })

  it('new user, bulk upload and reset password are enabled; a reset shows the new password once', async () => {
    const secret = 'Reset-Once-77'
    const target = useCore.getState().users[0]
    const saved = useCore.getState().users
    // a server user (uuid id) so the reset is allowed
    const id = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    useCore.setState({ users: [{ ...target, id }, ...saved.slice(1)] })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith(`/users/${id}/password-reset`) && init.method === 'POST') { calls.push(url); return reply(200, { data: { temporaryPassword: secret } }) }
      return Promise.reject(new TypeError('offline'))
    }))
    const user = userEvent.setup()
    window.location.hash = '#/users'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /users and roles/i }, { timeout: 5000 })
    for (const b of [screen.getByRole('button', { name: /^new user$/i }), screen.getByRole('button', { name: /^bulk upload$/i }), ...screen.getAllByRole('button', { name: /reset password/i })]) {
      expect(b).toBeEnabled()
      expect(b).not.toHaveAttribute('title')
    }
    const row = screen.getByRole('button', { name: target.loginId }).closest('tr')!
    await user.click(within(row).getByRole('button', { name: /reset password/i }))
    await user.click(within(await screen.findByRole('dialog', { name: /reset password/i })).getByRole('button', { name: /reset password/i }))
    const dialog = await screen.findByRole('dialog', { name: /password reset/i }, { timeout: 5000 })
    expect(within(dialog).getByText(secret)).toBeInTheDocument()
    expect(within(dialog).getByText(/will not be shown again/i)).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(useCore.getState())).not.toContain(secret)
    expect(useCore.getState().users.find((u) => u.id === id)?.mustChangePassword).toBe(true)
    useCore.setState({ users: saved })
  })
})

describe('menu, notifications, grievances and offer letter', () => {
  beforeEach(signedIn)

  it('groups stores, materials, vendors, live stock and available materials under Inventory, and has no offer formats page', () => {
    expect(NAV.find((g) => g.label === 'Inventory/Store')?.items.map((i) => i.to)).toEqual(['/stores', '/materials', '/vendors', '/stock', '/available-materials'])
    expect(NAV.find((g) => g.label === 'Equipment')?.items.map((i) => i.to)).toEqual(['/equipment/register', '/equipment/maintenance', '/equipment/available', '/equipment/planning'])
    expect(NAV.flatMap((g) => g.items).some((i) => i.to === '/offer-formats')).toBe(false)
  })

  it('every notification points to a page that exists', () => {
    const patterns = ROUTES.map((r) => new RegExp(`^${r.path.replace(/:[^/]+/g, '[^/?]+')}(\\?.*)?$`))
    for (const n of NOTIFICATIONS) expect(patterns.some((re) => re.test(n.to)), n.to).toBe(true)
  })

  it('clicking a notification opens the page that needs the action', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/dashboard'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /dashboard/i }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: /^notifications/i }))
    await user.click(await screen.findByRole('button', { name: /Head Office visit requested/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'GRV-0118' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('a grievance shows only its ID, message and visit date, and the visit can be marked visited', async () => {
    const user = userEvent.setup()
    const g = useCore.getState().grievances.find((x) => x.id === 'GRV-0117')!
    useCore.setState((s) => ({ grievances: s.grievances.map((x) => (x.id === g.id ? { ...x, rowVersion: 3 } : x)) }))
    let sent: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method !== 'PATCH' || !url.endsWith('/grievances/GRV-0117')) return Promise.reject(new TypeError('offline'))
      sent = JSON.parse(String(init.body)) as Record<string, unknown>
      return reply(200, { data: { id: g.id, code: g.code, subject: g.subject, message: g.message, status: 'resolved', closedAt: null, sourceModule: null, sourceRecordId: null, raisedBy: g.raisedById, raisedByName: g.raisedBy, raisedAt: g.raisedAt, employeeId: null, employeeCode: null, visitDate: g.visitDate, rowVersion: 4 } })
    }))
    window.location.hash = '#/grievances/GRV-0117'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'GRV-0117' }, { timeout: 5000 })
    expect(screen.getByText(/of 10 words/i)).toBeInTheDocument()
    expect(screen.queryByText(/severity|reviewer|confidential/i)).toBeNull()
    const buttons = screen.getAllByRole('button', { name: /^mark visited$/i })
    await user.click(buttons[buttons.length - 1])
    await vi.waitFor(() => expect(useCore.getState().grievances.find((x) => x.id === 'GRV-0117')).toMatchObject({ status: 'Visited', rowVersion: 4 }))
    expect(sent).toMatchObject({ status: 'resolved', rowVersion: 3 })
  })

  it('company profile no longer shows the offer letter format card', async () => {
    window.location.hash = '#/company'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /company profile/i }, { timeout: 5000 })
    expect(screen.queryByText('Offer letter format')).toBeNull()
    expect(screen.queryByText('VeloxIQ-offer-letter-format.pdf')).toBeNull()
    expect(screen.queryByRole('button', { name: /update format/i })).toBeNull()
  })
})

describe('bulk upload, filters and view-first tabs', () => {
  beforeEach(signedIn)
  const stub = stubActions()

  it('bulk upload checks every row and adds only the good ones', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/materials'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /material masters/i }, { timeout: 5000 })
    const before = useCore.getState().materials.length
    // POST /materials, answered as the server would: the saved row comes back with its id and row version
    const saved: string[] = []
    stub({ saveMaterialRemote: async (m) => { saved.push(m.code); const x = { ...m, id: `srv-${m.code}`, rowVersion: 1 }; useCore.setState((s) => ({ materials: [x, ...s.materials] })); return x } })
    await user.click(screen.getByRole('button', { name: /bulk upload/i }))
    const csv = [
      'code,name,category,uom,hsn,reorder_level,store_codes,status',
      'STL-TMT20,TMT bar Fe 500D 20 mm,Steel,MT,7214,10,STR-A; STR-D,Active',
      'CEM-OPC53,Duplicate cement,Cement,Bag (50 kg),2523,100,STR-A,Active',
      'BAD-1,Unknown unit,Steel,Bucket,12,5,STR-Z,Active',
    ].join('\n')
    await user.upload(screen.getByLabelText(/csv file of materials/i), new File([csv], 'materials.csv', { type: 'text/csv' }))
    expect(await screen.findByText(/ready to add/i)).toBeInTheDocument()
    expect(screen.getByText(/material code CEM-OPC53 already exists/i)).toBeInTheDocument()
    expect(screen.getByText(/unknown store code/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^add 1 material$/i }))
    await vi.waitFor(() => expect(useCore.getState().materials.length).toBe(before + 1))
    expect(saved).toEqual(['STL-TMT20'])
    expect(useCore.getState().materials.some((m) => m.code === 'STL-TMT20')).toBe(true)
  })

  it('materials filter by status with chips', async () => {
    window.location.hash = '#/materials'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /material masters/i }, { timeout: 5000 })
    const chips = screen.getByRole('group', { name: /filter by statuses/i })
    expect(within(chips).getByRole('button', { name: /^active/i })).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: /^inactive/i })).toBeInTheDocument()
    expect(within(chips).queryByRole('button', { name: /more statuses/i })).not.toBeInTheDocument()
  })

  it('every equipment plan state has an example', async () => {
    window.location.hash = '#/equipment/planning'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /equipment planning/i }, { timeout: 5000 })
    const chips = screen.getByRole('group', { name: /filter by states/i })
    for (const s of ['Shortfall', 'Surplus', 'Fulfilled']) expect(within(chips).getByRole('button', { name: new RegExp(`^${s}`) })).toBeInTheDocument()
  })

})

describe('scoped approval chains and grievance raiser', () => {
  beforeEach(signedIn)

  it('a request uses its project chain, then the company chain', () => {
    const { chains, projects } = useCore.getState()
    expect(chainFor(chains, projects, 'Material', 'CH-7')?.id).toBe('AC-13')
    expect(chainFor(chains, projects, 'Advance payment', 'CH-7')?.id).toBe('AC-14')
    expect(chainFor(chains, projects, 'Material', 'CH-1')?.id).toBe('AC-6')
    expect(useCore.getState().requests.every((r) => !!r.chainId)).toBe(true)
  })

  it('creates a new approval chain for chosen projects, and refuses a second company chain', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/approval-matrix'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /approval matrix/i }, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /set up/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /new approval chain/i }))
    await screen.findByRole('heading', { level: 1, name: /new approval chain/i }, { timeout: 5000 })

    await user.click(screen.getByLabelText(/^request type/i))
    await user.click(screen.getByRole('option', { name: 'Equipment' }))
    await user.click(screen.getByRole('radio', { name: /whole company/i }))
    await user.click(screen.getAllByLabelText(/^approver/i)[0])
    await user.click(screen.getByRole('option', { name: 'Rahul Verma (VELOX1130)' }))
    fireEvent.change(screen.getByLabelText(/reason for change/i), { target: { value: 'Second company chain should be refused' } })
    await user.click(screen.getByRole('button', { name: /create chain/i }))
    expect(await screen.findByText(/already has a company chain \(AC-5\)/i)).toBeInTheDocument()

    // the sample project is not on the server, so the chain is refused rather than kept in the browser
    const before = useCore.getState().chains.length
    await user.click(screen.getByRole('radio', { name: /one or more projects/i }))
    await user.click(screen.getByRole('checkbox', { name: /NH65-PKG2/i }))
    await user.click(screen.getByRole('button', { name: /create chain/i }))
    expect(await screen.findByText(/not stored on the server, so the change was not saved/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(useCore.getState().chains.length).toBe(before)
  })

  it('grievances show who raised them', async () => {
    window.location.hash = '#/grievances'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /grievances/i }, { timeout: 5000 })
    expect(screen.getByText('Mahesh Yadav')).toBeInTheDocument()
    expect(useCore.getState().grievances.every((g) => g.raisedBy.length > 0)).toBe(true)
  })
})

describe('organisation: departments, roles and organogram', () => {
  beforeEach(signedIn)
  const stub = stubActions()
  const set = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })

  it('groups the organisation screens with job openings, and every menu item has its own icon', () => {
    expect(NAV.find((g) => g.label === 'People and organisation')?.items.map((i) => i.to)).toEqual(['/organogram', '/departments', '/users', '/approvals', '/job-openings'])
    expect(NAV.some((g) => g.label === 'Hiring and HR' || g.label === 'Organisation')).toBe(false)
    const icons = NAV.flatMap((g) => g.items.map((i) => i.icon))
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('structure rules: one top role, no reporting loops, no orphaned reports', () => {
    const { roles, departments } = useCore.getState()
    const base = { title: 'Chairman', code: 'CHR', departmentId: 'D-01', grade: 'E1' as const, reportsToId: '', positions: 1, holder: '', description: '', status: 'Active' as const }
    expect(roleRules(base, undefined, roles, departments).map(([f]) => f)).toContain('reportsToId')
    const pd = roles.find((r) => r.id === 'R-05')!
    expect(roleRules({ ...pd, grade: 'E3', reportsToId: 'R-07', holder: pd.holder }, 'R-05', roles, departments).some(([, m]) => /loop/i.test(m))).toBe(true)
    expect(roleRules({ ...pd, grade: 'E3', reportsToId: 'R-02', status: 'Inactive' }, 'R-05', roles, departments).some(([, m]) => /report to it/i.test(m))).toBe(true)
  })

  it('organogram highlights a department and adds a role under the one you open', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/organogram'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /organogram/i }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: /^chart$/i }))
    await user.click(screen.getByRole('button', { name: /^finance and accounts$/i }))
    expect(window.location.hash).toContain('dept=D-07')
    await user.click(screen.getByRole('button', { name: /chief financial officer, finance and accounts/i }))
    const dialog = await screen.findByRole('dialog', { name: /chief financial officer/i })
    expect(within(dialog).getByText('Kavya Reddy')).toBeInTheDocument()
    // POST /organisation/positions, answered as the server would (tests have no server, so an unstubbed save fails offline)
    stub({ saveRoleRemote: async (r) => { const x = { ...r, id: `srv-${r.code}`, rowVersion: 1 }; useCore.setState((s) => ({ roles: [...s.roles, x] })); return x } })
    await user.click(within(dialog).getByRole('button', { name: /add a role under it/i }))
    const form = await screen.findByRole('dialog', { name: /add a role under chief financial officer/i })
    set(within(form).getByLabelText(/role title/i), 'Treasury manager')
    set(within(form).getByLabelText(/role code/i), 'TRS-MGR')
    await user.click(within(form).getByLabelText(/^grade/i))
    await user.click(screen.getByRole('option', { name: /^M2 ·/ }))
    await user.click(within(form).getByRole('button', { name: /^add role$/i }))
    const created = useCore.getState().roles.find((r) => r.code === 'TRS-MGR')
    expect(created?.reportsToId).toBe('R-03')
    expect(created?.departmentId).toBe('D-07')
  })

  it('refuses to deactivate a department that still has active roles', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/departments'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /^departments$/i }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'HR' }))
    const form = await screen.findByRole('dialog', { name: /edit department/i })
    await user.click(within(form).getByLabelText(/^status/i))
    await user.click(screen.getByRole('option', { name: 'Inactive' }))
    await user.click(within(form).getByRole('button', { name: /save department/i }))
    expect(await within(form).findByText(/active roles? (is|are) in this department/i)).toBeInTheDocument()
    expect(useCore.getState().departments.find((d) => d.id === 'D-08')?.status).toBe('Active')
  })

  it('bulk upload of roles accepts a reporting line to a role earlier in the same file', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/users'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /^users and roles$/i }, { timeout: 5000 })
    // POST /organisation/positions, answered as the server would: each role gets a server id
    const sent: { code: string; reportsToId: string | null }[] = []
    stub({ saveRoleRemote: async (r) => { sent.push({ code: r.code, reportsToId: r.reportsToId }); const x = { ...r, id: `srv-${r.code}`, rowVersion: 1 }; useCore.setState((s) => ({ roles: [...s.roles, x] })); return x } })
    await user.click(screen.getByRole('button', { name: /^roles$/i }))
    await user.click(within(screen.getByRole('region', { name: /^roles$/i })).getByRole('button', { name: /bulk upload/i }))
    const csv = [
      'code,title,department_code,grade,reports_to_code,positions,held_by,description,status',
      'LEG-HD,Head of legal,MGT,M1,MD,1,Priya Menon,Contracts and claims,Active',
      'LEG-OFF,Legal officer,MGT,S2,LEG-HD,2,,,Active',
      'BAD,Orphan role,MGT,S2,NOPE,1,,,Active',
    ].join('\n')
    await user.upload(screen.getByLabelText(/csv file of roles/i), new File([csv], 'roles.csv', { type: 'text/csv' }))
    expect(await screen.findByText(/no role with code NOPE/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^add 2 roles$/i }))
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    // the second role reports to the id the server gave the first one
    expect(sent[1]).toEqual({ code: 'LEG-OFF', reportsToId: 'srv-LEG-HD' })
    expect(useCore.getState().roles.find((r) => r.code === 'LEG-OFF')?.reportsToId).toBe('srv-LEG-HD')
  })

  it('people planning bulk upload flags unknown projects and adds the good rows', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/people-planning'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /resource planning/i }, { timeout: 5000 })
    const before = useCore.getState().peoplePlan.length
    // POST /plan-lines, answered as the server would
    stub({ savePeoplePlanRemote: async (l) => { const x = { ...l, id: `srv-${l.role}`, rowVersion: 1 }; useCore.setState((s) => ({ peoplePlan: [x, ...s.peoplePlan] })); return x } })
    await user.click(screen.getByRole('button', { name: /bulk upload/i }))
    const project = useCore.getState().projects[0]
    const position = useCore.getState().roles[0]
    const csv = [
      'project_code,position,role,headcount,from,to,status',
      `${project.code},${position.title},Electrician,4,2027-03-01,2027-05-31,Planned`,
      `NOPE-99,${position.title},Mason,2,2027-01-01,2027-02-28,Planned`,
    ].join('\n')
    await user.upload(screen.getByLabelText(/csv file of requirements/i), new File([csv], 'people.csv', { type: 'text/csv' }))
    expect(await screen.findByText(/project_code NOPE-99 does not exist/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^add 1 requirement$/i }))
    await vi.waitFor(() => expect(useCore.getState().peoplePlan.length).toBe(before + 1))
  })

  it('material planning bulk upload flags unknown materials and adds the good rows', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/material-planning'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /material planning/i }, { timeout: 5000 })
    const before = useCore.getState().materialPlan.length
    await user.click(screen.getByRole('button', { name: /bulk upload/i }))
    const project = useCore.getState().projects[0]
    const csv = [
      'project_code,material,qty,required_by,store,status',
      `${project.code},NO SUCH MATERIAL,5,2027-04-01,STR-A,Planned`,
    ].join('\n')
    await user.upload(screen.getByLabelText(/csv file of material lines/i), new File([csv], 'material.csv', { type: 'text/csv' }))
    expect(await screen.findByText(/material NO SUCH MATERIAL does not exist or is not Active/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^add 0 material lines$/i })).toBeDisabled()
    expect(useCore.getState().materialPlan.length).toBe(before)
  })
})

describe('moneyShort', () => {
  it('uses Cr and L with decimals only when needed', async () => {
    const { moneyShort } = await import('@/shared/lib/format')
    expect(moneyShort(10_670_000_000)).toBe('₹1,067 Cr')
    expect(moneyShort(10_000_000)).toBe('₹1 Cr')
    expect(moneyShort(12_500_000)).toBe('₹1.25 Cr')
    expect(moneyShort(1_250_000)).toBe('₹12.5 L')
    expect(moneyShort(295_540)).toBe('₹2.96 L')
    expect(moneyShort(95_540)).toBe('₹95,540')
  })
})

describe('subscription', () => {
  it('is in the sidebar and registered as a route', () => {
    const items = NAV.flatMap((g) => g.items)
    expect(items.some((i) => i.to === '/subscription' && i.label === 'Subscription')).toBe(true)
    expect(ROUTES.some((r) => r.path === '/subscription')).toBe(true)
  })
})

describe('subscription page', () => {
  it('renders plan, usage, billing and invoices', async () => {
    signedIn()
    window.location.hash = '#/subscription'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /subscription/i }, { timeout: 8000 })).toBeInTheDocument()
    expect(await screen.findByText(/SUB-VIQ-0042/)).toBeInTheDocument()
    expect(screen.getByText('INV-2025-118')).toBeInTheDocument()
  })
})
