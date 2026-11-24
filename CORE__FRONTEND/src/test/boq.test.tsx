import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/modules/auth'
import { useCore, type BoqItem, type Project } from '@/modules/core-data'
import * as seed from '@/modules/core-data/data/seed'
import { BoqTab } from '@/modules/projects/components/BoqTab'

// The project Bill of Quantities tab (API 1.3.0, /boq-items). Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const PROJECT = '11111111-1111-4111-8111-111111111111'
const UOM = '00000000-0000-4000-8000-000000000010'
const WBS = '33333333-3333-4333-8333-333333333333'

const project: Project = { ...seed.PROJECTS[0]!, id: PROJECT, rowVersion: 1, wbs: [{ id: WBS, code: '1', name: 'Earthwork', parentId: null, rowVersion: 1 }] }
const item = (over: Partial<BoqItem>): BoqItem => ({
  id: '44444444-4444-4444-8444-444444444444', projectId: PROJECT, itemCode: '1.01', description: 'Excavation in ordinary soil',
  wbsNodeId: WBS, uomId: UOM, quantity: 12.5, rate: 340.25, amount: 4253.13, status: 'draft', rowVersion: 1, ...over,
})

const type = (name: string, value: string) => {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
  if (!el) throw new Error(`no field ${name}`)
  fireEvent.change(el, { target: { value } })
}

describe('Bill of Quantities tab', () => {
  let savedUoms: ReturnType<typeof useCore.getState>['uoms'] = []
  beforeEach(() => {
    savedUoms = useCore.getState().uoms
    useCore.setState({ uoms: [{ id: UOM, code: 'CUM', name: 'Cubic metre', rowVersion: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] })
    useAuth.setState({ privileges: ['projects.manage'] })
  })
  afterEach(() => {
    useCore.setState({ uoms: savedUoms })
    useAuth.setState({ privileges: [] })
    vi.unstubAllGlobals()
  })

  it('lists the items with their unit, WBS code and the server amounts, and totals them', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { data: [item({}), item({ id: '55555555-5555-4555-8555-555555555555', itemCode: '1.02', description: 'Disposal of surplus earth', amount: 1000.5, wbsNodeId: null })] })))
    render(<BoqTab project={project} />)
    expect(await screen.findByText('Excavation in ordinary soil')).toBeInTheDocument()
    expect(screen.getByText(/2 items, total ₹5,253\.63/)).toBeInTheDocument()
    expect(screen.getAllByText('CUM')).toHaveLength(2)
    expect(screen.getByText('₹4,253.13')).toBeInTheDocument()
  })

  it('adds an item: sends the project and figures, never the amount, and shows the saved row', async () => {
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        posts.push(body)
        return reply(201, { data: item({ itemCode: '2.01', description: 'Granular sub-base', quantity: 40, rate: 1250, amount: 50000, wbsNodeId: null }) })
      }
      expect(url).toContain(`/boq-items?projectId=${PROJECT}`)
      return reply(200, { data: [] })
    }))
    render(<BoqTab project={project} />)
    fireEvent.click(await screen.findByRole('button', { name: /add boq item/i }))
    type('itemCode', '2.01')
    type('description', 'Granular sub-base')
    type('uomId', UOM)
    type('quantity', '40')
    type('rate', '1250')
    expect(screen.getByText('Amount: ₹50,000.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ projectId: PROJECT, itemCode: '2.01', description: 'Granular sub-base', wbsNodeId: null, uomId: UOM, quantity: 40, rate: 1250, status: 'draft' })
    expect(await screen.findByText('Granular sub-base')).toBeInTheDocument()
  })

  it('shows a duplicate item code on the field', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit = {}) =>
      init.method === 'POST'
        ? reply(409, { error: { code: 'BOQ_ITEM_DUPLICATE', message: 'A record with this value already exists' } })
        : reply(200, { data: [] })))
    render(<BoqTab project={project} />)
    fireEvent.click(await screen.findByRole('button', { name: /add boq item/i }))
    type('itemCode', '1.01')
    type('description', 'Repeat')
    type('uomId', UOM)
    type('quantity', '1')
    type('rate', '1')
    fireEvent.click(screen.getByRole('button', { name: /^add item$/i }))
    expect(await screen.findByText('This item code is already in this project.')).toBeInTheDocument()
  })

  it('offers no add, edit or remove control without projects.manage', async () => {
    useAuth.setState({ privileges: [] })
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { data: [item({})] })))
    render(<BoqTab project={project} />)
    expect(await screen.findByText('Excavation in ordinary soil')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add boq item/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit 1\.01/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove 1\.01/i })).toBeNull()
  })

  it('explains that a sample project has no BOQ, without calling the server', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<BoqTab project={{ ...project, rowVersion: undefined }} />)
    expect(screen.getByText(/This sample project is not, so it has no BOQ/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
