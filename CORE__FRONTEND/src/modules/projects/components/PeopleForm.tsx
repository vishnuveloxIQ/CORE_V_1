import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Modal } from '@/shared/ui/Modal'
import { RoleForm } from '@/modules/organisation'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import type { PeoplePlanLine, PeoplePlanStatus } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { newId, useCore } from '@/modules/core-data'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { PEOPLE_STATUSES, peopleSchema as schema } from '../utils/planning'

/** The position list's last choice: opens the role form, so a position not in the organogram is created there. */
const NEW_POSITION = '__new__'

/**
 * Add or edit one manpower requirement. `defaultProject` pre-selects the project; with `lockProject` the project
 * cannot be changed (the form was opened from that project's page).
 */
export function PeopleForm({ line, defaultProject, lockProject, onDone }: { line?: PeoplePlanLine; defaultProject?: string; lockProject?: boolean; onDone: () => void }) {
  const { projects, roles, departments, savePeoplePlanRemote } = useCore()
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null)
  const [addingPosition, setAddingPosition] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors: e } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: line ? { ...line, positionId: line.positionId ?? '' } : { projectId: defaultProject ?? '', positionId: '', role: '', headcount: 1, from: '', to: '', status: 'Planned' as PeoplePlanStatus },
  })
  const submit = handleSubmit(async (v) => {
    setFormError('')
    const next = { ...v, id: line?.id ?? newId(), rowVersion: line?.rowVersion }
    const body = JSON.stringify(v)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ key, body })
    try {
      await savePeoplePlanRemote(next, key)
      setPending(null)
      notify(line ? 'Requirement saved' : 'Requirement added')
      onDone()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await useCore.getState().loadPlanning()
        return setFormError('Someone else changed this line. The latest version is loaded; close this and edit it again.')
      }
      setFormError(errorText(err))
    }
  })
  const locked = lockProject && defaultProject ? projects.find((p) => p.id === defaultProject) : undefined
  return (
    <form noValidate onSubmit={submit}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
      <div className="form-grid">
        {locked
          ? <FormGroup label="Project" full>{(id) => <><Input id={id} value={locked.name} readOnly /><input type="hidden" {...register('projectId')} /></>}</FormGroup>
          : <FormGroup label="Project" required full error={e.projectId?.message}>{(id, d) => <Select {...a11y(id, d, e.projectId?.message)} {...register('projectId')}><option value="">Choose…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormGroup>}
        <FormGroup label="Position" required error={e.positionId?.message} helper={roles.length ? undefined : 'No positions yet. Add one on the Departments and organogram screens first.'}>
          {(id, d) => <Select {...a11y(id, d, e.positionId?.message)} {...register('positionId', { onChange: (ev: { target: HTMLSelectElement }) => { if (ev.target.value === NEW_POSITION) { setValue('positionId', '', { shouldDirty: true }); setAddingPosition(true) } } })}><option value="">Choose a position</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}<option value={NEW_POSITION}>+ Add a position not in the organogram</option></Select>}
        </FormGroup>
        <FormGroup label="Department" error={e.department?.message} helper={departments.length ? 'The department the people work in.' : 'No departments yet. Add them on the Departments screen first.'}>{(id, d) => <Select {...a11y(id, d, e.department?.message)} {...register('department')}><option value="">Choose a department</option>{departments.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</Select>}</FormGroup>
        <FormGroup label="Role / trade" required error={e.role?.message}>{(id, d) => <Input {...a11y(id, d, e.role?.message)} {...register('role')} />}</FormGroup>
        <FormGroup label="Headcount" required error={e.headcount?.message}>{(id, d) => <Input type="number" min={1} {...a11y(id, d, e.headcount?.message)} {...register('headcount', { valueAsNumber: true })} />}</FormGroup>
        <FormGroup label="From" required error={e.from?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.from?.message)} {...register('from')} />}</FormGroup>
        <FormGroup label="To" required error={e.to?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.to?.message)} {...register('to')} />}</FormGroup>
        <FormGroup label="Status">{(id) => <Select id={id} {...register('status')}>{PEOPLE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}</FormGroup>
      </div>
      <Modal open={addingPosition} onOpenChange={setAddingPosition} title="Add a position" description="Creates the position in the company organogram.">
        {addingPosition && (
          <RoleForm
            preset={{ title: watch('role') ?? '' }}
            onDone={(id) => {
              setAddingPosition(false);
              if (id) setValue('positionId', id, { shouldValidate: true, shouldDirty: true });
            }}
          />
        )}
      </Modal>
      <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" tone="primary">Save requirement</Button></div>
    </form>
  )
}
