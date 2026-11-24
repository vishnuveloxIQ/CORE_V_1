import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'

interface GuardProps {
  /** true while the page holds changes that have not been saved */
  when: boolean
  /** what is lost, in a few words: "the company profile" */
  what: string
}

function Guard({ when, what }: GuardProps) {
  // leaving this page (menu, links, back and forward) is held while there are unsaved changes
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search)
  // closing or reloading the browser tab shows the browser's own warning
  useEffect(() => {
    if (!when) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [when])
  return (
    <Modal
      open={blocker.state === 'blocked'}
      onOpenChange={(o) => { if (!o && blocker.state === 'blocked') blocker.reset() }}
      title="Leave without saving?"
    >
      <p style={{ marginTop: 0 }}>You have unsaved changes to {what}. They will not be applied unless you save them.</p>
      <div className="form-actions">
        <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>Stay and keep editing</Button>
        <Button tone="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>Leave without saving</Button>
      </div>
    </Modal>
  )
}

/**
 * Asks for confirmation before the user leaves a page with unsaved changes. It needs the app's data router;
 * outside one (a page rendered on its own) it does nothing.
 */
export function UnsavedChangesGuard(props: GuardProps) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  return dataRouter ? <Guard {...props} /> : null
}
