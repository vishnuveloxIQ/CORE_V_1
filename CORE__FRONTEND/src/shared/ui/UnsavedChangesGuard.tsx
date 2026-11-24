import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { hasUnsaved, useUnsaved } from '@/shared/lib/unsaved'

/**
 * Asks before the user leaves a page with unsaved form changes: links, the menu, back and forward, and closing or
 * reloading the browser tab. Render it once, inside the router. Tabs and dialogs ask through the same prompt
 * (confirmLeave in shared/lib/unsaved).
 */
export function UnsavedChangesGuard() {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsaved() &&
    currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search,
  );
  const state = blocker.state;
  const blockerRef = useRef(blocker);
  useEffect(() => {
    blockerRef.current = blocker;
  });
  const pending = useUnsaved((s) => s.pending);
  const finish = useUnsaved((s) => s.finish);
  const confirmLeave = useUnsaved((s) => s.confirmLeave);

  // a blocked navigation waits for the user's answer, then goes ahead or stays
  useEffect(() => {
    if (state !== 'blocked') return;
    void confirmLeave().then((leave) => {
      const current = blockerRef.current;
      if (current.state !== 'blocked') return;
      if (leave) current.proceed();
      else current.reset();
    });
  }, [state, confirmLeave]);

  // a prompt still open when the app goes away must not come back on the next mount
  useEffect(() => () => finish(false), [finish]);

  // closing or reloading the browser tab shows the browser's own warning
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <Modal
      guard={false}
      open={!!pending}
      onOpenChange={(o) => { if (!o) finish(false); }}
      title="Leave without saving?"
    >
      <p style={{ marginTop: 0 }}>
        You have unsaved changes. They will not be saved if you leave now.
      </p>
      <div className="form-actions">
        <Button onClick={() => finish(false)}>Stay and keep editing</Button>
        <Button tone="danger" onClick={() => finish(true)}>Leave without saving</Button>
      </div>
    </Modal>
  );
}
