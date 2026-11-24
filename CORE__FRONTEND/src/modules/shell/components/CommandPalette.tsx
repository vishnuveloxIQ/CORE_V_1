import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEARCH_TYPE_LABEL, searchRecords, searchTarget, type SearchHit } from '@/modules/core-data'
import { navFor } from '../config/nav'
import { useAuth } from '@/modules/auth'
import { useIsMobile } from '@/shared/hooks/useMedia'
import { useShell } from '../store/useShell'
import { Icon } from '@/shared/ui/icons'

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onToggleDrawer: () => void }

/**
 * Ctrl/⌘ K: jumps to any page, and (CORE-25-03) finds master records by code or name on the server as you type.
 * Lookups wait for a short pause in typing, and a reply that arrives after newer typing is ignored.
 */
export function CommandPalette({ open, onOpenChange, onToggleDrawer }: Props) {
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const theme = useShell((s) => s.theme)
  const toggleTheme = useShell((s) => s.toggleTheme)
  const collapsed = useShell((s) => s.sidebarCollapsed)
  const setCollapsed = useShell((s) => s.setSidebarCollapsed)
  const privileges = useAuth((s) => s.privileges)
  const run = (fn: () => void) => () => { onOpenChange(false); fn() }
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'failed'>('idle')
  const term = query.trim()
  useEffect(() => {
    if (!open || term.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      setLookup('loading')
      searchRecords(term).then(
        (rows) => { if (live) { setHits(rows); setLookup('idle') } },
        () => { if (live) { setHits([]); setLookup('failed') } },
      )
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [open, term])
  const shown = term.length >= 2 ? hits : []
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop open">
          <Dialog.Content className="cmdk" aria-label="Command menu">
            <Dialog.Title className="sr-only">Command menu</Dialog.Title>
            <Dialog.Description className="sr-only">Search pages and actions</Dialog.Description>
            <Command label="Command menu" loop>
              <div className="cmdk-in"><Icon name="search" /><Command.Input autoFocus placeholder="Type a page, action, or a record's code or name…" aria-label="Search" value={query} onValueChange={setQuery} /></div>
              <Command.List className="cmdk-list">
                <Command.Empty className="cmdk-empty">{lookup === 'loading' ? 'Searching records…' : 'No results.'}</Command.Empty>
                {shown.length > 0 && (
                  <Command.Group heading="Records" className="cmdk-g">
                    {shown.map((h) => (
                      <Command.Item key={`${h.type}:${h.id}`} value={`${h.label} ${h.code ?? ''} ${term} ${h.type}:${h.id}`} className="cmdk-i" onSelect={run(() => navigate(searchTarget(h)))}>
                        <Icon name="search" /><span>{h.label}{h.code && h.code !== h.label ? ` (${h.code})` : ''}</span><small>{SEARCH_TYPE_LABEL[h.type]}</small>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {lookup === 'failed' && term.length >= 2 && <div className="cmdk-empty" role="status">Record search is unavailable right now; pages and actions still work.</div>}
                <Command.Group heading="Pages" className="cmdk-g">
                  {navFor(privileges).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).map((i) => (
                    <Command.Item key={i.to} value={i.label} className="cmdk-i" onSelect={run(() => navigate(i.to))}>
                      <Icon name={i.icon} /><span>{i.label}</span><small>{i.group}</small>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Actions" className="cmdk-g">
                  <Command.Item value="toggle theme" className="cmdk-i" onSelect={run(toggleTheme)}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /><span>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</span><small>Theme</small></Command.Item>
                  <Command.Item value="toggle sidebar" className="cmdk-i" onSelect={run(() => (mobile ? onToggleDrawer() : setCollapsed(!collapsed)))}><Icon name="sidebar" /><span>Toggle sidebar</span><small>Layout</small></Command.Item>
                </Command.Group>
              </Command.List>
              <div className="cmdk-f"><span><span className="kbd">↑↓</span> navigate</span><span><span className="kbd">Enter</span> open</span><span><span className="kbd">Esc</span> close</span></div>
            </Command>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
