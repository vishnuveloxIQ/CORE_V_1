import { useEffect, useRef, useState } from 'react'
import { PageHead } from '@/modules/shell'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Note } from '@/shared/ui/Extras'
import { StatusBadge } from '@/shared/ui/Status'
import { FormGroup, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { useEnter } from '@/shared/hooks/useMotion'
import { errorText } from '@/shared/lib/api'
import { fmtDate } from '@/shared/lib/format'
import { Can, MANAGE } from '@/modules/auth'
import { isRemote, subContractorApi, useCore, type SubContractorRecord } from '@/modules/core-data'
import { SubContractorForm } from '../components/SubContractorTab'
import { openSubContractorDocument } from '../utils/subContractorDocument'

/**
 * Sub-contractor registration from the sidebar: every project's sub-contracts, with the project filter at the top
 * narrowing the list to one project. Add asks which project the new sub-contract belongs to.
 */
export default function SubContractors() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'sub-contractors')
  const projects = useCore((s) => s.projects)
  const [rows, setRows] = useState<SubContractorRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)
  const [projectId, setProjectId] = useState('')
  // the form: `new` asks for a project first; an existing row is edited in place
  const [edit, setEdit] = useState<SubContractorRecord | 'new' | null>(null)
  const [addProject, setAddProject] = useState('')

  useEffect(() => {
    let live = true
    subContractorApi.listSubContractors().then(
      (list) => { if (live) { setRows(list); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [tick])

  const reload = () => { setState('loading'); setTick((t) => t + 1) }
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Unknown project'
  const shown = projectId ? rows.filter((r) => r.projectId === projectId) : rows
  const remoteProjects = projects.filter(isRemote)
  const formProject = edit === 'new' ? projects.find((p) => p.id === addProject) : projects.find((p) => p.id === (edit as SubContractorRecord | null)?.projectId)

  return (
    <div ref={ref}>
      <PageHead
        crumb="Sub-contractor registration"
        title="Sub-contractor registration"
        desc="Sub-contract details for each project, for preparing work orders."
      />
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
      <Card title="Sub-contractors" subtitle="Sub-contract details for preparing a work order. Attach the signed agreement or work order (PDF or Word)." action={
        <Can privilege={MANAGE.projects}>
          <Button tone="primary" icon="plus" disabled={remoteProjects.length === 0} onClick={() => { setAddProject(projectId); setEdit('new') }}>Add sub-contractor</Button>
        </Can>
      }>
        {state === 'error' && (
          <Note title="The sub-contractor registrations could not be loaded" icon="alert">
            {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
          </Note>
        )}
      </Card>
      {state !== 'error' && (
        <TablePanel
          title="Registrations"
          subtitle={projectId ? `Showing ${nameOf(projectId)}.` : 'Showing every project.'}
          rows={shown}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Project', kind: 'c-sub', cell: (r) => <strong>{nameOf(r.projectId)}</strong>, csv: (r) => nameOf(r.projectId) },
            { header: 'Firm name', kind: 'c-more', cell: (r) => r.firmName, csv: (r) => r.firmName },
            { header: 'Owner', kind: 'c-more', cell: (r) => r.ownerName, csv: (r) => r.ownerName },
            { header: 'Work contract', kind: 'c-more', cell: (r) => r.workContractTitle, csv: (r) => r.workContractTitle },
            { header: 'Work order date', kind: 'c-more', cell: (r) => (r.workOrderDate ? fmtDate(r.workOrderDate) : '—'), csv: (r) => r.workOrderDate ?? '' },
            {
              header: 'Agreement / work order', kind: 'c-more',
              cell: (r) => (r.agreementFileId ? <Button size="sm" icon="download" onClick={() => openSubContractorDocument(r.agreementFileId!)}>Open</Button> : '—'),
              csv: (r) => (r.agreementFileId ? 'Attached' : ''),
            },
            { header: 'Status', kind: 'c-status', cell: (r) => <StatusBadge tone={r.status === 'active' ? 'approved' : 'draft'}>{r.status === 'active' ? 'Active' : 'Inactive'}</StatusBadge>, csv: (r) => r.status },
          ]}
          searchText={(r) => `${nameOf(r.projectId)} ${r.firmName} ${r.ownerName} ${r.workContractTitle}`}
          searchPlaceholder="Search by project, firm, owner or contract…"
          statusOf={(r) => (r.status === 'active' ? 'Active' : 'Inactive')}
          chipNoun="statuses"
          exportName="core-sub-contractors"
          action={(r) => (
            <Can privilege={MANAGE.projects}>
              <Button size="sm" icon="pencil" onClick={() => setEdit(r)}>Edit</Button>
            </Can>
          )}
        />
      )}
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add sub-contractor' : 'Edit sub-contractor'}>
        {edit === 'new' && (
          <div style={{ marginBottom: 16 }}>
            <FormGroup label="Project" required>
              {(id) => (
                <Select id={id} value={addProject} onChange={(e) => setAddProject(e.target.value)}>
                  <option value="">Choose a project</option>
                  {remoteProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </FormGroup>
          </div>
        )}
        {edit && formProject && (
          <SubContractorForm
            key={edit === 'new' ? `new-${addProject}` : edit.id}
            project={formProject}
            record={edit === 'new' ? undefined : edit}
            onCancel={() => setEdit(null)}
            onSaved={(saved) => {
              setRows((list) => [...list.filter((x) => x.id !== saved.id), saved])
              setEdit(null)
            }}
            onConflict={reload}
          />
        )}
      </Modal>
    </div>
  )
}
