import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import { EXECUTION_MODE_LABEL, PROJECT_TYPE_LABEL, type ExecutionMode, type Project, type ProjectType } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { ApiError, errorText, fieldErrors, idempotencyKey } from '@/shared/lib/api'
import { useCore } from '@/modules/core-data'
import { projectSchema as schema, type ProjectValues } from '../utils/project/schema'
import { INDIAN_STATES } from '@/shared/lib/indianStates'
import { OTHER_DEPARTMENT, PROJECT_DEPARTMENTS, departmentChoiceOf } from '../utils/project/departments'

const STATUSES = ['Planning', 'Active', 'On hold', 'Completed'] as const
/** API field name → form field name */
const FIELD: Record<string, keyof ProjectValues> = { valueAmount: 'value' }

export function ProjectForm({ project, onSaved, onCancel }: { project?: Project; onSaved: (id: string) => void; onCancel: () => void }) {
  const projects = useCore((s) => s.projects)
  const createRemote = useCore((s) => s.createProjectRemote)
  const updateRemote = useCore((s) => s.updateProjectRemote)
  const loadProjects = useCore((s) => s.loadProjects)
  const [error, setFormError] = useState('')
  // one Idempotency-Key per action: a retry of the same values after a network error reuses it, so the server
  // saves once; changed values are a new action and get a new key
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ProjectValues>({
    resolver: zodResolver(schema),
    defaultValues: project
      ? { code: project.code, name: project.name, client: project.client, consultantName: project.consultantName ?? '', state: project.state ?? '', executionMode: project.executionMode ?? '', projectType: project.projectType ?? '', departmentChoice: departmentChoiceOf(project.department).choice, departmentOther: departmentChoiceOf(project.department).other, startDate: project.startDate, endDate: project.endDate, status: project.status === 'Completed' ? 'Completed' : 'Active', value: project.value, description: project.description }
      : { code: '', name: '', client: '', consultantName: '', state: '', executionMode: '', projectType: '', departmentChoice: '', departmentOther: '', startDate: '', endDate: '', status: 'Active', value: 0, description: '' },
  })
  const departmentChoice = useWatch({ control, name: 'departmentChoice' })
  const submit = handleSubmit(async (v) => {
    setFormError('')
    if (projects.some((p) => p.code === v.code && p.id !== project?.id)) return setError('code', { message: 'Another project uses this project ID.' })
    // the saved department is the listed name, or the typed name for Other
    const details = { ...v, department: v.departmentChoice === OTHER_DEPARTMENT ? (v.departmentOther ?? '') : (v.departmentChoice ?? '') }
    const body = JSON.stringify(v)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ key, body })
    try {
      const saved = project ? await updateRemote(project.id, details, key) : await createRemote(details, key)
      setPending(null)
      onSaved(saved.id)
    } catch (err) {
      // only a lost connection may be retried with the same key; any answer from the server ends that action
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code.endsWith('_DUPLICATE')) return setError('code', { message: 'Another project uses this project ID.' })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await loadProjects()
        return setFormError('Someone else changed this project. The latest version is loaded; check it and save again.')
      }
      const fields = fieldErrors(err)
      const named = Object.entries(fields).filter(([f]) => f in FIELD || f in (v as object))
      named.forEach(([f, m]) => setError(FIELD[f] ?? (f as keyof ProjectValues), { message: m }))
      setFormError(named.length ? 'Check the highlighted fields.' : errorText(err))
    }
  })
  const e = errors
  return (
    <form noValidate onSubmit={submit}>
      {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><Icon name="alert" /><span>{error}</span></div>}
      <div className="form-grid">
        <FormGroup label="Project name" required error={e.name?.message}>{(id, d) => <Input {...a11y(id, d, e.name?.message)} {...register('name')} />}</FormGroup>
        {/* The project ID is the project code: the one reference to the project everywhere in CORE, so it is fixed once the project exists. */}
        <FormGroup label="Project ID" required error={e.code?.message}
          helper={project ? 'The project ID cannot change: other records refer to the project by it.' : 'The project’s reference everywhere in CORE, e.g. NH-44. It cannot change after the project is created.'}>
          {(id, d) => <Input className={project ? 'uppercase is-readonly' : 'uppercase'} readOnly={!!project} aria-readonly={project ? true : undefined} {...a11y(id, d, e.code?.message)} {...register('code', { setValueAs: (v: string) => v.toUpperCase() })} />}
        </FormGroup>
        <FormGroup label="Client" required error={e.client?.message}>{(id, d) => <Input {...a11y(id, d, e.client?.message)} {...register('client')} />}</FormGroup>
        <FormGroup label="State" error={e.state?.message}>{(id, d) => <Select id={id} aria-describedby={d} {...register('state')}><option value="">Select a state</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>}</FormGroup>
        <FormGroup label="Department" error={e.departmentChoice?.message} helper="Pick Other to type a different name.">{(id, d) => <Select id={id} aria-describedby={d} {...register('departmentChoice')}><option value="">Select a department</option>{PROJECT_DEPARTMENTS.map((x) => <option key={x} value={x}>{x}</option>)}<option value={OTHER_DEPARTMENT}>Other</option></Select>}</FormGroup>
        {departmentChoice === OTHER_DEPARTMENT && (
          <FormGroup label="Department name" required full error={e.departmentOther?.message}>{(id, d) => <Input {...a11y(id, d, e.departmentOther?.message)} {...register('departmentOther')} />}</FormGroup>
        )}
        <FormGroup label="Project type" error={e.projectType?.message}>{(id, d) => <Select id={id} aria-describedby={d} {...register('projectType')}><option value="">Select a project type</option>{(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>)}</Select>}</FormGroup>
        <FormGroup label="Consultant name" error={e.consultantName?.message}>{(id, d) => <Input {...a11y(id, d, e.consultantName?.message)} {...register('consultantName')} />}</FormGroup>
        <FormGroup label="Contract value (₹)" required error={e.value?.message}>{(id, d) => <Input type="number" inputMode="numeric" {...a11y(id, d, e.value?.message)} {...register('value', { valueAsNumber: true })} />}</FormGroup>
        <FormGroup label="Start date" required error={e.startDate?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.startDate?.message)} {...register('startDate')} />}</FormGroup>
        <FormGroup label="End date" required error={e.endDate?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.endDate?.message)} {...register('endDate')} />}</FormGroup>
        <FormGroup label="Status" required helper="Each status is saved as chosen and shown on the project list.">{(id, d) => <Select id={id} aria-describedby={d} {...register('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}</FormGroup>
        <FormGroup label="Description" full error={e.description?.message}>{(id, d) => <Textarea rows={3} {...a11y(id, d, e.description?.message)} {...register('description')} />}</FormGroup>
        <FormGroup label="Execution mode" full error={e.executionMode?.message}>{(id, d) => <Select id={id} aria-describedby={d} {...register('executionMode')}><option value="">Select an execution mode</option>{(Object.keys(EXECUTION_MODE_LABEL) as ExecutionMode[]).map((m) => <option key={m} value={m}>{EXECUTION_MODE_LABEL[m]}</option>)}</Select>}</FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" icon="check" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button>
      </div>
    </form>
  )
}
