import { useLocation } from 'react-router-dom'
import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { zodResolver } from '@hookform/resolvers/zod'
import type { Resolver } from 'react-hook-form'
import { z } from 'zod'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { KV } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import { Card } from '@/shared/ui/Card'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import type { Availability, EquipmentUnit, UnitDocKey, UnitUpload } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { bulk } from '@/shared/lib/bulk'
import { a11y, req } from '@/shared/lib/core'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_MANUFACTURERS } from '@/modules/core-data'
import { fmtDate, fmtDateTime, todayISO } from '@/shared/lib/format'
import { StatusBadge } from '@/shared/ui/Status'
import { newId, nextCode, useCore } from '@/modules/core-data'
import { ApiError, errorText, idempotencyKey } from '@/shared/lib/api'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE, useAuth } from '@/modules/auth'
import { EditUnitDialog, UnitFiles } from '../components/EquipmentControls'
import { asUpload, DOC_ACCEPT, FILE_HINT, IMAGE_ACCEPT, PHOTO_HINT, reportFileFailures } from '../utils/unitFiles'

const AVAILABILITY: Availability[] = ['Available', 'In use', 'Under maintenance', 'Breakdown']
/** Owned equipment is the company's own; hired equipment is held on hire from a vendor. The register has a tab for each. */
const OWNERSHIP = ['Owned', 'Hired'] as const
/** Whether a hired unit is still on hire. It is set Active at registration and changed afterwards (Edit); a unit with no saved status falls back to its agreement dates. */
type HireDates = { hireStatus?: 'Active' | 'Inactive'; agreementStart?: string; agreementEnd?: string }
const hireActive = (u: HireDates, today = todayISO()) =>
  u.hireStatus ? u.hireStatus === 'Active' : (!u.agreementStart || u.agreementStart <= today) && (!u.agreementEnd || u.agreementEnd >= today)
const HIRE_STATUS = (u: HireDates) => (hireActive(u) ? 'Active' : 'Inactive')
const CAPACITY_UNITS = ['kVA', 'kW', 'HP', 'Ton', 'kg', 'kN', 'm³', 'm³/h', 'm³/min', 'm²', 'm', 'cfm', 'L', 'kL', 'TPH', 'bar']
/** Categories that are not registered with the transport authority: no registration, PUC or fitness details. */
const NOT_ROAD_REGISTERED = ['Sensor Paver', 'Tandem Roller', 'Soil Compactor', 'Pad Foot Roller']
/** capacity as the register shows it: the figure and its unit when both are there */
const capacityText = (u: { capacity?: string; capacityUnit?: string }) => [u.capacity, u.capacityUnit].filter(Boolean).join(' ')
const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric']
/** Meter types: an hour meter (running hours) or an odometer (kilometres). */
const METER_TYPES = ['HMR', 'Odometer'] as const
const METER_LABEL: Record<(typeof METER_TYPES)[number], string> = { HMR: 'HMR — running hours', Odometer: 'Odometer — kilometres' }
const METER_UNIT: Record<(typeof METER_TYPES)[number], string> = { HMR: 'h', Odometer: 'km' }

const text = z.string().optional()
const dateField = z.string().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a date.')
const numField = z.string().optional().refine((v) => !v || /^\d+(\.\d+)?$/.test(v.trim()), 'Use a number.')
const reqNum = (label: string) => req(label).refine((v) => /^\d+(\.\d+)?$/.test(v), `${label} must be a number.`)
const reqYear = (label: string) => req(label).refine((v) => /^\d{4}$/.test(v), `${label} must be a four-digit year.`)

/** Make and model are built from manufacturer and model. */
const makeModelOf = (manufacturer: string, model: string) => [manufacturer, model].map((s) => s.trim()).filter(Boolean).join(' ')

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
  owner: text,
  warrantyEnd: dateField,
  warrantyReading: numField,
  currentLocation: text,
  hireRef: text,
  hiredFrom: text,
  agreementStart: dateField,
  agreementEnd: dateField,
}
type DocKey = keyof typeof docShape

const unitSchema = z.object({
  assetCode: req('Equipment ID'),
  name: req('Equipment name'),
  regNo: text,
  ownershipType: z.enum(OWNERSHIP),
  meterType: z.enum(METER_TYPES),
  // hired equipment only: its category and type, and the approved request it is registered against
  category: text,
  equipmentType: text,
  approvalRequestId: text,
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
  regDoc: text,
  fitnessDoc: text,
}
type FileKey = keyof typeof fileShape & UnitDocKey
const needTank = (v: { fuelType?: string; tankCapacity?: string }, ctx: z.RefinementCtx) => {
  // the tank capacity is needed unless the equipment is purely electric
  if (v.fuelType !== 'Electric' && !v.tankCapacity?.trim()) ctx.addIssue({ code: 'custom', path: ['tankCapacity'], message: 'Tank capacity is required.' })
}
const addSchema = unitSchema.extend({ ...fileShape, category: req('Equipment category') }).superRefine(needTank)
/** Hired equipment: category, type and the approval reference are required; the machine details are optional except the make, model, year and fuel. */
const addHiredSchema = unitSchema.extend({
  ...fileShape,
  category: req('Equipment category'),
  name: req('Equipment name'),
  owner: req('Vendor name'),
  agreementStart: req('Agreement start date'),
  agreementEnd: req('Agreement end date'),
  chasisNo: text,
  engineNo: req('Engine number'),
  regNo: req('Registration number'),
  meterPhoto: text,
}).superRefine((v, ctx) => {
  needTank(v, ctx)
  if (v.agreementStart && v.agreementEnd && v.agreementEnd < v.agreementStart) ctx.addIssue({ code: 'custom', path: ['agreementEnd'], message: 'The end date cannot be before the start date.' })
})
type AddValues = z.infer<typeof addSchema>
type FieldName = keyof AddValues

type DocField = { key: DocKey; label: string; col: string; example: string; step: number; kind?: 'date' | 'year' | 'num'; hint?: string; required?: boolean; options?: string[]; blank?: string; /** shown only for this ownership; both when absent */ only?: 'Owned' | 'Hired' }
/** Registration fields in wizard order. `col` is the bulk-upload column; `step` is the wizard step that shows it. */
const DOC_FIELDS: DocField[] = [
  { key: 'manufacturer', label: 'Manufacturer (OEM)', col: 'manufacturer', example: 'Tata Hitachi', step: 1, required: true },
  { key: 'model', label: 'Model', col: 'model', example: 'EX210', step: 1, required: true },
  { key: 'mfgYear', label: 'Manufacturing year', col: 'mfg_year', example: '2019', kind: 'year', step: 1, required: true, hint: 'YYYY' },
  { key: 'chasisNo', label: 'Chassis / serial number', col: 'chasis_no', example: 'CH781120', step: 1, required: true },
  { key: 'engineNo', label: 'Engine number', col: 'engine_no', example: 'ENG-44812', step: 1, required: true },
  { key: 'capacity', label: 'Capacity', col: 'capacity', example: '21', kind: 'num', step: 1, required: true },
  { key: 'capacityUnit', label: 'Capacity unit', col: 'capacity_unit', example: 'kVA', step: 1, required: true, options: CAPACITY_UNITS, blank: 'Choose a unit' },
  { key: 'fuelType', label: 'Fuel / energy type', col: 'fuel_type', example: 'Petrol', step: 1, required: true, options: FUEL_TYPES },
  { key: 'fuelNorm', label: 'Fuel norm (L/h)', col: 'fuel_norm', example: '12.5', kind: 'num', step: 1 },
  { key: 'tankCapacity', label: 'Tank capacity (L)', col: 'tank_capacity', example: '300', kind: 'num', step: 1 },
  { key: 'meterReading', label: 'Initial meter reading (h)', col: 'meter_reading', example: '4200', kind: 'num', step: 1, required: true },
  { key: 'invoiceNo', label: 'Invoice number', col: 'invoice_no', example: 'INV-2024-0120', step: 1, only: 'Owned' },
  { key: 'invoiceDate', label: 'Invoice date', col: 'invoice_date', example: '2024-03-15', kind: 'date', step: 1, hint: 'YYYY-MM-DD', only: 'Owned' },
  { key: 'warrantyEnd', label: 'Warranty end date', col: 'warranty_end', example: '2028-06-30', kind: 'date', step: 1, hint: 'YYYY-MM-DD', only: 'Owned' },
  { key: 'warrantyReading', label: 'Warranty end reading (HMR)', col: 'warranty_reading', example: '6000', kind: 'num', step: 1, only: 'Owned' },
  { key: 'insuranceNo', label: 'Insurance number', col: 'insurance_no', example: 'INS-55130', step: 1 },
  { key: 'insuranceExpiry', label: 'Insurance expiry date', col: 'insurance_expiry', example: '2027-08-10', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'regExpiry', label: 'Registration expiry date', col: 'registration_expiry', example: '2029-06-01', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'pucNo', label: 'PUC number', col: 'puc_no', example: 'PUC-40107', step: 1 },
  { key: 'pollutionExpiry', label: 'Pollution (PUC) expiry date', col: 'pollution_expiry', example: '2027-10-05', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'fitnessCert', label: 'Fitness certificate number', col: 'fitness_cert', example: 'FIT-9011', step: 1 },
  { key: 'fitnessExpiry', label: 'Fitness expiry date', col: 'fitness_expiry', example: '2031-02-14', kind: 'date', step: 1, hint: 'YYYY-MM-DD' },
  { key: 'hireRef', label: 'Hire agreement reference', col: 'hire_ref', example: 'HR-2291', step: 0, only: 'Hired' },
  { key: 'hiredFrom', label: 'Hired by', col: 'hired_by', example: 'HO hiring', step: 0, only: 'Hired' },
  { key: 'owner', label: 'Vendor name', col: 'vendor_name', example: 'Sai Earthmovers', step: 0, required: true, only: 'Hired' },
  { key: 'agreementStart', label: 'Agreement start date', col: 'agreement_start', example: '2025-01-01', kind: 'date', step: 0, required: true, hint: 'YYYY-MM-DD', only: 'Hired' },
  { key: 'agreementEnd', label: 'Agreement end date', col: 'agreement_end', example: '2025-12-31', kind: 'date', step: 0, required: true, hint: 'YYYY-MM-DD', only: 'Hired' },
]

/** Wizard steps for owned equipment: Identity, Technical, Review. */
const STEPS_OWNED = [
  { title: 'Identity', sub: 'Code, category, ownership' },
  { title: 'Technical', sub: 'Specifications, meter, fuel, papers, warranty' },
  { title: 'Review & save', sub: 'Confirm and register' },
]
/** Wizard steps for hired equipment: basic details, machine / meter / fuel, insurance and statutory, review. */
const STEPS_HIRED = [
  { title: 'Basic details', sub: 'Category, type, approval reference' },
  { title: 'Machine details', sub: 'Specifications, meter, fuel' },
  { title: 'Insurance & statutory', sub: 'Insurance, registration, PUC, fitness' },
  { title: 'Review & save', sub: 'Confirm and register' },
]
/** Hired equipment fields that sit in the insurance and statutory step, and the owned-only ones it leaves out. */
const HIRED_PAPERS: DocKey[] = ['insuranceNo', 'insuranceExpiry', 'regExpiry', 'pucNo', 'pollutionExpiry', 'fitnessCert', 'fitnessExpiry']
const OWNED_ONLY: DocKey[] = ['invoiceNo', 'invoiceDate', 'warrantyEnd', 'warrantyReading']
/** Machine fields a hired unit may leave empty. */
const HIRED_OPTIONAL: DocKey[] = ['chasisNo']
/** Fields that must be valid before Continue moves past each step (required DOC_FIELDS and FILE_STEPS are added per step). */
const REQUIRED_BY_STEP: FieldName[][] = [
  ['assetCode', 'category', 'name', 'ownershipType'],
  [],
  [],
  [],
]
const FILE_STEPS: Partial<Record<number, FileKey[]>> = {
  1: ['chasisPhoto', 'enginePhoto', 'meterPhoto', 'invoiceDoc', 'insuranceDoc', 'pucDoc', 'regDoc', 'fitnessDoc'],
}
const stepFields = (i: number, mode: 'Owned' | 'Hired' = 'Owned'): FieldName[] => mode === 'Hired' ? hiredStepFields(i) : [
  ...REQUIRED_BY_STEP[i],
  ...DOC_FIELDS.filter((f) => f.step === i).map((f) => f.key),
  ...(FILE_STEPS[i] ?? []),
]

const hiredStepFields = (i: number): FieldName[] => {
  if (i === 0) return ['category', 'name', 'owner', 'agreementStart', 'agreementEnd']
  if (i > 2) return []
  const docs = DOC_FIELDS.filter((f) => f.step === 1 && !OWNED_ONLY.includes(f.key) && HIRED_PAPERS.includes(f.key) === (i === 2)).map((f) => f.key)
  const files: FileKey[] = i === 1 ? ['chasisPhoto', 'enginePhoto', 'meterPhoto'] : ['insuranceDoc', 'regDoc', 'pucDoc', 'fitnessDoc']
  return [...docs, ...(i === 1 ? ['regNo' as FieldName] : []), ...files]
}

const blankDocs = Object.fromEntries(DOC_FIELDS.map((f) => [f.key, ''])) as Partial<Record<DocKey, string>>
const blankFiles: Record<FileKey, string> = { chasisPhoto: '', enginePhoto: '', meterPhoto: '', invoiceDoc: '', insuranceDoc: '', pucDoc: '', regDoc: '', fitnessDoc: '' }

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
function AddUnitForm({ mode, onDone }: { mode: 'Owned' | 'Hired'; onDone: () => void }) {
  const { saveUnitRemote, attachUnitFiles, units, users, loadUsers } = useCore()
  const loginId = useAuth((s) => s.user)
  // who hires it: site hiring when the person registering heads the P&M module (FEM), otherwise Head Office hiring
  const me = users.find((u) => u.loginId.toLowerCase() === (loginId ?? '').toLowerCase())
  const hiredFrom = me?.roles?.includes('Module head') || me?.role === 'Module head' ? (me.modules.includes('P&M') ? 'Site hiring' : 'HO hiring') : 'HO hiring'
  const registeredBy = me?.modules.includes('P&M') && (me.roles?.includes('Module head') || me.role === 'Module head') ? 'FEM head' : 'HO registration'
  const [step, setStep] = useState(0)
  const [formError, setFormError] = useState('')
  // the same unit sent again after a network error reuses its Idempotency-Key, so a retry cannot register it twice
  const [pending, setPending] = useState<{ body: string; key: string } | null>(null)
  // the machine photo: a preview URL and the file to upload after the unit is created
  const [photo, setPhoto] = useState<{ url: string; upload: UnitUpload } | null>(null)
  // the category and manufacturer pickers: "__other__" shows a field to type the value
  const [categoryPick, setCategoryPick] = useState('')
  const [manufacturerPick, setManufacturerPick] = useState('')
  // the capacity unit picker: "Add a unit not in the list" shows a field to type it
  const [otherUnit, setOtherUnit] = useState(false)
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
    resolver: zodResolver(mode === 'Hired' ? addHiredSchema : addSchema) as unknown as Resolver<AddValues>,
    defaultValues: {
      // a hired unit gets its company code automatically
      assetCode: mode === 'Hired' ? nextCode('HIR', units.map((u) => ({ code: u.assetCode }))) : '', name: '', category: '', equipmentType: '', approvalRequestId: '', regNo: '', ownershipType: mode, availability: 'Available',
      ...blankDocs, ...blankFiles, meterType: 'HMR', capacityUnit: '', fuelType: 'Petrol',
    },
  })

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => { if (mode === 'Hired' && users.length === 0) void loadUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'Hired') setValue('hiredFrom', hiredFrom) }, [hiredFrom]) // eslint-disable-line react-hooks/exhaustive-deps


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

  // Leaving a step turns the camera off, so it never keeps running on another screen. Done where the step changes.
  // the steps follow the kind of equipment: owned has no hire agreement step
  const steps = mode === 'Hired' ? STEPS_HIRED : STEPS_OWNED
  const LAST = steps.length - 1

  const goToStep = (next: number | ((s: number) => number)) => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamFor(null)
    setCamError(null)
    setFormError('')
    setStep(next)
  }

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
    const ok = await trigger(stepFields(step, mode))
    if (!ok) return
    // a hired unit needs an equipment photo before it can leave the machine details step
    if (mode === 'Hired' && step === 1 && !photo) { setFormError('Add an equipment photo to continue.'); return }
    goToStep((s) => s + 1)
  }

  const save = async (v: AddValues) => {
    setFormError('')
    const assetCode = v.assetCode.trim()
    const docs = Object.fromEntries(DOC_FIELDS.map((f) => [f.key, v[f.key]?.trim() || undefined])) as Partial<Record<DocKey, string>>
    const unit: EquipmentUnit = {
      id: newId(),
      assetCode,
      name: v.name.trim(),
      type: (v.category ?? '').trim(),
      makeModel: makeModelOf(v.manufacturer, v.model),
      regNo: v.regNo?.trim() ?? '',
      meterType: v.meterType,
      ownershipType: v.ownershipType,
      chainageId: '',
      lat: null,
      lng: null,
      lastPing: null,
      availability: v.availability as Availability,
      ...docs,
      // owned equipment records who registered it (not asked on the form): the P&M module head is the FEM head, anyone else registers for Head Office
      ...(mode === 'Owned' ? { hiredFrom: registeredBy } : { hireStatus: 'Active' as const }),
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
        goToStep(0)
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
  // the category drives the capacity units, manufacturers and which papers apply: hired units hold it in `category`, owned in `name`
  const cat = v.category ?? ''
  // purely electric equipment has no fuel norm or tank: those values are cleared
  useEffect(() => {
    if (v.fuelType === 'Electric') { setValue('fuelNorm', ''); setValue('tankCapacity', '') }
  }, [v.fuelType]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (s?: string) => s?.trim() || '—'
  /** A field is shown when it fits the ownership, the fuel type and whether the category is road registered. */
  const reviewApplies = (f: DocField) => {
    if (f.only && f.only !== mode) return false
    if (mode === 'Hired' && OWNED_ONLY.includes(f.key)) return false
    if (v.fuelType === 'Electric' && (f.key === 'fuelNorm' || f.key === 'tankCapacity')) return false
    if (NOT_ROAD_REGISTERED.includes(cat) && (f.key === 'regExpiry' || f.key === 'pucNo' || f.key === 'pollutionExpiry' || f.key === 'fitnessCert' || f.key === 'fitnessExpiry')) return false
    return true
  }
  const dateOut = (s?: string) => (s?.trim() ? fmtDate(s) : '—')
  const onPhoto = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (file) keepPhoto('machine', file)
    ev.target.value = ''
  }
  const docField = (key: DocKey) => {
    const f = DOC_FIELDS.find((x) => x.key === key)
    if (!f) return null
    // capacity units follow the category; meter reading and fuel norm units follow the meter type
    const options = f.options
    const unitOfMeter = METER_UNIT[v.meterType ?? 'HMR']
    const label = key === 'meterReading' ? `Initial meter reading (${unitOfMeter})` : key === 'fuelNorm' ? `Fuel norm (L/${unitOfMeter})` : f.label
    return (
      <FormGroup key={key} label={label} required={(f.required && !(mode === 'Hired' && HIRED_OPTIONAL.includes(key))) || (key === 'tankCapacity' && v.fuelType !== 'Electric')} error={e[key]?.message}>
        {(id, d) => key === 'capacityUnit'
          ? (
            <>
              <Select
                {...a11y(id, d, e[key]?.message)}
                value={otherUnit ? '__other__' : v.capacityUnit ?? ''}
                onChange={(ev) => {
                  const val = ev.target.value
                  setOtherUnit(val === '__other__')
                  setValue('capacityUnit', val === '__other__' ? '' : val, { shouldValidate: true })
                }}
              >
                <option value="">Choose a unit</option>
                {CAPACITY_UNITS.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value="__other__">+ Add a unit not in the list</option>
              </Select>
              {otherUnit && <Input style={{ marginTop: 8 }} placeholder="Type the unit, e.g. kPa" aria-label="Other capacity unit" {...register('capacityUnit')} />}
            </>
          )
          : options
          ? <Select {...a11y(id, d, e[key]?.message)} {...register(key)}>{f.blank && <option value="">{f.blank}</option>}{options.map((o) => <option key={o}>{o}</option>)}</Select>
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

  const manufacturerField = (
            <FormGroup label="Manufacturer (OEM)" required error={e.manufacturer?.message}>
              {(id, d) => (
                <Select
                  {...a11y(id, d, e.manufacturer?.message)}
                  value={manufacturerPick}
                  onChange={(ev) => {
                    const val = ev.target.value
                    setManufacturerPick(val)
                    setValue('manufacturer', val === '__other__' ? '' : val, { shouldValidate: true })
                  }}
                >
                  <option value="">Choose a manufacturer</option>
                  {(EQUIPMENT_MANUFACTURERS[cat] ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__other__">+ Add a manufacturer not in the list</option>
                </Select>
              )}
            </FormGroup>
  )
  const machinePhotoField = (label: string, required: boolean) => (
          <FormGroup label={label} required={required} helper={PHOTO_HINT}>
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
  )

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (step < LAST) void next() }} noValidate>
      <ol aria-label="Registration steps" className="reg-steps">
        {steps.map((s, i) => {
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
                  ? <button type="button" onClick={() => goToStep(i)} aria-label={`Go back to step ${i + 1}: ${s.title}`} title={`Back to ${s.title}`}>{badge}{text}</button>
                  : <>{badge}{text}</>}
              </li>
            </Fragment>
          )
        })}
      </ol>

      {mode === 'Owned' && step === 0 && (
        <div className="form-grid form-grid-4">
          <FormGroup label="Equipment ID" required error={e.assetCode?.message}>{(id, d) => <Input placeholder="e.g. EXC-006" style={{ textTransform: 'uppercase' }} {...a11y(id, d, e.assetCode?.message)} {...register('assetCode')} />}</FormGroup>
          <FormGroup label="Equipment category" required error={e.category?.message}>
            {(id, d) => (
              <Select
                {...a11y(id, d, e.category?.message)}
                value={categoryPick}
                onChange={(ev) => {
                  const val = ev.target.value
                  setCategoryPick(val)
                  setValue('category', val === '__other__' ? '' : val, { shouldValidate: true })
                  // a manufacturer belongs to one category, so it is chosen again
                  setManufacturerPick('')
                  setValue('manufacturer', '')
                }}
              >
                <option value="">Choose a category</option>
                {EQUIPMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__other__">+ Add a category not in the list</option>
              </Select>
            )}
          </FormGroup>
          <FormGroup label="Equipment name" required error={e.name?.message}>
            {(id, d) => <Input placeholder="e.g. Excavator EX210" {...a11y(id, d, e.name?.message)} {...register('name')} />}
          </FormGroup>
          {categoryPick === '__other__' && (
            <FormGroup label="Other category" required>
              {(id, d) => <Input placeholder="e.g. Crawler crane" {...a11y(id, d, e.category?.message)} {...register('category')} />}
            </FormGroup>
          )}
          {machinePhotoField('Machine photo', false)}
        </div>
      )}

      {mode === 'Owned' && step === 1 && (
        <>
          <SectionTitle>1. Equipment identification</SectionTitle>
          <div className="form-grid form-grid-3">
            {manufacturerField}
            {docField('model')}
            {docField('mfgYear')}
            {manufacturerPick === '__other__' && (
              <FormGroup label="Other manufacturer" required full>
                {(id, d) => <Input placeholder="e.g. Escorts Kubota" {...a11y(id, d, e.manufacturer?.message)} {...register('manufacturer')} />}
              </FormGroup>
            )}
            {docField('chasisNo')}
            {docField('engineNo')}
            <FormGroup label="Registration number" required error={e.regNo?.message}>{(id, d) => <Input placeholder="e.g. TS09EX1402" {...a11y(id, d, e.regNo?.message)} {...register('regNo')} />}</FormGroup>
            {fileTile('chasisPhoto', 'Chassis / serial number photo', false, 'chasisPhoto')}
            {fileTile('enginePhoto', 'Engine number photo', false, 'enginePhoto')}
          </div>

          <SectionTitle>2. Technical specifications</SectionTitle>
          <div className="form-grid form-grid-3">
            {docField('capacity')}
            {docField('capacityUnit')}
            {docField('fuelType')}
            {/* fuel norm and tank capacity do not apply to purely electric equipment */}
            {v.fuelType !== 'Electric' && docField('fuelNorm')}
            {v.fuelType !== 'Electric' && docField('tankCapacity')}
          </div>

          <SectionTitle>3. Meter details</SectionTitle>
          <div className="form-grid form-grid-3">
            <FormGroup label="Meter type" required error={e.meterType?.message}>
              {(id, d) => <Select {...a11y(id, d, e.meterType?.message)} {...register('meterType')}>{METER_TYPES.map((m) => <option key={m} value={m}>{METER_LABEL[m]}</option>)}</Select>}
            </FormGroup>
            {docField('meterReading')}
            {fileTile('meterPhoto', 'Meter photo', true, 'meterPhoto')}
          </div>

          {mode === 'Owned' && (
            <>
              <SectionTitle>4. Invoice and warranty details</SectionTitle>
              <div className="form-grid form-grid-3">
                {docField('invoiceNo')}
                {docField('invoiceDate')}
                {fileTile('invoiceDoc', 'Invoice document')}
                {docField('warrantyEnd')}
                {docField('warrantyReading')}
              </div>
            </>
          )}

          <SectionTitle>5. Insurance details</SectionTitle>
          <div className="form-grid form-grid-3">
            {docField('insuranceNo')}
            {docField('insuranceExpiry')}
            {fileTile('insuranceDoc', 'Insurance document')}
          </div>

          {/* registration, PUC and fitness apply only to road-registered equipment */}
          {!NOT_ROAD_REGISTERED.includes(cat) && (
            <>
              <SectionTitle>6. Statutory and compliance details</SectionTitle>
              <div className="form-grid form-grid-3">
                {docField('regExpiry')}
                {fileTile('regDoc', 'Registration document')}
                <div aria-hidden="true" />
                {docField('pucNo')}
                {docField('pollutionExpiry')}
                {fileTile('pucDoc', 'PUC document')}
                {docField('fitnessCert')}
                {docField('fitnessExpiry')}
                {fileTile('fitnessDoc', 'Fitness certificate document')}
              </div>
            </>
          )}
        </>
      )}

      {mode === 'Hired' && step === 0 && (
        <>
          <SectionTitle>1. Basic equipment details</SectionTitle>
          <div className="form-grid form-grid-3">
            <FormGroup label="Equipment category" required error={e.category?.message}>
              {(id, d) => (
                <Select
                  {...a11y(id, d, e.category?.message)}
                  value={categoryPick}
                  onChange={(ev) => {
                    const val = ev.target.value
                    setCategoryPick(val)
                    setValue('category', val === '__other__' ? '' : val, { shouldValidate: true })
                    setManufacturerPick('')
                    setValue('manufacturer', '')
                  }}
                >
                  <option value="">Choose a category</option>
                  {EQUIPMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__other__">+ Add a category not in the list</option>
                </Select>
              )}
            </FormGroup>
            <FormGroup label="Equipment name" required error={e.name?.message}>
              {(id, d) => <Input placeholder="e.g. Excavator EX210" {...a11y(id, d, e.name?.message)} {...register('name')} />}
            </FormGroup>
            {categoryPick === '__other__' && (
              <FormGroup label="Other category" required full>
                {(id, d) => <Input placeholder="e.g. Crawler crane" {...a11y(id, d, e.category?.message)} {...register('category')} />}
              </FormGroup>
            )}
            <FormGroup label="Hired by">{(id) => <Input id={id} value={hiredFrom} readOnly />}</FormGroup>
            {docField('owner')}
            {docField('hireRef')}
            {docField('agreementStart')}
            {docField('agreementEnd')}
          </div>
        </>
      )}

      {mode === 'Hired' && step === 1 && (
        <>
          <SectionTitle>2. Machine specifications</SectionTitle>
          <div className="form-grid form-grid-3">
            {manufacturerField}
            {docField('model')}
            {docField('mfgYear')}
            {manufacturerPick === '__other__' && (
              <FormGroup label="Other manufacturer" required full>
                {(id, d) => <Input placeholder="e.g. Escorts Kubota" {...a11y(id, d, e.manufacturer?.message)} {...register('manufacturer')} />}
              </FormGroup>
            )}
            {docField('chasisNo')}
            {docField('engineNo')}
            <FormGroup label="Registration number" required error={e.regNo?.message}>{(id, d) => <Input placeholder="e.g. TS09EX1402" {...a11y(id, d, e.regNo?.message)} {...register('regNo')} />}</FormGroup>
            {fileTile('chasisPhoto', 'Chassis / serial number photo', false, 'chasisPhoto')}
            {fileTile('enginePhoto', 'Engine number photo', false, 'enginePhoto')}
            {machinePhotoField('Equipment photo', true)}
            {docField('capacity')}
            {docField('capacityUnit')}
          </div>

          <SectionTitle>3. Meter details</SectionTitle>
          <div className="form-grid form-grid-3">
            <FormGroup label="Meter type" required error={e.meterType?.message}>
              {(id, d) => <Select {...a11y(id, d, e.meterType?.message)} {...register('meterType')}>{METER_TYPES.map((m) => <option key={m} value={m}>{METER_LABEL[m]}</option>)}</Select>}
            </FormGroup>
            {docField('meterReading')}
            {fileTile('meterPhoto', 'Meter photo', false, 'meterPhoto')}
          </div>

          <SectionTitle>4. Fuel details</SectionTitle>
          <div className="form-grid form-grid-3">
            {docField('fuelType')}
            {v.fuelType !== 'Electric' && docField('fuelNorm')}
            {v.fuelType !== 'Electric' && docField('tankCapacity')}
          </div>
        </>
      )}

      {mode === 'Hired' && step === 2 && (
        <>
          <SectionTitle>5. Insurance details</SectionTitle>
          <div className="form-grid form-grid-3">
            {docField('insuranceNo')}
            {docField('insuranceExpiry')}
            {fileTile('insuranceDoc', 'Insurance document')}
          </div>
          {!NOT_ROAD_REGISTERED.includes(cat) && (
            <>
              <SectionTitle>6. Statutory and compliance details</SectionTitle>
              <div className="form-grid form-grid-3">
                {docField('regExpiry')}
                {fileTile('regDoc', 'Registration document')}
                <div aria-hidden="true" />
                {docField('pucNo')}
                {docField('pollutionExpiry')}
                {fileTile('pucDoc', 'PUC document')}
                {docField('fitnessCert')}
                {docField('fitnessExpiry')}
                {fileTile('fitnessDoc', 'Fitness certificate document')}
              </div>
            </>
          )}
        </>
      )}

      {step === LAST && (
        <div className="detail-grid detail-grid-3">
          <KV k="Equipment ID"><strong>{shown(v.assetCode?.trim() ?? '')}</strong></KV>
          <KV k="Category"><strong>{shown(cat)}</strong></KV>
          <KV k="Equipment name"><strong>{shown(v.name)}</strong></KV>
          <KV k="Ownership type"><strong>{shown(v.ownershipType)}</strong></KV>
          <KV k="Machine photo"><strong>{photo ? 'Attached' : '—'}</strong></KV>
          <KV k="Availability"><strong>{v.availability || '—'}</strong></KV>
          {/* the same sequence as the form: identification, specifications, meter, invoice, insurance, statutory */}
          {DOC_FIELDS.filter((f) => reviewApplies(f)).flatMap((f) => [
            f.key === 'meterReading' ? <KV key="meterType" k="Meter type"><strong>{METER_LABEL[v.meterType ?? 'HMR']}</strong></KV> : null,
            <KV key={f.key} k={f.key === 'meterReading' ? `Initial meter reading (${METER_UNIT[v.meterType ?? 'HMR']})` : f.key === 'fuelNorm' ? `Fuel norm (L/${METER_UNIT[v.meterType ?? 'HMR']})` : f.label}>
              <strong>{f.kind === 'date' ? dateOut(v[f.key]) : shown(v[f.key])}</strong>
            </KV>,
            f.key === 'engineNo' ? <KV key="regNo" k="Registration number"><strong>{shown(v.regNo)}</strong></KV> : null,
          ])}
        </div>
      )}

      {formError && <div className="login-error" role="alert" style={{ marginTop: 14 }}><span>{formError}</span></div>}
      <div className="form-actions">
        <Button onClick={onDone}>Cancel</Button>
        {step > 0 && <Button onClick={() => goToStep((s) => s - 1)}>Back</Button>}
        {step < LAST
          ? <Button tone="primary" onClick={() => void next()}>Continue</Button>
          : <Button tone="primary" icon="check" onClick={() => void handleSubmit(save)()}>Register equipment</Button>}
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
  const { units, projects, saveUnitRemote, unitsLoad, unitsError } = useCore()
  // the register is split into owned and hired equipment; the wizard and the table follow the tab
  // owned and hired equipment have their own menu entries and addresses: the address decides the kind
  const location = useLocation()
  const kind: 'Owned' | 'Hired' = location.pathname === '/equipment/hired' ? 'Hired' : 'Owned'
  /** A detail row shows when the field fits the unit's ownership, fuel type and whether its category is road registered. */
  const detailApplies = (f: DocField) => {
    if (!selected) return false
    if (f.only && f.only !== (selected.ownershipType ?? 'Owned')) return false
    return true
  }
  const [selected, setSelected] = useState<EquipmentUnit | null>(null)
  const [editFor, setEditFor] = useState<EquipmentUnit | null>(null)
  const [upload, setUpload] = useState(false)
  const [adding, setAdding] = useState(false)
  // units without an ownership type are owned (the register's first kind)
  const [projectId, setProjectId] = useState('')
  const shownUnits = units.filter((u) => (u.ownershipType ?? 'Owned') === kind && (!projectId || u.projectId === projectId))
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
        type: (r.equipment_name ?? '').trim(),
        regNo: (r.reg_no ?? '').trim(),
        ownershipType: ownership ?? '',
        meterType: 'HMR',
        availability: avail ?? '',
        ...docs,
      }
      const errors = bulk.check(unitSchema, value)
      if (availRaw && !avail) errors.push(`availability must be one of: ${AVAILABILITY.join(', ')}.`)
      if (!ownership) errors.push(`ownership_type must be one of: ${OWNERSHIP.join(', ')}.`)
      for (const f of DOC_FIELDS) {
        if (f.options && docs[f.key] && !f.options.includes(docs[f.key])) errors.push(`${f.col} must be one of: ${f.options.join(', ')}.`)
      }
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
              type: value.name,
              makeModel: makeModelOf(docs.manufacturer, docs.model),
              regNo: value.regNo,
              meterType: 'HMR',
              ownershipType: value.ownershipType,
              chainageId: '',
              projectId: where?.id,
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
  const gps = (u: EquipmentUnit) => (u.lat !== null && u.lng !== null && u.lastPing ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : null)
  const txt = (v?: string) => v || '—'
  const dateOf = (v?: string) => (v ? fmtDate(v) : '—')

  // Registration takes over the whole screen, like the New project page; Cancel or Back returns to the register.
  if (adding) {
    return (
      <div>
        <PageHead crumb="Company equipment register" title={kind === 'Owned' ? 'Register owned equipment' : 'Register hired equipment'} desc="Fields marked with * are required. Add one equipment unit to the company register."
          actions={<Button icon="chevL" onClick={() => setAdding(false)}>Back to equipment register</Button>} />
        <Card title="Equipment details">
          <AddUnitForm mode={kind} onDone={() => setAdding(false)} />
        </Card>
      </div>
    )
  }

  return (
    <div ref={ref}>
      <PageHead crumb={kind === 'Owned' ? 'Company equipment register' : 'Hired equipment'} title={kind === 'Owned' ? 'Company equipment register' : 'Hired equipment'} desc={kind === 'Owned' ? "Equipment the company owns." : "Equipment held on hire from vendors."}
        actions={<>
          <Can privilege={MANAGE.masters}>
            <Button icon="upload" onClick={() => setUpload(true)}>Bulk upload</Button>
            <Button tone="primary" icon="plus" onClick={() => setAdding(true)}>{kind === 'Owned' ? 'Add owned equipment' : 'Add hired equipment'}</Button>
          </Can>
        </>} />
      {unitsLoad === 'error' && <div className="login-error" role="alert" style={{ marginBottom: 16 }}><span>The equipment units could not be read: {unitsError} The register is empty until the server answers.</span></div>}
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="grid stats">
        <StatTile label="Available" value={count('Available')} icon="checkc" tone="green" />
        <StatTile label="In use" value={count('In use')} icon="activity" tone="blue" />
        <StatTile label="Under maintenance" value={count('Under maintenance')} icon="wrench" tone="gold" />
        <StatTile label="Breakdown" value={count('Breakdown')} icon="breakdown" tone="rose" />
      </div>
      <TablePanel title="Registered units" subtitle="Registration is maintained by P&M. Filter by availability using the chips; pick more than one to combine. Search by asset code, name, type or registration number." rows={shownUnits} rowKey={(u) => u.id}
        columns={[
          { header: 'S No', kind: 'c-id', cell: (u) => shownUnits.indexOf(u) + 1, csv: (u) => String(shownUnits.indexOf(u) + 1) },
          { header: 'Category', kind: 'c-sub', cell: (u) => <strong>{u.type || u.name}</strong>, csv: (u) => u.type || u.name || '' },
          { header: 'Made', kind: 'c-more', cell: (u) => u.makeModel, csv: (u) => u.makeModel },
          { header: 'Model', kind: 'c-more', cell: (u) => u.model || '—', csv: (u) => u.model ?? '' },
          { header: 'Capacity / size', kind: 'c-more', cell: (u) => capacityText(u) || '—', csv: capacityText },
          { header: 'Company Code', kind: 'c-amt', cell: (u) => u.assetCode, csv: (u) => u.assetCode },
          ...(kind === 'Hired'
            ? [
                { header: 'Hired by', kind: 'c-more' as const, cell: (u: EquipmentUnit) => u.hiredFrom || '—', csv: (u: EquipmentUnit) => u.hiredFrom ?? '' },
                { header: 'Hire status', kind: 'c-more' as const, cell: (u: EquipmentUnit) => <StatusBadge tone={hireActive(u) ? 'approved' : 'draft'}>{HIRE_STATUS(u)}</StatusBadge>, csv: (u: EquipmentUnit) => HIRE_STATUS(u) },
              ]
            : [{ header: 'Registered by', kind: 'c-more' as const, cell: (u: EquipmentUnit) => u.hiredFrom || '—', csv: (u: EquipmentUnit) => u.hiredFrom ?? '' }]),
        ]}
        searchText={(u) => `${u.assetCode} ${u.name ?? ''} ${u.type} ${u.makeModel} ${u.regNo}`} statusOf={(u) => u.availability}
        action={(u) => <Button size="sm" onClick={() => setSelected(u)}>Details</Button>}
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
          ...DOC_FIELDS.map((f) => ({ key: f.col, label: f.label, required: f.required && !f.only, example: f.example, hint: f.options ? f.options.join(', ') : f.hint })),
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
            <KV k="Ownership"><strong>{txt(selected.ownershipType)}</strong></KV>
            {selected.ownershipType === 'Hired' && <KV k="Hire status"><strong>{HIRE_STATUS(selected)}</strong></KV>}
            {/* the same sequence as the registration form */}
            {DOC_FIELDS.filter((f) => detailApplies(f)).flatMap((f) => [
              f.key === 'meterReading' ? <KV key="meterType" k="Meter type"><strong>{txt(selected.meterType)}</strong></KV> : null,
              <KV key={f.key} k={f.key === 'meterReading' ? `Initial meter reading (${selected.meterType === 'Odometer' ? 'km' : 'h'})` : f.key === 'fuelNorm' ? `Fuel norm (L/${selected.meterType === 'Odometer' ? 'km' : 'h'})` : f.label}>
                <strong>{f.kind === 'date' ? dateOf(selected[f.key]) : txt(selected[f.key])}</strong>
              </KV>,
              f.key === 'engineNo' ? <KV key="regNo" k="Registration number"><strong>{txt(selected.regNo)}</strong></KV> : null,
            ])}
            <KV k="Location"><strong>{gps(selected) ?? 'No fix'}</strong></KV>
            <KV k="Last fix"><strong>{selected.lastPing ? fmtDateTime(selected.lastPing) : '—'}</strong></KV>
          </div>
          <h3 style={{ margin: '18px 0 8px' }}>Photo and documents</h3>
          <UnitFiles unit={selected} />
          <div className="form-actions">
            {selected.rowVersion !== undefined && <Can privilege={MANAGE.masters}><Button onClick={() => { setEditFor(selected); setSelected(null) }}>Edit</Button></Can>}
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
        </>}
      </Modal>
      {editFor && <EditUnitDialog unit={editFor} onClose={() => setEditFor(null)} />}
    </div>
  )
}
