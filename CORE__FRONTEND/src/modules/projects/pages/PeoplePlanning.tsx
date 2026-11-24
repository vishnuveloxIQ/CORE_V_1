import { useRef, useState } from 'react'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import type { PeoplePlanLine, PeoplePlanStatus } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { bulk, saveEach } from '@/shared/lib/bulk'
import { byId } from '@/shared/lib/core'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { newId, useCore } from '@/modules/core-data'
import { errorText } from '@/shared/lib/api'
import { Can, MANAGE } from '@/modules/auth'
import { PeopleForm } from '../components/PeopleForm'
import { PEOPLE_STATUSES as STATUSES, peopleSchema as schema } from '../utils/planning'

const TONE = { Planned: 'pending', Confirmed: 'pending', Fulfilled: 'approved' } as const

/** Resource planning: manpower required per project by role or trade. TODO(backend): GET/POST/PUT/DELETE /projects/{id}/people-plan (mock data today). */
export default function PeoplePlanning() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'people-planning')
  const { peoplePlan, projects, roles, savePeoplePlanRemote, cancelPlanRemote } = useCore()
  const [removeError, setRemoveError] = useState('')
  const [edit, setEdit] = useState<PeoplePlanLine | 'new' | null>(null)
  const [remove, setRemove] = useState<PeoplePlanLine | null>(null)
  const [upload, setUpload] = useState(false)
  const [projectId, setProjectId] = useState('')
  const validate = (records: Record<string, string>[]): RowCheck<PeoplePlanLine>[] => {
    return records.map((r) => {
      const project = projects.find((p) => p.code.toUpperCase() === (r.project_code ?? '').toUpperCase())
      const status = bulk.pick(r.status || 'Planned', STATUSES)
      const position = roles.find((x) => x.title.trim().toLowerCase() === (r.position ?? '').trim().toLowerCase())
      const value = { projectId: project?.id ?? '', positionId: position?.id ?? '', role: r.role ?? '', headcount: bulk.num(r.headcount ?? ''), from: r.from ?? '', to: r.to ?? '', status: status ?? 'Planned' }
      const errors = bulk.check(schema, value)
      if (!project) errors.push(`project_code ${r.project_code || '(blank)'} does not exist.`)
      if (!position) errors.push(`position ${r.position || '(blank)'} does not exist. Use the title of a position on the organogram.`)
      if (!status) errors.push('status must be one of: Planned, Confirmed, Fulfilled.')
      if (value.from && !bulk.date(value.from)) errors.push('from must be a date like 2027-01-01.')
      if (value.to && !bulk.date(value.to)) errors.push('to must be a date like 2027-06-30.')
      if (peoplePlan.some((l) => l.projectId === value.projectId && l.role.toLowerCase() === value.role.trim().toLowerCase() && l.from === value.from)) errors.push('The same requirement already exists.')
      const label = `${r.role || '?'} × ${r.headcount || '?'} · ${r.project_code || '?'}`
      return errors.length ? { label, errors } : { label, value: { ...value, id: newId() } }
    })
  }
  const rows = projectId ? peoplePlan.filter((l) => l.projectId === projectId) : peoplePlan
  const total = (s?: PeoplePlanStatus) => rows.filter((l) => !s || l.status === s).reduce((n, l) => n + l.headcount, 0)
  const projectName = (id: string) => byId(projects, id)?.name ?? id

  return (
    <div ref={ref}>
      <PageHead crumb="Resource planning" title="Resource planning" desc="Plan the manpower required on each project by role or trade, with the period and status of each requirement."
        actions={<Can privilege={MANAGE.masters}>
          <Button icon="upload" onClick={() => setUpload(true)}>Bulk upload</Button>
          <Button tone="primary" icon="plus" onClick={() => setEdit('new')}>Add requirement</Button>
        </Can>} />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">{(id) => <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormGroup>
      </div>
      <div className="grid stats">
        <StatTile label="Total headcount" value={total()} icon="users" tone="blue" />
        <StatTile label="Planned" value={total('Planned')} icon="clipboard" tone="gold" />
        <StatTile label="Confirmed" value={total('Confirmed')} icon="clipboard" tone="blue" />
        <StatTile label="Fulfilled" value={total('Fulfilled')} icon="clipboard" tone="green" />
      </div>
      <TablePanel title="Manpower requirements" subtitle="Filter by status using the chips; pick more than one to combine. Search by project or role. Headcount required per role or trade, per project."
        rows={rows} rowKey={(l) => l.id}
        columns={[
          { header: 'Project', kind: 'c-sub', cell: (l) => <strong>{projectName(l.projectId)}</strong>, csv: (l) => projectName(l.projectId) },
          { header: 'Role / trade', kind: 'c-id', cell: (l) => l.role, csv: (l) => l.role },
          { header: 'Headcount', kind: 'c-amt', cell: (l) => l.headcount, csv: (l) => String(l.headcount) },
          { header: 'Time Period', kind: 'c-more', cell: (l) => `${fmtDate(l.from)} – ${fmtDate(l.to)}`, csv: (l) => `${l.from} to ${l.to}` },
          { header: 'Status', kind: 'c-status', cell: (l) => <StatusBadge tone={TONE[l.status]}>{l.status}</StatusBadge>, csv: (l) => l.status },
        ]}
        searchText={(l) => `${projectName(l.projectId)} ${l.role}`} statusOf={(l) => l.status}
        action={(l) => <Can privilege={MANAGE.masters}><div className="row-actions"><Button size="sm" icon="pencil" onClick={() => setEdit(l)}>Edit</Button><Button size="sm" tone="danger" icon="trash" onClick={() => setRemove(l)}>Remove</Button></div></Can>}
        exportName="core-people-plan" chipNoun="statuses" />
      <BulkUpload open={upload} onOpenChange={setUpload} noun="requirements" templateName="core-people-plan-template"
        fields={[
          { key: 'project_code', label: 'Project ID', required: true, example: projects[0]?.code ?? '', hint: `Projects: ${projects.map((p) => p.code).join(', ')}` },
          { key: 'position', label: 'Position', required: true, example: roles[0]?.title ?? '', hint: `Positions: ${roles.map((x) => x.title).join(', ') || 'none yet'}` },
          { key: 'role', label: 'Role / trade', required: true, example: 'Mason' },
          { key: 'headcount', label: 'Headcount', required: true, example: '10', hint: 'Whole number, 1 or more' },
          { key: 'from', label: 'From', required: true, example: '2027-01-01', hint: 'yyyy-mm-dd' },
          { key: 'to', label: 'To', required: true, example: '2027-06-30', hint: 'yyyy-mm-dd, after from' },
          { key: 'status', label: 'Status', required: false, example: 'Planned', hint: 'Planned, Confirmed or Fulfilled (blank = Planned)' },
        ]}
        validate={validate} onImport={(list) => void saveEach(list, (l) => savePeoplePlanRemote(l), (l) => `${l.role} × ${l.headcount}`, { one: 'requirement', many: 'requirements' })} />
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add requirement' : 'Edit requirement'}>
        {edit && <PeopleForm key={edit === 'new' ? 'new' : edit.id} line={edit === 'new' ? undefined : edit} defaultProject={projectId} onDone={() => setEdit(null)} />}
      </Modal>
      <Modal open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title="Remove requirement?">
        {remove && <>
          <p style={{ marginTop: 0 }}>{remove.role} × {remove.headcount} on {projectName(remove.projectId)}. The change is kept in the audit trail.</p>
          <div className="form-actions"><Button onClick={() => setRemove(null)}>Cancel</Button><Button tone="danger" onClick={() => {
            const done = () => { setRemove(null); setRemoveError(''); notify('Requirement removed') }
            // the API cannot delete a plan line, so it is cancelled
            cancelPlanRemote('people', remove.id).then(done, (err) => setRemoveError(errorText(err)))
          }}>Remove</Button></div>
          {removeError && <p role="alert" style={{ color: 'var(--red)' }}>{removeError}</p>}
        </>}
      </Modal>
    </div>
  )
}
