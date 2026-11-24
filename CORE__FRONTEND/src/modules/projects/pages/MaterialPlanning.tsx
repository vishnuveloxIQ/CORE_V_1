import { useRef, useState } from 'react'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import type { MaterialPlanLine, MaterialPlanStatus } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { bulk, saveEach } from '@/shared/lib/bulk'
import { byId } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { newId, useCore } from '@/modules/core-data'
import { errorText } from '@/shared/lib/api'
import { Can, MANAGE } from '@/modules/auth'
import { MaterialForm } from '../components/MaterialForm'
import { MATERIAL_STATUSES as STATUSES, materialSchema as schema, storesForProject } from '../utils/planning'

const TONE = { Planned: 'pending', Requested: 'pending', Ordered: 'pending', Received: 'approved' } as const

/** Material planning: materials required per project. TODO(backend): GET/POST/PUT/DELETE /projects/{id}/material-plan (mock data today). */
export default function MaterialPlanning() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'material-planning')
  const { materialPlan, materials, stores, sites, projects, saveMaterialPlanRemote, cancelPlanRemote } = useCore()
  const [removeError, setRemoveError] = useState('')
  const [edit, setEdit] = useState<MaterialPlanLine | 'new' | null>(null)
  const [remove, setRemove] = useState<MaterialPlanLine | null>(null)
  const [upload, setUpload] = useState(false)
  const [projectId, setProjectId] = useState('')
  const validate = (records: Record<string, string>[]): RowCheck<MaterialPlanLine>[] => {
    return records.map((r) => {
      const project = projects.find((p) => p.code.toUpperCase() === (r.project_code ?? '').toUpperCase())
      const material = materials.find((m) => m.status === 'Active' && m.name.trim().toLowerCase() === (r.material ?? '').trim().toLowerCase())
      const store = stores.find((s) => s.status === 'Active' && s.name.trim().toLowerCase() === (r.store ?? '').trim().toLowerCase())
      const status = bulk.pick(r.status || 'Planned', STATUSES)
      const value = { projectId: project?.id ?? '', materialId: material?.id ?? '', qty: bulk.num(r.qty ?? ''), uom: material?.uom ?? '', requiredBy: r.required_by ?? '', storeId: store?.id ?? '', status: status ?? 'Planned' }
      const errors = bulk.check(schema, value)
      if (!project) errors.push(`project_code ${r.project_code || '(blank)'} does not exist.`)
      if (!material) errors.push(`material ${r.material || '(blank)'} does not exist or is not Active.`)
      if (!store) errors.push(`store ${r.store || '(blank)'} does not exist or is not Active.`)
      else if (project && !storesForProject(stores, sites, project.id).some((s) => s.id === store.id)) errors.push(`store ${store.name} is not assigned to project ${project.code}.`)
      if (!status) errors.push('status must be one of: Planned, Requested, Ordered, Received.')
      if (value.requiredBy && !bulk.date(value.requiredBy)) errors.push('required_by must be a date like 2027-06-30.')
      if (materialPlan.some((l) => l.projectId === value.projectId && l.materialId === value.materialId && l.storeId === value.storeId && l.requiredBy === value.requiredBy)) errors.push('The same material line already exists.')
      const label = `${r.material || '?'} × ${r.qty || '?'} · ${r.project_code || '?'}`
      return errors.length ? { label, errors } : { label, value: { ...value, id: newId() } }
    })
  }
  const rows = projectId ? materialPlan.filter((l) => l.projectId === projectId) : materialPlan
  const projectName = (id: string) => byId(projects, id)?.name ?? id
  const matName = (id: string) => byId(materials, id)?.name ?? id
  const storeName = (id: string) => byId(stores, id)?.name ?? id
  const count = (s: MaterialPlanStatus) => rows.filter((l) => l.status === s).length

  return (
    <div ref={ref}>
      <PageHead crumb="Material planning" title="Material planning" desc="Plan the materials required on each project, with quantity as per BOQ."
        actions={<Can privilege={MANAGE.masters}>
          <Button icon="upload" onClick={() => setUpload(true)}>Bulk upload</Button>
          <Button tone="primary" icon="plus" onClick={() => setEdit('new')}>Add material line</Button>
        </Can>} />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">{(id) => <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormGroup>
      </div>
      <div className="grid stats">
        <StatTile label="Material lines" value={rows.length} icon="clipboard" tone="blue" />
        <StatTile label="Planned / requested" value={count('Planned') + count('Requested')} icon="clipboard" tone="gold" />
        <StatTile label="Ordered" value={count('Ordered')} icon="clipboard" tone="blue" />
        <StatTile label="Received" value={count('Received')} icon="clipboard" tone="green" />
      </div>
      <TablePanel title="Material requirements" subtitle="Filter by status using the chips; pick more than one to combine. Search by project, material or store. Quantities are planned against the materials master."
        rows={rows} rowKey={(l) => l.id}
        columns={[
          { header: 'Project', kind: 'c-sub', cell: (l) => <strong>{projectName(l.projectId)}</strong>, csv: (l) => projectName(l.projectId) },
          { header: 'Material', kind: 'c-id', cell: (l) => matName(l.materialId), csv: (l) => matName(l.materialId) },
          { header: 'Quantity', kind: 'c-amt', cell: (l) => `${l.qty.toLocaleString('en-IN')} ${l.uom}`, csv: (l) => `${l.qty} ${l.uom}` },
          { header: 'Target store', kind: 'c-more', cell: (l) => storeName(l.storeId), csv: (l) => storeName(l.storeId) },
          { header: 'Status', kind: 'c-status', cell: (l) => <StatusBadge tone={TONE[l.status]}>{l.status}</StatusBadge>, csv: (l) => l.status },
        ]}
        searchText={(l) => `${projectName(l.projectId)} ${matName(l.materialId)} ${storeName(l.storeId)}`} statusOf={(l) => l.status}
        action={(l) => <Can privilege={MANAGE.masters}><div className="row-actions"><Button size="sm" icon="pencil" onClick={() => setEdit(l)}>Edit</Button><Button size="sm" tone="danger" icon="trash" onClick={() => setRemove(l)}>Remove</Button></div></Can>}
        exportName="core-material-plan" chipNoun="statuses" />
      <BulkUpload open={upload} onOpenChange={setUpload} noun="material lines" templateName="core-material-plan-template"
        fields={[
          { key: 'project_code', label: 'Project ID', required: true, example: projects[0]?.code ?? '', hint: `Projects: ${projects.map((p) => p.code).join(', ')}` },
          { key: 'material', label: 'Material', required: true, example: materials.find((m) => m.status === 'Active')?.name ?? '', hint: 'Name from the materials master (Active only). Unit is taken from the master.' },
          { key: 'qty', label: 'Quantity', required: true, example: '100', hint: 'Number, 1 or more' },
          { key: 'required_by', label: 'Required by', required: true, example: '2027-03-31', hint: 'yyyy-mm-dd' },
          { key: 'store', label: 'Target store', required: true, example: stores.find((s) => s.status === 'Active')?.name ?? '', hint: 'Store name (Active only)' },
          { key: 'status', label: 'Status', required: false, example: 'Planned', hint: 'Planned, Requested, Ordered or Received (blank = Planned)' },
        ]}
        validate={validate} onImport={(list) => void saveEach(list, (l) => saveMaterialPlanRemote(l), (l) => `${matName(l.materialId)} × ${l.qty}`, { one: 'material line', many: 'material lines' })} />
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add material line' : 'Edit material line'}>
        {edit && <MaterialForm key={edit === 'new' ? 'new' : edit.id} line={edit === 'new' ? undefined : edit} defaultProject={projectId} onDone={() => setEdit(null)} />}
      </Modal>
      <Modal open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title="Remove material line?">
        {remove && <>
          <p style={{ marginTop: 0 }}>{matName(remove.materialId)} for {projectName(remove.projectId)}. The change is kept in the audit trail.</p>
          <div className="form-actions"><Button onClick={() => setRemove(null)}>Cancel</Button><Button tone="danger" onClick={() => {
            const done = () => { setRemove(null); setRemoveError(''); notify('Material line removed') }
            // the API cannot delete a plan line, so it is cancelled
            cancelPlanRemote('material', remove.id).then(done, (err) => setRemoveError(errorText(err)))
          }}>Remove</Button></div>
          {removeError && <p role="alert" style={{ color: 'var(--red)' }}>{removeError}</p>}
        </>}
      </Modal>
    </div>
  )
}
