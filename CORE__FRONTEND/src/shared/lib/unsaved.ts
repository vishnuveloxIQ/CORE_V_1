import { useCallback, useEffect, useId } from 'react'
import { create } from 'zustand'

/**
 * Forms that hold changes nobody has saved yet. Each form registers while it has unsaved changes, and removes itself
 * when it unmounts. A form that is being saved right now does not count as unsaved, so a save that navigates to
 * another page is not held. Moving to another page, switching a tab, or closing a dialog asks `confirmLeave()` first,
 * which opens one "Leave without saving?" prompt when anything unsaved is registered.
 */
interface UnsavedState {
  dirty: Record<string, true>
  saving: Record<string, true>
  pending: { resolve: (leave: boolean) => void } | null
  setDirty: (id: string, on: boolean) => void
  setSaving: (id: string, on: boolean) => void
  /** resolves true at once when nothing is unsaved; otherwise asks the user and resolves with their choice */
  confirmLeave: () => Promise<boolean>
  finish: (leave: boolean) => void
}

const flip = (map: Record<string, true>, id: string, on: boolean) => {
  if (on === !!map[id]) return map
  const next = { ...map }
  if (on) next[id] = true
  else delete next[id]
  return next
}

export const useUnsaved = create<UnsavedState>()((set, get) => ({
  dirty: {},
  saving: {},
  pending: null,
  setDirty: (id, on) => set((s) => ({ dirty: flip(s.dirty, id, on) })),
  setSaving: (id, on) => set((s) => ({ saving: flip(s.saving, id, on) })),
  confirmLeave: () => {
    if (!hasUnsaved()) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      get().pending?.resolve(false)
      set({ pending: { resolve } })
    })
  },
  finish: (leave) => {
    get().pending?.resolve(leave)
    set({ pending: null })
  },
}))

/** True while a form has changes nobody has saved (a form in the middle of its save does not count). */
export const hasUnsaved = () => {
  const { dirty, saving } = useUnsaved.getState()
  return Object.keys(dirty).some((id) => !saving[id])
}

/**
 * Registers the calling form as unsaved while `dirty` is true. Returns a function that marks the form as being saved
 * (true) or not (false) at once, so a save that navigates away is not held.
 */
export function useUnsavedGuard(dirty: boolean) {
  const id = useId()
  const setDirty = useUnsaved((s) => s.setDirty)
  const setSaving = useUnsaved((s) => s.setSaving)
  useEffect(() => {
    setDirty(id, dirty)
    return () => {
      setDirty(id, false)
      setSaving(id, false)
    }
  }, [id, dirty, setDirty, setSaving])
  return useCallback((on: boolean) => setSaving(id, on), [id, setSaving])
}
