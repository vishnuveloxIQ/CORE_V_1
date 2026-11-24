import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MiniTable, Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatusBadge } from '@/shared/ui/Status'
import { ApiError, errorText } from '@/shared/lib/api'
import { a11y, num, req } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import { ActionScope } from '@/modules/shell'
import { boqApi, isRemote, uomLabel, useCore, type BoqItem, type BoqStatus, type Project } from '@/modules/core-data'

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const STATUS_LABEL: Record<BoqStatus, string> = { draft: 'Draft', approved: 'Approved' }
const STATUS_TONE = { draft: 'draft', approved: 'approved' } as const

/**
 * Bill of Quantities for one project (GET /boq-items?projectId=). Anyone signed in can read it; adding, editing and
 * removing items needs projects.manage. Amounts come from the server (quantity x rate), so the total always matches
 * the rows.
 */
export function BoqTab({ project }: { project: Project }) {
  const remote = isRemote(project)
  const uoms = useCore((s) => s.uoms)
  const [items, setItems] = useState<BoqItem[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [edit, setEdit] = useState<BoqItem | 'new' | null>(null)
  const [removing, setRemoving] = useState<BoqItem | null>(null)
  const [busy, setBusy] = useState(false)

  // bumping the tick reads the list again (after a failed read or a version conflict)
  const [tick, setTick] = useState(0)
  const load = () => {
    setState('loading')
    setTick((t) => t + 1)
  }

  useEffect(() => {
    if (!remote) return
    let live = true
    boqApi.listBoqItems(project.id).then(
      (rows) => {
        if (!live) return
        setItems(rows)
        setState('ready')
      },
      (err: unknown) => {
        if (!live) return
        setLoadError(errorText(err))
        setState('error')
      },
    )
    return () => {
      live = false
    }
  }, [remote, project.id, tick])

  if (!remote) {
    return (
      <Card title="Bill of Quantities">
        <Note title="Kept on the server" icon="info" className="mt-0">
          The Bill of Quantities is stored on the server. This sample project is not, so it has no BOQ.
        </Note>
      </Card>
    )
  }

  const unitOf = (id: string) => uoms.find((u) => u.id === id)?.code ?? '—'
  const wbsOf = (id: string | null) => (id ? project.wbs.find((w) => w.id === id)?.code ?? '—' : '—')
  const total = boqApi.boqTotal(items)

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await boqApi.deleteBoqItem(removing.id)
      setItems((list) => list.filter((i) => i.id !== removing.id))
      notify(`BOQ item ${removing.itemCode} removed`)
      setRemoving(null)
    } catch (err) {
      notify(`BOQ item not removed: ${errorText(err)}`, 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Bill of Quantities"
      subtitle={state === 'ready' ? `${items.length} ${items.length === 1 ? 'item' : 'items'}, total ${rupees.format(total)}` : 'Priced work items for this project'}
      action={
        <Can privilege={MANAGE.projects}>
          <Button size="sm" icon="plus" onClick={() => setEdit('new')} disabled={state !== 'ready'}>
            Add BOQ item
          </Button>
        </Can>
      }
    >
      {state === 'loading' && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading the Bill of Quantities…</p>}
      {state === 'error' && (
        <Note title="The Bill of Quantities could not be loaded" icon="alert" className="mt-0">
          {loadError}{' '}
          <Button size="sm" icon="refresh" onClick={load}>
            Try again
          </Button>
        </Note>
      )}
      {state === 'ready' &&
        (items.length === 0 ? (
          <EmptyState icon="clipboard" title="No BOQ items yet">
            Add the priced items of the contract, e.g. 2.01 Excavation in ordinary soil.
          </EmptyState>
        ) : (
          <MiniTable
            label="Bill of Quantities items"
            head={['Item code', 'Description', 'WBS', 'Unit', 'Quantity', 'Rate', 'Amount', 'Status', '']}
            rows={items.map((i) => [
              <code key="c">{i.itemCode}</code>,
              <strong key="d">{i.description}</strong>,
              wbsOf(i.wbsNodeId),
              unitOf(i.uomId),
              <span key="q" className="amount">{qty.format(i.quantity)}</span>,
              <span key="r" className="amount">{rupees.format(i.rate)}</span>,
              <strong key="a" className="amount">{rupees.format(i.amount)}</strong>,
              <StatusBadge key="s" tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</StatusBadge>,
              <Can key="x" privilege={MANAGE.projects}>
                <div className="row-actions">
                  <Button size="sm" icon="pencil" aria-label={`Edit ${i.itemCode}`} onClick={() => setEdit(i)}>
                    Edit
                  </Button>
                  <Button size="sm" tone="danger" icon="trash" aria-label={`Remove ${i.itemCode}`} onClick={() => setRemoving(i)}>
                    Remove
                  </Button>
                </div>
              </Can>,
            ])}
          />
        ))}
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add BOQ item' : 'Edit BOQ item'}>
        {edit && (
          <BoqForm
            key={edit === 'new' ? 'new' : edit.id}
            project={project}
            item={edit === 'new' ? undefined : edit}
            hasUnits={uoms.length > 0}
            unitOptions={uoms.map((u) => ({ id: u.id, label: uomLabel(u) }))}
            onSaved={(saved) => {
              setItems((list) => {
                const rest = list.filter((i) => i.id !== saved.id)
                return [...rest, saved].sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }))
              })
              setEdit(null)
            }}
            onConflict={load}
            onCancel={() => setEdit(null)}
          />
        )}
      </Modal>
      <Modal open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove BOQ item">
        {removing && (
          <>
            <p style={{ marginTop: 0 }}>
              Remove <strong>{removing.itemCode}</strong> ({removing.description}) from the Bill of Quantities? This cannot be undone.
            </p>
            <div className="form-actions">
              <Button onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
              <Button tone="danger" icon="trash" onClick={() => void remove()} disabled={busy}>
                {busy ? 'Removing…' : 'Remove item'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  )
}

const boqSchema = z.object({
  itemCode: req('Item code').max(40, 'Keep it to 40 characters.'),
  description: req('Description').max(500, 'Keep it to 500 characters.'),
  wbsNodeId: z.string(),
  uomId: z.string().min(1, 'Choose a unit.'),
  quantity: num('Quantity').max(99_999_999_999, 'The quantity is too large.'),
  rate: num('Rate').max(999_999_999_999, 'The rate is too large.'),
  status: z.enum(['draft', 'approved']),
})

function BoqForm({
  project,
  item,
  hasUnits,
  unitOptions,
  onSaved,
  onConflict,
  onCancel,
}: {
  project: Project
  item?: BoqItem
  hasUnits: boolean
  unitOptions: Array<{ id: string; label: string }>
  onSaved: (item: BoqItem) => void
  onConflict: () => void
  onCancel: () => void
}) {
  const [error, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(boqSchema),
    defaultValues: item
      ? { itemCode: item.itemCode, description: item.description, wbsNodeId: item.wbsNodeId ?? '', uomId: item.uomId, quantity: item.quantity, rate: item.rate, status: item.status }
      : { itemCode: '', description: '', wbsNodeId: '', uomId: '', quantity: 0, rate: 0, status: 'draft' as const },
  })
  const [quantity, rate] = useWatch({ control, name: ['quantity', 'rate'] })
  const preview = Number.isFinite(quantity) && Number.isFinite(rate) ? Math.round(quantity * rate * 100) / 100 : 0

  const submit = handleSubmit(async (v) => {
    setFormError('')
    const draft = { ...v, wbsNodeId: v.wbsNodeId || null }
    try {
      const saved = item ? await boqApi.updateBoqItem(item.id, item.rowVersion, draft) : await boqApi.createBoqItem(project.id, draft)
      notify(item ? `BOQ item ${saved.itemCode} saved` : `BOQ item ${saved.itemCode} added`)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.code.endsWith('_DUPLICATE'))
        return setError('itemCode', { message: 'This item code is already in this project.' })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onConflict()
        return setFormError('Someone else changed this item. The latest list is loaded; close this and try again.')
      }
      setFormError(errorText(err))
    }
  })

  return (
    <form noValidate onSubmit={submit}>
      {error && (
        <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
          <span>{error}</span>
        </div>
      )}
      <ActionScope project={{ name: project.name, code: project.code }} />
      {!hasUnits && (
        <Note title="No units of measure" icon="alert" className="mt-0">
          The server has no units of measure yet, so an item cannot be saved. Ask an administrator to add them.
        </Note>
      )}
      <div className="form-grid">
        <FormGroup label="Item code" required error={e.itemCode?.message}>
          {(id, d) => <Input placeholder="Enter item code, e.g. 2.01" {...a11y(id, d, e.itemCode?.message)} {...register('itemCode')} />}
        </FormGroup>
        <FormGroup label="WBS item">
          {(id) => (
            <Select id={id} {...register('wbsNodeId')}>
              <option value="">None</option>
              {project.wbs.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.code} {n.name}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Description" required full error={e.description?.message}>
          {(id, d) => <Input {...a11y(id, d, e.description?.message)} {...register('description')} />}
        </FormGroup>
        <FormGroup label="Unit" required error={e.uomId?.message}>
          {(id, d) => (
            <Select {...a11y(id, d, e.uomId?.message)} {...register('uomId')}>
              <option value="">Choose a unit</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Status">
          {(id) => (
            <Select id={id} {...register('status')}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Quantity" required error={e.quantity?.message}>
          {(id, d) => <Input type="number" step="0.001" min={0} {...a11y(id, d, e.quantity?.message)} {...register('quantity', { valueAsNumber: true })} />}
        </FormGroup>
        <FormGroup label="Rate (₹)" required error={e.rate?.message} helper={`Amount: ${rupees.format(preview)}`}>
          {(id, d) => <Input type="number" step="0.01" min={0} {...a11y(id, d, e.rate?.message)} {...register('rate', { valueAsNumber: true })} />}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={isSubmitting || !hasUnits}>
          {isSubmitting ? 'Saving…' : item ? 'Save item' : 'Add item'}
        </Button>
      </div>
    </form>
  )
}
