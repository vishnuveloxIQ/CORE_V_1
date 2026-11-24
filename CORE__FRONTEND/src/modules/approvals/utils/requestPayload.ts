import { z } from 'zod'
import type { ModuleName, RequestPayload, RequestType } from '@/modules/core-data'
import { isISODate } from '@/shared/lib/core'

/**
 * The payload a new request carries, per request type. The fields are the ones the request detail page shows for the
 * payload kind (RequestPayload), and the payload is sent as that object, so GET /approval-requests reads it back as payloadJson.
 */
export type PayloadKind = RequestPayload['kind']

export const KIND_OF: Record<RequestType, PayloadKind> = {
  'Onboarded employee list': 'onboarding',
  'Offer letter': 'offer',
  'Job opening': 'job',
  'Manpower requisition': 'mrf',
  Equipment: 'equipment',
  Material: 'material',
  'Advance payment': 'payment',
  Recruitment: 'recruitment',
  'Employee transfer': 'transfer',
  Promotion: 'promotion',
  'Bonus and incentive': 'bonus',
  'Loan and advance': 'loan',
  Payments: 'payment',
}

/** The module that raises each payload kind, offered as the default when the request type changes. */
export const MODULE_OF: Record<PayloadKind, ModuleName> = {
  onboarding: 'HRMS', offer: 'HRMS', job: 'HRMS', mrf: 'HRMS', recruitment: 'HRMS', transfer: 'HRMS', promotion: 'HRMS', bonus: 'HRMS', loan: 'HRMS',
  equipment: 'P&M', material: 'Stores', payment: 'PMS',
}

/** Kinds whose payload amount is the request amount (the Amount field). */
export const AMOUNT_KINDS: PayloadKind[] = ['payment', 'loan', 'bonus']

export const JOB_ROUTES = ['Site hires directly', 'Head Office posts and sends candidate'] as const

/** Where a picker takes its options from (server lists in the store). */
export type Source = 'materials' | 'stores' | 'uoms' | 'equipmentTypes' | 'roles' | 'sites' | 'users' | 'departments' | 'jobRoute' | 'basis' | 'yesNo'

export type PayloadField =
  | 'materialId' | 'qty' | 'uom' | 'storeId' | 'neededBy'
  | 'equipmentType' | 'from' | 'to' | 'justification'
  | 'payee' | 'purpose'
  | 'position' | 'count' | 'ctcMin' | 'ctcMax' | 'experience' | 'route' | 'postedOnHrms'
  | 'candidate' | 'ctc' | 'joining' | 'reason' | 'requiredBy'
  | 'employee' | 'empId' | 'designation' | 'fromSiteId' | 'toSiteId' | 'effective'
  | 'fromRole' | 'toRole' | 'currentCtc' | 'newCtc'
  | 'basis' | 'scope' | 'headcount' | 'period' | 'criteria' | 'tenureMonths'

/**
 * One payload field on the form. `select` must be one of the source's options; `suggest` is free text with the
 * source's names offered (people and departments are held in HRMS, so a name not in CORE is allowed).
 */
export interface FieldSpec {
  name: PayloadField
  label: string
  input: 'text' | 'textarea' | 'date' | 'money' | 'int' | 'decimal' | 'select' | 'suggest'
  source?: Source
  optional?: boolean
  full?: boolean
}

const role = (name: PayloadField, label: string): FieldSpec => ({ name, label, input: 'select', source: 'roles' })
const employee: FieldSpec[] = [
  { name: 'employee', label: 'Employee', input: 'suggest', source: 'users' },
  { name: 'empId', label: 'Employee ID', input: 'text' },
]

export const FIELDS: Record<PayloadKind, FieldSpec[]> = {
  material: [
    { name: 'materialId', label: 'Material', input: 'select', source: 'materials' },
    { name: 'qty', label: 'Quantity', input: 'decimal' },
    { name: 'uom', label: 'Unit', input: 'select', source: 'uoms' },
    { name: 'storeId', label: 'Requesting store', input: 'select', source: 'stores' },
    { name: 'neededBy', label: 'Required by', input: 'date' },
  ],
  equipment: [
    { name: 'equipmentType', label: 'Equipment type', input: 'select', source: 'equipmentTypes' },
    { name: 'qty', label: 'Quantity', input: 'int' },
    { name: 'from', label: 'Needed from', input: 'date' },
    { name: 'to', label: 'Needed to', input: 'date' },
    { name: 'justification', label: 'Justification', input: 'textarea', full: true },
  ],
  payment: [
    { name: 'payee', label: 'Payee', input: 'text' },
    { name: 'purpose', label: 'Purpose', input: 'textarea', full: true },
  ],
  recruitment: [
    role('position', 'Position'),
    { name: 'count', label: 'Headcount', input: 'int' },
  ],
  job: [
    role('position', 'Position'),
    { name: 'count', label: 'Openings', input: 'int' },
    { name: 'ctcMin', label: 'CTC from (INR a year)', input: 'money' },
    { name: 'ctcMax', label: 'CTC to (INR a year)', input: 'money' },
    { name: 'experience', label: 'Experience', input: 'text' },
    { name: 'route', label: 'Hiring route', input: 'select', source: 'jobRoute', optional: true },
    { name: 'postedOnHrms', label: 'Posted on the HRMS recruitment page', input: 'select', source: 'yesNo' },
  ],
  offer: [
    { name: 'candidate', label: 'Candidate', input: 'text' },
    role('position', 'Position'),
    { name: 'ctc', label: 'Annual CTC (INR)', input: 'money' },
    { name: 'joining', label: 'Joining date', input: 'date' },
  ],
  // the employees are a list of rows (name, position, joining), drawn by the dialog
  onboarding: [],
  mrf: [
    role('position', 'Position'),
    { name: 'count', label: 'Headcount', input: 'int' },
    { name: 'requiredBy', label: 'Required by', input: 'date' },
    { name: 'reason', label: 'Reason', input: 'textarea', full: true },
  ],
  transfer: [
    ...employee,
    role('designation', 'Designation'),
    { name: 'effective', label: 'Effective from', input: 'date' },
    { name: 'fromSiteId', label: 'From location', input: 'select', source: 'sites' },
    { name: 'toSiteId', label: 'To location', input: 'select', source: 'sites' },
    { name: 'reason', label: 'Reason', input: 'textarea', full: true },
  ],
  promotion: [
    ...employee,
    role('fromRole', 'From role'),
    role('toRole', 'To role'),
    { name: 'currentCtc', label: 'Current CTC (INR a year)', input: 'money' },
    { name: 'newCtc', label: 'New CTC (INR a year)', input: 'money' },
    { name: 'effective', label: 'Effective from', input: 'date' },
    { name: 'justification', label: 'Justification', input: 'textarea', full: true },
  ],
  bonus: [
    { name: 'basis', label: 'Bonus or incentive', input: 'select', source: 'basis' },
    { name: 'scope', label: 'Applies to', input: 'suggest', source: 'departments' },
    { name: 'headcount', label: 'Headcount', input: 'int' },
    { name: 'period', label: 'Period', input: 'text' },
    { name: 'criteria', label: 'Criteria', input: 'textarea', full: true },
  ],
  loan: [
    ...employee,
    { name: 'tenureMonths', label: 'Tenure (months)', input: 'int' },
    { name: 'purpose', label: 'Purpose', input: 'textarea', full: true },
  ],
}

const ALL_FIELDS = [...new Set(Object.values(FIELDS).flat().map((f) => f.name))]

const employeeRow = z.object({ name: z.string(), position: z.string(), joining: z.string() })
export type EmployeeRow = z.infer<typeof employeeRow>

/** Payload fields as the form holds them (text, as typed); checked per kind by payloadRules. */
export const payloadShape = {
  ...(Object.fromEntries(ALL_FIELDS.map((n) => [n, z.string()])) as Record<PayloadField, z.ZodString>),
  employees: z.array(employeeRow),
}
export type PayloadValues = Record<PayloadField, string> & { employees: EmployeeRow[] }

export const emptyPayload = (): PayloadValues => ({
  ...(Object.fromEntries(ALL_FIELDS.map((n) => [n, ''])) as Record<PayloadField, string>),
  postedOnHrms: 'false',
  basis: 'Bonus',
  employees: [{ name: '', position: '', joining: '' }],
})

const LIMIT = 200
const LONG_LIMIT = 2000

/** Required fields, numbers and dates for the request type's payload kind, with the errors on the fields. */
export function payloadRules(kind: PayloadKind, v: PayloadValues & { amount: number }, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
  for (const f of FIELDS[kind]) {
    const text = v[f.name].trim()
    if (!text) { if (!f.optional) issue([f.name], `${f.label} is required.`); continue }
    if (f.input === 'date' && !isISODate(text)) issue([f.name], 'Pick a date.')
    if (f.input === 'int' && !(/^\d+$/.test(text) && Number(text) >= 1)) issue([f.name], 'Enter a whole number of 1 or more.')
    if ((f.input === 'decimal' || f.input === 'money') && !(Number.isFinite(Number(text)) && Number(text) > 0)) issue([f.name], 'Enter a number more than 0.')
    if (f.input === 'textarea' && text.length > LONG_LIMIT) issue([f.name], `Use ${LONG_LIMIT} characters or fewer.`)
    if ((f.input === 'text' || f.input === 'suggest') && text.length > LIMIT) issue([f.name], `Use ${LIMIT} characters or fewer.`)
  }
  if (AMOUNT_KINDS.includes(kind) && !(v.amount > 0)) issue(['amount'], 'Enter the amount (more than 0).')
  if (kind === 'equipment' && isISODate(v.from) && isISODate(v.to) && v.to < v.from) issue(['to'], 'Must be on or after the from date.')
  if (kind === 'job' && Number(v.ctcMax) > 0 && Number(v.ctcMax) < Number(v.ctcMin)) issue(['ctcMax'], 'Must be at least the CTC from.')
  if (kind === 'transfer' && v.fromSiteId && v.fromSiteId === v.toSiteId) issue(['toSiteId'], 'Pick a different location.')
  if (kind === 'promotion' && v.fromRole && v.fromRole === v.toRole) issue(['toRole'], 'Pick a different role.')
  if (kind === 'onboarding') {
    if (!v.employees.length) issue(['employees'], 'Add at least one employee.')
    v.employees.forEach((e, i) => {
      if (!e.name.trim()) issue(['employees', i, 'name'], 'Name is required.')
      else if (e.name.trim().length > LIMIT) issue(['employees', i, 'name'], `Use ${LIMIT} characters or fewer.`)
      if (!e.position.trim()) issue(['employees', i, 'position'], 'Position is required.')
      if (!isISODate(e.joining)) issue(['employees', i, 'joining'], 'Pick the joining date.')
    })
  }
}

/** The payload sent with POST /approval-requests (the RequestPayload of the kind), from checked form values. */
export function buildPayload(kind: PayloadKind, v: PayloadValues & { amount: number }): RequestPayload {
  const t = (n: PayloadField) => v[n].trim()
  const n = (f: PayloadField) => Number(v[f])
  switch (kind) {
    case 'material': return { kind, materialId: t('materialId'), qty: n('qty'), uom: t('uom'), storeId: t('storeId'), neededBy: t('neededBy') }
    case 'equipment': return { kind, equipmentType: t('equipmentType'), qty: n('qty'), from: t('from'), to: t('to'), justification: t('justification') }
    case 'payment': return { kind, amount: v.amount, payee: t('payee'), purpose: t('purpose') }
    case 'recruitment': return { kind, position: t('position'), count: n('count') }
    case 'job': return {
      kind, position: t('position'), openings: n('count'), ctcMin: n('ctcMin'), ctcMax: n('ctcMax'), experience: t('experience'),
      ...(t('route') ? { route: t('route') as (typeof JOB_ROUTES)[number] } : {}), postedOnHrms: v.postedOnHrms === 'true', publishedToSite: null,
    }
    case 'offer': return { kind, candidate: t('candidate'), position: t('position'), ctc: n('ctc'), joining: t('joining') }
    case 'onboarding': return { kind, employees: v.employees.map((e) => ({ name: e.name.trim(), position: e.position.trim(), joining: e.joining })) }
    case 'mrf': return { kind, position: t('position'), count: n('count'), reason: t('reason'), requiredBy: t('requiredBy') }
    case 'transfer': return {
      kind, employee: t('employee'), empId: t('empId'), designation: t('designation'), fromSiteId: t('fromSiteId'), toSiteId: t('toSiteId'),
      effective: t('effective'), reason: t('reason'),
    }
    case 'promotion': return {
      kind, employee: t('employee'), empId: t('empId'), fromRole: t('fromRole'), toRole: t('toRole'), currentCtc: n('currentCtc'), newCtc: n('newCtc'),
      effective: t('effective'), justification: t('justification'),
    }
    case 'bonus': return { kind, basis: v.basis === 'Incentive' ? 'Incentive' : 'Bonus', scope: t('scope'), headcount: n('headcount'), amount: v.amount, period: t('period'), criteria: t('criteria') }
    case 'loan': return { kind, employee: t('employee'), empId: t('empId'), amount: v.amount, tenureMonths: n('tenureMonths'), purpose: t('purpose') }
  }
}
