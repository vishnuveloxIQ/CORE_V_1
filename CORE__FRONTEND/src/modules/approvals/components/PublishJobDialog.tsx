import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { notify } from '@/shared/lib/toast'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { ActionScope } from '@/modules/shell'
import { projectOf, useCore, type ApprovalRequest } from '@/modules/core-data'

/** Publishes the approved job opening to its project (POST /approval-requests/{id}/publish). */
export function PublishJobDialog({ req, onClose }: { req: ApprovalRequest | null; onClose: () => void }) {
  const { projects, publishJobRemote, loadRequests } = useCore()
  const { run, error, setError, saving } = useRemoteSave(loadRequests)
  if (!req) return null
  const project = projectOf(projects, req.chainageId)
  const close = () => { setError(''); onClose() }
  const publish = async () => {
    const done = await run({ id: req.id }, (key) => publishJobRemote(req.id, key).then(() => true))
    if (!done) return
    notify(`${req.code} published${project ? ` to ${project.name}` : ''}`)
    close()
  }
  return (
    <Modal open onOpenChange={(o) => !o && close()} title="Publish job opening">
      <ActionScope project={project ?? null} site={null} />
      <p style={{ marginTop: 0, fontSize: 13.5 }}>
        Head Office publishes this approved opening to its project. The project sees it and receives the candidate Head Office sends.
      </p>
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="form-actions">
        <Button onClick={close} disabled={saving}>Cancel</Button>
        <Button tone="primary" icon="send" disabled={saving} onClick={() => void publish()}>{saving ? 'Publishing…' : 'Publish'}</Button>
      </div>
    </Modal>
  )
}
