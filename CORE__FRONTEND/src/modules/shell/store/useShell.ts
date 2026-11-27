import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { IconName } from '@/shared/ui/icons'
import { listNotifications, markNotificationRead, type NotificationRecord } from '@/modules/core-data'

export interface ShellNotification { id: string; icon: IconName; title: string; description: string; at: string; to: string }

/** Where a notification opens, from the record it names. TODO(backend): sourceType values are not fixed by the API; unknown ones open the dashboard. */
const target = (r: NotificationRecord) =>
  r.sourceType && r.sourceId
    ? /request|approval/i.test(r.sourceType) ? `/approvals/${r.sourceId}` : /grievance/i.test(r.sourceType) ? `/grievances/${r.sourceId}` : '/dashboard'
    : '/dashboard'

const fromRecord = (r: NotificationRecord): ShellNotification => ({
  id: r.id, icon: 'approvals', title: r.title, description: r.body ?? '', at: r.createdAt ?? new Date().toISOString(), to: target(r),
})

interface ShellState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  /** ids of notifications the user has read */
  read: string[]
  /** notifications read from GET /notifications; empty until they are read */
  remote: ShellNotification[]
  loadNotifications: () => Promise<void>
  toggleTheme: () => void
  setSidebarCollapsed: (c: boolean) => void
  markRead: (id: string) => void
  markAllRead: () => void
}

const storage = createJSONStorage(() => {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage }
  catch { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
})

/** Only UI-shell state lives here (theme, sidebar, notification read-state). Put your own data in your own stores. */
export const useShell = create<ShellState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      sidebarCollapsed: false,
      read: [],
      remote: [],
      loadNotifications: async () => {
        try {
          const rows = await listNotifications()
          set((s) => ({ remote: rows.map(fromRecord), read: [...new Set([...s.read, ...rows.filter((r) => r.readAt).map((r) => r.id)])] }))
        } catch { /* the bell stays as it was; the next load tries again */ }
      },
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      markRead: (id) => {
        set((s) => (s.read.includes(id) ? s : { read: [...s.read, id] }))
        if (get().remote.some((n) => n.id === id)) void markNotificationRead(id).catch(() => { /* read again on the next load */ })
      },
      markAllRead: () => {
        const list = get().remote
        set({ read: list.map((n) => n.id) })
        for (const n of list) void markNotificationRead(n.id).catch(() => { /* read again on the next load */ })
      },
    }),
    { name: 'veloxiq-shell:v1', version: 1, storage, partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed, read: s.read }) },
  ),
)
