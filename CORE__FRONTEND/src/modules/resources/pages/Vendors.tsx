import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatusBadge } from '@/shared/ui/Status'
import { PageHead } from '@/modules/shell'
import { Can, MANAGE } from '@/modules/auth'
import { useEnter } from '@/shared/hooks/useMotion'
import { ApiError, errorText, fieldErrors } from '@/shared/lib/api'
import { a11y } from '@/shared/lib/core'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { createVendor, listVendors, updateVendor, vendorFrom, verifyVendor, type Vendor } from '@/modules/core-data'

type Row = Vendor & { rowVersion: number }

/**
 * Vendors: suppliers, hire owners and service providers (GET /vendors). Anyone signed in can read the list; adding,
 * changing and verifying vendors needs masters.manage. A vendor is deactivated, never deleted.
 */
export default function Vendors() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'vendors')
  const [vendors, setVendors] = useState<Row[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState<Row | 'new' | null>(null)
  const [verifying, setVerifying] = useState('')
  const reload = () => { setState('loading'); setTick((t) => t + 1) }

  useEffect(() => {
    let live = true
    listVendors().then(
      (rows) => { if (live) { setVendors(rows.map(vendorFrom)); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [tick])

  const keep = (saved: Row) => setVendors((list) => [...list.filter((v) => v.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
  const verify = async (v: Row) => {
    setVerifying(v.id)
    try {
      keep(vendorFrom(await verifyVendor(v.id, v.rowVersion)))
      notify(`${v.name} verified`)
    } catch (err) {
      notify(`${v.name} not verified: ${errorText(err)}`, 6000)
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') reload()
    } finally {
      setVerifying('')
    }
  }

  return (
    <div ref={ref}>
      <PageHead
        crumb="Vendors"
        title="Vendors"
        desc="Suppliers, equipment hire owners and service providers the company works with."
        actions={<Can privilege={MANAGE.masters}><Button tone="primary" icon="plus" disabled={state !== 'ready'} onClick={() => setEdit('new')}>New vendor</Button></Can>}
      />
      {state === 'error' && (
        <Note title="The vendors could not be loaded" icon="alert">
          {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
        </Note>
      )}
      <TablePanel
        title="All vendors"
        subtitle={state === 'loading' ? 'Loading…' : 'Filter by status using the chips. A vendor is deactivated, never deleted, so its history stays.'}
        rows={vendors}
        rowKey={(v) => v.id}
        statusOf={(v) => v.status}
        chipNoun="statuses"
        columns={[
          { header: 'Code', kind: 'c-id', cell: (v) => <strong>{v.code}</strong>, csv: (v) => v.code },
          { header: 'Vendor', kind: 'c-sub', cell: (v) => <span><strong>{v.name}</strong><span className="sub">{[v.email, v.phone].filter(Boolean).join(' · ') || '—'}</span></span>, csv: (v) => v.name },
          { header: 'GSTIN / PAN', kind: 'c-more', cell: (v) => [v.gstin, v.pan].filter(Boolean).join(' · ') || '—', csv: (v) => `${v.gstin} ${v.pan}`.trim() },
          { header: 'Verified', kind: 'c-more', cell: (v) => (v.verifiedAt ? fmtDate(v.verifiedAt) : 'Not yet'), csv: (v) => v.verifiedAt ?? '' },
          { header: 'Status', kind: 'c-status', cell: (v) => <StatusBadge tone={v.status === 'Active' ? 'approved' : 'draft'}>{v.status}</StatusBadge>, csv: (v) => v.status },
        ]}
        action={(v) => (
          <Can privilege={MANAGE.masters}>
            <span className="row-actions">
              <Button size="sm" icon="pencil" aria-label={`Edit ${v.name}`} onClick={() => setEdit(v)}>Edit</Button>
              {!v.verifiedAt && <Button size="sm" icon="check" disabled={verifying === v.id} onClick={() => void verify(v)}>Verify</Button>}
            </span>
          </Can>
        )}
        searchText={(v) => `${v.code} ${v.name} ${v.gstin} ${v.pan} ${v.email} ${v.phone}`}
        searchPlaceholder="Search by code, name, GSTIN or contact…"
        exportName="core-vendors"
      />
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'New vendor' : 'Edit vendor'} size="wide">
        {edit && <VendorForm key={edit === 'new' ? 'new' : edit.id} vendor={edit === 'new' ? undefined : edit} onSaved={(v) => { keep(v); setEdit(null) }} onConflict={reload} onCancel={() => setEdit(null)} />}
      </Modal>
    </div>
  )
}

const blankOr = (re: RegExp, message: string) => z.string().trim().refine((v) => v === '' || re.test(v), message)

const schema = z.object({
  code: z.string().trim().min(1, 'Vendor code is required.').max(40, 'Keep it to 40 characters.'),
  name: z.string().trim().min(1, 'Vendor name is required.').max(200, 'Keep it to 200 characters.'),
  status: z.enum(['Active', 'Inactive']),
  gstin: blankOr(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN is 15 characters, e.g. 36AAHCV1234K1Z8.'),
  pan: blankOr(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN is 10 characters, e.g. AAHCV1234K.'),
  email: blankOr(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'),
  phone: z.string().trim().max(30, 'Keep it to 30 characters.'),
  address: z.string().trim().max(500, 'Keep it to 500 characters.'),
}).refine((v) => !v.gstin || !v.pan || v.gstin.slice(2, 12) === v.pan, { path: ['gstin'], message: 'Characters 3 to 12 of the GSTIN must be the PAN.' })

function VendorForm({ vendor, onSaved, onConflict, onCancel }: { vendor?: Row; onSaved: (v: Row) => void; onConflict: () => void; onCancel: () => void }) {
  const [error, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors: e, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      code: vendor?.code ?? '', name: vendor?.name ?? '', status: vendor?.status === 'Inactive' ? 'Inactive' as const : 'Active' as const,
      gstin: vendor?.gstin ?? '', pan: vendor?.pan ?? '', email: vendor?.email ?? '', phone: vendor?.phone ?? '', address: vendor?.address ?? '',
    },
  })
  const upper = { setValueAs: (v: string) => v.toUpperCase() }
  const submit = handleSubmit(async (v) => {
    setFormError('')
    try {
      const rec = vendor ? await updateVendor(vendor.id, vendor.rowVersion, v) : await createVendor(v)
      notify(vendor ? `${v.name} saved` : `${v.name} added`)
      onSaved(vendorFrom(rec))
    } catch (err) {
      if (err instanceof ApiError && err.code.endsWith('_DUPLICATE')) return setError('code', { message: 'Another vendor uses this code.' })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        onConflict()
        return setFormError('Someone else changed this vendor. The latest list is loaded; close this and try again.')
      }
      const fields = fieldErrors(err)
      const known = Object.entries(fields).filter(([f]) => f in schema.shape)
      for (const [f, m] of known) setError(f as keyof z.infer<typeof schema>, { message: m })
      setFormError(known.length ? 'Check the highlighted fields.' : errorText(err))
    }
  })
  return (
    <form noValidate onSubmit={submit}>
      {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
      <div className="form-grid">
        <FormGroup label="Vendor name" required error={e.name?.message}>{(id, d) => <Input {...a11y(id, d, e.name?.message)} {...register('name')} />}</FormGroup>
        <FormGroup label="Vendor code" required error={e.code?.message}>{(id, d) => <Input className="uppercase" placeholder="e.g. VEN-0042" {...a11y(id, d, e.code?.message)} {...register('code', upper)} />}</FormGroup>
        <FormGroup label="GSTIN" error={e.gstin?.message}>{(id, d) => <Input className="uppercase" maxLength={15} {...a11y(id, d, e.gstin?.message)} {...register('gstin', upper)} />}</FormGroup>
        <FormGroup label="PAN" error={e.pan?.message}>{(id, d) => <Input className="uppercase" maxLength={10} {...a11y(id, d, e.pan?.message)} {...register('pan', upper)} />}</FormGroup>
        <FormGroup label="Email" error={e.email?.message}>{(id, d) => <Input type="email" {...a11y(id, d, e.email?.message)} {...register('email')} />}</FormGroup>
        <FormGroup label="Phone" error={e.phone?.message}>{(id, d) => <Input inputMode="tel" {...a11y(id, d, e.phone?.message)} {...register('phone')} />}</FormGroup>
        <FormGroup label="Address" full error={e.address?.message}>{(id, d) => <Textarea rows={2} {...a11y(id, d, e.address?.message)} {...register('address')} />}</FormGroup>
        <FormGroup label="Status" helper="An inactive vendor is kept for history but cannot be picked for new work.">
          {(id, d) => <Select id={id} aria-describedby={d} {...register('status')}><option value="Active">Active</option><option value="Inactive">Inactive</option></Select>}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : vendor ? 'Save vendor' : 'Add vendor'}</Button>
      </div>
    </form>
  )
}
