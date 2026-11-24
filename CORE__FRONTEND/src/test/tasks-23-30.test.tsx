import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { matches } from '@/modules/approvals/utils/inbox'
import { useAuth } from '@/modules/auth'
import { eventState } from '@/modules/core-data/api/integration'
import { searchTarget } from '@/modules/core-data/api/search'
import { compareVersions } from '@/modules/company/utils/versionCompare'
import EventMonitor from '@/modules/integrations/pages/EventMonitor'
import ReadModels from '@/modules/integrations/pages/ReadModels'
import { ConnectivityBanner } from '@/modules/shell/components/ConnectivityBanner'
import { CommandPalette } from '@/modules/shell/components/CommandPalette'
import { api } from '@/shared/lib/api'

// 23–30 November frontend tasks: event monitor (23-02, 23-03), read models (24-01, 24-02), version compare (25-02),
// record search (25-03), inbox level filter (23-01) and the outage banner (28-03). Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', direction: 'outbound', eventId: '11111111-1111-4111-8111-111111111111', eventType: 'approval_request.decided', aggregateType: 'approval_request',
  aggregateId: '22222222-2222-4222-8222-222222222222', aggregateSeq: 2, sourceModule: 'core', status: 'dead_lettered', attempts: 3,
  lastError: 'Broker refused the message', nextAttemptAt: null, occurredAt: '2026-11-22T09:00:00Z', createdAt: '2026-11-22T09:00:00Z',
  publishedAt: null, processedAt: null, deadLetteredAt: '2026-11-22T09:05:00Z', replayStatus: null, correlationId: 'req-1', payloadKeys: ['status', 'code'], ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuth.setState({ privileges: [] })
})

describe('event states', () => {
  it('shows only what the server recorded', () => {
    expect(eventState({ status: 'pending', attempts: 0 })).toBe('Queued')
    expect(eventState({ status: 'pending', attempts: 2 })).toBe('Retrying')
    expect(eventState({ status: 'published', attempts: 1 })).toBe('Sent')
    expect(eventState({ status: 'dead_lettered', attempts: 5 })).toBe('Dead-letter')
    expect(eventState({ status: 'processed', attempts: 0 })).toBe('Processed')
  })
})

describe('event monitor', () => {
  it('lists events with field names only, and replays a dead-letter only after confirming, reporting what the server says', async () => {
    const posts: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') { posts.push(url); return reply(200, { data: event({ status: 'pending', attempts: 0, replayStatus: 'requested' }) }) }
      if (url.includes('/summary')) return reply(200, { data: { counts: [{ direction: 'outbound', status: 'dead_lettered', count: 1 }], oldestPendingAt: null, deadLettered: 1 } })
      return reply(200, { data: [event()], meta: { total: 1 } })
    }))
    render(<MemoryRouter><EventMonitor /></MemoryRouter>)
    expect(await screen.findByText('Broker refused the message')).toBeInTheDocument()
    expect(screen.getAllByText('Dead-letter').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    const details = await screen.findByRole('dialog')
    expect(within(details).getByText('status, code')).toBeInTheDocument()
    expect(within(details).getByText('Values are not shown here.')).toBeInTheDocument()
    fireEvent.click(within(details).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    const confirm = await screen.findByRole('dialog')
    expect(posts).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replay event' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toContain('/integration-events/e1/replay')
  })

  it('says the figures may be out of date when a refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(500, { error: { code: 'INTERNAL', message: 'Server error.' } })))
    render(<MemoryRouter><EventMonitor /></MemoryRouter>)
    expect(await screen.findByText(/The events could not be loaded/)).toBeInTheDocument()
  })
})

describe('read models', () => {
  function Where() { const l = useLocation(); return <output data-testid="where">{l.search}</output> }

  it('keeps the module and search in the address, and does not judge freshness', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      urls.push(url)
      if (url.includes('sync-status')) return reply(200, { data: [{ sourceModule: 'hrms', entityType: 'employee', records: 3, lastSeq: 9, lastSyncedAt: '2026-11-22T08:00:00Z' }] })
      return reply(200, { data: [{ id: 'r1', sourceModule: 'hrms', entityType: 'employee', sourceId: '33333333-3333-4333-8333-333333333333', sourceSeq: 9, deleted: false, syncedAt: '2026-11-22T08:00:00Z', data: { name: 'Asha Rao' } }], meta: { total: 1 } })
    }))
    render(<MemoryRouter initialEntries={['/integrations/read-models']}><Routes><Route path="/integrations/read-models" element={<><ReadModels /><Where /></>} /></Routes></MemoryRouter>)
    expect(await screen.findByText('name: Asha Rao')).toBeInTheDocument()
    expect(screen.getByText(/the freshness threshold is an open owner decision/i)).toBeInTheDocument()
    fireEvent.change(document.querySelector('select[name="module"]')!, { target: { value: 'hrms' } })
    fireEvent.change(document.querySelector('input[name="q"]')!, { target: { value: 'Asha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('?module=hrms&q=Asha'))
    await waitFor(() => expect(urls.some((u) => u.includes('/ref-records?sourceModule=hrms&q=Asha'))).toBe(true))
  })
})

describe('policy version compare', () => {
  it('lists every field with both values and marks what changed', () => {
    const rows = compareVersions({ amount: 50000, rules: [{ title: 'A' }] }, { amount: 75000, rules: [{ title: 'A' }, { title: 'B' }] })
    expect(rows.find((r) => r.field === 'Amount')).toEqual({ field: 'Amount', from: '50000', to: '75000', changed: true })
    expect(rows.find((r) => r.field === 'Rules › 1 › Title')?.changed).toBe(false)
    expect(rows.find((r) => r.field === 'Rules › 2 › Title')).toMatchObject({ from: 'Not set', to: 'B', changed: true })
  })
})

describe('record search in the command menu', () => {
  it('looks records up on the server after a pause in typing, and opens the record', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      urls.push(url)
      return reply(200, { data: [{ type: 'project', id: 'p1', code: 'NH-44', label: 'Fictional Highway', rank: 0 }] })
    }))
    function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}</output> }
    render(<MemoryRouter><CommandPalette open onOpenChange={() => undefined} onToggleDrawer={() => undefined} /><Where /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/Type a page, action/), { target: { value: 'NH' } })
    expect(urls).toHaveLength(0)
    const hit = await screen.findByText('Fictional Highway (NH-44)', {}, { timeout: 2000 })
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('/search?q=NH')
    fireEvent.click(hit)
    expect(screen.getByTestId('where').textContent).toBe('/projects/p1')
    expect(searchTarget({ type: 'vendor', id: 'v1' })).toBe('/vendors')
  })
})

describe('approvals inbox: current level', () => {
  it('matches requests still waiting at that level only', () => {
    const r = { module: 'HRMS', raisedAt: '2026-11-20T10:00:00Z', currentLevel: 2, status: 'In review' } as never
    const decided = { module: 'HRMS', raisedAt: '2026-11-20T10:00:00Z', currentLevel: 2, status: 'Approved' } as never
    expect(matches(r, { module: '', from: '', to: '', level: '2' })).toBe(true)
    expect(matches(r, { module: '', from: '', to: '', level: '1' })).toBe(false)
    expect(matches(decided, { module: '', from: '', to: '', level: '2' })).toBe(false)
  })
})

describe('outage banner', () => {
  it('appears when the server cannot be reached or is being updated, and clears on the next answer', async () => {
    render(<ConnectivityBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await act(async () => { await api('GET', '/health', { auth: false }).catch(() => undefined) })
    expect(screen.getByRole('alert')).toHaveTextContent('Core cannot reach the server.')
    vi.stubGlobal('fetch', vi.fn(() => reply(503, { error: { code: 'UNAVAILABLE', message: 'Updating' } })))
    await act(async () => { await api('GET', '/vendors', { auth: false }).catch(() => undefined) })
    expect(screen.getByRole('alert')).toHaveTextContent('Core is being updated.')
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { data: { status: 'ok' } })))
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
