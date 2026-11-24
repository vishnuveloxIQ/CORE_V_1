import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import type { MaterialPlanLine, MaterialPlanStatus } from '@/modules/core-data'
import { a11y, byId } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { newId, uomLabel, useCore } from '@/modules/core-data'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { MATERIAL_STATUSES, materialSchema as schema, storesForProject } from '../utils/planning'

/**
 * Add or edit one material line. `defaultProject` pre-selects the project; with `lockProject` the project
 * cannot be changed (the form was opened from that project's page).
 */
export function MaterialForm({ line, defaultProject, lockProject, onDone }: { line?: MaterialPlanLine; defaultProject?: string; lockProject?: boolean; onDone: () => void }) {
  const { materials, stores, sites, projects, uoms, uomsError, saveMaterialPlanRemote } = useCore()
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null)
  const { register, handleSubmit, setValue, watch, formState: { errors: e } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: line ?? { projectId: defaultProject ?? '', materialId: '', qty: 1, uom: '', requiredBy: '', storeId: '', status: 'Planned' as MaterialPlanStatus },
  })
  const submit = handleSubmit(async (v) => {
    setFormError('')
    const next = { ...v, id: line?.id ?? newId(), rowVersion: line?.rowVersion }
    const body = JSON.stringify(v)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ key, body })
    try {
      await saveMaterialPlanRemote(next, key)
      setPending(null)
      notify(line ? 'Material line saved' : 'Material line added')
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
  const mats = materials.filter((m) => m.status === 'Active' || m.id === line?.materialId)
  // the target store is one of the stores assigned to the chosen project (a store at one of its locations)
  const projectId = watch('projectId')
  const projectStores = storesForProject(stores, sites, projectId)
  const sts = projectStores.filter((s) => s.status === 'Active' || s.id === line?.storeId)
  // a project with exactly one store has its target store chosen for it, as the project itself is
  const onlyStore = sts.length === 1 ? sts[0] : undefined
  const storeId = watch('storeId')
  useEffect(() => {
    if (onlyStore && storeId !== onlyStore.id) setValue('storeId', onlyStore.id, { shouldValidate: !!storeId })
  }, [onlyStore, storeId, setValue])
  const storeHelper = !projectId
    ? 'Choose a project first. Only the stores assigned to it are listed.'
    : sts.length === 0
      ? 'No store is assigned to this project yet. Add a store at one of the project\'s locations first.'
      : 'Only the stores assigned to this project are listed.'
  const locked = lockProject && defaultProject ? projects.find((p) => p.id === defaultProject) : undefined
  return (
    <form noValidate onSubmit={submit}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
      <div className="form-grid">
        {locked
          ? <FormGroup label="Project" full>{(id) => <><Input id={id} value={locked.name} readOnly /><input type="hidden" {...register('projectId')} /></>}</FormGroup>
          : <FormGroup label="Project" required full error={e.projectId?.message}>{(id, d) => <Select {...a11y(id, d, e.projectId?.message)} {...register('projectId', { onChange: () => setValue('storeId', '') })}><option value="">Choose…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormGroup>}
        <FormGroup label="Material" required error={e.materialId?.message}>{(id, d) => <Select {...a11y(id, d, e.materialId?.message)} {...register('materialId', { onChange: (ev) => setValue('uom', byId(materials, ev.target.value)?.uom ?? '') })}><option value="">Choose…</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</FormGroup>
        {onlyStore
          ? <FormGroup label="Target store" helper="The only store assigned to this project.">{(id) => <><Input id={id} value={onlyStore.name} readOnly /><input type="hidden" {...register('storeId')} /></>}</FormGroup>
          : <FormGroup label="Target store" required error={e.storeId?.message} helper={storeHelper}>{(id, d) => <Select {...a11y(id, d, e.storeId?.message)} {...register('storeId')}><option value="">Choose…</option>{sts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</FormGroup>}
        <FormGroup label="Quantity" required error={e.qty?.message}>{(id, d) => <Input type="number" min={1} {...a11y(id, d, e.qty?.message)} {...register('qty', { valueAsNumber: true })} />}</FormGroup>
        <FormGroup label="Unit" required error={e.uom?.message} helper={uomsError ? `The server's units could not be read: ${uomsError}` : 'Units come from the server\'s list. A unit that is not listed cannot be added here.'}>
          {(id, d) => <Select {...a11y(id, d, e.uom?.message)} {...register('uom')}><option value="">Choose a unit</option>{uoms.map((u) => <option key={u.id} value={u.code}>{uomLabel(u)}</option>)}</Select>}
        </FormGroup>
        <FormGroup label="Required by" required error={e.requiredBy?.message}>{(id, d) => <Input type="date" {...a11y(id, d, e.requiredBy?.message)} {...register('requiredBy')} />}</FormGroup>
        <FormGroup label="Status">{(id) => <Select id={id} {...register('status')}>{MATERIAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}</FormGroup>
      </div>
      <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" tone="primary">Save material line</Button></div>
    </form>
  )
}
