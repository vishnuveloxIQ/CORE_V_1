import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/App'
import { useAuth } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { api, setTenantId } from '@/shared/lib/api'

// CORE-18-03: after a sign-out or a session the server ended, the previous user's data does not stay in memory.

const leftover = () => {
  const initial = useCore.getInitialState().users
  useCore.setState({ users: [...initial, { ...initial[0]!, id: 'leftover-user', name: 'Previous session user' }] })
}
const hasLeftover = () => useCore.getState().users.some((u) => u.id === 'leftover-user')

describe('signing out clears the data held in memory', () => {
  beforeEach(() => {
    setTenantId('acme')
    useAuth.setState({ user: 'ACME9999', profile: null, privileges: ['access.manage'], isAdmin: true, mustChangePassword: false })
  })

  it('a deliberate sign-out drops what the previous user loaded', async () => {
    leftover()
    expect(hasLeftover()).toBe(true)
    await useAuth.getState().logout()
    expect(hasLeftover()).toBe(false)
    expect(useCore.getState().users).toEqual(useCore.getInitialState().users)
  })

  it('a session the server ended drops it too', async () => {
    leftover()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'AUTH_INVALID_TOKEN', message: 'expired' } }), { status: 401 }))))
    await expect(api('GET', '/auth/sessions')).rejects.toMatchObject({ code: 'SESSION_ENDED' })
    expect(useAuth.getState().user).toBeNull()
    expect(hasLeftover()).toBe(false)
  })

  it('other changes while signed in keep the data', () => {
    leftover()
    useAuth.setState({ privileges: [], isAdmin: false })
    expect(hasLeftover()).toBe(true)
  })
})
