import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCore } from '@/modules/core-data'
import * as seed from '@/modules/core-data/data/seed'
import { RaiseRequestDialog } from '@/modules/approvals/components/RaiseRequestDialog'

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const PROJECT = '11111111-1111-4111-8111-111111111111'
const SITE = '22222222-2222-4222-8222-222222222222'
const OTHER_SITE = '22222222-2222-4222-8222-999999999999'
const MARKER = '33333333-3333-4333-8333-333333333333'
const MATERIAL = '44444444-4444-4444-8444-444444444444'
const STORE = '55555555-5555-4555-8555-555555555555'

/** One server project with a location and a chainage marker, and the material, store and unit pickers' lists. */
function serverLists() {
  const material = { ...seed.MATERIALS[0], id: MATERIAL, name: 'Cement OPC 53', code: 'CEM-53', uom: 'MT', status: 'Active' as const, rowVersion: 1 }
  useCore.setState({
    projects: [{
      ...seed.PROJECTS[0], id: PROJECT, name: 'Server project', rowVersion: 1,
      chainage: { startKm: 0, endKm: 10, markers: [{ id: MARKER, km: 2.5, label: 'CH-1' }] },
    }],
    sites: [
      { ...seed.SITES[0], id: SITE, name: 'Camp A', status: 'Active', rowVersion: 1 },
      // a location of another project is not offered
      { ...seed.SITES[0], id: OTHER_SITE, name: 'Elsewhere', status: 'Active', projectId: '66666666-6666-4666-8666-666666666666', rowVersion: 1 },
    ],
    materials: [material],
    stores: [{ ...seed.STORES[0], id: STORE, name: 'Main store', status: 'Active', rowVersion: 1 }],
    uoms: [['KG', 'Kilogram'], ['MT', 'Metric tonne']]
      .map(([code, name], i) => ({ id: `00000000-0000-4000-8000-0000000000${10 + i}`, code, name, rowVersion: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })),
    requests: [],
  })
}

const pick = (name: string, value: string) => {
  const el = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`)
  if (!el) throw new Error(`no select ${name}`)
  fireEvent.change(el, { target: { value } })
}
const type = (name: string, value: string) => {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!el) throw new Error(`no input ${name}`)
  fireEvent.change(el, { target: { value } })
}

describe('raising a request', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  beforeEach(() => {
    const s = useCore.getState()
    saved = { projects: s.projects, sites: s.sites, materials: s.materials, stores: s.stores, uoms: s.uoms, requests: s.requests }
    serverLists()
  })
  afterEach(() => useCore.setState(saved))

  it('sends the material payload and chainage in the POST body', async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://x').pathname.replace(/^\/api/, '')
      if (path === '/approval-requests' && init.method === 'POST') {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return reply(201, { data: { id: '77777777-7777-4777-8777-777777777777', code: 'REQ-9001' } })
      }
      if (path === '/approval-requests') return reply(200, { data: [] })
      return reply(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
    }))
    const onClose = vi.fn()
    render(<RaiseRequestDialog onClose={onClose} />)

    pick('requestType', 'Material')
    type('title', 'Cement for pier P1')
    type('amount', '250000')
    pick('projectId', PROJECT)
    // only the project's own location is offered
    pick('chainageMarkerId', MARKER)
    pick('materialId', MATERIAL)
    type('qty', '300')
    pick('storeId', STORE)
    fireEvent.click(screen.getByLabelText(/required by/i))
    const calendar = await screen.findByRole('dialog', { name: 'Choose date' })
    fireEvent.click(calendar.querySelectorAll<HTMLButtonElement>('.dp-grid button')[15])
    fireEvent.click(screen.getByRole('button', { name: 'Raise request' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      requestType: 'Material', module: 'Stores', title: 'Cement for pier P1', amount: 250000,
      projectId: PROJECT, chainageMarkerId: MARKER, emergency: false,
      payload: { kind: 'material', materialId: MATERIAL, qty: 300, uom: 'MT', storeId: STORE },
    })
    expect((posts[0].payload as { neededBy: string }).neededBy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // a material request's Required by date is also the request's needed-by date
    expect(posts[0].neededBy).toBe((posts[0].payload as { neededBy: string }).neededBy)
  })

  it('asks when a request is needed unless it is an emergency', async () => {
    render(<RaiseRequestDialog onClose={() => undefined} />)
    pick('requestType', 'Advance payment')
    type('title', 'Mobilisation advance')
    fireEvent.click(screen.getByRole('button', { name: 'Raise request' }))
    const form = screen.getByRole('button', { name: 'Raise request' }).closest('form')!
    expect(await within(form).findByText('Enter the date this is needed by, or mark the request as an emergency.')).toBeInTheDocument()
    pick('emergency', 'true')
    await waitFor(() => expect(within(form).queryByText(/Needed by/)).toBeNull())
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('shows the missing payload fields and sends nothing', async () => {
    render(<RaiseRequestDialog onClose={() => undefined} />)
    pick('requestType', 'Material')
    type('title', 'Cement')
    fireEvent.click(screen.getByRole('button', { name: 'Raise request' }))
    const form = screen.getByRole('button', { name: 'Raise request' }).closest('form')!
    expect(await within(form).findByText('Material is required.')).toBeInTheDocument()
    expect(within(form).getByText('Required by is required.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
