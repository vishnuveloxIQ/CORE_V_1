import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm'
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/Status'
import { Modal } from '@/shared/ui/Modal'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { a11y } from '@/shared/lib/core'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import { openSubContractorDocument } from '../utils/subContractorDocument'
import {
  createFile, isRemote, newId, subContractorApi, uploadFileContent, uploadProblem, uploadTypeOf,
  type Project, type SubContractorDraft, type SubContractorRecord,
} from '@/modules/core-data'

/** The form's own fields, as the sub-contract details sheet lists them. */
const DATE = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Pick a date.')
const schema = z.object({
  projectName: z.string().trim().max(300, 'Use 300 characters or fewer.'),
  firmName: z.string().trim().min(1, 'Firm name is required.').max(200, 'Use 200 characters or fewer.'),
  ownerName: z.string().trim().min(1, 'Owner name is required.').max(200, 'Use 200 characters or fewer.'),
  address: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  mailId: z.string().trim().refine((v) => v === '' || z.email().safeParse(v).success, 'Use an email address.'),
  phone: z.string().trim().max(20, 'Use 20 characters or fewer.'),
  gstNumber: z.string().trim().max(15, 'Use 15 characters or fewer.'),
  panNumber: z.string().trim().max(10, 'Use 10 characters or fewer.'),
  workOrderDate: DATE,
  workContractTitle: z.string().trim().min(1, 'Work contract title is required.').max(200, 'Use 200 characters or fewer.'),
  workContractPeriod: z.string().trim().max(200, 'Use 200 characters or fewer.'),
  scopeAnnexure: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  consumablesTerms: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  shedTentMaterial: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  safetyItems: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  otherConditions: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
  status: z.enum(['active', 'inactive']),
})
type FormValues = z.infer<typeof schema>

const TEXT_KEYS = [
  'projectName', 'firmName', 'ownerName', 'address', 'mailId', 'phone', 'gstNumber', 'panNumber',
  'workContractTitle', 'workContractPeriod', 'scopeAnnexure', 'consumablesTerms', 'shedTentMaterial', 'safetyItems', 'otherConditions',
] as const

/** Form values to the API draft: text is trimmed and empty text is sent as null. */
const draftOf = (v: FormValues): SubContractorDraft => {
  const out: Record<string, string | null> = {}
  for (const k of TEXT_KEYS) out[k] = v[k].trim() || null
  return { ...out, firmName: v.firmName.trim(), ownerName: v.ownerName.trim(), workContractTitle: v.workContractTitle.trim(), workOrderDate: v.workOrderDate, status: v.status } as SubContractorDraft
}

/** The sub-contractor registration tab: the sub-contract details of each firm on a project, with the agreement or work order. */
export function SubContractorTab({ project }: { project: Project }) {
  const remote = isRemote(project)
  const [rows, setRows] = useState<SubContractorRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [edit, setEdit] = useState<SubContractorRecord | 'new' | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!remote) return
    let live = true
    subContractorApi.listSubContractors(project.id).then(
      (list) => { if (live) { setRows(list); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [project.id, remote, tick])

  const reload = () => { setState('loading'); setTick((t) => t + 1) }

  return (
    <div>
      <Card title="Sub-contractor registration" subtitle="Sub-contract details for preparing a work order. Attach the signed agreement or work order (PDF or Word)." action={
        <Can privilege={MANAGE.projects}>
          <Button tone="primary" icon="plus" disabled={!remote} onClick={() => setEdit('new')}>Add sub-contractor</Button>
        </Can>
      }>
        {!remote && (
          <Note title="Sub-contractors are saved on the server" icon="alert">
            This project is not on the server yet, so sub-contractor registrations cannot be saved.
          </Note>
        )}
        {state === 'error' && (
          <Note title="The sub-contractor registrations could not be loaded" icon="alert">
            {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
          </Note>
        )}
      </Card>
      {state !== 'error' && (
        <TablePanel
          title="Sub-contractors"
          subtitle={`${project.name}: one row per sub-contract.`}
          rows={remote ? rows : []}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Firm name', kind: 'c-sub', cell: (r) => <strong>{r.firmName}</strong>, csv: (r) => r.firmName },
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
          searchText={(r) => `${r.firmName} ${r.ownerName} ${r.workContractTitle}`}
          statusOf={(r) => (r.status === 'active' ? 'Active' : 'Inactive')}
          chipNoun="statuses"
          searchPlaceholder="Search by firm, owner or contract…"
          exportName="core-sub-contractors"
          action={(r) => (
            <Can privilege={MANAGE.projects}>
              <Button size="sm" icon="pencil" disabled={!remote} onClick={() => setEdit(r)}>Edit</Button>
            </Can>
          )}
        />
      )}
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add sub-contractor' : 'Edit sub-contractor'}>
        {edit && (
          <SubContractorForm
            key={edit === 'new' ? 'new' : edit.id}
            project={project}
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

export function SubContractorForm({
  project, record, onCancel, onSaved, onConflict,
}: {
  project: Project
  record?: SubContractorRecord
  onCancel: () => void
  onSaved: (r: SubContractorRecord) => void
  onConflict: () => void
}) {
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  const [doc, setDoc] = useState<File | null>(null)
  const [docError, setDocError] = useState('')
  const docInput = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, formState: { errors: e } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectName: project.name,
      firmName: record?.firmName ?? '',
      ownerName: record?.ownerName ?? '',
      address: record?.address ?? '',
      mailId: record?.mailId ?? '',
      phone: record?.phone ?? '',
      gstNumber: record?.gstNumber ?? '',
      panNumber: record?.panNumber ?? '',
      workOrderDate: record?.workOrderDate ?? '',
      workContractTitle: record?.workContractTitle ?? '',
      workContractPeriod: record?.workContractPeriod ?? '',
      scopeAnnexure: record?.scopeAnnexure ?? '',
      consumablesTerms: record?.consumablesTerms ?? '',
      shedTentMaterial: record?.shedTentMaterial ?? '',
      safetyItems: record?.safetyItems ?? '',
      otherConditions: record?.otherConditions ?? '',
      status: record?.status ?? 'active',
    },
  })

  const pickDoc = (file?: File) => {
    setDocError('')
    if (!file) return setDoc(null)
    const problem = uploadProblem(file.name, file.type, file.size)
    if (problem) { setDoc(null); return setDocError(problem) }
    setDoc(file)
  }

  const save = async (v: FormValues) => {
    setFormError('')
    // the project is fixed by the page the tab sits on
    const draft = draftOf({ ...v, projectName: project.name })
    // the same form sent again after a network error reuses its Idempotency-Key, so a retry cannot register it twice
    const body = JSON.stringify({ draft, doc: doc?.name ?? null })
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ body, key })
    setBusy(true)
    try {
      let saved = record
        ? await subContractorApi.updateSubContractor(record.id, record.rowVersion, draft, key)
        : await subContractorApi.createSubContractor(project.id, draft, key)
      setPending(null)
      if (doc) {
        // the row exists now (its id owns the file); the document is attached once it is stored
        const type = uploadTypeOf(doc.name, doc.type)
        const row = await createFile({ ownerType: 'sub_contractor', ownerId: saved.id, fileName: doc.name, contentType: type, sizeBytes: doc.size, objectKey: `sub-contractors/${saved.id}/${newId()}/${doc.name}`, visibility: 'company' })
        await uploadFileContent(row.id, doc, type)
        saved = await subContractorApi.updateSubContractor(saved.id, saved.rowVersion, { agreementFileId: row.id })
      }
      notify(record ? 'Sub-contractor updated' : 'Sub-contractor added')
      onSaved(saved)
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setFormError('This sub-contractor was changed by someone else. The list has been refreshed; check it and save again.')
        onConflict()
        return
      }
      setFormError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof FormValues, label: string, opts: { required?: boolean; type?: 'date' | 'email'; full?: boolean; area?: boolean; placeholder?: string; locked?: boolean } = {}) => (
    <FormGroup label={label} required={opts.required} error={e[key]?.message} full={opts.full}>
      {(id, d) => opts.area
        ? <Textarea rows={2} {...a11y(id, d, e[key]?.message)} {...register(key)} />
        : <Input type={opts.type === 'date' ? 'date' : 'text'} placeholder={opts.placeholder} readOnly={opts.locked} {...a11y(id, d, e[key]?.message)} {...register(key)} />}
    </FormGroup>
  )

  return (
    <form noValidate onSubmit={handleSubmit(save)}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
      <h3 style={{ margin: '4px 0 10px', fontSize: 14, fontWeight: 600 }}>Sub-contract details</h3>
      <div className="form-grid form-grid-3">
        {field('projectName', 'Name of the project', { locked: true })}
        <FormGroup label="Status" required error={e.status?.message}>
          {(id, d) => <Select {...a11y(id, d, e.status?.message)} {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}
        </FormGroup>
        {field('firmName', 'Firm name', { required: true })}
        {field('ownerName', 'Owner name', { required: true })}
        {field('address', 'Address', { area: true, full: true })}
        {field('mailId', 'Mail ID', { type: 'email' })}
        {field('phone', 'Phone number')}
        {field('gstNumber', 'GST number')}
        {field('panNumber', 'PAN number')}
        {field('workOrderDate', 'Work order date', { required: true, type: 'date' })}
        {field('workContractTitle', 'Work contract title', { required: true })}
        {field('workContractPeriod', 'Work contract period', { placeholder: 'e.g. 1 Apr 2026 to 31 Mar 2027' })}
      </div>
      <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 600 }}>Scope and conditions</h3>
      <div className="form-grid form-grid-3">
        {field('scopeAnnexure', 'Annexure for scope of work', { area: true })}
        {field('consumablesTerms', 'Consumables, electricity, water etc', { area: true })}
        {field('shedTentMaterial', 'Shed / tent material', { area: true })}
        {field('safetyItems', 'Safety items (jackets, helmets, gloves, boots)', { area: true })}
        {field('otherConditions', 'Other conditions, if any', { area: true, full: true })}
      </div>
      <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 600 }}>Agreement / work order</h3>
      <FormGroup label="Agreement / work order document" helper="PDF or Word (.doc, .docx), up to 2 MB." error={docError}>
        {(id) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              id={id}
              ref={docInput}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(ev) => { pickDoc(ev.target.files?.[0]); ev.target.value = '' }}
            />
            <Button icon="upload" onClick={() => docInput.current?.click()}>{doc || record?.agreementFileId ? 'Replace document' : 'Upload document'}</Button>
            <span style={{ fontSize: 13, color: 'var(--muted, #667085)' }}>
              {doc?.name ?? (record?.agreementFileId ? 'A document is attached' : 'No file chosen')}
            </span>
          </div>
        )}
      </FormGroup>
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button tone="primary" type="submit" disabled={busy}>{record ? 'Save changes' : 'Add sub-contractor'}</Button>
      </div>
    </form>
  )
}
