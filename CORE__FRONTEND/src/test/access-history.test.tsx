import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'
import { NAV } from '@/modules/shell'

// CORE-19-02: the sign-in history, a tab of the audit trail over GET /audit-log/auth-events. Example data is fictional.

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const EVENTS = [
  { id: 'e1', at: '2026-11-21T09:15:00Z', event: 'login_success', user: 'Asha Rao', loginId: 'ACME0001', detail: null },
  { id: 'e2', at: '2026-11-21T09:10:00Z', event: 'login_failure', user: null, loginId: 'ACME9999', detail: 'Unknown login' },
]

describe('sign-in history', () => {
  let queries: URLSearchParams[] = []
  beforeEach(() => {
    queries = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = new URL(url, 'http://x')
      if (u.pathname.endsWith('/audit-log/auth-events')) {
        queries.push(u.searchParams)
        return reply(200, { data: EVENTS, meta: { limit: 50, offset: 0, total: 2 } })
      }
      return reply(200, { data: [] })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuth.setState({ privileges: [] })
    window.location.hash = '#/'
  })

  it('is a tab of the audit trail, not a menu item of its own', async () => {
    expect(NAV.flatMap((g) => g.items).some((i) => i.label === 'Sign-in history' || i.to === '/audit/access')).toBe(false)
    useAuth.setState({ user: 'admin.user', isAdmin: false, privileges: ['access.manage'], lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/audit'
    render(<App />)
    const tab = await screen.findByRole('button', { name: 'Sign-ins' }, { timeout: 5000 })
    expect(queries).toHaveLength(0)
    fireEvent.click(tab)
    expect(tab).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(queries.length).toBeGreaterThan(0))
  })

  it('lists events with readable labels, and marks a failure as a warning; the old address opens the tab', async () => {
    useAuth.setState({ user: 'admin.user', isAdmin: false, privileges: ['access.manage'], lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/audit/access'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Sign-ins' }, { timeout: 5000 })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByText('Showing 1–2 of 2')
    const badge = (label: string) => [...document.querySelectorAll('.status')].find((b) => b.textContent === label)
    expect(badge('Signed in')).toHaveClass('s-approved')
    expect(badge('Sign-in failed')).toHaveClass('s-rejected')
    expect(screen.getAllByText('ACME9999').length).toBeGreaterThan(0)
  })

  it('sends the chosen filters to the server', async () => {
    useAuth.setState({ user: 'admin.user', isAdmin: false, privileges: ['access.manage'], lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/audit?view=sign-in'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Sign-ins' }, { timeout: 5000 })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(document.querySelector('select[name="eventType"]')).not.toBeNull())
    fireEvent.change(document.querySelector('select[name="eventType"]')!, { target: { value: 'access_denied' } })
    fireEvent.change(document.querySelector('input[name="actor"]')!, { target: { value: 'Asha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(queries.some((q) => q.get('eventType') === 'access_denied' && q.get('actor') === 'Asha')).toBe(true))
  })

  it('is not shown to a user without access.manage', async () => {
    useAuth.setState({ user: 'module.user', isAdmin: false, privileges: [], lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/audit/access'
    render(<App />)
    expect(await screen.findByText(/module screens are not in this application/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(queries).toHaveLength(0)
  })
})
