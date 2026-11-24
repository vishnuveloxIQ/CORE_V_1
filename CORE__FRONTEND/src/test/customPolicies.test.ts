import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customPolicyState, useCore } from '@/modules/core-data'

const def = {
  name: 'Site safety induction',
  description: 'Induction rules',
  fields: [{ id: 'f1', label: 'Validity (days)', type: 'number' as const, required: true }],
}

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

/** A small in-memory /custom-policies, /custom-policy-fields and /custom-policy-versions server. */
function fakeServer() {
  const policies: Record<string, unknown>[] = []
  const fields: Record<string, unknown>[] = []
  const versions: Record<string, unknown>[] = []
  const posts: string[] = []
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'http://x').pathname.replace(/^\/api/, '')
    if (init.method === 'POST') {
      posts.push(path)
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      const at = '2026-11-20T08:00:00Z'
      if (path === '/custom-policies') { const r = { ...body, id: `p${policies.length + 1}`, rowVersion: 1, createdAt: at }; policies.push(r); return reply(201, { data: r }) }
      if (path === '/custom-policy-fields') { const r = { ...body, id: `fld${fields.length + 1}`, rowVersion: 1 }; fields.push(r); return reply(201, { data: r }) }
      if (path === '/custom-policy-versions') {
        const versionNo = versions.filter((v) => v.customPolicyId === body.customPolicyId).length + 1
        const r = { ...body, id: `v${versions.length + 1}`, versionNo, rowVersion: 1, createdAt: at }
        versions.push(r)
        return reply(201, { data: r })
      }
    }
    if (path === '/custom-policies') return reply(200, { data: policies })
    if (path === '/custom-policy-fields') return reply(200, { data: fields })
    if (path === '/custom-policy-versions') return reply(200, { data: versions })
    return reply(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
  }))
  return { posts }
}

describe('custom policies', () => {
  beforeEach(() => useCore.setState({ customPolicies: [], customVersions: [], customSource: 'none' }))

  it('refuses to save before custom policies were read from the server, and keeps nothing in the browser', async () => {
    await expect(useCore.getState().createCustomPolicyRemote(def, { effectiveFrom: '2020-01-01', reason: 'Initial', values: { f1: 30 } }))
      .rejects.toMatchObject({ code: 'NOT_SAVED' })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(useCore.getState().customPolicies).toHaveLength(0)
  })

  it('creates a policy, its fields and first version on the server, keyed by the server field ids', async () => {
    const { posts } = fakeServer()
    await useCore.getState().loadCustomPolicies()
    const id = await useCore.getState().createCustomPolicyRemote(def, { effectiveFrom: '2020-01-01', reason: 'Initial', values: { f1: 30 } })
    expect(posts).toEqual(['/custom-policies', '/custom-policy-fields', '/custom-policy-versions'])
    const s = useCore.getState()
    expect(s.customPolicies.map((p) => p.id)).toEqual([id])
    expect(s.customVersions[0]).toMatchObject({ policyId: id, version: 1, values: { fld1: 30 } })
  })

  it('adds versions without overwriting, and separates current from scheduled', async () => {
    fakeServer()
    await useCore.getState().loadCustomPolicies()
    const id = await useCore.getState().createCustomPolicyRemote(def, { effectiveFrom: '2020-01-01', reason: 'Initial', values: { f1: 30 } })
    await useCore.getState().addCustomVersionRemote(id, '2020-06-01', 'Raise', { fld1: 60 })
    await useCore.getState().addCustomVersionRemote(id, '2999-01-01', 'Future', { fld1: 90 })
    const st = customPolicyState(useCore.getState().customVersions, id, '2021-01-01')
    expect(st.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(st.current.version).toBe(2)
    expect(st.scheduled.map((v) => v.version)).toEqual([3])
    expect(st.latest.version).toBe(3)
  })
})
