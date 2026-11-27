import { render, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'

// CORE-17-04: an automated accessibility check (axe-core, WCAG 2.1 A and AA rules) of the main screens, as a
// signed-in user who holds every manage privilege, so create and edit controls are on the page too. Colour contrast
// is not checked here: jsdom does not lay out or paint, so that rule is checked in the browser instead.

const PAGES = [
  '/dashboard', '/company', '/policies', '/projects', '/projects/new', '/geofences', '/stores',
  '/materials', '/stock', '/equipment/register', '/equipment/planning', '/people-planning', '/material-planning',
  '/approvals', '/approval-matrix', '/approval-matrix/new', '/job-openings', '/grievances', '/audit', '/audit/access',
  '/users', '/users/new', '/departments', '/organogram', '/help', '/available-materials', '/vendors', '/equipment/maintenance', '/integrations/events', '/integrations/read-models', '/equipment/available',
]

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))

describe('accessibility of the main screens', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ data: [], meta: { total: 0 } })))
    useAuth.setState({
      user: 'admin.user', isAdmin: true, lockedUntil: 0, mustChangePassword: false,
      privileges: ['projects.manage', 'masters.manage', 'organisation.manage', 'access.manage', 'policies.manage', 'approvals.manage'],
    })
  })
  afterAll(() => {
    vi.unstubAllGlobals()
    useAuth.setState({ privileges: [], isAdmin: false })
    window.location.hash = '#/'
  })

  it.each(PAGES)('%s has no serious or critical WCAG A/AA violations', async (path) => {
    window.location.hash = `#${path}`
    const { container, unmount } = render(<App />)
    await waitFor(() => expect(container.querySelector('.ph h1, .ph h2')).not.toBeNull(), { timeout: 5000 })
    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    const serious = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    unmount()
    expect(serious, path).toEqual([])
  }, 20_000)
})
