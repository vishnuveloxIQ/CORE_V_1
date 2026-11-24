import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'
import { rememberLoginRole } from '@/modules/auth/utils/loginRole'
import { api, SESSION_ENDED_MESSAGE, setTenantId } from '@/shared/lib/api'

// When the server ends a session (expired, signed out from another device, revoked), the user reads one plain message
// and is sent back to the login page they signed in from.

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('when the session ends', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setTenantId('acme')
  })

  it('a refused call that cannot be refreshed gives one plain message and signs the app out', async () => {
    useAuth.setState({ user: 'ACME8801', profile: null, privileges: [], isAdmin: false, mustChangePassword: false })
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: { code: 'AUTH_INVALID_TOKEN', message: 'Access token is invalid or expired' } })))
    await expect(api('GET', '/auth/sessions')).rejects.toMatchObject({ code: 'SESSION_ENDED', message: SESSION_ENDED_MESSAGE })
    expect(SESSION_ENDED_MESSAGE).not.toMatch(/token/i)
    expect(useAuth.getState().user).toBeNull()
  })

  it('sends a user who signed in from "Login as user" back to the user login', async () => {
    rememberLoginRole('user')
    useAuth.setState({ user: null, profile: null, privileges: [], isAdmin: false, mustChangePassword: false, signedOut: false })
    window.location.hash = '#/projects'
    render(<App />)
    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/login\?role=user/))
  })

  it('sends everyone else to the admin login, as before', async () => {
    useAuth.setState({ user: null, profile: null, privileges: [], isAdmin: false, mustChangePassword: false, signedOut: false })
    window.location.hash = '#/projects'
    render(<App />)
    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/login\?role=admin/))
  })
})
