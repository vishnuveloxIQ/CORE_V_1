import { api } from '@/shared/lib/api'
import type { CompanyProfile, CompanyType, Department, Holiday, HolidayType, Role, ShiftTiming } from '../types'

/**
 * Organisation endpoints (/organisation/*): company profile, holidays, shifts, number series, departments and
 * positions. Departments and positions are called "Role" in the UI. Shifts and number series are never deleted.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Seed data uses ids that are not UUIDs; the API cannot reference them. */
export const isUuid = (id: string | null | undefined): id is string => !!id && UUID.test(id)
const orNull = (s: string | undefined | null) => (s && s.trim() ? s.trim() : null)
const enc = encodeURIComponent
const base = '/organisation'

// ---------- company profile ----------
export interface CompanyRecord {
  id: string; code: string; legalName: string; status: string; tradeName: string | null
  companyType: CompanyType | null
  cin: string | null; gstin: string | null; pan: string | null; tan: string | null
  addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null
  pin: string | null; country: string | null; contactName: string | null; contactEmail: string | null
  contactPhone: string | null; website: string | null; logoFileId: string | null
  settings: Record<string, number> | null; rowVersion: number
}

/** mobileCode is the code sent to a changed mobile number; the API needs it only when that number changes. */
export type CompanyDetails = Omit<CompanyProfile, 'logo' | 'offerLetter' | 'id' | 'code' | 'rowVersion'> & { mobileCode?: string }

/** Keeps the logo and offer letter already in the store: the API holds neither as a data URL. */
export const companyFrom = (r: CompanyRecord, prev: CompanyProfile): CompanyProfile => ({
  ...prev,
  id: r.id, code: r.code, rowVersion: r.rowVersion, logoFileId: r.logoFileId,
  legalName: r.legalName, tradeName: r.tradeName ?? '', companyType: r.companyType ?? '', cin: r.cin ?? '', gstin: r.gstin ?? '', pan: r.pan ?? '', tan: r.tan ?? '',
  addressLine1: r.addressLine1 ?? '', addressLine2: r.addressLine2 ?? '', city: r.city ?? '', state: r.state ?? '', pin: r.pin ?? '',
  country: r.country ?? '', contactName: r.contactName ?? '', contactEmail: r.contactEmail ?? '', contactPhone: r.contactPhone ?? '',
  website: r.website ?? '',
})

export const getCompanyProfile = () => api<CompanyRecord>('GET', `${base}/company-profile`)

/** PUT replaces the whole profile; rowVersion is sent once the profile exists. */
export const putCompanyProfile = (v: CompanyDetails, prev: Pick<CompanyProfile, 'code' | 'rowVersion' | 'logoFileId'>, idempotencyKey?: string) =>
  api<CompanyRecord>('PUT', `${base}/company-profile`, {
    idempotencyKey,
    body: {
      code: prev.code || 'COMPANY',
      status: 'active',
      legalName: v.legalName,
      tradeName: orNull(v.tradeName),
      companyType: v.companyType || null,
      ...(v.mobileCode ? { mobileCode: v.mobileCode } : {}),
      cin: orNull(v.cin), gstin: orNull(v.gstin), pan: orNull(v.pan), tan: orNull(v.tan),
      addressLine1: orNull(v.addressLine1), addressLine2: orNull(v.addressLine2),
      city: orNull(v.city), state: orNull(v.state), pin: orNull(v.pin), country: orNull(v.country),
      contactName: orNull(v.contactName), contactEmail: orNull(v.contactEmail), contactPhone: orNull(v.contactPhone),
      website: orNull(v.website),
      // the logo is a file row (/files) whose bytes are uploaded separately; a PUT keeps the link it was given
      logoFileId: prev.logoFileId ?? null,
      settings: null,
      ...(prev.rowVersion !== undefined ? { rowVersion: prev.rowVersion } : {}),
    },
  })

// ---------- holidays ----------
export interface HolidayRecord {
  id: string; holidayDate: string; endDate: string | null; name: string
  holidayType: 'national' | 'regional' | 'company' | null; isOptional: boolean; scopeProjectId: string | null; rowVersion: number
}
export type HolidayRow = Holiday & { id: string; scopeProjectId: string | null; rowVersion: number }

const HOLIDAY_FROM: Record<string, HolidayType> = { national: 'National', regional: 'Regional', company: 'Festival' }
export const holidayFrom = (r: HolidayRecord): HolidayRow => ({
  id: r.id, name: r.name, date: r.holidayDate, endDate: r.endDate ?? undefined,
  type: r.isOptional ? 'Optional' : (r.holidayType && HOLIDAY_FROM[r.holidayType]) || 'Festival',
  scopeProjectId: r.scopeProjectId, rowVersion: r.rowVersion,
})
const holidayBody = (h: Holiday, scopeProjectId?: string | null) => ({
  holidayDate: h.date,
  endDate: h.endDate || null,
  name: h.name,
  // TODO(backend): 'Festival' has no API type; it is stored as 'company'. 'Optional' is the isOptional flag.
  holidayType: h.type === 'National' ? 'national' : h.type === 'Regional' ? 'regional' : 'company',
  isOptional: h.type === 'Optional',
  scopeProjectId: isUuid(scopeProjectId) ? scopeProjectId : null,
})
export const listHolidays = () => api<HolidayRecord[]>('GET', `${base}/holidays`)
export const createHoliday = (h: Holiday, scopeProjectId?: string | null, idempotencyKey?: string) =>
  api<HolidayRecord>('POST', `${base}/holidays`, { body: holidayBody(h, scopeProjectId), idempotencyKey })
export const updateHoliday = (id: string, rowVersion: number, h: Holiday, scopeProjectId?: string | null, idempotencyKey?: string) =>
  api<HolidayRecord>('PATCH', `${base}/holidays/${enc(id)}`, { body: { ...holidayBody(h, scopeProjectId), rowVersion }, idempotencyKey })
export const deleteHoliday = (id: string) => api<{ deleted: boolean }>('DELETE', `${base}/holidays/${enc(id)}`)

// ---------- shifts ----------
export interface ShiftRecord {
  id: string; code: string; name: string; timezone: string; inTime: string; outTime: string; isActive: boolean
  weekOffDays: number[]; effectiveFrom: string; effectiveTo: string | null; rowVersion: number
}
export type ShiftRow = ShiftTiming & { id: string; code: string; rowVersion: number; isActive: boolean }
export const shiftFrom = (r: ShiftRecord): ShiftRow => ({
  id: r.id, code: r.code, name: r.name, start: r.inTime.slice(0, 5), end: r.outTime.slice(0, 5), isActive: r.isActive, rowVersion: r.rowVersion,
})
const shiftBody = (t: ShiftTiming, code?: string) => ({
  code: code || t.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || 'SHIFT',
  name: t.name,
  inTime: t.start,
  outTime: t.end,
  // TODO(backend): timezone, effectiveFrom and weekOffDays are not in the UI's shift timing; defaults are sent
  timezone: 'Asia/Kolkata',
  effectiveFrom: new Date().toISOString().slice(0, 10),
})
export const listShifts = () => api<ShiftRecord[]>('GET', `${base}/shifts`)
export const createShift = (t: ShiftTiming, idempotencyKey?: string) =>
  api<ShiftRecord>('POST', `${base}/shifts`, { body: shiftBody(t), idempotencyKey })
/** Only the fields the UI edits are patched. A shift is deactivated with isActive false, never deleted. */
export const updateShift = (id: string, rowVersion: number, t: Partial<ShiftTiming> & { isActive?: boolean }, idempotencyKey?: string) =>
  api<ShiftRecord>('PATCH', `${base}/shifts/${enc(id)}`, {
    body: {
      rowVersion,
      ...(t.name !== undefined ? { name: t.name } : {}),
      ...(t.start !== undefined ? { inTime: t.start } : {}),
      ...(t.end !== undefined ? { outTime: t.end } : {}),
      ...(t.isActive !== undefined ? { isActive: t.isActive } : {}),
    },
    idempotencyKey,
  })

// ---------- number series ----------
export interface SeriesRecord { id: string; seriesCode: string; prefix: string; yearScope: number; nextValue: number; rowVersion: number }
export const listNumberSeries = () => api<SeriesRecord[]>('GET', `${base}/number-series`)
export const createNumberSeries = (v: { seriesCode: string; prefix: string; yearScope?: number; nextValue?: number }, idempotencyKey?: string) =>
  api<SeriesRecord>('POST', `${base}/number-series`, { body: v, idempotencyKey })
export const updateNumberSeries = (id: string, rowVersion: number, v: { prefix?: string; nextValue?: number }, idempotencyKey?: string) =>
  api<SeriesRecord>('PATCH', `${base}/number-series/${enc(id)}`, { body: { ...v, rowVersion }, idempotencyKey })

// ---------- departments ----------
export interface DepartmentRecord {
  id: string; code: string; name: string; status: 'active' | 'inactive'; parentDepartmentId: string | null
  headPositionId: string | null; description: string | null; colorIndex: number | null; colorHex: string | null; rowVersion: number
}
export const departmentFrom = (r: DepartmentRecord): Department => ({
  id: r.id, code: r.code, name: r.name, parentId: r.parentDepartmentId, headRoleId: r.headPositionId,
  description: r.description ?? '', color: r.colorIndex ?? 0, colorHex: r.colorHex ?? undefined,
  status: r.status === 'inactive' ? 'Inactive' : 'Active', rowVersion: r.rowVersion,
})
const departmentBody = (d: Department) => ({
  code: d.code,
  name: d.name,
  status: d.status === 'Inactive' ? 'inactive' : 'active',
  // an id that is not a UUID is sample data the API does not know
  parentDepartmentId: isUuid(d.parentId) ? d.parentId : null,
  headPositionId: isUuid(d.headRoleId) ? d.headRoleId : null,
  description: orNull(d.description),
  colorIndex: d.color,
  colorHex: d.colorHex || null,
})
export const listDepartments = () => api<DepartmentRecord[]>('GET', `${base}/departments`)
export const createDepartment = (d: Department, idempotencyKey?: string) =>
  api<DepartmentRecord>('POST', `${base}/departments`, { body: departmentBody(d), idempotencyKey })
export const updateDepartment = (d: Department, rowVersion: number, idempotencyKey?: string) =>
  api<DepartmentRecord>('PATCH', `${base}/departments/${enc(d.id)}`, { body: { ...departmentBody(d), rowVersion }, idempotencyKey })
export const deleteDepartment = (id: string) => api<{ deleted: boolean }>('DELETE', `${base}/departments/${enc(id)}`)

// ---------- positions (roles) ----------
export interface PositionRecord {
  id: string; code: string; title: string; departmentId: string; grade: string | null; reportsToPositionId: string | null
  plannedPositions: number; description: string | null; status: 'active' | 'inactive'; rowVersion: number
}
/** `holder` is not in the API (people live in HRMS), so a role read from it has none. */
export const roleFrom = (r: PositionRecord, prev?: Role): Role => ({
  id: r.id, code: r.code, title: r.title, departmentId: r.departmentId, grade: r.grade ?? '', reportsToId: r.reportsToPositionId,
  positions: r.plannedPositions, holder: prev?.holder ?? '', description: r.description ?? '',
  status: r.status === 'inactive' ? 'Inactive' : 'Active', rowVersion: r.rowVersion,
})
const positionBody = (r: Role) => ({
  code: r.code,
  title: r.title,
  departmentId: r.departmentId,
  grade: orNull(r.grade),
  reportsToPositionId: isUuid(r.reportsToId) ? r.reportsToId : null,
  plannedPositions: r.positions,
  description: orNull(r.description),
  status: r.status === 'Inactive' ? 'inactive' : 'active',
  // TODO(backend): field holder not in API
})
export const listPositions = () => api<PositionRecord[]>('GET', `${base}/positions`)
export const createPosition = (r: Role, idempotencyKey?: string) =>
  api<PositionRecord>('POST', `${base}/positions`, { body: positionBody(r), idempotencyKey })
export const updatePosition = (r: Role, rowVersion: number, idempotencyKey?: string) =>
  api<PositionRecord>('PATCH', `${base}/positions/${enc(r.id)}`, { body: { ...positionBody(r), rowVersion }, idempotencyKey })
export const deletePosition = (id: string) => api<{ deleted: boolean }>('DELETE', `${base}/positions/${enc(id)}`)
