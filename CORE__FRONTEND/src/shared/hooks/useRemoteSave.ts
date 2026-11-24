import { useRef, useState } from 'react'
import { ApiError, errorText, fieldErrors, idempotencyKey } from '@/shared/lib/api'

/**
 * Runs one save against the API. The Idempotency-Key is made per action and reused only to retry the same
 * action after a lost connection. Returns the result, or undefined after setting `error` / calling `onField`.
 * Only one save runs at a time: a second call while one is in flight (a double click before the button disables)
 * is ignored and returns undefined, so one action is never sent twice.
 */
export function useRemoteSave(onConflict?: () => Promise<void> | void) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef<{ body: string; key: string } | null>(null)
  const inFlight = useRef(false)

  const run = async <T,>(body: unknown, save: (key: string) => Promise<T>, onField?: (field: string, message: string) => boolean | void): Promise<T | undefined> => {
    if (inFlight.current) return undefined
    inFlight.current = true
    setError('')
    const sig = JSON.stringify(body)
    const key = pending.current?.body === sig ? pending.current.key : idempotencyKey()
    pending.current = { body: sig, key }
    setSaving(true)
    try {
      const out = await save(key)
      pending.current = null
      return out
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') pending.current = null
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await onConflict?.()
        setError('Someone else changed this. The latest version is loaded; check it and save again.')
        return undefined
      }
      const named = Object.entries(fieldErrors(err)).filter(([f, m]) => onField?.(f, m) === true)
      setError(named.length ? 'Check the highlighted fields.' : errorText(err))
      return undefined
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }
  return { run, error, setError, saving }
}
