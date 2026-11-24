import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/icons'
import { api, currentReachability, onReachability } from '@/shared/lib/api'

/**
 * CORE-28-03: an app-wide notice while the server cannot be reached, a call timed out, or the API is being updated.
 * It tells people their last change may not be saved and how to retry, and it clears by itself on the next answer.
 * Screens still show their own error for the call that failed; this banner never claims anything was saved.
 */
export function ConnectivityBanner() {
  const state = useSyncExternalStore(onReachability, currentReachability, currentReachability)
  const [checking, setChecking] = useState(false)
  if (state === 'ok') return null
  const check = async () => {
    setChecking(true)
    try { await api('GET', '/health', { auth: false }) } catch { /* the banner stays */ } finally { setChecking(false) }
  }
  return (
    <div className="conn-banner" role="alert">
      <Icon name={state === 'maintenance' ? 'wrench' : 'alert'} />
      <span>
        {state === 'maintenance'
          ? <><strong>Core is being updated.</strong> It will be back shortly. Anything you were saving may not have been saved: check it once Core is back, then try again.</>
          : <><strong>Core cannot reach the server.</strong> Check your connection. Anything you were saving may not have been saved: check it before you try again.</>}
      </span>
      <Button size="sm" icon="refresh" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check again'}</Button>
    </div>
  )
}
