import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '@/modules/shell'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { useEnter } from '@/shared/hooks/useMotion'
import { errorText, idempotencyKey } from '@/shared/lib/api'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import { isRemote, useCore, workforceApi, type AdvertRecord } from '@/modules/core-data'
import { INDIAN_STATES } from '@/shared/lib/indianStates'

const TONE = { DRAFT: 'draft', PUBLISHED: 'approved', CLOSED: 'rejected' } as const

/** Workforce adverts: the list of head office's adverts to registered sub-contractors, and a new draft. */
export default function WorkforceAdverts() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'workforce-adverts')
  const navigate = useNavigate()
  const projects = useCore((s) => s.projects)
  const [rows, setRows] = useState<AdvertRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [projectId, setProjectId] = useState('')
  const shown = projectId ? rows.filter((r) => r.projectId === projectId) : rows

  useEffect(() => {
    let live = true
    workforceApi.listAdverts().then(
      (list) => { if (live) { setRows(list); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [tick])

  const reload = () => { setState('loading'); setTick((t) => t + 1) }
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Unknown project'
  const count = (st: AdvertRecord['status']) => shown.filter((r) => r.status === st).length

  return (
    <div ref={ref}>
      <PageHead
        crumb="Workforce adverts"
        title="Workforce adverts"
        desc="Workers a project location needs, advertised to the registered sub-contractors. Publish a draft to send it out."
      />
      <div className="grid stats">
        <StatTile label="Drafts" value={count('DRAFT')} icon="clipboard" tone="gold" />
        <StatTile label="Published" value={count('PUBLISHED')} icon="checkc" tone="green" />
        <StatTile label="Closed" value={count('CLOSED')} icon="xc" tone="purple" />
      </div>
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <Card title="Adverts" subtitle="Start with a draft, add the worker lines, then publish." action={
        <Can privilege={MANAGE.projects}>
          <Button tone="primary" icon="plus" onClick={() => setAdding(true)}>New advert</Button>
        </Can>
      }>
        {state === 'error' && (
          <Note title="The adverts could not be loaded" icon="alert">
            {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
          </Note>
        )}
      </Card>
      {state !== 'error' && (
        <TablePanel
          title="All adverts"
          subtitle="Open an advert to add its worker lines, publish it, and record the sub-contractors who respond."
          rows={shown}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Code', kind: 'c-id', cell: (r) => r.code, csv: (r) => r.code },
            { header: 'Title', kind: 'c-sub', cell: (r) => <strong>{r.title}</strong>, csv: (r) => r.title },
            { header: 'Project', kind: 'c-more', cell: (r) => nameOf(r.projectId), csv: (r) => nameOf(r.projectId) },
            { header: 'Required from', kind: 'c-more', cell: (r) => `${fmtDate(r.requiredFrom)}${r.requiredTo ? ` to ${fmtDate(r.requiredTo)}` : ''}`, csv: (r) => r.requiredFrom },
            { header: 'Status', kind: 'c-status', cell: (r) => <StatusBadge tone={TONE[r.status]}>{r.status === 'DRAFT' ? 'Draft' : r.status === 'PUBLISHED' ? 'Published' : 'Closed'}</StatusBadge>, csv: (r) => r.status },
          ]}
          searchText={(r) => `${r.code} ${r.title} ${nameOf(r.projectId)}`}
          searchPlaceholder="Search by code, title or project…"
          statusOf={(r) => (r.status === 'DRAFT' ? 'Draft' : r.status === 'PUBLISHED' ? 'Published' : 'Closed')}
          chipNoun="statuses"
          exportName="core-workforce-adverts"
          action={(r) => <Button size="sm" onClick={() => navigate(`/workforce-adverts/${r.id}`)}>Open</Button>}
        />
      )}
      {adding && <NewAdvert onClose={() => setAdding(false)} onCreated={(id) => navigate(`/workforce-adverts/${id}`)} />}
    </div>
  )
}

function NewAdvert({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const projects = useCore((s) => s.projects).filter(isRemote)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [state, setState] = useState('')
  const [description, setDescription] = useState('')
  const [requiredFrom, setRequiredFrom] = useState('')
  const [requiredTo, setRequiredTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (!title.trim()) return setError('Give the advert a title.')
    if (!projectId) return setError('Choose the project.')
    if (!requiredFrom) return setError('Pick the date the workers are needed from.')
    if (requiredTo && requiredTo < requiredFrom) return setError('The end date cannot be before the start date.')
    setBusy(true)
    try {
      const created = await workforceApi.createAdvert(
        { title: title.trim(), projectId, state: state.trim() || null, description: description.trim() || null, requiredFrom, requiredTo: requiredTo || null, closesAt: null },
        idempotencyKey(),
      )
      notify('Draft advert created')
      onCreated(created.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="New workforce advert" description="A new advert starts as a draft. Add the worker lines before publishing.">
      <form noValidate onSubmit={submit}>
        {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
        <div className="form-grid">
          <FormGroup label="Title" required>{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Masons for canal lining" />}</FormGroup>
          <FormGroup label="Project" required>
            {(id) => (
              <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose a project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="State">
            {(id) => (
              <Select id={id} value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Choose a state</option>
                {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Required from" required>{(id) => <Input id={id} type="date" value={requiredFrom} onChange={(e) => setRequiredFrom(e.target.value)} />}</FormGroup>
          <FormGroup label="Required to">{(id) => <Input id={id} type="date" value={requiredTo} onChange={(e) => setRequiredTo(e.target.value)} />}</FormGroup>
          <FormGroup label="Description" full>{(id) => <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}</FormGroup>
        </div>
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit" disabled={busy}>Create draft</Button>
        </div>
      </form>
    </Modal>
  )
}
