import { useId, useState } from 'react'
import { useFieldArray, useWatch, type FieldError } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { a11y, req } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { todayISO } from '@/shared/lib/format'
import { ActionScope } from '@/modules/shell'
import { asUuid, isRemote, MODULES, uomLabel, useCore, type RaiseBody, type RequestType } from '@/modules/core-data'
import { REQUEST_TYPES } from '../utils/schema'
import {
  AMOUNT_KINDS, buildPayload, emptyPayload, FIELDS, JOB_ROUTES, KIND_OF, MODULE_OF, payloadRules, payloadShape,
  type FieldSpec, type Source,
} from '../utils/requestPayload'

const schema = z.object({
  requestType: z.string().min(1, 'Pick a request type.'),
  module: z.string().min(1, 'Pick a module.'),
  title: req('Title').max(200, 'Use 200 characters or fewer.'),
  amount: z.number({ error: 'Enter the amount.' }).min(0, 'Amount cannot be negative.'),
  projectId: z.string(),
  locationId: z.string(),
  chainageMarkerId: z.string(),
  emergency: z.enum(['true', 'false']),
  /** when the request is needed by; a material request uses its own Required by date instead */
  neededByDate: z.string(),
  ...payloadShape,
}).superRefine((v, ctx) => {
  const kind = KIND_OF[v.requestType as RequestType]
  if (kind) payloadRules(kind, v, ctx)
  // A request that is not an emergency says when it is needed (owner decision, 2026-11-22).
  if (v.emergency === 'false' && kind !== 'material') {
    if (!v.neededByDate) ctx.addIssue({ code: 'custom', path: ['neededByDate'], message: 'Enter the date this is needed by, or mark the request as an emergency.' })
    else if (v.neededByDate < todayISO()) ctx.addIssue({ code: 'custom', path: ['neededByDate'], message: 'The needed-by date cannot be in the past.' })
  }
})
type Values = z.infer<typeof schema>
type Option = { value: string; label: string }

const active = <T extends { status: 'Active' | 'Inactive' }>(list: T[]) => list.filter((x) => x.status === 'Active')
const unique = (list: string[]) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b))

/**
 * Raise a new approval request (POST /approval-requests) with its payload (the fields the detail page shows for the
 * request type), and the project's location and chainage marker. Mounted only while open.
 */
export function RaiseRequestDialog({ onClose }: { onClose: () => void }) {
  const raiseRequestRemote = useCore((s) => s.raiseRequestRemote)
  const projects = useCore((s) => s.projects).filter(isRemote)
  const sites = useCore((s) => s.sites)
  const materials = useCore((s) => s.materials)
  const stores = useCore((s) => s.stores)
  const uoms = useCore((s) => s.uoms)
  const equipmentTypes = useCore((s) => s.equipmentTypes)
  const roles = useCore((s) => s.roles)
  const users = useCore((s) => s.users)
  const departments = useCore((s) => s.departments)
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  const listId = useId()
  const { register, handleSubmit, setValue, control, formState: { errors: e } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestType: REQUEST_TYPES[0], module: MODULE_OF[KIND_OF[REQUEST_TYPES[0]]], title: '', amount: 0, projectId: '', locationId: '', chainageMarkerId: '',
      emergency: 'false', neededByDate: '', ...emptyPayload(),
    },
  })
  const employees = useFieldArray({ control, name: 'employees' })
  const [requestType, projectId, locationId, emergency] = useWatch({ control, name: ['requestType', 'projectId', 'locationId', 'emergency'] })
  const kind = KIND_OF[requestType as RequestType]

  const project = projects.find((p) => p.id === projectId)
  const locations = project ? sites.filter((s) => s.rowVersion !== undefined && (s.projectId === project.id || project.locationIds.includes(s.id))) : []
  const markers = (project?.chainage?.markers ?? []).filter((m) => asUuid(m.id))

  const options: Record<Source, Option[]> = {
    materials: active(materials).map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    stores: active(stores).map((s) => ({ value: s.id, label: s.name })),
    uoms: uoms.map((u) => ({ value: u.code, label: uomLabel(u) })),
    equipmentTypes: equipmentTypes.filter((t) => t.active).map((t) => ({ value: t.name, label: t.name })),
    roles: unique(active(roles).map((r) => r.title)).map((t) => ({ value: t, label: t })),
    sites: active(sites).filter((s) => s.rowVersion !== undefined).map((s) => ({ value: s.id, label: s.name })),
    users: unique(users.map((u) => u.name)).map((n) => ({ value: n, label: n })),
    departments: ['All employees', ...unique(active(departments).map((d) => d.name))].map((n) => ({ value: n, label: n })),
    jobRoute: JOB_ROUTES.map((r) => ({ value: r, label: r })),
    basis: [{ value: 'Bonus', label: 'Bonus' }, { value: 'Incentive', label: 'Incentive' }],
    yesNo: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }],
  }
  const EMPTY_TEXT: Partial<Record<Source, string>> = {
    materials: 'No material is on the server yet.', stores: 'No store is on the server yet.', uoms: 'No unit of measure is on the server yet.',
    equipmentTypes: 'No equipment type is on the server yet.', sites: 'No location is on the server yet.',
  }

  const submit = handleSubmit(async (v) => {
    setFormError('')
    const body: RaiseBody = {
      requestType: v.requestType,
      module: v.module,
      amount: v.amount,
      title: v.title.trim(),
      projectId: v.projectId || undefined,
      locationId: (v.projectId && v.locationId) || undefined,
      chainageMarkerId: (v.projectId && v.chainageMarkerId) || undefined,
      payload: kind ? buildPayload(kind, v) : undefined,
      emergency: v.emergency === 'true',
      // the date it is needed by, unless it is an emergency; a material request's own Required by date is that date
      neededBy: v.emergency === 'true' ? undefined : (kind === 'material' ? v.neededBy : v.neededByDate) || undefined,
    }
    const text = JSON.stringify(body)
    const key = pending?.body === text ? pending.key : idempotencyKey()
    setPending({ body: text, key })
    try {
      const code = await raiseRequestRemote(body, key)
      setPending(null)
      notify(`Request ${code} raised`)
      onClose()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      setFormError(errorText(err))
    }
  })

  const payloadField = (f: FieldSpec) => {
    const err = (e[f.name] as FieldError | undefined)?.message
    const list = f.source ? options[f.source] : []
    // a role list that is still empty falls back to typing the title
    const asSelect = f.input === 'select' && !(f.source === 'roles' && !list.length)
    const onChange = f.name === 'materialId'
      ? (ev: { target: { value: string } }) => {
        // the material's own unit is offered first; any server unit can be picked instead
        const unit = materials.find((m) => m.id === ev.target.value)?.uom
        if (unit && uoms.some((u) => u.code === unit)) setValue('uom', unit)
      }
      : undefined
    return (
      <FormGroup key={`${kind}-${f.name}`} label={f.label} required={!f.optional} full={f.full} error={err}
        helper={asSelect && f.source && !list.length ? EMPTY_TEXT[f.source] : undefined}>
        {(id, d) => {
          const aria = a11y(id, d, err)
          if (asSelect) {
            return (
              <Select {...aria} {...register(f.name, { onChange })} id={id}>
                {f.source !== 'yesNo' && f.source !== 'basis' && <option value="">{f.optional ? 'Not decided' : 'Choose…'}</option>}
                {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )
          }
          if (f.input === 'textarea') return <Textarea rows={2} {...aria} {...register(f.name)} id={id} />
          if (f.input === 'date') return <Input type="date" {...aria} {...register(f.name)} id={id} />
          const numeric = f.input === 'int' || f.input === 'decimal' || f.input === 'money'
          return (
            <>
              <Input {...aria} {...register(f.name)} id={id}
                {...(numeric ? { type: 'number', min: f.input === 'int' ? 1 : 0, step: f.input === 'int' ? 1 : 'any' } : {})}
                {...(f.input === 'suggest' ? { list: `${listId}-${f.name}`, autoComplete: 'off' } : {})} />
              {f.input === 'suggest' && <datalist id={`${listId}-${f.name}`}>{list.map((o) => <option key={o.value} value={o.value} />)}</datalist>}
            </>
          )
        }}
      </FormGroup>
    )
  }

  return (
    <Modal open size="wide" onOpenChange={(o) => !o && onClose()} title="New approval request" description="Raise a request for approval in CORE.">
      <form noValidate onSubmit={submit}>
        {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
        <ActionScope project={project ?? null} site={(project && locations.find((l) => l.id === locationId)) || null} />
        <div className="form-grid">
          <FormGroup label="Request type" required error={e.requestType?.message}>
            {(id, d) => (
              <Select {...a11y(id, d, e.requestType?.message)} id={id} {...register('requestType', {
                onChange: (ev: { target: { value: string } }) => {
                  const next = KIND_OF[ev.target.value as RequestType]
                  if (next) setValue('module', MODULE_OF[next])
                },
              })}>
                {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Module" required error={e.module?.message}>
            {(id, d) => (
              <Select {...a11y(id, d, e.module?.message)} {...register('module')} id={id}>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Title" required full error={e.title?.message}>
            {(id, d) => <Input {...a11y(id, d, e.title?.message)} {...register('title')} id={id} />}
          </FormGroup>
          <FormGroup label="Amount (INR)" required error={e.amount?.message}
            helper={kind && AMOUNT_KINDS.includes(kind) ? 'The amount asked for; it is also the payload amount.' : undefined}>
            {(id, d) => <Input type="number" min={0} step="0.01" {...a11y(id, d, e.amount?.message)} {...register('amount', { valueAsNumber: true })} id={id} />}
          </FormGroup>
          <FormGroup label="Emergency" helper={emergency === 'true' ? 'Raises priority only; it never bypasses approval.' : 'If it is not an emergency, say when it is needed.'}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} {...register('emergency')}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            )}
          </FormGroup>
          {emergency !== 'true' && kind !== 'material' && (
            <FormGroup label="Needed by" required error={e.neededByDate?.message}>
              {(id, d) => <Input type="date" min={todayISO()} {...a11y(id, d, e.neededByDate?.message)} {...register('neededByDate')} id={id} />}
            </FormGroup>
          )}
          <FormGroup label="Project" helper={projects.length ? 'Leave empty for a company-wide request.' : 'No project is on the server yet.'}>
            {(id) => (
              <Select id={id} {...register('projectId', {
                onChange: () => { setValue('locationId', ''); setValue('chainageMarkerId', '') },
              })}>
                <option value="">None (company-wide)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Location" helper={!project ? 'Pick a project first.' : locations.length ? undefined : 'The project has no location on the server.'}>
            {(id) => (
              <Select id={id} disabled={!project} {...register('locationId')}>
                <option value="">None</option>
                {locations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Chainage" helper={!project ? 'Pick a project first.' : markers.length ? undefined : 'The project has no chainage marker on the server.'}>
            {(id) => (
              <Select id={id} disabled={!project} {...register('chainageMarkerId')}>
                <option value="">None</option>
                {markers.map((m) => <option key={m.id} value={m.id}>{`${m.label} (km ${m.km})`}</option>)}
              </Select>
            )}
          </FormGroup>
        </div>

        {kind && (
          <>
            <h3 className="section-t">{requestType} details</h3>
            <div className="form-grid">{FIELDS[kind].map(payloadField)}</div>
            {kind === 'onboarding' && (
              <div className="stack" style={{ gap: 8 }}>
                {e.employees?.message && <span role="alert" className="helper" style={{ color: 'var(--red)' }}>{e.employees.message}</span>}
                {employees.fields.map((row, i) => {
                  const re = e.employees?.[i]
                  return (
                    <div className="form-grid" key={row.id}>
                      <FormGroup label={`Employee ${i + 1} name`} required error={re?.name?.message}>
                        {(id, d) => <Input {...a11y(id, d, re?.name?.message)} {...register(`employees.${i}.name`)} id={id} />}
                      </FormGroup>
                      <FormGroup label="Position" required error={re?.position?.message}>
                        {(id, d) => options.roles.length
                          ? (
                            <Select {...a11y(id, d, re?.position?.message)} {...register(`employees.${i}.position`)} id={id}>
                              <option value="">Choose…</option>
                              {options.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </Select>
                          )
                          : <Input {...a11y(id, d, re?.position?.message)} {...register(`employees.${i}.position`)} id={id} />}
                      </FormGroup>
                      <FormGroup label="Joining date" required error={re?.joining?.message}>
                        {(id, d) => <Input type="date" {...a11y(id, d, re?.joining?.message)} {...register(`employees.${i}.joining`)} id={id} />}
                      </FormGroup>
                      {employees.fields.length > 1 && (
                        <div className="form-group" style={{ alignSelf: 'end' }}>
                          <Button size="sm" onClick={() => employees.remove(i)}>Remove employee {i + 1}</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div><Button size="sm" icon="plus" onClick={() => employees.append({ name: '', position: '', joining: '' })}>Add employee</Button></div>
              </div>
            )}
          </>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit">Raise request</Button>
        </div>
      </form>
    </Modal>
  )
}
