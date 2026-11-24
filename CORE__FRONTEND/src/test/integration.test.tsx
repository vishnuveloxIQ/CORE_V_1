import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'
import { setTenantId } from '@/shared/lib/api'

// Integration fixes: sign-in loads only what the user may read, and the user login returns to the page that sent the
// user there. Example data is fictional.

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

/** Answers every API call with an empty list, and the sign-in calls with a signed-in user. Records the paths asked. */
function mockApi(privileges: string[]) {
  const paths: string[] = []
  const fetchMock = vi.fn((url: string) => {
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
    paths.push(path)
    if (path === '/auth/login') {
      return json(200, {
        data: {
          accessToken: 'a.b.c', accessTokenExpiresIn: 900, refreshToken: 'r', refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
          user: { id: 'u1', loginId: 'ACME1234', name: 'Fictional User', email: null },
        },
      })
    }
    if (path === '/auth/me/access') return json(200, { data: { privileges: privileges.map((privilege) => ({ privilege })), grants: [] } })
    return json(200, { data: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return paths
}

describe('integration fixes', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setTenantId('acme')
  })

  it('does not read the user list at sign-in for a user without the access privilege', async () => {
    const paths = mockApi([])
    useAuth.setState({ user: 'ACME1234', profile: null, privileges: [], isAdmin: false, mustChangePassword: false })
    window.location.hash = '#/dashboard'
    render(<App />)
    await vi.waitFor(() => expect(paths).toContain('/projects'))
    expect(paths).not.toContain('/users')
  })

  it('reads the user list at sign-in for an access administrator', async () => {
    const paths = mockApi(['access.manage'])
    useAuth.setState({ user: 'ACME1234', profile: null, privileges: ['access.manage'], isAdmin: true, mustChangePassword: false })
    window.location.hash = '#/dashboard'
    render(<App />)
    await vi.waitFor(() => expect(paths).toContain('/users'))
  })

  it('the user login returns to the page that sent the user there', async () => {
    mockApi([])
    useAuth.setState({ user: null, profile: null, privileges: [], isAdmin: false, mustChangePassword: false, signedOut: false })
    window.location.hash = '#/login?role=user&next=%2Fprojects'
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByRole('textbox', { name: /login id/i }, { timeout: 5000 }), 'ACME1234')
    await user.type(screen.getByLabelText(/^password/i), 'Fictional-Password-1')
    await user.click(screen.getByRole('button', { name: /^login$/i }))
    await vi.waitFor(() => expect(window.location.hash).toBe('#/projects'))
  })
})
