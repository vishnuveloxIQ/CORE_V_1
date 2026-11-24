import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { PageHead } from '@/modules/shell'
import { Can, MANAGE } from '@/modules/auth'
import { useEnter } from '@/shared/hooks/useMotion'
import { ApiError, errorText } from '@/shared/lib/api'
import { a11y } from '@/shared/lib/core'
import { fmtDate, todayISO } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { maintenanceApi, useCore, type DueState, type EquipmentUnit, type MaintenanceSchedule } from '@/modules/core-data'

const DUE_LABEL: Record<DueState, string> = { overdue: 'Overdue', 'due-soon': 'Due soon', ok: 'Up to date', unknown: 'No service recorded' }
const DUE_TONE = { overdue: 'rejected', 'due-soon': 'pending', ok: 'approved', unknown: 'draft' } as const
const hoursFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

/** "Every 3 months or 500 hours, whichever comes first". */
const intervalText = (s: Pick<MaintenanceSchedule, 'intervalMonths' | 'intervalHours'>) => {
  const parts = [s.intervalMonths && `${s.intervalMonths} ${s.intervalMonths === 1 ? 'month' : 'months'}`, s.intervalHours && `${hoursFmt.format(s.intervalHours)} hours`].filter(Boolean)
  return `Every ${parts.join(' or ')}${parts.length > 1 ? ', whichever comes first' : ''}`
}

interface Row { s: MaintenanceSchedule; unit: EquipmentUnit | undefined }

/**
 * Equipment maintenance: every machine's service tasks and how often they are due, by calendar months or running
 * hours (for example every 3 months or 500 hours), with when each is next due. Anyone signed in can read it; adding,
 * changing and removing schedules needs masters.manage, as for the equipment register.
 */
export default function Maintenance() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'maintenance')
  const units = useCore((s) => s.units)
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState<MaintenanceSchedule | 'new' | null>(null)
  const [removing, setRemoving] = useState<MaintenanceSchedule | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayISO()
  const reload = () => { setState('loading'); setTick((t) => t + 1) }

  useEffect(() => {
    let live = true
    maintenanceApi.listSchedules().then(
      (rows) => { if (live) { setSchedules(rows); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [tick])

  const serverUnits = units.filter((u) => u.rowVersion !== undefined)
  const rows: Row[] = schedules.map((s) => ({ s, unit: units.find((u) => u.id === s.equipmentUnitId) }))
  const dueOf = (r: Row) => maintenanceApi.nextDue(r.s, today, maintenanceApi.meterHours(r.unit?.meterReading))
  const count = (st: DueState) => rows.filter((r) => dueOf(r).state === st).length
  const unscheduled = serverUnits.filter((u) => !schedules.some((s) => s.equipmentUnitId === u.id)).length
  const unitLabel = (u: EquipmentUnit | undefined) => (u ? `${u.assetCode}${u.name ? ` · ${u.name}` : ''}` : 'Unit not loaded')

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await maintenanceApi.deleteSchedule(removing.id)
      setSchedules((list) => list.filter((x) => x.id !== removing.id))
      notify(`Schedule "${removing.task}" removed`)
      setRemoving(null)
    } catch (err) {
      notify(`Schedule not removed: ${errorText(err)}`, 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref}>
      <PageHead
        crumb="Maintenance"
        title="Equipment maintenance"
        desc="How often each machine is serviced, by months or running hours, and when it is next due."
        actions={<Can privilege={MANAGE.masters}><Button tone="primary" icon="plus" disabled={state !== 'ready' || !serverUnits.length} onClick={() => setEdit('new')}>Add schedule</Button></Can>}
      />
      <div className="grid stats">
        <StatTile label="Overdue" value={count('overdue')} icon="alert" tone="rose" />
        <StatTile label="Due soon" value={count('due-soon')} icon="clock" tone="gold" />
        <StatTile label="Up to date" value={count('ok')} icon="checkc" tone="green" />
        <StatTile label="Machines without a schedule" value={unscheduled} icon="wrench" tone="blue" />
      </div>
      {state === 'error' && (
        <Note title="The maintenance schedules could not be loaded" icon="alert">
          {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
        </Note>
      )}
      <TablePanel
        title="Service schedules"
        subtitle={`Due soon means within 14 days, or within the last 10% of the hour interval. Hours are counted from the meter reading in the equipment register. Filter by status using the chips.`}
        rows={rows}
        rowKey={(r) => r.s.id}
        statusOf={(r) => DUE_LABEL[dueOf(r).state]}
        chipNoun="statuses"
        columns={[
          { header: 'Equipment', kind: 'c-sub', cell: (r) => <span><strong>{unitLabel(r.unit)}</strong><span className="sub">{r.unit?.type ?? ''}</span></span>, csv: (r) => unitLabel(r.unit) },
          { header: 'Task', kind: 'c-more', cell: (r) => <span style={{ whiteSpace: 'normal' }}><strong>{r.s.task}</strong><span className="sub">{intervalText(r.s)}</span></span>, csv: (r) => `${r.s.task}: ${intervalText(r.s)}` },
          {
            header: 'Last service', kind: 'c-more',
            cell: (r) => [r.s.lastServiceDate && fmtDate(r.s.lastServiceDate), r.s.lastServiceHours !== null && `${hoursFmt.format(r.s.lastServiceHours)} h`].filter(Boolean).join(' · ') || '—',
            csv: (r) => `${r.s.lastServiceDate ?? ''} ${r.s.lastServiceHours ?? ''}`.trim(),
          },
          {
            header: 'Next due', kind: 'c-more',
            cell: (r) => { const d = dueOf(r); return [d.date && fmtDate(d.date), d.hours !== undefined && `${hoursFmt.format(d.hours)} h`].filter(Boolean).join(' or ') || '—' },
            csv: (r) => { const d = dueOf(r); return `${d.date ?? ''} ${d.hours ?? ''}`.trim() },
          },
          { header: 'Status', kind: 'c-status', cell: (r) => { const st = dueOf(r).state; return <StatusBadge tone={DUE_TONE[st]}>{DUE_LABEL[st]}</StatusBadge> }, csv: (r) => DUE_LABEL[dueOf(r).state] },
        ]}
        action={(r) => (
          <Can privilege={MANAGE.masters}>
            <span className="row-actions">
              <Button size="sm" icon="pencil" aria-label={`Edit ${r.s.task} on ${unitLabel(r.unit)}`} onClick={() => setEdit(r.s)}>Edit</Button>
              <Button size="sm" tone="danger" icon="trash" aria-label={`Remove ${r.s.task} on ${unitLabel(r.unit)}`} onClick={() => setRemoving(r.s)} />
            </span>
          </Can>
        )}
        searchText={(r) => `${unitLabel(r.unit)} ${r.unit?.type ?? ''} ${r.s.task}`}
        searchPlaceholder="Search by machine, type or task…"
        exportName="core-maintenance-schedules"
      />
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add maintenance schedule' : 'Edit maintenance schedule'}>
        {edit && (
          <ScheduleForm
            key={edit === 'new' ? 'new' : edit.id}
            schedule={edit === 'new' ? undefined : edit}
            units={serverUnits}
            onSaved={(saved) => {
              setSchedules((list) => [...list.filter((x) => x.id !== saved.id), saved])
              setEdit(null)
            }}
            onConflict={reload}
            onCancel={() => setEdit(null)}
          />
        )}
      </Modal>
      <Modal open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove maintenance schedule">
        {removing && (
          <>
            <p style={{ marginTop: 0 }}>Remove <strong>{removing.task}</strong> from {unitLabel(units.find((u) => u.id === removing.equipmentUnitId))}? This cannot be undone.</p>
            <div className="form-actions">
              <Button onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
              <Button tone="danger" icon="trash" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove schedule'}</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

/** A number field: blank means not set. */
const optionalInt = (label: string, max: number) =>
  z.union([z.nan(), z.number().int(`${label} is a whole number.`).min(1, `${label} must be at least 1.`).max(max, `${label} is at most ${max}.`)])

const schema = z.object({
  equipmentUnitId: z.string().min(1, 'Choose a machine.'),
  task: z.string().trim().min(1, 'Task is required.').max(100, 'Keep it to 100 characters.'),
  intervalMonths: optionalInt('Months', 120),
  intervalHours: optionalInt('Hours', 100_000),
  lastServiceDate: z.string(),
  lastServiceHours: z.union([z.nan(), z.number().min(0, 'Hours cannot be negative.')]),
  notes: z.string().max(1000, 'Keep notes to 1,000 characters.'),
}).refine((v) => !Number.isNaN(v.intervalMonths) || !Number.isNaN(v.intervalHours), {
  path: ['intervalMonths'],
  message: 'Set how often: months, hours, or both.',
})

const orNull = (n: number) => (Number.isNaN(n) ? null : n)

function ScheduleForm({ schedule, units, onSaved, onConflict, onCancel }: {
  schedule?: MaintenanceSchedule
  units: EquipmentUnit[]
  onSaved: (s: MaintenanceSchedule) => void
  onConflict: () => void
  onCancel: () => void
}) {
  const [error, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors: e, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      equipmentUnitId: schedule?.equipmentUnitId ?? '',
      task: schedule?.task ?? 'General service',
      intervalMonths: schedule?.intervalMonths ?? Number.NaN,
      intervalHours: schedule?.intervalHours ?? Number.NaN,
      lastServiceDate: schedule?.lastServiceDate ?? '',
      lastServiceHours: schedule?.lastServiceHours ?? Number.NaN,
      notes: schedule?.notes ?? '',
    },
  })
  const submit = handleSubmit(async (v) => {
    setFormError('')
    const draft = {
      task: v.task,
      intervalMonths: orNull(v.intervalMonths),
      intervalHours: orNull(v.intervalHours),
      lastServiceDate: v.lastServiceDate || null,
      lastServiceHours: orNull(v.lastServiceHours),
      notes: v.notes.trim() || null,
    }
    try {
      const saved = schedule
        ? await maintenanceApi.updateSchedule(schedule.id, schedule.rowVersion, draft)
        : await maintenanceApi.createSchedule(v.equipmentUnitId, draft)
      notify(schedule ? 'Schedule saved' : 'Schedule added')
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.code.endsWith('_DUPLICATE')) return setError('task', { message: 'This machine already has a schedule for this task.' })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onConflict()
        return setFormError('Someone else changed this schedule. The latest list is loaded; close this and try again.')
      }
      setFormError(errorText(err))
    }
  })
  const n = { valueAsNumber: true } as const
  return (
    <form noValidate onSubmit={submit}>
      {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
      <div className="form-grid">
        <FormGroup label="Machine" required full error={e.equipmentUnitId?.message} helper={schedule ? 'A schedule stays with its machine.' : undefined}>
          {(id, d) => (
            <Select {...a11y(id, d, e.equipmentUnitId?.message)} disabled={!!schedule} {...register('equipmentUnitId')}>
              <option value="">Choose a machine</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.assetCode}{u.name ? ` · ${u.name}` : ''} ({u.type})</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Task" required full error={e.task?.message}>
          {(id, d) => <Input placeholder="e.g. General service, Oil change" {...a11y(id, d, e.task?.message)} {...register('task')} />}
        </FormGroup>
        <FormGroup label="Every (months)" error={e.intervalMonths?.message} helper="For example 3 for a quarterly service.">
          {(id, d) => <Input type="number" min={1} step={1} {...a11y(id, d, e.intervalMonths?.message)} {...register('intervalMonths', n)} />}
        </FormGroup>
        <FormGroup label="Every (running hours)" error={e.intervalHours?.message} helper="For example 500. Whichever comes first applies.">
          {(id, d) => <Input type="number" min={1} step={1} {...a11y(id, d, e.intervalHours?.message)} {...register('intervalHours', n)} />}
        </FormGroup>
        <FormGroup label="Last serviced on">
          {(id) => <Input id={id} type="date" {...register('lastServiceDate')} />}
        </FormGroup>
        <FormGroup label="Meter hours at last service" error={e.lastServiceHours?.message}>
          {(id, d) => <Input type="number" min={0} step="0.1" {...a11y(id, d, e.lastServiceHours?.message)} {...register('lastServiceHours', n)} />}
        </FormGroup>
        <FormGroup label="Notes" full error={e.notes?.message}>
          {(id, d) => <Textarea rows={2} {...a11y(id, d, e.notes?.message)} {...register('notes')} />}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : schedule ? 'Save schedule' : 'Add schedule'}</Button>
      </div>
    </form>
  )
}
