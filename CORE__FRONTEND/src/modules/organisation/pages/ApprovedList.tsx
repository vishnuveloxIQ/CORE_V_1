import { useEffect, useRef, useState } from 'react'
import { PageHead } from '@/modules/shell'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/shared/ui/Modal'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import { useCore } from '@/modules/core-data'
import { useApprovedPeople, type ApprovedPerson, type ApprovedStatus } from '../store/approvedPeople'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { bulk } from '@/shared/lib/bulk'

const TONE: Record<ApprovedStatus, 'pending' | 'review' | 'approved'> = {
  Approved: 'pending',
  'With HRMS': 'review',
  Onboarded: 'approved',
}

const EMPTY = { projectCode: '', department: '', name: '', designation: '', joiningDate: '' }

/** People the admin approves for a project, sends to HRMS, and then sees as onboarded. Mock data until the HRMS hand-off has a backend. */
export default function ApprovedList() {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEnter(ref, 'approved-list')
  const projects = useCore((s) => s.projects)
  const departments = useCore((s) => s.departments)
  const people = useApprovedPeople((s) => s.people)
  const loadPeople = useApprovedPeople((s) => s.load)
  useEffect(() => { void loadPeople() }, [loadPeople])
  const add = useApprovedPeople((s) => s.add)
  const update = useApprovedPeople((s) => s.update)
  const remove = useApprovedPeople((s) => s.remove)
  // the add dialog, or the edit dialog for one person (editing is set while it is open)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ApprovedPerson | null>(null)
  const [upload, setUpload] = useState(false)
  const [forward, setForward] = useState(false)
  // '' shows every project; otherwise the project code the list is filtered to
  const [projectFilter, setProjectFilter] = useState('')
  const shown = projectFilter ? people.filter((p) => p.projectCode === projectFilter) : people
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const projectName = (code: string) => projects.find((p) => p.code === code)?.name ?? code
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // one row per person: the project code, department name, employee name, designation and joining date
  const validate = (records: Record<string, string>[]): RowCheck<Omit<ApprovedPerson, 'id' | 'status'>>[] =>
    records.map((r) => {
      const project = projects.find((p) => p.code.toUpperCase() === (r.project_code ?? '').trim().toUpperCase())
      const dept = departments.find((d) => d.name.trim().toLowerCase() === (r.department ?? '').trim().toLowerCase())
      const value = {
        projectCode: project?.code ?? '',
        department: dept?.name ?? (r.department ?? '').trim(),
        name: (r.employee_name ?? '').trim(),
        designation: (r.designation ?? '').trim(),
        joiningDate: (r.joining_date ?? '').trim(),
      }
      const errors: string[] = []
      if (!project) errors.push(`project_code ${r.project_code || '(blank)'} does not exist.`)
      if (!dept) errors.push(`department ${r.department || '(blank)'} does not exist. Use the name of a department on the organogram.`)
      if (!value.name) errors.push('employee_name is required.')
      if (!value.designation) errors.push('designation is required.')
      if (!value.joiningDate || !bulk.date(value.joiningDate)) errors.push('joining_date must be a date like 2027-01-01.')
      const label = `${value.name || r.employee_name || '?'} · ${project?.code ?? r.project_code ?? '?'}`
      return errors.length ? { label, errors } : { label, value }
    })

  const uploadFields = [
    { key: 'project_code', label: 'Project ID', required: true, example: projects[0]?.code ?? '', hint: `Projects: ${projects.map((p) => p.code).join(', ')}` },
    { key: 'department', label: 'Department', required: true, example: departments[0]?.name ?? '', hint: 'The name of a department on the organogram' },
    { key: 'employee_name', label: 'Employee name', required: true, example: 'Venkat Rao' },
    { key: 'designation', label: 'Designation', required: true, example: 'Site engineer' },
    { key: 'joining_date', label: 'Joining date', required: true, example: '2027-01-01', hint: 'yyyy-mm-dd' },
  ]
  const startAdd = () => {
    setForm(EMPTY)
    setError('')
    setEditing(null)
    setAdding(true)
  }
  const startEdit = (p: ApprovedPerson) => {
    setForm({ projectCode: p.projectCode, department: p.department, name: p.name, designation: p.designation, joiningDate: p.joiningDate })
    setError('')
    setAdding(false)
    setEditing(p)
  }
  const closeDialog = () => {
    setAdding(false)
    setEditing(null)
    setError('')
  }
  const removePerson = (p: ApprovedPerson) => {
    if (!window.confirm(`Delete ${p.name} from the approved list? This cannot be undone.`)) return
    remove(p.id)
    notify(`${p.name} deleted`)
  }

  const save = () => {
    if (!form.projectCode || !form.department.trim() || !form.name.trim() || !form.designation.trim() || !form.joiningDate) {
      return setError('Fill in every field: project, department, employee name, designation and joining date.')
    }
    const details = { projectCode: form.projectCode, department: form.department.trim(), name: form.name.trim(), designation: form.designation.trim(), joiningDate: form.joiningDate }
    if (editing) {
      update(editing.id, details)
      notify(`${details.name} updated`)
    } else {
      add(details)
      notify(`${details.name} added as approved`)
    }
    setForm(EMPTY)
    closeDialog()
  }

  return (
    <div ref={ref}>
      <PageHead
        crumb="Approved list"
        title="Approved list"
        desc="Approve the people for each project, send them to HRMS for onboarding, and see who HRMS has onboarded."
        actions={
          <Can privilege={MANAGE.masters}>
            <Button icon="upload" onClick={() => setUpload(true)}>Bulk upload</Button>{' '}
            <Button tone="primary" icon="plus" onClick={startAdd}>Add Employee</Button>{' '}
            <Button icon="upload" onClick={() => setForward(true)}>Forward</Button>{' '}
            <Button icon="chart" onClick={() => navigate(projectFilter ? `/approved-list/compare?project=${projectFilter}` : '/approved-list/compare')}>Compare</Button>
          </Can>
        }
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <TablePanel
        title="Approved people"
        subtitle="Send each approved person to HRMS. When HRMS has onboarded them, they show as Onboarded here and on the project."
        rows={shown}
        rowKey={(p) => p.id}
        columns={[
          { header: 'Sl no', kind: 'c-id', cell: (p) => shown.indexOf(p) + 1, csv: (p) => String(shown.indexOf(p) + 1) },
          { header: 'Project', kind: 'c-sub', cell: (p) => <strong>{projectName(p.projectCode)}</strong>, csv: (p) => projectName(p.projectCode) },
          { header: 'Department', kind: 'c-more', cell: (p) => p.department, csv: (p) => p.department },
          { header: 'Employee name', kind: 'c-more', cell: (p) => p.name, csv: (p) => p.name },
          { header: 'Designation', kind: 'c-more', cell: (p) => p.designation, csv: (p) => p.designation },
          { header: 'Joining date', kind: 'c-more', cell: (p) => fmtDate(p.joiningDate), csv: (p) => p.joiningDate },
          { header: 'Status', kind: 'c-status', cell: (p) => <StatusBadge tone={TONE[p.status]}>{p.status}</StatusBadge>, csv: (p) => p.status },
        ]}
        searchText={(p) => `${projectName(p.projectCode)} ${p.department} ${p.name} ${p.designation}`}
        statusOf={(p) => p.status}
        action={(p) => (
          <Can privilege={MANAGE.masters}>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Button size="sm" icon="pencil" onClick={() => startEdit(p)}>Edit</Button>
              <Button size="sm" tone="danger" icon="trash" onClick={() => removePerson(p)}>Delete</Button>
            </span>
          </Can>
        )}
        searchPlaceholder="Search by project, name or designation…"
        exportName="core-approved-people"
        chipNoun="statuses"
      />
      <BulkUpload open={upload} onOpenChange={setUpload} noun="approved people" templateName="core-approved-people-template"
        fields={uploadFields}
        validate={validate}
        onImport={(list) => {
          list.forEach((l) => add(l))
          notify(`${list.length} approved ${list.length === 1 ? 'person' : 'people'} added`)
        }} />
      <BulkUpload open={forward} onOpenChange={setForward} noun="forwarded people" templateName="core-approved-people-forward-template"
        fields={uploadFields}
        validate={validate}
        onImport={(list) => {
          list.forEach((l) => add(l))
          notify(`${list.length} forwarded ${list.length === 1 ? 'person' : 'people'} added`)
        }} />
      <Modal open={adding || !!editing} onOpenChange={(o) => { if (!o) closeDialog() }} title={editing ? 'Edit approved person' : 'Add approved person'} description={editing ? 'Change the details of this person. Their status is kept.' : 'The person starts as Approved. Send them to HRMS from the list.'}>
        <div className="form-grid">
          <FormGroup label="Project" required full>
            {(id) => (
              <Select id={id} value={form.projectCode} onChange={set('projectCode')}>
                <option value="">Choose a project</option>
                {projects.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Department" required>{(id) => (
            <Select id={id} value={form.department} onChange={set('department')}>
              <option value="">Choose a department</option>
              {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Select>
          )}</FormGroup>
          <FormGroup label="Employee name" required>{(id) => <Input id={id} value={form.name} onChange={set('name')} />}</FormGroup>
          <FormGroup label="Designation" required>{(id) => <Input id={id} value={form.designation} onChange={set('designation')} />}</FormGroup>
          <FormGroup label="Joining date" required>{(id) => <Input id={id} type="date" value={form.joiningDate} onChange={set('joiningDate')} />}</FormGroup>
        </div>
        {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="form-actions">
          <Button onClick={closeDialog}>Cancel</Button>
          <Button tone="primary" icon="check" onClick={save}>{editing ? 'Save changes' : 'Add person'}</Button>
        </div>
      </Modal>
    </div>
  )
}
