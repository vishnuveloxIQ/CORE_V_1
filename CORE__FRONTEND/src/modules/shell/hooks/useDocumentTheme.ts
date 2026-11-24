import { useLayoutEffect } from 'react'
import { useShell } from '../store/useShell'

/** Keeps <html> attributes (theme, sidebar state) in sync — the CSS keys off these. */
export function useDocumentTheme() {
  const theme = useShell((s) => s.theme)
  const collapsed = useShell((s) => s.sidebarCollapsed)
  useLayoutEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', theme === 'dark')
    el.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
    el.style.colorScheme = theme
  }, [theme, collapsed])
}
