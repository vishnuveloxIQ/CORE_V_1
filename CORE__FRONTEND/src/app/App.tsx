import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { createHashRouter, Navigate, Route, RouterProvider, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './ErrorBoundary'
import { APP, Shell, privilegeFor, useDocumentTheme } from '@/modules/shell'
import { StepUpHost } from '@/shared/lib/stepUp'
import NotFound from './pages/NotFound'
import NoAccess from './pages/NoAccess'
import { ROUTES } from './routes'
import { ADMIN_PRIVILEGE, lastLoginRole, onSignedOut, useAuth } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { ChangePassword, ForgotPassword, Home, Login, Register } from '@/modules/auth/routes'

// When a user signs out or the server ends the session, nothing they loaded stays in memory for the next person on
// this tab: lists, users and approvals go back to the starting state, and the next sign-in reads its own data.
onSignedOut(() => useCore.setState(useCore.getInitialState(), true))

/** Shows the page only when the user holds the privilege its menu entry names; otherwise a no-access notice. */
function Gate({ path, children }: { path: string; children: ReactNode }) {
  const privileges = useAuth((s) => s.privileges)
  const needs = privilegeFor(path.replace(/\/:.*$/, ''))
  return needs && !privileges.includes(needs) ? <NoAccess /> : <>{children}</>
}

/** Everything except /login needs a signed-in user; otherwise go to /login and come back after. */
function Protected() {
  const user = useAuth((s) => s.user)
  const signedOut = useAuth((s) => s.signedOut)
  // a temporary password must be replaced first; nothing else loads until then
  const mustChange = useAuth((s) => s.mustChangePassword)
  const { pathname, search } = useLocation()
  useEffect(() => { if (user) document.title = `${APP.module} | VeloxIQ` }, [user])
  // modules wired to the Core API load once per sign-in; the rest show only what is held on this device
  useEffect(() => {
    if (!user || mustChange) return
    const core = useCore.getState()
    // projects first: locations and markers are attached to the projects read from the API
    const storesReady = core.loadProjects().then(() => Promise.all([core.loadSites(), core.loadStores()]))
    // materials first: their unit text is needed to show material plan lines
    // materials and plan lines show each unit's code from GET /uoms, so the units are read first
    const materialsReady = core.loadUoms().then(() => core.loadMaterials())
    void materialsReady.then(() => core.loadPlanning())
    // stock needs the server store and material ids, so it loads once both are read
    void Promise.all([storesReady, materialsReady]).then(() => core.loadStock())
    // equipment units: the register's rows from GET /equipment-units (no sample units when the read fails)
    void core.loadUnits()
    // holiday and shift rows after the policies: they replace the holidays and shifts of the latest policy version
    void core.loadPolicies().then(() => core.loadCalendarRows())
    void core.loadCustomPolicies()
    // company profile, offer letter, departments and roles: read at sign-in too, since job openings uses the offer letter
    void core.loadOrganisation()
    // users: the first page of sign-in accounts. GET /users needs access.manage, so it is read only by users who hold it;
    // everyone else would get a 403 at every sign-in (the sample users stay, as when the read fails)
    if (useAuth.getState().privileges.includes(ADMIN_PRIVILEGE)) void core.loadUsers()
    // approvals, grievances and tickets (the sample data stays when a read fails)
    void core.loadChains()
    void core.loadCashLimits()
    void core.loadRequests()
    void core.loadGrievances()
    void core.loadTickets()
  }, [user, mustChange])
  if (!user) {
    const next = pathname === '/' || signedOut ? '' : `?next=${encodeURIComponent(pathname + search)}`
    // back to the login page the user signed in from (user or admin)
    return <Navigate to={`/login?role=${lastLoginRole()}${next.replace('?', '&')}`} replace />
  }
  if (mustChange) return <Navigate to={`/change-password?next=${encodeURIComponent(pathname + search)}`} replace />
  return (
    <Shell>
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={null}>
          <Routes>
            <Route index element={<Navigate to="/dashboard" replace />} />
            {ROUTES.map(({ path, Component }) => <Route key={path} path={path} element={<Gate path={path}><Component /></Gate>} />)}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  )
}

function Frame() {
  useDocumentTheme()
  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={null}><Home /></Suspense>} />
      <Route path="/forgot" element={<Suspense fallback={null}><ForgotPassword /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={null}><Register /></Suspense>} />
      <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
      <Route path="/change-password" element={<Suspense fallback={null}><ChangePassword /></Suspense>} />
      <Route path="*" element={<Protected />} />
    </Routes>
  )
}

export default function App() {
  // a data router (not <HashRouter>) so a page can hold navigation while it has unsaved changes (useBlocker);
  // made per mount so it reads the address the page was opened at
  const [router] = useState(() => createHashRouter([{ path: '*', element: <Frame /> }]))
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      <StepUpHost />
      <Toaster position="bottom-center" offset={{ bottom: 28 }} mobileOffset={{ bottom: 92 }} toastOptions={{ unstyled: true }} />
    </ErrorBoundary>
  )
}
