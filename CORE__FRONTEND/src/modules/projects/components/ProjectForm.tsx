import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import type { Project } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { ApiError, errorText, fieldErrors, idempotencyKey } from '@/shared/lib/api'
import { useCore } from '@/modules/core-data'
import { projectSchema as schema, type ProjectValues } from '../utils/project/schema'

/** The backend stores active or inactive only, so the form offers the two statuses that survive a reload. */
const STATUSES = ['Active', 'Completed'] as const
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
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ProjectValues>({
    resolver: zodResolver(schema),
    defaultValues: project
      ? { code: project.code, name: project.name, client: project.client, startDate: project.startDate, endDate: project.endDate, status: project.status === 'Completed' ? 'Completed' : 'Active', value: project.value, description: project.description }
      : { code: '', name: '', client: '', startDate: '', endDate: '', status: 'Active', value: 0, description: '' },
  })
  const submit = handleSubmit(async (v) => {
    setFormError('')
    if (projects.some((p) => p.code === v.code && p.id !== project?.id)) return setError('code', { message: 'Another project uses this project ID.' })
    const body = JSON.stringify(v)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ key, body })
    try {
      const saved = project ? await updateRemote(project.id, v, key) : await createRemote(v, key)
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
        <FormGroup label="Contract value (₹)" required error={e.value?.message}>{(id, d) => <Input type="number" inputMode="numeric" {...a11y(id, d, e.value?.message)} {...register('value', { valueAsNumber: true })} />}</FormGroup>
        <FormGroup label="Start date" required error={e.startDate?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.startDate?.message)} {...register('startDate')} />}</FormGroup>
        <FormGroup label="End date" required error={e.endDate?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.endDate?.message)} {...register('endDate')} />}</FormGroup>
        <FormGroup label="Status" required helper="Completed closes the project. Planning and On hold are not stored by the server yet.">{(id, d) => <Select id={id} aria-describedby={d} {...register('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}</FormGroup>
        <FormGroup label="Description" full error={e.description?.message}>{(id, d) => <Textarea rows={3} {...a11y(id, d, e.description?.message)} {...register('description')} />}</FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" icon="check" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button>
      </div>
    </form>
  )
}
