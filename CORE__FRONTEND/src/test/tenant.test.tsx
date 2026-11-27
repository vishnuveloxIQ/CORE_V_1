import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'
import { api, ApiError, tenantId } from '@/shared/lib/api'

// There is no tenant-less login. The company always comes from the login ID's prefix; with none chosen, a pre-login call
// is refused before it is sent. The first test relies on no company having been chosen yet in this file.

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('no tenant-less login', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuth.setState({ user: null, profile: null, privileges: [], isAdmin: false, mustChangePassword: false, lockedUntil: 0 })
    window.location.hash = '#/forgot'
  })

  it('sends a sign-in with no company header, so the server finds the company from the login ID', async () => {
    const fetchMock = vi.fn(() => json(200, { data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    expect(tenantId()).toBeNull()
    await api('POST', '/auth/login', { body: { loginId: 'ACME9999', password: 'x' }, auth: false })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBeUndefined()
    // a reset still needs the company chosen first, so it is refused and sends nothing
    await expect(api('POST', '/auth/password-reset/request', { body: { loginId: 'ACME9999' }, auth: false })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Forgot password refuses a login ID whose prefix is not a company, and sends nothing', async () => {
    const fetchMock = vi.fn(() => json(202, { data: { accepted: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByRole('textbox', { name: /login id/i }), 'ZZZ1234')
    await user.click(screen.getByRole('button', { name: /send otp/i }))
    expect(await screen.findByText(/does not belong to a company set up here/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Forgot password sends the company that the login ID prefix names, not a default', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json(202, { data: { accepted: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByRole('textbox', { name: /login id/i }), 'BETA1234')
    await user.click(screen.getByRole('button', { name: /send otp/i }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const init = fetchMock.mock.calls[0]![1]
    expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBe('beta')
  })

  it('names the sample OTP on the code step until email is set up (decision D10)', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json(202, { data: { accepted: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByRole('textbox', { name: /login id/i }), 'BETA1234')
    await user.click(screen.getByRole('button', { name: /send otp/i }))
    expect(await screen.findByText('Testing: no email is sent yet')).toBeInTheDocument()
    expect(screen.getByText('123456')).toBeInTheDocument()
  })
})
