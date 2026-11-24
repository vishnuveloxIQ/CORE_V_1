import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsMobile } from '@/shared/hooks/useMedia'
import { useShell } from '../store/useShell'
import { CommandPalette } from './CommandPalette'
import { Dock } from './Dock'
import { Footer } from './Footer'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { ConnectivityBanner } from './ConnectivityBanner'

/**
 * The page frame — header on top, sidebar on the left, content + footer on the right.
 * Wrap every screen in this (App.tsx already does). Do not restyle it per screen.
 */
export function Shell({ children }: { children: ReactNode }) {
  const mobile = useIsMobile()
  const { pathname } = useLocation()
  const setCollapsed = useShell((s) => s.setSidebarCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [cmd, setCmd] = useState(false)

  const toggleNav = useCallback(() => {
    if (mobile) setDrawer((d) => !d)
    else setCollapsed(!useShell.getState().sidebarCollapsed)
  }, [mobile, setCollapsed])

  useEffect(() => {
    document.documentElement.dataset.drawer = drawer && mobile ? 'open' : 'closed'
    return () => { document.documentElement.dataset.drawer = 'closed' }
  }, [drawer, mobile])
  // Every screen opens at the top — the window keeps its scroll across route changes otherwise.
  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) { setPrevPath(pathname); setDrawer(false) }
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((o) => !o) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="shell-classic">
      <a className="skip" href="#main">Skip to main content</a>
      <Header onMenu={toggleNav} onSearch={() => setCmd(true)} drawerOpen={drawer} />
      <div className="shell">
        <Sidebar drawerOpen={drawer} onCloseDrawer={() => setDrawer(false)} />
        <div className="main">
          <main id="main" className="content" tabIndex={-1} key={pathname}><ConnectivityBanner />{children}</main>
          <Footer />
        </div>
      </div>
      <Dock onMore={() => setDrawer(true)} />
      <CommandPalette open={cmd} onOpenChange={setCmd} onToggleDrawer={toggleNav} />
    </div>
  )
}
