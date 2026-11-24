import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/app/App'
import { useAuth } from '@/modules/auth'

// A signed-in user without any manage privilege (for example a module user): the master-data screens show no
// create or edit control, and the New user page explains why the form is not there (D1).
describe('access by privilege', () => {
  beforeEach(() => {
    useAuth.setState({ user: 'module.user', isAdmin: false, privileges: [], lockedUntil: 0, mustChangePassword: false })
    window.location.hash = '#/'
  })

  it('shows no primary create button on the master-data pages without a manage privilege', async () => {
    const pages = ['/projects', '/sites', '/stores', '/materials', '/departments', '/organogram', '/people-planning', '/material-planning', '/equipment/planning']
    for (const path of pages) {
      window.location.hash = `#${path}`
      const { container, unmount } = render(<App />)
      // a page either renders its heading, or the route gate shows the no-access notice (pages the menu hides)
      await waitFor(
        () => expect(container.querySelector('.ph') ?? /do not have access/.test(container.textContent ?? '') ? true : false).toBe(true),
        { timeout: 5000 },
      )
      expect(container.querySelector('.ph .head-actions .btn.primary'), path).toBeNull()
      unmount()
    }
  })

  it('shows the no-access notice on the New user page instead of the form', async () => {
    window.location.hash = '#/users/new'
    render(<App />)
    expect(await screen.findByText(/do not have access to this page/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create user/i })).toBeNull()
  })
})
