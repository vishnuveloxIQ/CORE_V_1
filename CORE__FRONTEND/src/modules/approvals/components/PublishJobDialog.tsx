import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { a11y } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { ActionScope } from '@/modules/shell'
import { projectOf, useCore, type ApprovalRequest } from '@/modules/core-data'

/** Picks a server location and publishes the approved job opening there (POST /approval-requests/{id}/publish). */
export function PublishJobDialog({ req, onClose }: { req: ApprovalRequest | null; onClose: () => void }) {
  const { sites, projects, publishJobRemote, loadRequests } = useCore()
  const { run, error, setError, saving } = useRemoteSave(loadRequests)
  const [locationId, setLocationId] = useState('')
  if (!req) return null
  const project = projectOf(projects, req.chainageId)
  // locations read from the server only; the request's own project first
  const options = sites
    .filter((s) => s.rowVersion !== undefined && s.status === 'Active')
    .sort((a, b) => Number(b.projectId === project?.id) - Number(a.projectId === project?.id) || a.name.localeCompare(b.name))
  const close = () => { setLocationId(''); setError(''); onClose() }
  const publish = async () => {
    if (!locationId) return setError('Choose the location to publish to.')
    const done = await run({ id: req.id, locationId }, (key) => publishJobRemote(req.id, locationId, key).then(() => true))
    if (!done) return
    notify(`${req.code} published to ${sites.find((s) => s.id === locationId)?.name ?? 'the location'}`)
    close()
  }
  return (
    <Modal open onOpenChange={(o) => !o && close()} title="Publish to location">
      <ActionScope project={project ?? null} site={sites.find((s) => s.id === locationId) ?? null} />
      <p style={{ marginTop: 0, fontSize: 13.5 }}>
        Head Office publishes this approved opening to one location. The location sees it and receives the candidate Head Office sends.
      </p>
      <FormGroup label="Location" required error={error || undefined}>
        {(id, d) => (
          <Select {...a11y(id, d, error)} value={locationId} onChange={(e) => { setLocationId(e.target.value); setError('') }}>
            <option value="">{options.length ? 'Choose a location' : 'No locations read from the server'}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>{s.code} · {s.name}{s.projectId === project?.id ? ' (this project)' : ''}</option>
            ))}
          </Select>
        )}
      </FormGroup>
      <div className="form-actions">
        <Button onClick={close} disabled={saving}>Cancel</Button>
        <Button tone="primary" icon="send" disabled={saving || !options.length} onClick={() => void publish()}>{saving ? 'Publishing…' : 'Publish'}</Button>
      </div>
    </Modal>
  )
}
