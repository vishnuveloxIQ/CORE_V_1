import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/modules/auth'
import { useCore, type ApprovalChain } from '@/modules/core-data'
import { requestFrom, type RequestRecord } from '@/modules/core-data/api/approvals'
import * as seed from '@/modules/core-data/data/seed'
import ApprovalDetail from '@/modules/approvals/pages/ApprovalDetail'
import ApprovalsList from '@/modules/approvals/pages/ApprovalsList'
import ChainEditor from '@/modules/approvals/pages/ChainEditor'
import { matches } from '@/modules/approvals/utils/inbox'
import { ApiError } from '@/shared/lib/api'

// CORE-21-02 and CORE-21-04: the decision (scope, current approver only, a confirmation, one send per action), the
// inbox filters, and editing a chain into a new matrix version. Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const ME = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const RAISER = '00000000-0000-4000-8000-000000000003'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const SITE = '22222222-2222-4222-8222-222222222222'
const MARKER = '33333333-3333-4333-8333-333333333333'
const REQ = '44444444-4444-4444-8444-444444444444'

const level = (levelNo: number, approverUserId: string) => ({
  id: `l${levelNo}`, matrixVersionId: 'v1', levelNo, approverUserId, approverRoleId: null, timeoutHours: 24, onTimeout: 'remind',
  cashLimitInr: null, escalateToUserId: null, amountFrom: 0, amountTo: null, rowVersion: 1,
})

const record = (extra: Partial<RequestRecord> = {}): RequestRecord => ({
  id: REQ, code: 'APR-2026-0042', requestType: 'Manpower requisition', module: 'HRMS', title: 'Two surveyors', amount: 0,
  status: 'pending', emergency: false, locationId: SITE, chainageMarkerId: MARKER, raisedById: RAISER, raisedByName: 'Raiser',
  raisedAt: '2026-11-20T10:00:00Z', chainId: 'c1', matrixVersionId: 'v1', matrixVersion: 1, currentLevel: 1,
  payloadJson: { kind: 'mrf', position: 'Surveyor', count: 2, requiredBy: '2026-12-01', reason: 'New stretch' },
  assignedActorId: ME, decidedAt: null, rowVersion: 3,
  levelsSnapshot: [level(1, ME), level(2, OTHER)] as unknown as RequestRecord['levelsSnapshot'],
  ...extra,
})

function serverState(req = record()) {
  useCore.setState({
    requests: [requestFrom(req)],
    users: [
      { ...seed.USERS[0]!, id: ME, name: 'Me Approver' },
      { ...seed.USERS[0]!, id: OTHER, name: 'Second Approver' },
      { ...seed.USERS[0]!, id: RAISER, name: 'Raiser' },
    ],
    projects: [{ ...seed.PROJECTS[0]!, id: PROJECT, code: 'NH-44', name: 'Fictional Highway', rowVersion: 1, chainage: { startKm: 0, endKm: 10, markers: [{ id: MARKER, km: 2, label: 'CH-2', wbsCode: '' }] } }],
    sites: [{ ...seed.SITES[0]!, id: SITE, code: 'CAMP-A', name: 'Camp A', projectId: PROJECT, status: 'Active', rowVersion: 1 }],
  })
  useAuth.setState({ profile: { ...(useAuth.getState().profile ?? {}), id: ME } as never })
}

const renderDetail = () =>
  render(<MemoryRouter initialEntries={[`/approvals/${REQ}`]}><Routes><Route path="/approvals/:id" element={<ApprovalDetail />} /></Routes></MemoryRouter>)

describe('deciding a request', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  let posts: Record<string, unknown>[] = []
  beforeEach(() => {
    const s = useCore.getState()
    saved = { requests: s.requests, users: s.users, projects: s.projects, sites: s.sites }
    posts = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST' && url.includes('/actions')) {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        // a slow server, so a second click arrives while the first save is still running
        return new Promise((resolve) => setTimeout(() => resolve(reply(200, { data: record({ currentLevel: 2, assignedActorId: OTHER, rowVersion: 4 }) })), 30))
      }
      return reply(200, { data: [] })
    }))
    serverState()
  })
  afterEach(() => {
    useCore.setState(saved)
    vi.unstubAllGlobals()
  })

  it('shows the project and site the decision applies to', async () => {
    renderDetail()
    const scope = within(await screen.findByRole('group', { name: 'Applies to' }))
    expect(scope.getByText('Fictional Highway (NH-44)')).toBeInTheDocument()
    expect(scope.getByText('Camp A (CAMP-A)')).toBeInTheDocument()
  })

  it('asks for confirmation before approving, and sends one action however often Confirm is clicked', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Approve APR-2026-0042?')).toBeInTheDocument()
    expect(within(dialog).getByText('It moves on to L2.')).toBeInTheDocument()
    expect(posts).toHaveLength(0)
    const confirm = within(dialog).getByRole('button', { name: 'Confirm approval' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(useCore.getState().requests[0]?.currentLevel).toBe(2))
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ action: 'approve', rowVersion: 3 })
  })

  it('going back from the confirmation sends nothing', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts).toHaveLength(0)
  })

  it('needs a reason to reject, then confirms that rejection is final', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByText('Give a reason for rejecting (at least 5 characters).')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Enter reason, conditions or notes'), { target: { value: 'Not in this year’s budget' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('The request is closed as rejected. This cannot be undone.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ action: 'reject', comment: 'Not in this year’s budget' })
  })

  it('offers no decision to someone who is not the approver at the current level', async () => {
    serverState(record({ currentLevel: 2, assignedActorId: OTHER }))
    renderDetail()
    expect(await screen.findByText('Waiting on Second Approver')).toBeInTheDocument()
    for (const name of ['Approve', 'Reject', 'Clarify']) expect(screen.getByRole('button', { name })).toBeDisabled()
  })

  it('leaves a level that also names a role to the server', async () => {
    const withRole = { ...level(2, OTHER), approverRoleId: '55555555-5555-4555-8555-555555555555' }
    serverState(record({ currentLevel: 2, assignedActorId: OTHER, levelsSnapshot: [level(1, ME), withRole] as unknown as RequestRecord['levelsSnapshot'] }))
    renderDetail()
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled()
  })
})

describe('the approvals inbox', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  beforeEach(() => {
    saved = { requests: useCore.getState().requests }
    useCore.setState({
      requests: [
        requestFrom(record({ id: 'a', code: 'APR-1', module: 'HRMS', title: 'HR request', raisedAt: '2026-11-02T10:00:00Z' })),
        requestFrom(record({ id: 'b', code: 'APR-2', module: 'Stores', title: 'Stores request', raisedAt: '2026-11-15T10:00:00Z' })),
        requestFrom(record({ id: 'c', code: 'APR-3', module: 'Stores', title: 'Late stores request', raisedAt: '2026-11-20T10:00:00Z' })),
      ],
    })
  })
  afterEach(() => useCore.setState(saved))

  const shown = () => ['APR-1', 'APR-2', 'APR-3'].filter((t) => screen.queryAllByText(t).length > 0)

  it('filters by module, and clears the filter', async () => {
    render(<MemoryRouter><ApprovalsList /></MemoryRouter>)
    expect(shown()).toEqual(['APR-1', 'APR-2', 'APR-3'])
    fireEvent.change(document.querySelector('select[name="module"]')!, { target: { value: 'Stores' } })
    await waitFor(() => expect(shown()).toEqual(['APR-2', 'APR-3']))
    expect(screen.getByText('2 requests match these filters.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(shown()).toHaveLength(3))
  })

  it('matches the day raised inclusively at both ends', () => {
    const [a, b, c] = useCore.getState().requests
    const range = { module: '', from: '2026-11-15', to: '2026-11-20' }
    expect([a, b, c].map((r) => matches(r!, range))).toEqual([false, true, true])
    expect([a, b, c].map((r) => matches(r!, { module: 'Stores', from: '', to: '2026-11-15' }))).toEqual([false, true, false])
  })
})

describe('editing a chain into a new matrix version', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  const chain: ApprovalChain = {
    id: 'c1', name: 'Hiring chain', requestType: 'Manpower requisition', module: 'HRMS', raisedBy: 'HRMS', isActive: true, timeoutHours: 24,
    scopeType: 'Company', scopeIds: [], rowVersion: 1,
    versions: [{ version: 1, effectiveFrom: '2026-11-01', reason: 'First version', updatedBy: 'Me Approver', updatedAt: '2026-11-01T09:00:00Z', levels: [{ approverId: ME, timeoutHours: 24, onTimeout: 'Remind approver only' }] }],
  }
  beforeEach(() => {
    const s = useCore.getState()
    saved = { chains: s.chains, users: s.users, addChainVersion: s.addChainVersion, loadChains: s.loadChains }
    serverState()
    useCore.setState({ chains: [chain] })
  })
  afterEach(() => useCore.setState(saved))

  const renderEditor = () =>
    render(<MemoryRouter initialEntries={['/approval-matrix/c1?edit=1']}><Routes><Route path="/approval-matrix/:id" element={<ChainEditor />} /></Routes></MemoryRouter>)

  it('saves the edited levels and the reason as one new version, once, even after a double click', async () => {
    const addChainVersion = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
    useCore.setState({ addChainVersion })
    renderEditor()
    fireEvent.change(await screen.findByPlaceholderText(/Enter the reason for this change/), { target: { value: 'Add a second approver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }))
    fireEvent.change(document.querySelector('select[name="levels.1.approverId"]')!, { target: { value: OTHER } })
    const save = screen.getByRole('button', { name: 'Save Configuration' })
    await act(async () => {
      fireEvent.click(save)
      fireEvent.click(save)
    })
    await waitFor(() => expect(addChainVersion).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 60))
    expect(addChainVersion).toHaveBeenCalledTimes(1)
    const [chainId, version] = addChainVersion.mock.calls[0] as unknown as [string, { reason: string; levels: Array<{ approverId: string; onTimeout: string }> }]
    expect(chainId).toBe('c1')
    expect(version.reason).toBe('Add a second approver')
    expect(version.levels.map((l) => l.approverId)).toEqual([ME, OTHER])
    // requests are never escalated: every level reminds its own approver again (owner decision, 2026-11-22)
    expect(version.levels.map((l) => l.onTimeout)).toEqual(['Remind approver only', 'Remind approver only'])
  })

  it('on a version conflict, reloads the chains and asks the user to check and save again', async () => {
    const loadChains = vi.fn(async () => {})
    useCore.setState({ addChainVersion: vi.fn(async () => { throw new ApiError(409, 'VERSION_CONFLICT', 'The record changed since you read it.') }), loadChains })
    renderEditor()
    fireEvent.change(await screen.findByPlaceholderText(/Enter the reason for this change/), { target: { value: 'Shorter timeout' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }))
    expect(await screen.findByText('Someone else changed this. The latest version is loaded; check it and save again.')).toBeInTheDocument()
    expect(loadChains).toHaveBeenCalled()
  })
})
