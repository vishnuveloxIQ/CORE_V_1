import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { KV } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import { Card } from '@/shared/ui/Card'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import type { Availability, EquipmentUnit, UnitDocKey, UnitUpload } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { bulk } from '@/shared/lib/bulk'
import { a11y, req } from '@/shared/lib/core'
import { AVAIL_TONE, COMPANY_EQUIPMENT_TYPE } from '@/modules/core-data'
import { fmtDate, fmtDateTime } from '@/shared/lib/format'
import { newId, nextCode, projectOf, useCore } from '@/modules/core-data'
import { typeIdByName } from '@/modules/core-data'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import { AssignUnitDialog, EditUnitDialog, UnitAssignments, UnitFiles } from '../components/EquipmentControls'
import { asUpload, DOC_ACCEPT, FILE_HINT, IMAGE_ACCEPT, PHOTO_HINT, reportFileFailures } from '../utils/unitFiles'

const AVAILABILITY: Availability[] = ['Available', 'In use', 'Under maintenance', 'Breakdown']
const OWNERSHIP = ['Owned', 'Hired']
const CAPACITY_UNITS = ['kVA', 'kW', 'HP', 'Ton', 'm³', 'm³/h', 'm', 'cfm']
/** capacity as the register shows it: the figure and its unit when both are there */
const capacityText = (u: { capacity?: string; capacityUnit?: string }) => [u.capacity, u.capacityUnit].filter(Boolean).join(' ')
const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric']
/** Meter type is fixed for every unit: hour meter (hours run). */
const METER_TYPE = 'HMR'

const text = z.string().optional()
const dateField = z.string().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a date.')
const numField = z.string().optional().refine((v) => !v || /^\d+(\.\d+)?$/.test(v.trim()), 'Use a number.')
const reqNum = (label: string) => req(label).refine((v) => /^\d+(\.\d+)?$/.test(v), `${label} must be a number.`)
const reqYear = (label: string) => req(label).refine((v) => /^\d{4}$/.test(v), `${label} must be a four-digit year.`)
const reqDate = (label: string) => req(label).refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), `${label} must be a date.`)

/** Make and model are built from manufacturer and model. */
const makeModelOf = (manufacturer: string, model: string) => [manufacturer, model].map((s) => s.trim()).filter(Boolean).join(' ')
/** Owner choices for the Ownership step. */
const OWNERS = ['Company', 'Hire vendor', 'Sai Earthmovers']
/** Current-location choices: the server locations of the selected project (the unit's locationId is one of these). */
const locationsOf = (
  projects: { id: string; locationIds?: string[] }[],
  sites: { id: string; name: string; projectId?: string }[],
  projectId: string | undefined,
) => {
  if (!projectId) return []
  const ids = projects.find((p) => p.id === projectId)?.locationIds ?? []
  return sites.filter((s) => s.projectId === projectId || ids.includes(s.id))
}
const NO_LOCATION = 'The project has no location to link the unit to. Add a location to the project first.'

/** Registration fields. Each key is also rendered, validated, saved and shown from DOC_FIELDS. */
const docShape = {
  manufacturer: req('Manufacturer (OEM)'),
  model: req('Model'),
  mfgYear: reqYear('Manufacturing year'),
  chasisNo: req('Chassis / serial number'),
  engineNo: req('Engine number'),
  capacity: reqNum('Capacity'),
  capacityUnit: req('Capacity unit'),
  meterReading: reqNum('Initial meter reading'),
  fuelType: req('Fuel / energy type'),
  fuelNorm: numField,
  tankCapacity: numField,
  invoiceNo: text,
  invoiceDate: dateField,
  regExpiry: dateField,
  insuranceNo: text,
  insuranceExpiry: dateField,
  pucNo: text,
  pollutionExpiry: dateField,
  fitnessCert: text,
  fitnessExpiry: dateField,
  owner: req('Owner / vendor'),
  hireRef: req('Hired agreement reference'),
  agreementStart: reqDate('Agreement start date'),
  agreementEnd: reqDate('Agreement end date'),
  warrantyEnd: dateField,
  warrantyReading: numField,
  currentLocation: req('Current location'),
}
type DocKey = keyof typeof docShape

const unitSchema = z.object({
  assetCode: req('Equipment ID'),
  name: req('Equipment name'),
  regNo: text,
  ownershipType: z.string().min(1, 'Choose Owned or Hired.'),
  chainageId: z.string().min(1, NO_LOCATION),
  availability: z.string().min(1, 'Choose one of the availability states.'),
  ...docShape,
})
/** Photo and document tiles: the form holds the chosen file's name for the checks; the file is uploaded once the unit is created. The meter photo is required. */
const fileShape = {
  chasisPhoto: text,
  enginePhoto: text,
  meterPhoto: req('Meter photo'),
  invoiceDoc: text,
  insuranceDoc: text,
  pucDoc: text,
}
type FileKey = keyof typeof fileShape & UnitDocKey
const addSchema = unitSchema.omit({ chainageId: true }).extend({
  projectId: z.string().min(1, 'Choose the project this equipment belongs to.'),
  ...fileShape,
})
type AddValues = z.infer<typeof addSchema>
type FieldName = keyof AddValues

type DocField = { key: DocKey; label: string; col: string; example: string; step: number; kind?: 'date' | 'year' | 'num'; hint?: string; required?: boolean; options?: string[]; blank?: string }
/** Registration fields in wizard order. `col` is the bulk-upload column; `step` is the wizard step that shows it. */
const DOC_FIELDS: DocField[] = [
  { key: 'manufacturer', label: 'Manufacturer (OEM)', col: 'manufacturer', example: 'Tata Hitachi', step: 1, required: true },
  { key: 'model', label: 'Model', col: 'model', example: 'EX210', step: 1, required: true },
  { key: 'mfgYear', label: 'Manufacturing year', col: 'mfg_year', example: '2019', kind: 'year', step: 1, required: true, hint: 'YYYY' },
  { key: 'chasisNo', label: 'Chassis / serial number', col: 'chasis_no', example: 'CH781120', step: 1, required: true },
  { key: 'engineNo', label: 'Engine number', col: 'engine_no', example: 'ENG-44812', step: 1, required: true },
  { key: 'capacity', label: 'Capacity', col: 'capacity', example: '21', kind: 'num', step: 1, required: true },
  { key: 'capacityUnit', label: 'Capacity unit', col: 'capacity_unit', example: 'kVA', step: 1, required: true, options: CAPACITY_UNITS },
  { key: 'meterReading', label: 'Initial meter reading (h)', col: 'meter_reading', example: '4200', kind: 'num', step: 1, required: true },
  { key: 'fuelType', label: 'Fuel / energy type', col: 'fuel_type', example: 'Petrol', step: 1, required: true, options: FUEL_TYPES },
  { key: 'fuelNorm', label: 'Fuel norm (L/h)', col: 'fuel_norm', example: '12.5', kind: 'num', step: 1 },
  { key: 'tankCapacity', label: 'Tank capacity (L)', col: 'tank_capacity', example: '300', kind: 'num', step: 1 },
  { key: 'invoiceNo', label: 'Invoice number', col: 'invoice_no', example: 'INV-2024-0120', step: 1 },
  { key: 'invoiceDate', label: 'Invoice date', col: 'invoice_date', example: '2024-03-15', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'insuranceNo', label: 'Insurance number', col: 'insurance_no', example: 'INS-55130', step: 1 },
  { key: 'insuranceExpiry', label: 'Insurance expiry date', col: 'insurance_expiry', example: '2027-08-10', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'pucNo', label: 'PUC number', col: 'puc_no', example: 'PUC-40107', step: 1 },
  { key: 'pollutionExpiry', label: 'Pollution (PUC) expiry date', col: 'pollution_expiry', example: '2027-10-05', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'regExpiry', label: 'Registration expiry date', col: 'registration_expiry', example: '2029-06-01', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'fitnessCert', label: 'Fitness certificate number', col: 'fitness_cert', example: 'FIT-9011', step: 1 },
  { key: 'fitnessExpiry', label: 'Fitness expiry date', col: 'fitness_expiry', example: '2031-02-14', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'owner', label: 'Owner / vendor', col: 'owner', example: 'Sai Earthmovers', step: 2, required: true, options: OWNERS, blank: 'Choose an owner' },
  { key: 'hireRef', label: 'Hired agreement reference', col: 'hire_ref', example: 'HR-2291', step: 2, required: true },
  { key: 'agreementStart', label: 'Agreement start date', col: 'agreement_start', example: '2026-01-01', kind: 'date', step: 2, required: true, hint: 'YYYY-MM-DD' },
  { key: 'agreementEnd', label: 'Agreement end date', col: 'agreement_end', example: '2026-12-31', kind: 'date', step: 2, required: true, hint: 'YYYY-MM-DD' },
  { key: 'warrantyEnd', label: 'Warranty end date', col: 'warranty_end', example: '2028-06-30', kind: 'date', step: 2, hint: 'YYYY-MM-DD' },
  { key: 'warrantyReading', label: 'Warranty end reading (HMR)', col: 'warranty_reading', example: '6000', kind: 'num', step: 2 },
  { key: 'currentLocation', label: 'Current location', col: 'current_location', example: 'Chainage 42 Site Camp', step: 2, required: true, blank: 'Choose a location' },
]

/** Wizard steps: Identity (0), Technical (1), Ownership & location (2), Review & save (3). */
const STEPS = [
  { title: 'Identity', sub: 'Code, category, ownership' },
  { title: 'Technical', sub: 'Specifications, meter, fuel, papers' },
  { title: 'Ownership & location', sub: 'Owner, dates, location' },
  { title: 'Review & save', sub: 'Confirm and register' },
]
const LAST = STEPS.length - 1
/** Fields that must be valid before Continue moves past each step (required DOC_FIELDS and FILE_STEPS are added per step). */
const REQUIRED_BY_STEP: FieldName[][] = [
  ['assetCode', 'name', 'ownershipType'],
  [],
  ['projectId'],
  [],
]
const FILE_STEPS: Partial<Record<number, FileKey[]>> = {
  1: ['chasisPhoto', 'enginePhoto', 'meterPhoto', 'invoiceDoc', 'insuranceDoc', 'pucDoc'],
}
const stepFields = (i: number): FieldName[] => [
  ...REQUIRED_BY_STEP[i],
  ...DOC_FIELDS.filter((f) => f.step === i).map((f) => f.key),
  ...(FILE_STEPS[i] ?? []),
]

const blankDocs = Object.fromEntries(DOC_FIELDS.map((f) => [f.key, ''])) as Partial<Record<DocKey, string>>
const blankFiles: Record<FileKey, string> = { chasisPhoto: '', enginePhoto: '', meterPhoto: '', invoiceDoc: '', insuranceDoc: '', pucDoc: '' }

const SectionTitle = ({ children }: { children: string }) => (
  <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 600 }}>{children}</h3>
)

/** A photo the camera can capture: the machine photo field, or a photo upload tile. */
type CamTarget = 'machine' | 'chasisPhoto' | 'enginePhoto' | 'meterPhoto'
const CAM_LABEL: Record<CamTarget, string> = {
  machine: 'Machine photo',
  chasisPhoto: 'Chassis number photo',
  enginePhoto: 'Engine number photo',
  meterPhoto: 'Meter photo',
}

/** Four-step equipment registration wizard; the same record shape as a bulk-uploaded row. */
function AddUnitForm({ onDone }: { onDone: () => void }) {
  const { projects, sites, saveUnitRemote, attachUnitFiles } = useCore()
  const [step, setStep] = useState(0)
  const [formError, setFormError] = useState('')
  // the same unit sent again after a network error reuses its Idempotency-Key, so a retry cannot register it twice
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  // the machine photo: a preview URL and the file to upload after the unit is created
  const [photo, setPhoto] = useState<{ url: string; upload: UnitUpload } | null>(null)
  // the chosen photo and document files by tile; uploaded after the unit is created
  const [docFiles, setDocFiles] = useState<Partial<Record<FileKey, UnitUpload>>>({})
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const camRefs = useRef<Partial<Record<FileKey, HTMLInputElement | null>>>({})
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // which photo the live camera view is capturing for; null = camera off
  const [camFor, setCamFor] = useState<CamTarget | null>(null)
  // the error names the photo it came from, so it shows under that field only
  const [camError, setCamError] = useState<{ target: CamTarget; message: string } | null>(null)
  const { register, handleSubmit, trigger, watch, setError, setValue, formState: { errors: e } } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: {
      assetCode: '', name: '', regNo: '', ownershipType: 'Owned', projectId: '', availability: 'Available',
      ...blankDocs, ...blankFiles, capacityUnit: 'kVA', fuelType: 'Petrol',
    },
  })

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  // Release the camera when the form leaves the screen.
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])

  // The popup mounts after this component renders, so the video element attaches its stream when it appears.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamFor(null)
  }

  // Leaving a step turns the camera off, so it never keeps running on another screen.
  useEffect(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamFor(null)
    setCamError(null)
  }, [step])

  /** Asks for camera access (the browser shows its permission prompt); falls back to the device capture input if unavailable. */
  const takePhoto = async (target: CamTarget) => {
    setCamError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      (target === 'machine' ? cameraRef.current : camRefs.current[target])?.click()
      return
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      setCamFor(target)
    } catch {
      setCamError({ target, message: 'Camera access was blocked or no camera was found. Allow camera access in your browser, or upload a file instead.' })
    }
  }

  /** A chosen or captured photo: checked against the allowed types and 2 MB, then kept for upload. */
  const keepPhoto = (target: CamTarget, file: File) => {
    if (target !== 'machine') return pickFile(target, file)
    const r = asUpload(file)
    if ('problem' in r) return setCamError({ target, message: r.problem })
    setCamError(null)
    setPhoto({ url: URL.createObjectURL(file), upload: r.upload })
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const target = camFor
    if (!video || !target) return
    // scaled to at most 1920 px on the long side so a capture stays under the 2 MB upload limit
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) keepPhoto(target, new File([blob], `${target}-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      stopCam()
    }, 'image/jpeg', 0.85)
  }

  const next = async () => {
    if (await trigger(stepFields(step))) setStep((s) => s + 1)
  }

  const save = async (v: AddValues) => {
    setFormError('')
    const assetCode = v.assetCode.trim()
    // the unit links to the chosen server location; its id is sent as locationId
    const chainageId = locationsOf(projects, sites, v.projectId).find((s) => s.name === v.currentLocation)?.id
    if (!chainageId) {
      setStep(2)
      setError('currentLocation', { message: v.currentLocation ? 'Choose a location of the selected project.' : NO_LOCATION })
      return
    }
    const docs = Object.fromEntries(DOC_FIELDS.map((f) => [f.key, v[f.key]?.trim() || undefined])) as Partial<Record<DocKey, string>>
    const unit: EquipmentUnit = {
      id: newId(),
      assetCode,
      name: v.name.trim(),
      type: COMPANY_EQUIPMENT_TYPE.name,
      makeModel: makeModelOf(v.manufacturer, v.model),
      regNo: v.regNo?.trim() ?? '',
      meterType: METER_TYPE,
      ownershipType: v.ownershipType,
      chainageId,
      lat: null,
      lng: null,
      lastPing: null,
      availability: v.availability as Availability,
      ...docs,
    }
    // the id is not part of the request, so the body compares equal on a retry
    const body = JSON.stringify({ ...unit, id: undefined })
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ body, key })
    let saved: EquipmentUnit
    try {
      saved = await saveUnitRemote(unit, key)
      setPending(null)
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code === 'EQUIPMENT_UNIT_DUPLICATE') {
        setStep(0)
        setError('assetCode', { message: err.message })
        return
      }
      setFormError(errorText(err))
      return
    }
    // the unit exists now (its id is the owner of the files); a file that fails is reported and the unit stays
    const { failed } = await attachUnitFiles(saved, { photo: photo?.upload, docs: docFiles })
    notify('Equipment registered')
    reportFileFailures(failed)
    onDone()
  }

  const v = watch()
  const shown = (s?: string) => s?.trim() || '—'
  const dateOut = (s?: string) => (s?.trim() ? fmtDate(s) : '—')
  const projectCode = projects.find((p) => p.id === v.projectId)?.code ?? '—'
  const onPhoto = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (file) keepPhoto('machine', file)
    ev.target.value = ''
  }
  const docField = (key: DocKey) => {
    const f = DOC_FIELDS.find((x) => x.key === key)
    if (!f) return null
    // Current location lists the selected project's server locations.
    const options = key === 'currentLocation' ? locationsOf(projects, sites, v.projectId).map((s) => s.name) : f.options
    return (
      <FormGroup key={key} label={f.label} required={f.required} error={e[key]?.message}>
        {(id, d) => options
          ? <Select {...a11y(id, d, e[key]?.message)} placement={key === 'currentLocation' ? 'top' : undefined} {...register(key)}>{f.blank && <option value="">{f.blank}</option>}{options.map((o) => <option key={o}>{o}</option>)}</Select>
          : <Input type={f.kind === 'date' ? 'date' : 'text'} placeholder={f.example} placement={key === 'warrantyEnd' ? 'top' : undefined} {...a11y(id, d, e[key]?.message)} {...register(key)} />}
      </FormGroup>
    )
  }
  const pickFile = (key: FileKey, file?: File) => {
    if (!file) return
    const r = asUpload(file)
    if ('problem' in r) return setError(key, { message: r.problem })
    setDocFiles((x) => ({ ...x, [key]: r.upload }))
    setValue(key, file.name, { shouldValidate: true })
  }
  /** Camera error, shown right under the photo field that asked for the camera. The live view is in the popup. */
  const camPanel = (key: CamTarget) => (
    camError?.target === key && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--danger, #c0392b)', fontSize: 13 }}>{camError.message}</p>
  )

  /** Photo or document tile: picks a file and keeps its name on the form. Photo tiles can also use the camera. */
  const fileTile = (key: FileKey, label: string, required = false, camera?: Exclude<CamTarget, 'machine'>) => (
    <FormGroup label={label} required={required} error={e[key]?.message} helper={camera ? PHOTO_HINT : FILE_HINT}>
      {(id) => (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input id={id} type="file" accept={camera ? IMAGE_ACCEPT : DOC_ACCEPT} hidden onChange={(ev) => { pickFile(key, ev.target.files?.[0]); ev.target.value = '' }} />
            {camera && (
              <input ref={(el) => { camRefs.current[key] = el }} type="file" accept={IMAGE_ACCEPT} capture="environment" hidden onChange={(ev) => { pickFile(key, ev.target.files?.[0]); ev.target.value = '' }} />
            )}
            {camera && <Button onClick={() => takePhoto(camera)}>{v[key] ? 'Retake photo' : 'Take photo'}</Button>}
            <Button onClick={() => document.getElementById(id)?.click()}>{v[key] ? 'Replace file' : 'Upload file'}</Button>
            <span style={{ fontSize: 13, color: 'var(--muted, #667085)' }}>{v[key] || 'No file chosen'}</span>
          </div>
          {camera && camPanel(camera)}
        </>
      )}
    </FormGroup>
  )

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (step < LAST) void next() }} noValidate>
      <ol aria-label="Registration steps" className="reg-steps">
        {STEPS.map((s, i) => {
          const done = i < step
          const state = done ? 'done' : i === step ? 'current' : 'future'
          const badge = (
            <span className="reg-step-n" aria-hidden="true">
              {done ? <Icon name="check" /> : i + 1}
            </span>
          )
          const text = (
            <span className="reg-step-txt">
              <strong>{s.title}</strong>
              <span>{s.sub}</span>
            </span>
          )
          return (
            <Fragment key={s.title}>
              {i > 0 && <li aria-hidden="true" className={`reg-conn${i <= step ? ' done' : ''}`} />}
              <li className={`reg-step ${state}`} aria-current={i === step ? 'step' : undefined}>
                {done
                  ? <button type="button" onClick={() => setStep(i)} aria-label={`Go back to step ${i + 1}: ${s.title}`} title={`Back to ${s.title}`}>{badge}{text}</button>
                  : <>{badge}{text}</>}
              </li>
            </Fragment>
          )
        })}
      </ol>

      {step === 0 && (
        <div className="form-grid form-grid-4">
          <FormGroup label="Equipment ID" required error={e.assetCode?.message}>{(id, d) => <Input placeholder="e.g. EXC-006" style={{ textTransform: 'uppercase' }} {...a11y(id, d, e.assetCode?.message)} {...register('assetCode')} />}</FormGroup>
          <FormGroup label="Equipment name" required error={e.name?.message}>{(id, d) => <Input placeholder="e.g. JCB 3DX Backhoe 01" {...a11y(id, d, e.name?.message)} {...register('name')} />}</FormGroup>
          <FormGroup label="Ownership type" required error={e.ownershipType?.message}>{(id, d) => <Select {...a11y(id, d, e.ownershipType?.message)} {...register('ownershipType')}>{OWNERSHIP.map((o) => <option key={o}>{o}</option>)}</Select>}</FormGroup>
          <FormGroup label="Machine photo" helper={PHOTO_HINT}>
            {(id) => (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input id={id} ref={cameraRef} type="file" accept={IMAGE_ACCEPT} capture="environment" hidden onChange={onPhoto} />
                  <input ref={uploadRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={onPhoto} />
                  <Button onClick={() => takePhoto('machine')}>{photo ? 'Retake photo' : 'Take photo'}</Button>
                  <Button onClick={() => uploadRef.current?.click()}>Upload file</Button>
                  {photo && <img src={photo.url} alt="Machine preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />}
                </div>
                {camPanel('machine')}
              </>
            )}
          </FormGroup>
        </div>
      )}

      {step === 1 && (
        <>
          <SectionTitle>Machine specifications</SectionTitle>
          <div className="form-grid form-grid-4">
            {docField('manufacturer')}
            {docField('model')}
            {docField('mfgYear')}
            {docField('chasisNo')}
            {fileTile('chasisPhoto', 'Chassis number photo', false, 'chasisPhoto')}
            {docField('engineNo')}
            {fileTile('enginePhoto', 'Engine number photo', false, 'enginePhoto')}
            <FormGroup label="Registration number" error={e.regNo?.message}>{(id, d) => <Input placeholder="e.g. TS09EX1402" {...a11y(id, d, e.regNo?.message)} {...register('regNo')} />}</FormGroup>
            {docField('capacity')}
            {docField('capacityUnit')}
          </div>

          <SectionTitle>Meter and fuel</SectionTitle>
          <div className="form-grid form-grid-4">
            <FormGroup label="Meter type">{(id) => <Input id={id} value="HMR — running hours" readOnly />}</FormGroup>
            {docField('meterReading')}
            {fileTile('meterPhoto', 'Meter photo', true, 'meterPhoto')}
            {docField('fuelType')}
            {docField('fuelNorm')}
            {docField('tankCapacity')}
          </div>

          <SectionTitle>Invoice, registration, insurance and fitness</SectionTitle>
          <div className="form-grid form-grid-4">
            {docField('invoiceNo')}
            {docField('invoiceDate')}
            {fileTile('invoiceDoc', 'Invoice document')}
            {docField('insuranceNo')}
            {docField('insuranceExpiry')}
            {fileTile('insuranceDoc', 'Insurance document')}
            {docField('pucNo')}
            {docField('pollutionExpiry')}
            {fileTile('pucDoc', 'PUC document')}
            {docField('regExpiry')}
            {docField('fitnessCert')}
            {docField('fitnessExpiry')}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <SectionTitle>Ownership</SectionTitle>
          <div className="form-grid form-grid-4">
            {docField('owner')}
            {docField('hireRef')}
            {docField('agreementStart')}
            {docField('agreementEnd')}
            {docField('warrantyEnd')}
            {docField('warrantyReading')}
          </div>

          <SectionTitle>Location</SectionTitle>
          <div className="form-grid form-grid-4">
            <FormGroup label="Current project" required error={e.projectId?.message}>{(id, d) => <Select {...a11y(id, d, e.projectId?.message)} {...register('projectId')}><option value="">Choose a project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>}</FormGroup>
            {docField('currentLocation')}
          </div>
        </>
      )}

      {step === LAST && (
        <div className="detail-grid detail-grid-4">
          <KV k="Equipment ID"><strong>{shown(v.assetCode?.trim() ?? '')}</strong></KV>
          <KV k="Equipment name"><strong>{shown(v.name)}</strong></KV>
          <KV k="Ownership type"><strong>{shown(v.ownershipType)}</strong></KV>
          <KV k="Machine photo"><strong>{photo ? 'Attached' : '—'}</strong></KV>
          <KV k="Make and model"><strong>{shown(makeModelOf(v.manufacturer ?? '', v.model ?? ''))}</strong></KV>
          <KV k="Registration number"><strong>{shown(v.regNo)}</strong></KV>
          <KV k="Meter type"><strong>HMR — running hours</strong></KV>
          <KV k="Current project"><strong>{projectCode}</strong></KV>
          <KV k="Availability"><strong>{v.availability || '—'}</strong></KV>
          {DOC_FIELDS.map((f) => (
            <KV key={f.key} k={f.label}><strong>{f.kind === 'date' ? dateOut(v[f.key]) : shown(v[f.key])}</strong></KV>
          ))}
        </div>
      )}

      {formError && <div className="login-error" role="alert" style={{ marginTop: 14 }}><span>{formError}</span></div>}
      <div className="form-actions">
        <Button onClick={onDone}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
        {step < LAST
          ? <Button tone="primary" onClick={() => void next()}>Continue</Button>
          : <Button tone="primary" icon="check" onClick={handleSubmit(save)}>Register equipment</Button>}
      </div>

      <Modal open={camFor !== null} onOpenChange={(o) => { if (!o) stopCam() }} title={camFor ? CAM_LABEL[camFor] : 'Take photo'}>
        <div style={{ display: 'grid', gap: 12 }}>
          <video ref={attachVideo} autoPlay playsInline muted style={{ width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={stopCam}>Cancel</Button>
            <Button tone="primary" onClick={capturePhoto}>Capture</Button>
          </div>
        </div>
      </Modal>
    </form>
  )
}

/** 3.5 Equipment register (read-only): units registered by P&M with location and availability. */
export default function EquipmentRegister() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'eq-register')
  const { units, projects, sites, saveUnitRemote, unitsLoad, unitsError, equipmentTypes } = useCore()
  const [selected, setSelected] = useState<EquipmentUnit | null>(null)
  const [editFor, setEditFor] = useState<EquipmentUnit | null>(null)
  const [upload, setUpload] = useState(false)
  const [adding, setAdding] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [assignFor, setAssignFor] = useState<EquipmentUnit | null>(null)
  // a unit links to a server location (chainageId holds its id); '' means unassigned
  const siteOf = (u: EquipmentUnit) => sites.find((s) => s.id === u.chainageId)
  const projectIdOf = (u: EquipmentUnit) => projectOf(projects, u.chainageId)?.id ?? siteOf(u)?.projectId
  const projectCodeOf = (u: EquipmentUnit) => projects.find((p) => p.id === projectIdOf(u))?.code ?? 'Unassigned'
  const shownUnits = projectId ? units.filter((u) => projectIdOf(u) === projectId) : units
  /** Bulk-uploaded rows are saved one by one; a row the server refuses is reported and the others still save. */
  const importUnits = async (list: EquipmentUnit[]) => {
    const failed: string[] = []
    for (const u of list) {
      try {
        await saveUnitRemote(u)
      } catch (err) {
        failed.push(`${u.assetCode}: ${errorText(err)}`)
      }
    }
    notify(`${list.length - failed.length} of ${list.length} equipment unit${list.length === 1 ? '' : 's'} saved.`, 6000)
    if (failed.length) notify(failed.join(' '), 10000)
  }
  const validate = (records: Record<string, string>[]): RowCheck<EquipmentUnit>[] => {
    let n = Number(nextCode('EQ', units).split('-')[1])
    return records.map((r) => {
      const availRaw = (r.availability ?? '').trim()
      const avail = availRaw ? bulk.pick(availRaw, AVAILABILITY) : 'Available'
      const ownership = bulk.pick(r.ownership_type ?? '', OWNERSHIP)
      const where = projects.find((p) => p.code.toUpperCase() === (r.project_code ?? '').toUpperCase())
      const docs = Object.fromEntries(DOC_FIELDS.map((f) => {
        const raw = (r[f.col] ?? '').trim()
        return [f.key, f.options ? (bulk.pick(raw, f.options) ?? raw) : raw]
      })) as Record<DocKey, string>
      const value = {
        assetCode: (r.asset_code ?? '').trim(),
        name: (r.equipment_name ?? '').trim(),
        type: COMPANY_EQUIPMENT_TYPE.name,
        regNo: (r.reg_no ?? '').trim(),
        ownershipType: ownership ?? '',
        chainageId: locationsOf(projects, sites, where?.id).find((s) => s.name === docs.currentLocation)?.id ?? '',
        availability: avail ?? '',
        ...docs,
      }
      const errors = bulk.check(unitSchema, value)
      if (availRaw && !avail) errors.push(`availability must be one of: ${AVAILABILITY.join(', ')}.`)
      if (!ownership) errors.push(`ownership_type must be one of: ${OWNERSHIP.join(', ')}.`)
      for (const f of DOC_FIELDS) {
        if (f.options && docs[f.key] && !f.options.includes(docs[f.key])) errors.push(`${f.col} must be one of: ${f.options.join(', ')}.`)
      }
      const locations = locationsOf(projects, sites, where?.id).map((s) => s.name)
      if (where && !locations.length) errors.push(`Project ${where.code} has no location to link the unit to.`)
      else if (docs.currentLocation && !locations.includes(docs.currentLocation)) errors.push(`current_location must be one of: ${locations.join(', ')}.`)
      if (r.project_code && !where) errors.push(`Project code ${r.project_code} does not exist.`)
      if (value.assetCode && units.some((u) => u.assetCode.toUpperCase() === value.assetCode.toUpperCase()))
        errors.push(`Company code ${value.assetCode} is already registered.`)
      const label = `${value.assetCode || r.asset_code || '?'} · ${value.name || '?'}`
      return errors.length
        ? { label, errors }
        : {
            label,
            value: {
              id: `EQ-${n++}`,
              assetCode: value.assetCode,
              name: value.name,
              type: COMPANY_EQUIPMENT_TYPE.name,
              makeModel: makeModelOf(docs.manufacturer, docs.model),
              regNo: value.regNo,
              meterType: METER_TYPE,
              ownershipType: value.ownershipType,
              chainageId: value.chainageId,
              lat: null,
              lng: null,
              lastPing: null,
              availability: value.availability as Availability,
              ...Object.fromEntries(DOC_FIELDS.map((f) => [f.key, docs[f.key] || undefined])),
            },
          }
    })
  }
  const count = (a: string) => shownUnits.filter((u) => u.availability === a).length
  const typeIdOf = (name: string) => typeIdByName(equipmentTypes, name)
  const gps = (u: EquipmentUnit) => (u.lat !== null && u.lng !== null && u.lastPing ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : null)
  const txt = (v?: string) => v || '—'
  const dateOf = (v?: string) => (v ? fmtDate(v) : '—')

  // Registration takes over the whole screen, like the New project page; Cancel or Back returns to the register.
  if (adding) {
    return (
      <div>
        <PageHead crumb="Company equipment register" title="Register equipment" desc="Fields marked with * are required. Add one equipment unit to the company register."
          actions={<Button icon="chevL" onClick={() => setAdding(false)}>Back to equipment register</Button>} />
        <Card title="Equipment details">
          <AddUnitForm onDone={() => setAdding(false)} />
        </Card>
      </div>
    )
  }

  return (
    <div ref={ref}>
      <PageHead crumb="Company equipment register" title="Company equipment register" desc="Registered equipment units with their current project, GPS position and availability, mapped to the planning lines."
        actions={<>
          <Can privilege={MANAGE.masters}>
            <Button icon="upload" onClick={() => setUpload(true)}>Bulk upload</Button>
            <Button tone="primary" icon="plus" onClick={() => setAdding(true)}>Add equipment</Button>
          </Can>
        </>} />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          )}
        </FormGroup>
      </div>
      {unitsLoad === 'error' && <div className="login-error" role="alert" style={{ marginBottom: 16 }}><span>The equipment units could not be read: {unitsError} The register is empty until the server answers.</span></div>}
      <div className="grid stats">
        <StatTile label="Available" value={count('Available')} icon="checkc" tone="green" />
        <StatTile label="In use" value={count('In use')} icon="activity" tone="blue" />
        <StatTile label="Under maintenance" value={count('Under maintenance')} icon="wrench" tone="gold" />
        <StatTile label="Breakdown" value={count('Breakdown')} icon="breakdown" tone="rose" />
      </div>
      <TablePanel title="Registered units" subtitle="Registration is maintained by P&M. Filter by availability using the chips; pick more than one to combine. Search by asset code, name, type or registration number." rows={shownUnits} rowKey={(u) => u.id}
        columns={[
          { header: 'S No', kind: 'c-id', cell: (u) => shownUnits.indexOf(u) + 1, csv: (u) => String(shownUnits.indexOf(u) + 1) },
          { header: 'Equipment Name', kind: 'c-sub', cell: (u) => <strong>{u.name || u.type}</strong>, csv: (u) => u.name || u.type },
          { header: 'Made', kind: 'c-more', cell: (u) => u.makeModel, csv: (u) => u.makeModel },
          { header: 'Model', kind: 'c-more', cell: (u) => u.model || '—', csv: (u) => u.model ?? '' },
          { header: 'Capacity / size', kind: 'c-more', cell: (u) => capacityText(u) || '—', csv: capacityText },
          { header: 'Company Code', kind: 'c-amt', cell: (u) => u.assetCode, csv: (u) => u.assetCode },
          { header: 'Current Project', kind: 'c-amt', cell: (u) => projectCodeOf(u), csv: (u) => projectCodeOf(u) },
          { header: 'Current Status', kind: 'c-status', cell: (u) => <StatusBadge tone={AVAIL_TONE[u.availability]}>{u.availability}</StatusBadge>, csv: (u) => u.availability },
        ]}
        searchText={(u) => `${u.assetCode} ${u.name ?? ''} ${u.type} ${u.makeModel} ${u.regNo}`} statusOf={(u) => u.availability}
        action={(u) => <>
          <Button size="sm" disabled={!typeIdOf(u.type)} title={typeIdOf(u.type) ? undefined : 'This type is not on the server yet'} onClick={() => setAssignFor(u)}>Assign</Button>{' '}
          <Button size="sm" onClick={() => setSelected(u)}>Details</Button>
        </>}
        searchPlaceholder="Search by asset, name, type or registration…" exportName="core-equipment-register" chipNoun="availability" />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="equipment units"
        templateName="core-equipment-register-template"
        fields={[
          { key: 'asset_code', label: 'Company code', required: true, example: 'EXC-020', hint: 'Must be unique' },
          { key: 'equipment_name', label: 'Equipment name', required: true, example: 'JCB 3DX Backhoe 01' },
          { key: 'reg_no', label: 'Registration number', required: false, example: 'TS09EX1402', hint: 'Optional' },
          { key: 'ownership_type', label: 'Ownership', required: true, example: 'Owned', hint: OWNERSHIP.join(', ') },
          { key: 'project_code', label: 'Current project code', required: true, example: projects[0]?.code ?? '', hint: `Projects: ${projects.map((p) => p.code).join(', ')}` },
          { key: 'availability', label: 'Availability', required: false, example: 'Available', hint: `Optional, defaults to Available. ${AVAILABILITY.join(', ')}` },
          ...DOC_FIELDS.map((f) => ({ key: f.col, label: f.label, required: f.required, example: f.example, hint: f.options ? f.options.join(', ') : f.hint })),
        ]}
        validate={validate}
        onImport={(list) => void importUnits(list)}
      />
      <Modal open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Equipment unit" size="wide">
        {selected && <>
          <div className="detail-grid detail-grid-4">
            <KV k="S No"><strong>{shownUnits.indexOf(selected) + 1}</strong></KV>
            <KV k="Equipment Name"><strong>{selected.name || selected.type}</strong></KV>
            <KV k="Made"><strong>{selected.makeModel}</strong></KV>
            <KV k="Company Code"><strong>{selected.assetCode}</strong></KV>
            <KV k="Registration Number"><strong>{txt(selected.regNo)}</strong></KV>
            <KV k="Ownership"><strong>{txt(selected.ownershipType)}</strong></KV>
            <KV k="Current Project"><strong>{projectCodeOf(selected)}</strong></KV>
            <KV k="Meter type"><strong>{txt(selected.meterType)}</strong></KV>
            {DOC_FIELDS.map((f) => (
              <KV key={f.key} k={f.label}><strong>{f.kind === 'date' ? dateOf(selected[f.key]) : txt(selected[f.key])}</strong></KV>
            ))}
            <KV k="Location"><strong>{gps(selected) ?? 'No fix'}</strong></KV>
            <KV k="Last fix"><strong>{selected.lastPing ? fmtDateTime(selected.lastPing) : '—'}</strong></KV>
          </div>
          <h3 style={{ margin: '18px 0 8px' }}>Photo and documents</h3>
          <UnitFiles unit={selected} />
          <h3 style={{ margin: '18px 0 8px' }}>Project assignments</h3>
          <UnitAssignments unit={selected} />
          <div className="form-actions">
            {selected.rowVersion !== undefined && <Can privilege={MANAGE.masters}><Button onClick={() => { setEditFor(selected); setSelected(null) }}>Edit</Button></Can>}
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
        </>}
      </Modal>
      {assignFor && <AssignUnitDialog unit={assignFor} onClose={() => setAssignFor(null)} />}
      {editFor && <EditUnitDialog unit={editFor} onClose={() => setEditFor(null)} />}
    </div>
  )
}
