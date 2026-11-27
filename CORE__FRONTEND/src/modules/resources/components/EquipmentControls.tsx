import { useEffect, useState, type FormEvent } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { notify } from '@/shared/lib/toast'
import { a11y } from '@/shared/lib/core'
import { isRemote, typeIdByName, useCore, type EquipmentTypeRecord, type EquipmentUnit, type FuelNormUnit, type MeterKind } from '@/modules/core-data'
import { fetchFileContent, UNIT_DOC_KEYS, UNIT_DOC_LABEL, type UnitDocKey, type UnitUpload } from '@/modules/core-data'
import { asUpload, DOC_ACCEPT, FILE_HINT, IMAGE_ACCEPT, isPhotoKey, PHOTO_HINT, reportFileFailures } from '../utils/unitFiles'



const CODE_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

const typeSchema = (editing: boolean) => z.object({
  code: editing ? z.string() : z.string().trim().regex(CODE_RE, 'Start with a letter; use letters, digits or _ (max 40).'),
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Use 200 characters or fewer.'),
  meterKind: z.enum(['', 'hours', 'km', 'none']),
  meterPrecision: z.string().refine((v) => v === '' || /^[0-4]$/.test(v), 'Use a whole number from 0 to 4.'),
  fuelNormUnit: z.enum(['', 'litre_per_hour', 'litre_per_km']),
  active: z.enum(['true', 'false']),
})
type TypeValues = z.infer<ReturnType<typeof typeSchema>>


/**
 * Create (type is null) or edit an equipment type. Mounted only while open, so the form starts from the chosen type.
 * The code is fixed after create, so it is read-only when editing.
 */
export function EquipmentTypeDialog({ type, onClose }: { type: EquipmentTypeRecord | null; onClose: () => void }) {
  const saveEquipmentTypeRemote = useCore((s) => s.saveEquipmentTypeRemote)
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  const editing = !!type
  const { register, handleSubmit, formState: { errors: e } } = useForm<TypeValues>({
    resolver: zodResolver(typeSchema(editing)),
    defaultValues: {
      code: type?.code ?? '',
      name: type?.name ?? '',
      meterKind: type?.meterKind ?? '',
      meterPrecision: type?.meterPrecision !== null && type?.meterPrecision !== undefined ? String(type.meterPrecision) : '',
      fuelNormUnit: type?.fuelNormUnit ?? '',
      active: type?.active === false ? 'false' : 'true',
    },
  })

  const submit = handleSubmit(async (v) => {
    setFormError('')
    const draft = {
      code: v.code.trim(),
      name: v.name.trim(),
      meterKind: (v.meterKind || null) as MeterKind | null,
      meterPrecision: v.meterPrecision === '' ? null : Number(v.meterPrecision),
      fuelNormUnit: (v.fuelNormUnit || null) as FuelNormUnit | null,
      active: v.active === 'true',
    }
    const payload = { ...draft, id: type?.id, rowVersion: type?.rowVersion }
    const body = JSON.stringify(payload)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ body, key })
    try {
      await saveEquipmentTypeRemote(payload, key)
      setPending(null)
      notify(editing ? 'Equipment type saved' : 'Equipment type added')
      onClose()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await useCore.getState().loadPlanning()
        return setFormError('Someone else changed this equipment type. The latest version is loaded; close this and edit it again.')
      }
      setFormError(errorText(err))
    }
  })

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={editing ? 'Edit equipment type' : 'Add equipment type'} description="Equipment type master, held on the server.">
      <form noValidate onSubmit={submit}>
        {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
        <div className="form-grid">
          <FormGroup label="Code" required={!editing} error={e.code?.message} helper={editing ? 'The code cannot be changed after create.' : 'Letters, digits or _, starting with a letter.'}>
            {(id, d) => <Input {...a11y(id, d, e.code?.message)} disabled={editing} {...register('code')} id={id} />}
          </FormGroup>
          <FormGroup label="Name" required error={e.name?.message}>
            {(id, d) => <Input {...a11y(id, d, e.name?.message)} {...register('name')} id={id} />}
          </FormGroup>
          <FormGroup label="Meter">
            {(id) => (
              <Select id={id} {...register('meterKind')}>
                <option value="">Not set</option>
                <option value="hours">Hours</option>
                <option value="km">Kilometres</option>
                <option value="none">None</option>
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Meter precision" error={e.meterPrecision?.message} helper="Decimal places, 0 to 4.">
            {(id, d) => <Input type="number" min={0} max={4} {...a11y(id, d, e.meterPrecision?.message)} {...register('meterPrecision')} id={id} />}
          </FormGroup>
          <FormGroup label="Fuel norm unit">
            {(id) => (
              <Select id={id} {...register('fuelNormUnit')}>
                <option value="">Not set</option>
                <option value="litre_per_hour">Litre per hour</option>
                <option value="litre_per_km">Litre per km</option>
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Status">
            {(id) => (
              <Select id={id} {...register('active')}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            )}
          </FormGroup>
        </div>
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit">{editing ? 'Save type' : 'Add type'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Assign this one unit to a project. The unit becomes In use at that project; a unit that is not Available cannot be assigned. Mounted only while open. */
export function AssignUnitDialog({ unit, onClose }: { unit: EquipmentUnit; onClose: () => void }) {
  const { projects, planLines, units, saveUnitRemote } = useCore()
  const remoteProjects = projects.filter(isRemote)
  const [projectId, setProjectId] = useState('')
  const [formError, setFormError] = useState('')
  // the equipment must be in the chosen project's equipment planning; checked once a project is picked
  const plannedHere = projectId !== '' && planLines.some((l) => l.projectId === projectId && l.equipmentType.trim().toLowerCase() === unit.type.trim().toLowerCase())
  const planCheck = projectId === '' ? '' : plannedHere ? '' : `${unit.type} is not in this project's equipment planning. Add it to the planning first.`
  // assigning beyond the units planned for this project and type needs a reason
  const sameType = (t: string) => t.trim().toLowerCase() === unit.type.trim().toLowerCase()
  const planned = planLines.filter((l) => l.projectId === projectId && sameType(l.equipmentType)).reduce((n, l) => n + l.plannedQty, 0)
  const assignedNow = units.filter((u) => u.projectId === projectId && sameType(u.type) && u.availability === 'In use').length
  const overPlan = plannedHere && assignedNow + 1 > planned
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setFormError('')
    if (unit.availability !== 'Available') return setFormError(`${unit.assetCode} is ${unit.availability} and cannot be assigned to a project.`)
    if (!projectId) return setFormError('Pick a project. Only projects on the server can take an assignment.')
    if (!plannedHere) return setFormError(planCheck)
    if (overPlan && reason.trim().length < 3) return setFormError('Enter the reason for assigning more units than planned.')
    const next: EquipmentUnit = { ...unit, projectId, availability: 'In use', overPlanReason: overPlan ? reason.trim() : undefined }
    const body = JSON.stringify(next)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ body, key })
    setBusy(true)
    try {
      await saveUnitRemote(next, key)
      setPending(null)
      notify('Equipment assigned to project')
      onClose()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      setFormError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Assign to project" description="Assign this unit to a project.">
      <form noValidate onSubmit={submit}>
        {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
        <p className="helper" style={{ marginBottom: 14 }}>
          {`${unit.assetCode} · ${unit.type}. Once assigned, the unit is In use and cannot be assigned again.`}
        </p>
        <div className="form-grid">
          <FormGroup label="Project" required>
            {(id) => (
              <Select id={id} value={projectId} onChange={(e) => { setProjectId(e.target.value); setFormError('') }}>
                <option value="">Choose a project</option>
                {remoteProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
          </FormGroup>
          {planCheck && <p role="alert" style={{ color: 'var(--red)', margin: 0 }}>{planCheck}</p>}
          {overPlan && (
            <>
              <p role="alert" style={{ color: 'var(--red)', margin: 0 }}>{`${planned} ${unit.type} planned for this project and ${assignedNow} already assigned. Assigning this unit goes over the plan, so a reason is needed.`}</p>
              <FormGroup label="Reason for assigning over the plan" required>
                {(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setFormError('') }} />}
              </FormGroup>
            </>
          )}
        </div>
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit" disabled={busy || (projectId !== '' && !plannedHere)}>Assign</Button>
        </div>
      </form>
    </Modal>
  )
}

const DATE_OR_BLANK = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a date.')
const unitEditSchema = z.object({
  name: z.string().trim().min(1, 'Equipment name is required.').max(200, 'Use 200 characters or fewer.'),
  regNo: z.string().trim().max(40, 'Use 40 characters or fewer.'),
  availability: z.enum(['Available', 'In use', 'Under maintenance', 'Breakdown']),
  hireStatus: z.enum(['Active', 'Inactive']),
  owner: z.string().trim().max(100, 'Use 100 characters or fewer.'),
  meterReading: z.string().trim().refine((v) => v === '' || /^\d+(\.\d+)?$/.test(v), 'Use a number.'),
  insuranceExpiry: DATE_OR_BLANK,
  pollutionExpiry: DATE_OR_BLANK,
  fitnessExpiry: DATE_OR_BLANK,
})
type UnitEditValues = z.infer<typeof unitEditSchema>

/**
 * Edit a registered unit. Saves the changed fields with the row version read, so a stale copy is refused (VERSION_CONFLICT).
 * Mounted only while open.
 */
export function EditUnitDialog({ unit, onClose }: { unit: EquipmentUnit; onClose: () => void }) {
  const { saveUnitRemote, attachUnitFiles } = useCore()
  const [formError, setFormError] = useState('')
  // replacement photo and documents chosen here; uploaded after the unit is saved
  const [photo, setPhoto] = useState<UnitUpload | null>(null)
  const [docs, setDocs] = useState<Partial<Record<UnitDocKey, UnitUpload>>>({})
  const [fileErrors, setFileErrors] = useState<Partial<Record<UnitDocKey | 'photo', string>>>({})
  const choose = (key: UnitDocKey | 'photo', file?: File) => {
    if (!file) return
    const r = asUpload(file)
    if ('problem' in r) return setFileErrors((x) => ({ ...x, [key]: r.problem }))
    setFileErrors((x) => ({ ...x, [key]: '' }))
    if (key === 'photo') setPhoto(r.upload)
    else setDocs((x) => ({ ...x, [key]: r.upload }))
  }
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, formState: { errors: e } } = useForm<UnitEditValues>({
    resolver: zodResolver(unitEditSchema),
    defaultValues: {
      name: unit.name ?? '',
      regNo: unit.regNo ?? '',
      availability: unit.availability,
      hireStatus: unit.hireStatus ?? 'Active',
      owner: unit.owner ?? '',
      meterReading: unit.meterReading ?? '',
      insuranceExpiry: unit.insuranceExpiry ?? '',
      pollutionExpiry: unit.pollutionExpiry ?? '',
      fitnessExpiry: unit.fitnessExpiry ?? '',
    },
  })

  const submit = handleSubmit(async (v) => {
    setFormError('')
    const next: EquipmentUnit = {
      ...unit,
      name: v.name.trim(),
      regNo: v.regNo.trim(),
      availability: v.availability,
      // only a hired unit has a hire status
      ...(unit.ownershipType === 'Hired' ? { hireStatus: v.hireStatus } : {}),
      owner: v.owner.trim() || undefined,
      meterReading: v.meterReading.trim() || undefined,
      insuranceExpiry: v.insuranceExpiry || undefined,
      pollutionExpiry: v.pollutionExpiry || undefined,
      fitnessExpiry: v.fitnessExpiry || undefined,
    }
    const body = JSON.stringify(next)
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ body, key })
    try {
      const saved = await saveUnitRemote(next, key)
      setPending(null)
      const { failed } = photo || Object.keys(docs).length ? await attachUnitFiles(saved, { photo: photo ?? undefined, docs }) : { failed: [] }
      notify('Equipment unit saved')
      reportFileFailures(failed)
      onClose()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await useCore.getState().loadUnits()
        return setFormError('Someone else changed this unit. The latest version is loaded; close this and edit it again.')
      }
      setFormError(errorText(err))
    }
  })

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Edit equipment unit" description={`${unit.assetCode} · ${unit.type}. Fields not shown here keep their saved values.`}>
      <form noValidate onSubmit={submit}>
        {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
        <div className="form-grid">
          <FormGroup label="Equipment name" required error={e.name?.message}>
            {(id, d) => <Input {...a11y(id, d, e.name?.message)} {...register('name')} id={id} />}
          </FormGroup>
          <FormGroup label="Registration number" error={e.regNo?.message}>
            {(id, d) => <Input {...a11y(id, d, e.regNo?.message)} {...register('regNo')} id={id} />}
          </FormGroup>
          <FormGroup label={`Initial meter reading (${unit.meterType === 'Odometer' ? 'km' : 'h'})`} error={e.meterReading?.message}>
            {(id, d) => <Input {...a11y(id, d, e.meterReading?.message)} {...register('meterReading')} id={id} />}
          </FormGroup>
          <FormGroup label="Insurance expiry" error={e.insuranceExpiry?.message}>
            {(id, d) => <Input type="date" {...a11y(id, d, e.insuranceExpiry?.message)} {...register('insuranceExpiry')} id={id} />}
          </FormGroup>
          <FormGroup label="Pollution (PUC) expiry" error={e.pollutionExpiry?.message}>
            {(id, d) => <Input type="date" {...a11y(id, d, e.pollutionExpiry?.message)} {...register('pollutionExpiry')} id={id} />}
          </FormGroup>
          <FormGroup label="Fitness expiry" error={e.fitnessExpiry?.message}>
            {(id, d) => <Input type="date" {...a11y(id, d, e.fitnessExpiry?.message)} {...register('fitnessExpiry')} id={id} />}
          </FormGroup>
          <FormGroup label="Availability" required>
            {(id) => (
              <Select id={id} {...register('availability')}>
                <option>Available</option>
                <option>In use</option>
                <option>Under maintenance</option>
                <option>Breakdown</option>
              </Select>
            )}
          </FormGroup>
          {unit.ownershipType === 'Hired' && (
            <FormGroup label="Hire status" required helper="Inactive once the unit is off hire.">
              {(id) => (
                <Select id={id} {...register('hireStatus')}>
                  <option>Active</option>
                  <option>Inactive</option>
                </Select>
              )}
            </FormGroup>
          )}
          <FormGroup label="Owner / vendor" error={e.owner?.message}>
            {(id, d) => <Input {...a11y(id, d, e.owner?.message)} {...register('owner')} id={id} />}
          </FormGroup>
        </div>
        <h3 style={{ margin: '18px 0 8px', fontSize: 14, fontWeight: 600 }}>Photos and documents</h3>
        <p className="helper" style={{ marginBottom: 10 }}>Choose a file only to replace the stored one. Photos: {PHOTO_HINT} Documents: {FILE_HINT} Files are uploaded after the unit is saved.</p>
        <div className="form-grid">
          <FormGroup label="Machine photo" error={fileErrors.photo || undefined} helper={unit.photoFileId ? 'A photo is stored.' : 'No photo stored.'}>
            {(id) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input id={id} type="file" accept={IMAGE_ACCEPT} hidden onChange={(ev) => choose('photo', ev.target.files?.[0])} />
                <Button onClick={() => document.getElementById(id)?.click()}>{unit.photoFileId || photo ? 'Replace photo' : 'Upload photo'}</Button>
                <span style={{ fontSize: 13, color: 'var(--muted, #667085)' }}>{photo?.name ?? 'No new file'}</span>
              </div>
            )}
          </FormGroup>
          {UNIT_DOC_KEYS.map((k) => (
            <FormGroup key={k} label={UNIT_DOC_LABEL[k]} error={fileErrors[k] || undefined} helper={unit.documents?.[k] ? 'A file is stored.' : 'No file stored.'}>
              {(id) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input id={id} type="file" accept={isPhotoKey(k) ? IMAGE_ACCEPT : DOC_ACCEPT} hidden onChange={(ev) => choose(k, ev.target.files?.[0])} />
                  <Button onClick={() => document.getElementById(id)?.click()}>{unit.documents?.[k] || docs[k] ? 'Replace file' : 'Upload file'}</Button>
                  <span style={{ fontSize: 13, color: 'var(--muted, #667085)' }}>{docs[k]?.name ?? 'No new file'}</span>
                </div>
              )}
            </FormGroup>
          ))}
        </div>
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit">Save unit</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Project assignments of a unit's equipment type, each with an unassign control. Shown only for server rows. */
export function UnitAssignments({ unit }: { unit: EquipmentUnit }) {
  const { projects, assignments, equipmentTypes, planSource, unassignEquipmentRemote } = useCore()
  const [busyId, setBusyId] = useState('')
  const [err, setErr] = useState('')
  const typeKnown = !!typeIdByName(equipmentTypes, unit.type)
  // only server rows (UUID ids) can be unassigned; rows that are not on the server are shown nowhere
  const serverId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rows = planSource === 'api' ? assignments.filter((a) => a.equipmentType === unit.type && serverId.test(a.id)) : []
  const unassign = async (id: string) => {
    setErr('')
    setBusyId(id)
    try {
      await unassignEquipmentRemote(id)
      notify('Assignment removed')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusyId('')
    }
  }
  return (
    <div>
      {err && <div className="login-error" role="alert" style={{ marginBottom: 10 }}><span>{err}</span></div>}
      {!typeKnown && <p className="helper">This unit's type is not on the server yet, so it cannot be assigned.</p>}
      {typeKnown && rows.length === 0 && <p className="helper">No project assignments for {unit.type}.</p>}
      {rows.map((a) => (
        <div key={a.id} className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{projects.find((p) => p.id === a.projectId)?.code ?? a.projectId} · {a.qty} × {a.equipmentType}</span>
          <Button size="sm" disabled={busyId === a.id} onClick={() => void unassign(a.id)}>Unassign</Button>
        </div>
      ))}
    </div>
  )
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
/** Saves a blob through a temporary link. */
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** The stored machine photo (read from /files/{id}/content) and a Download button for each stored photo or document. */
export function UnitFiles({ unit }: { unit: EquipmentUnit }) {
  const [photo, setPhoto] = useState<{ id: string; url: string; error: string } | null>(null)
  const [busy, setBusy] = useState<UnitDocKey | ''>('')
  const [err, setErr] = useState('')
  const photoId = unit.photoFileId

  useEffect(() => {
    if (!photoId) return
    let url = ''
    let live = true
    fetchFileContent(photoId)
      .then((b) => { if (live) { url = URL.createObjectURL(b); setPhoto({ id: photoId, url, error: '' }) } })
      .catch((e: unknown) => { if (live) setPhoto({ id: photoId, url: '', error: errorText(e) }) })
    return () => { live = false; if (url) URL.revokeObjectURL(url) }
  }, [photoId])

  const download = async (k: UnitDocKey, id: string) => {
    setErr('')
    setBusy(k)
    try {
      const blob = await fetchFileContent(id)
      saveBlob(blob, `${unit.assetCode}-${k}.${EXT[blob.type] ?? 'bin'}`)
    } catch (e) {
      setErr(`${UNIT_DOC_LABEL[k]}: ${errorText(e)}`)
    } finally {
      setBusy('')
    }
  }
  const shown = photo && photo.id === photoId ? photo : null
  const stored = UNIT_DOC_KEYS.filter((k) => unit.documents?.[k])
  return (
    <div>
      {!photoId && <p className="helper">No machine photo stored.</p>}
      {photoId && !shown && <p className="helper">Reading the machine photo…</p>}
      {shown?.error && <p className="helper" role="alert">The machine photo could not be read: {shown.error}</p>}
      {shown?.url && <img src={shown.url} alt={`Machine photo of ${unit.assetCode}`} style={{ maxWidth: 240, maxHeight: 180, objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: 10 }} />}
      {err && <div className="login-error" role="alert" style={{ marginBottom: 10 }}><span>{err}</span></div>}
      {stored.length === 0 && <p className="helper">No photos or documents stored.</p>}
      {stored.map((k) => (
        <div key={k} className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{UNIT_DOC_LABEL[k]}</span>
          <Button size="sm" disabled={busy === k} onClick={() => void download(k, unit.documents?.[k] ?? '')}>Download</Button>
        </div>
      ))}
    </div>
  )
}
