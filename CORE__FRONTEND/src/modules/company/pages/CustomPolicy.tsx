import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/modules/shell'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { errorText } from '@/shared/lib/api'
import { customPolicyState, useCore } from '@/modules/core-data'
import { Modal } from '@/shared/ui/Modal'
import { Can, MANAGE } from '@/modules/auth'
import { CustomPolicyView, CustomValuesForm, formatCustomValue } from '../components/CustomPolicyEditor'

/** One admin-defined policy: what is in force first; New version opens the values form. History on the right. */
export default function CustomPolicy() {
  const ref = useRef<HTMLDivElement>(null)
  const { id = '' } = useParams()
  useEnter(ref, `custom-policy-${id}`)
  const navigate = useNavigate()
  const defs = useCore((s) => s.customPolicies)
  const all = useCore((s) => s.customVersions)
  const add = useCore((s) => s.addCustomVersionRemote)
  const [editing, setEditing] = useState(false)
  const remove = useCore((s) => s.deleteCustomPolicyRemote)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const back = <Button icon="chevL" onClick={() => navigate('/policies')}>All policies</Button>
  const def = defs.find((d) => d.id === id)

  if (!def) {
    return (
      <div ref={ref}>
        <PageHead crumb="Policies" title="Custom policy" desc="That policy does not exist or was removed." actions={back} />
        <Card><EmptyState icon="scroll" title="Nothing to show">Go back to the policies list.</EmptyState></Card>
      </div>
    )
  }

  const { versions, current, latest } = customPolicyState(all, id)
  const summary = (values: typeof current.values) =>
    def.fields.slice(0, 2).map((f) => `${f.label}: ${formatCustomValue(f, values[f.id])}`).join(' · ')

  return (
    <div ref={ref}>
      <PageHead crumb={def.name} title={def.name} desc={def.description}
        actions={<>{back}
          <Can privilege={MANAGE.policies}><Button tone="danger" icon="trash" onClick={() => setDeleting(true)}>Delete policy</Button></Can>
          {!editing && <Button tone="primary" icon="plus" onClick={() => setEditing(true)}>New version</Button>}</>} />
      <Modal open={deleting} onOpenChange={(o) => !busy && setDeleting(o)} title={`Delete ${def.name}?`}>
        <p style={{ marginTop: 0 }}>
          This removes the policy, its {def.fields.length} {def.fields.length === 1 ? 'field' : 'fields'} and all {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          {current ? `, including v${current.version}, which is in force today` : ''}. It cannot be undone; the audit trail keeps a record of what was removed.
        </p>
        <div className="form-actions">
          <Button onClick={() => setDeleting(false)} disabled={busy}>Cancel</Button>
          <Button tone="danger" icon="trash" disabled={busy} onClick={async () => {
            setBusy(true)
            try {
              await remove(id)
              notify(`${def.name} deleted`)
              navigate('/policies')
            } catch (err) {
              notify(`${def.name} not deleted: ${errorText(err)}`, 6000)
              setBusy(false)
            }
          }}>{busy ? 'Deleting…' : 'Delete policy'}</Button>
        </div>
      </Modal>
      <div className="form-layout">
        {!editing ? (
          <Card title={`In force: v${current.version}`} subtitle={`Since ${fmtDate(current.effectiveFrom)} · ${current.createdBy} · “${current.reason}”`}
            action={<Button size="sm" icon="pencil" onClick={() => setEditing(true)}>Edit as new version</Button>}>
            <CustomPolicyView fields={def.fields} values={current.values} />
            {latest.version !== current.version && <p style={{ margin: '14px 0 0', fontSize: 13 }}><StatusBadge tone="review">Scheduled</StatusBadge> v{latest.version} applies from {fmtDate(latest.effectiveFrom)}.</p>}
          </Card>
        ) : (
          <Card title="New version" subtitle={`Starts from v${latest.version}. Saving never overwrites an earlier version.`} action={<Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>}>
            <CustomValuesForm key={`${id}-${latest.version}`} fields={def.fields} initial={latest.values}
              onSave={async (values, effectiveFrom, reason) => {
                try {
                  await add(id, effectiveFrom, reason, values)
                } catch (err) {
                  notify(`${def.name}: not saved. ${errorText(err)}`)
                  return
                }
                notify(`${def.name}: v${latest.version + 1} saved, effective ${fmtDate(effectiveFrom)}`)
                setEditing(false)
              }} />
          </Card>
        )}
        <Card title="Versions" subtitle={`In force today: v${current.version}`}>
          <div className="timeline">
            {[...versions].reverse().map((v) => {
              const state = v.id === current.id ? 'In force' : v.effectiveFrom > current.effectiveFrom ? 'Scheduled' : 'Superseded'
              return (
                <div className="step" key={v.id}>
                  <div className="step-n">v{v.version}</div>
                  <div>
                    <strong>{summary(v.values)}</strong>
                    <span style={{ display: 'block' }}>From {fmtDate(v.effectiveFrom)} · {v.createdBy}</span>
                    <span style={{ display: 'block' }}>“{v.reason}”</span>
                    <StatusBadge tone={state === 'In force' ? 'approved' : state === 'Scheduled' ? 'review' : 'draft'} className="mt-1">{state}</StatusBadge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
