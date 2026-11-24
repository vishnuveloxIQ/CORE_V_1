import { format } from 'date-fns'
import { create } from 'zustand'
import { useAuth } from '@/modules/auth'
import { ApiError, errorText } from '@/shared/lib/api'
import { createProject, fromRecord, listProjects, updateChainageRange, updateProject, type ProjectDetails } from '../api/projects'
import * as parts from '../api/projectParts'
import type { ZoneDraft } from '../api/projectParts'
import * as masters from '../api/masters'
import * as mat from '../api/materials'
import * as eq from '../api/equipment'
import * as unitApi from '../api/units'
import * as uomApi from '../api/uoms'
import * as plans from '../api/planLines'
import * as pol from '../api/policies'
import { mirrorOvertime } from '../api/otPolicies'
import { mirrorLeave } from '../api/leavePolicies'
import type { SiteDetails, StoreDetails } from '../api/masters'
import * as org from '../api/organisation'
import * as files from '../api/files'
import * as offer from '../api/offerLetter'
import type { OfferLetterRevision } from '../api/offerLetter'
import * as appr from '../api/approvals'
import * as grv from '../api/grievances'
import * as tkt from '../api/tickets'
import * as usr from '../api/users'
import * as stk from '../api/stock'
import * as acc from '../api/access'
import { notify } from '@/shared/lib/toast'
import type {
  ApprovalChain, ApprovalRequest, CompanyProfile, Department, LogoChange, EquipmentAssignment, EquipmentUnit, GeoZone, Grievance, GrievanceStatus,
  CustomPolicyDef, CustomPolicyVersion, CustomValue, Material, MatrixVersion, CoreUser, OfferLetterFile, PeoplePlanLine, MaterialPlanLine, PlanLine, PolicyData, PolicyKey, PolicyVersion, Project, Role, Site,
  StockRow, Store, Ticket, ChainageMarker, GeoZoneType, Milestone, Holiday, HolidayPolicy, ShiftPolicy, CashLimitRow,
} from '../types'

/**
 * CORE data read from the API. Every change is saved through the API first and the store then holds the server's
 * answer; nothing is changed in the browser only. The server writes the audit row (PRD §4), read on the audit page.
 * Master data and rules are versioned, never overwritten.
 */
interface CoreState {
  company: CompanyProfile
  policies: PolicyVersion[]
  customPolicies: CustomPolicyDef[]
  customVersions: CustomPolicyVersion[]
  projects: Project[]
  sites: Site[]
  stores: Store[]
  materials: Material[]
  stock: StockRow[]
  planLines: PlanLine[]
  peoplePlan: PeoplePlanLine[]
  materialPlan: MaterialPlanLine[]
  units: EquipmentUnit[]
  assignments: EquipmentAssignment[]
  users: CoreUser[]
  chains: ApprovalChain[]
  requests: ApprovalRequest[]
  grievances: Grievance[]
  tickets: Ticket[]
  departments: Department[]
  roles: Role[]

  /** whether the policies were read from GET /policies: 'none' until then; writes go to the API only after that */
  policiesSource: 'none' | 'api'
  policiesLoad: 'idle' | 'loading' | 'ready' | 'error'
  policiesError: string
  /** API policy id per policy key */
  policyIds: Partial<Record<PolicyKey, string>>
  /** reads /policies and /policy-versions; a key the API has no versions for has none */
  loadPolicies: () => Promise<void>
  /** saves a new version to the API (POST, then publish). Refused (ApiError NOT_SAVED) until policies were read from the API. */
  savePolicyVersion: <K extends PolicyKey>(key: K, effectiveFrom: string, reason: string, data: PolicyData[K]) => Promise<void>
  customSource: 'none' | 'api'
  /** reads /custom-policies, their fields and versions */
  loadCustomPolicies: () => Promise<void>
  /** creates an admin-defined policy with its fields and first version on the API; returns the new id. Refused until custom policies were read from the API. Throws ApiError. */
  createCustomPolicyRemote: (def: Pick<CustomPolicyDef, 'name' | 'description' | 'fields'>, first: { effectiveFrom: string; reason: string; values: Record<string, CustomValue> }) => Promise<string>
  addCustomVersionRemote: (policyId: string, effectiveFrom: string, reason: string, values: Record<string, CustomValue>) => Promise<void>
  /** DELETE /custom-policies/{id}: removes the policy with its fields and versions, then drops it from the lists */
  deleteCustomPolicyRemote: (policyId: string) => Promise<void>
  /** whether the project list was read from GET /projects: 'none' until then */
  projectsSource: 'none' | 'api'
  projectsLoad: 'idle' | 'loading' | 'ready' | 'error'
  projectsError: string
  /** reads GET /projects and replaces the project list */
  loadProjects: () => Promise<void>
  /** POST /projects; throws ApiError */
  createProjectRemote: (v: ProjectDetails, idempotencyKey?: string) => Promise<Project>
  /** PATCH /projects/{id} with the row version last read; throws ApiError (VERSION_CONFLICT when stale) */
  updateProjectRemote: (id: string, v: ProjectDetails, idempotencyKey?: string) => Promise<Project>
  /** PATCH /projects/{id} with chainageStartKm and chainageEndKm and the row version; VERSION_CONFLICT re-reads the projects. Throws ApiError. */
  saveChainageRangeRemote: (id: string, startKm: number, endKm: number, idempotencyKey?: string) => Promise<void>
  /** per project: whether its milestones, WBS, markers, zones and locations were read from the API */
  partsLoad: Record<string, 'loading' | 'ready' | 'error'>
  partsError: Record<string, string>
  /** reads the project's parts from the API (no-op for a project not read from the API) */
  loadProjectParts: (projectId: string) => Promise<void>
  /** reads the geo-fence zones of every project in the company with one call (GET /geo-zones); a failed read keeps the zones held */
  loadAllZones: () => Promise<void>
  /** The actions below write to the API, for a project read from it only (else ApiError NOT_SAVED). They throw ApiError. */
  saveMilestone: (projectId: string, m: Omit<Milestone, 'id' | 'rowVersion'>, id?: string) => Promise<void>
  removeMilestone: (projectId: string, id: string) => Promise<void>
  addWbsNode: (projectId: string, n: parts.WbsDraft) => Promise<void>
  removeWbsNode: (projectId: string, id: string) => Promise<void>
  /** PATCH /wbs-nodes/{id} for a server item (needs its row version); renames follow the markers that use the code */
  editWbsNode: (projectId: string, id: string, n: parts.WbsDraft) => Promise<void>
  /** returns the markers that could not be saved, with the reason */
  addMarkers: (projectId: string, list: { km: number; label: string; wbsCode: string }[]) => Promise<string[]>
  removeMarker: (projectId: string, id: string) => Promise<void>
  /** PATCH /chainage-markers/{id} for a server marker (needs its row version) */
  editMarker: (projectId: string, id: string, m: { km: number; label: string; wbsCode: string }) => Promise<void>
  saveZoneDraft: (projectId: string, z: ZoneDraft & { type: GeoZoneType }, zoneId?: string, idempotencyKey?: string) => Promise<GeoZone>
  removeZone: (projectId: string, zoneId: string) => Promise<void>
  /** locations and stores read from the API */
  sitesLoad: 'idle' | 'loading' | 'ready' | 'error'
  sitesError: string
  storesLoad: 'idle' | 'loading' | 'ready' | 'error'
  storesError: string
  /** GET /locations: replaces the locations and sets each API project's locationIds */
  loadSites: () => Promise<void>
  /** GET /stores and GET /chainage-markers: replaces the stores and fills every API project's markers */
  loadStores: () => Promise<void>
  createSiteRemote: (projectId: string, v: SiteDetails, idempotencyKey?: string) => Promise<Site>
  updateSiteRemote: (id: string, v: SiteDetails, idempotencyKey?: string) => Promise<Site>
  createStoreRemote: (v: StoreDetails, idempotencyKey?: string) => Promise<Store>
  updateStoreRemote: (id: string, v: StoreDetails, idempotencyKey?: string) => Promise<Store>
  /** materials, equipment types, assignments and plan lines read from the API */
  materialsSource: 'none' | 'api'
  materialsLoad: 'idle' | 'loading' | 'ready' | 'error'
  materialsError: string
  planSource: 'none' | 'api'
  planLoad: 'idle' | 'loading' | 'ready' | 'error'
  planError: string
  equipmentTypes: eq.EquipmentTypeRecord[]
  /** units of measure from GET /uoms (read only); a failed read leaves the list empty and sets uomsError */
  uoms: uomApi.UomRecord[]
  uomsError: string
  /** GET /uoms: replaces the units of measure. Load it before materials and plan lines, which show the unit's code. */
  loadUoms: () => Promise<void>
  /** GET /materials: replaces the materials (the unit text comes from the uoms list) */
  loadMaterials: () => Promise<void>
  /** GET /equipment-types, /equipment-assignments and /plan-lines: replaces the equipment, people and material plans */
  loadPlanning: () => Promise<void>
  /** POST or PATCH /materials, by whether the material already has a row version */
  saveMaterialRemote: (m: Material, idempotencyKey?: string) => Promise<Material>
  /** whether the stock rows were read from GET /stock-levels: 'none' until then */
  stockSource: 'none' | 'api'
  stockLoad: 'idle' | 'loading' | 'ready' | 'error'
  stockError: string
  /** GET /stock-levels: replaces the stock. Call after stores and materials are read, since rows use their server ids */
  loadStock: () => Promise<void>
  /** whether the units were read from GET /equipment-units: a failed read leaves the register empty and sets unitsError */
  unitsLoad: 'idle' | 'loading' | 'ready' | 'error'
  unitsError: string
  /** GET /equipment-units: replaces the units with the server rows */
  loadUnits: () => Promise<void>
  /** POST /equipment-units when the unit has no row version, else PATCH with it; the saved unit replaces the one in the list */
  saveUnitRemote: (u: EquipmentUnit, idempotencyKey?: string) => Promise<EquipmentUnit>
  /**
   * Uploads the chosen machine photo and photo/document files of a saved unit (POST /files + PUT /files/{id}/content,
   * owner equipment_unit), then PATCHes photoFileId and documents. A file that fails is named in `failed`; the unit stays.
   */
  attachUnitFiles: (u: EquipmentUnit, chosen: unitApi.UnitUploads) => Promise<{ unit: EquipmentUnit; failed: string[] }>
  saveEquipmentPlanRemote: (l: PlanLine, idempotencyKey?: string) => Promise<PlanLine>
  savePeoplePlanRemote: (l: PeoplePlanLine, idempotencyKey?: string) => Promise<PeoplePlanLine>
  saveMaterialPlanRemote: (l: MaterialPlanLine, idempotencyKey?: string) => Promise<MaterialPlanLine>
  /** the API cannot delete a plan line: this cancels it (PATCH status cancelled) and drops it from the screen */
  cancelPlanRemote: (kind: plans.PlanKind, id: string) => Promise<void>
  /** POST /equipment-types, or PATCH with the row version when the type is already on the server */
  saveEquipmentTypeRemote: (t: eq.EquipmentTypeDraft & { id?: string; rowVersion?: number }, idempotencyKey?: string) => Promise<eq.EquipmentTypeRecord>
  /** POST /equipment-assignments: one row per project and equipment type */
  assignEquipmentRemote: (a: { projectId: string; equipmentType: string; qty: number }, idempotencyKey?: string) => Promise<void>
  /** DELETE /equipment-assignments/{id} */
  unassignEquipmentRemote: (id: string) => Promise<void>
  usersLoad: 'idle' | 'loading' | 'ready' | 'error'
  usersError: string
  /** total users on the server (meta.total of GET /users); 0 until read */
  usersTotal: number
  /** reads the first page of GET /users. Server users replace the local rows with the same id or login id; users with non-UUID ids (not on the server) stay */
  loadUsers: () => Promise<void>
  /**
   * Deactivates (POST /access/users/{id}/suspensions) or reactivates (restores the open suspension) a server user;
   * the status shown follows the server's answer. Throws ApiError.
   */
  setUserActiveRemote: (id: string, active: boolean, reason: string) => Promise<void>
  /**
   * POST /users. The saved user is added to the list; the temporary password is returned to the caller to show once
   * and is never kept in the store. Throws ApiError (409 USER_DUPLICATE_LOGIN for a login id in use).
   */
  createUserRemote: (loginId: string, d: usr.UserDraft, idempotencyKey?: string) => Promise<{ id: string; loginId: string; temporaryPassword: string }>
  /** PATCH /users/{id} with the row version last read; VERSION_CONFLICT re-reads the users. Throws ApiError. */
  updateUserRemote: (id: string, d: usr.UserDraft, idempotencyKey?: string) => Promise<void>
  /** POST /users/{id}/password-reset. Returns the temporary password to show once (never kept). Throws ApiError. */
  resetUserPasswordRemote: (id: string, idempotencyKey?: string) => Promise<string>
  /** company profile, departments, roles and the offer letter read from the API */
  orgLoad: 'idle' | 'loading' | 'ready' | 'error'
  orgError: string
  /** the offer letter revision history, newest first (GET /offer-letter/revisions); empty when the read fails */
  offerLetterRevisions: OfferLetterRevision[]
  offerLetterRevisionsError: string
  /** GET /offer-letter/revisions (needs organisation.manage). A failed read leaves the list empty and sets the error. */
  loadOfferLetterRevisions: () => Promise<void>
  /** GET /organisation/company-profile, /departments, /positions and /document-templates; each one that fails leaves its list as it was */
  loadOrganisation: (force?: boolean) => Promise<void>
  /** PUT /organisation/company-profile; throws ApiError */
  /** saves the profile; a logo change (new file or removal) is applied in the same save, never before it */
  updateCompanyRemote: (c: Omit<CompanyProfile, 'logo' | 'offerLetter' | 'id' | 'code' | 'rowVersion'>, idempotencyKey?: string, logo?: LogoChange) => Promise<void>
  /** POST /files and /document-templates (PATCH when a format exists); throws ApiError */
  setOfferLetterRemote: (f: Pick<OfferLetterFile, 'fileName' | 'mimeType' | 'size' | 'dataUrl'>, idempotencyKey?: string) => Promise<void>
  /** POST or PATCH /organisation/departments; throws ApiError */
  saveDepartmentRemote: (d: Department, idempotencyKey?: string) => Promise<Department>
  /** POST or PATCH /organisation/positions; throws ApiError */
  saveRoleRemote: (r: Role, idempotencyKey?: string) => Promise<Role>
  /** holiday and shift rows read from /organisation/holidays and /organisation/shifts; the holidays and shifts of the latest version come from them. When a read fails, the version keeps the rows it had */
  calendarSource: 'none' | 'api'
  calendarLoad: 'idle' | 'loading' | 'ready' | 'error'
  calendarError: string
  holidayRows: org.HolidayRow[]
  shiftRows: org.ShiftRow[]
  loadCalendarRows: () => Promise<void>
  /** creates, updates and deletes holiday rows of baseYear so they match the form; reloads the rows. Throws ApiError */
  saveHolidayRowsRemote: (baseYear: number, data: HolidayPolicy) => Promise<void>
  /** creates, updates and deactivates shift rows so the active shifts match the form; reloads the rows. Throws ApiError */
  saveShiftRowsRemote: (data: ShiftPolicy) => Promise<void>
  /** GET /approval-chains, /matrix-versions, /matrix-levels: replaces the chains */
  loadChains: () => Promise<void>
  /** cash limit rows read from the API */
  cashLimits: CashLimitRow[]
  /** GET /cash-limit-rows: replaces the cash limit rows */
  loadCashLimits: () => Promise<void>
  /** POST or PATCH /cash-limit-rows, by whether the row already has a row version */
  saveCashLimitRemote: (r: CashLimitRow, idempotencyKey?: string) => Promise<void>
  /** DELETE /cash-limit-rows/{id} */
  removeCashLimitRemote: (id: string) => Promise<void>
  /** server rule rows of a published company rules version (GET /policy-rules), read for the acknowledge control */
  policyRulesByVersion: Record<string, pol.PolicyRuleRecord[]>
  loadPolicyRules: (policyVersionId: string) => Promise<void>
  /** rule ids the signed-in user has acknowledged (GET /policy-rules/acknowledgements, plus acknowledgements made since) */
  ackedRuleIds: string[]
  /** reads the signed-in user's acknowledgements; a failed read keeps the current list */
  loadAcknowledgements: () => Promise<void>
  /** POST /policy-rules/{id}/acknowledge */
  acknowledgeRuleRemote: (ruleId: string) => Promise<void>
  /** POST /approval-requests, then reloads the list; returns the server request code */
  raiseRequestRemote: (body: appr.RaiseBody, idempotencyKey?: string) => Promise<string>
  /** GET /approval-requests: replaces the requests (history is read per request with loadRequestActions) */
  loadRequests: () => Promise<void>
  /** GET /approval-requests/{id}/actions: fills the request history; no-op for a request not read from the API */
  loadRequestActions: (id: string) => Promise<void>
  /** GET /grievances: replaces the grievances */
  loadGrievances: () => Promise<void>
  /** GET /tickets: replaces the tickets */
  loadTickets: () => Promise<void>
  approvalsLoad: 'idle' | 'loading' | 'ready' | 'error'
  grievancesLoad: 'idle' | 'loading' | 'ready' | 'error'
  ticketsLoad: 'idle' | 'loading' | 'ready' | 'error'
  /** POST /matrix-versions with its levels, then publish, then re-reads the chains. Only for a chain read from the API. Throws ApiError. */
  addChainVersion: (chainId: string, v: Omit<MatrixVersion, 'version' | 'updatedAt' | 'updatedBy'>) => Promise<void>
  /** POST /approval-chains (one per project; company: one), each with its first published version; re-reads the chains and returns the first new id. Throws ApiError. */
  addChain: (c: Omit<ApprovalChain, 'id' | 'versions'>, v: Omit<MatrixVersion, 'version' | 'updatedAt' | 'updatedBy'>) => Promise<string>
  /**
   * POST /approval-requests/{id}/actions (approve or reject) with the row version last read; the server's answer
   * replaces the request and its history is re-read. VERSION_CONFLICT re-reads the requests. Throws ApiError.
   * `decision` carries the approver's choice (store or vendor, local or Head Office hire), at most 100 characters.
   */
  decide: (id: string, action: 'Approved' | 'Rejected', comment: string, idempotencyKey?: string, decision?: string) => Promise<void>
  /** POST /approval-requests/{id}/actions with 'clarify' (approver asks the raiser) or 'respond' (raiser answers); comment required. Throws ApiError. */
  clarifyRemote: (id: string, action: 'clarify' | 'respond', comment: string, idempotencyKey?: string) => Promise<void>
  /** POST /approval-requests/{id}/publish: an approved job opening, published to a server location. Throws ApiError. */
  publishJobRemote: (id: string, locationId: string, idempotencyKey?: string) => Promise<void>
  /** PATCH /grievances/{id} with the status, visit date and optional note (max 2000); VERSION_CONFLICT re-reads the grievances. Throws ApiError. */
  updateVisit: (id: string, to: GrievanceStatus, visitDate?: string, idempotencyKey?: string, note?: string) => Promise<void>
  /** POST /tickets; the saved ticket is added to the list and its code returned. Throws ApiError. */
  addTicket: (t: Omit<Ticket, 'id' | 'code' | 'status' | 'createdAt' | 'raisedById'>, idempotencyKey?: string) => Promise<string>
}

/** The signed-in user's login id, as the audit log and the workflow name them. 'You' when nobody is signed in. */
const me = () => useAuth.getState().user || 'You'
/** An empty company profile: the fields are filled from GET /organisation/company-profile. */
const EMPTY_COMPANY: CompanyProfile = {
  legalName: '', tradeName: '', cin: '', gstin: '', pan: '', tan: '', addressLine1: '', addressLine2: '', city: '', state: '', pin: '', country: '',
  contactName: '', contactEmail: '', contactPhone: '', website: '', logo: '', offerLetter: null,
}
/** Local date-time without zone, e.g. "2026-11-06T09:15:00". */
export const nowISO = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")

/** Next sequential id for a prefix, e.g. nextId('P', projects) → "P-104". */
export const nextId = (prefix: string, list: { id: string }[]) => {
  const max = list.reduce((m, x) => {
    const n = Number(x.id.split('-').pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${max + 1}`
}

/** Next display code for a prefix, read from `code`, e.g. nextCode('P', projects) → "P-104". */
export const nextCode = (prefix: string, list: readonly object[]) => {
  const max = list.reduce<number>((m, x) => {
    const code = 'code' in x && typeof x.code === 'string' ? x.code : ''
    const n = Number(code.split('-').pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${max + 1}`
}

/** Login ID format (handoff core_user.login_id): 3–6 letters or digits, then 4 digits, e.g. VELOX1234. */
export const LOGIN_ID_RE = /^[A-Za-z0-9]{3,6}\d{4}$/

/**
 * Next free login ID for a company prefix, e.g. VELOX1188 → VELOX1189. Without a prefix it keeps the stem the
 * existing users share.
 */
export const nextLoginId = (users: readonly { loginId: string }[], prefix?: string) => {
  const stem = prefix || users[0]?.loginId.match(/^(.*?)\d{4}$/)?.[1] || 'VELOX'
  const max = users.reduce((m, u) => {
    const n = Number(u.loginId.slice(-4))
    return u.loginId.toUpperCase().startsWith(stem.toUpperCase()) && Number.isFinite(n) && n > m ? n : m
  }, 1000)
  return `${stem}${String(max + 1).padStart(4, '0')}`
}

/** New uuid. Uses crypto.randomUUID where available (secure contexts only), else a v4 fallback for plain-http LAN use. */
export const newId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  )
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]

/** A project read from the API carries its row version; a project created on this device does not. */
export const isRemote = (p: Project | undefined): p is Project => p?.rowVersion !== undefined

/**
 * The range the server stores (PATCH /projects/{id}) is shown as saved, even when markers fall outside it (the
 * screen warns). With no saved range, it is widened to cover the markers.
 */
function rangeFor(ch: Project['chainage'], markers: ChainageMarker[]) {
  if (ch.rangeSaved || !markers.length) return { startKm: ch.startKm, endKm: ch.endKm }
  const lo = markers[0].km
  const hi = markers[markers.length - 1].km
  const unset = !(ch.endKm > ch.startKm)
  return { startKm: unset ? lo : Math.min(ch.startKm, lo), endKm: unset ? Math.max(hi, lo + 1) : Math.max(ch.endKm, hi) }
}

/** The live offer letter template: the newest revision if the server holds more than one. */
const latestOfferTemplate = (list: files.DocumentTemplateRecord[]) =>
  list
    .filter((x) => x.code === files.OFFER_LETTER_CODE && x.status !== 'retired')
    .sort((a, b) => b.revision - a.revision)[0]

/** A blob as a data URL, the form the logo is shown in. */
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => bad(r.error)
    r.readAsDataURL(b)
  })

export const useCore = create<CoreState>()((set, get) => {
  /** The project, which must have been read from the API: a change to anything else is refused, never kept locally. */
  const need = (projectId: string) => {
    const p = get().projects.find((x) => x.id === projectId)
    if (!p) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found. Reload the page.')
    if (!isRemote(p)) throw notSaved('This project is not stored on the server')
    return p
  }
  /** A list that was not read from the API cannot be changed: the change would exist in this browser only. */
  const needSource = (source: 'none' | 'api', what: string) => {
    if (source !== 'api') throw notSaved(`${what} were not read from the server`)
  }
  const writeLevels = async (versionId: string, v: Pick<MatrixVersion, 'levels'>) => {
    for (const [i, l] of v.levels.entries()) if (appr.asUuid(l.approverId)) await appr.createMatrixLevel(appr.levelBody(versionId, l, i + 1))
  }
  /** version, its levels, then publish (the server only routes requests through published versions) */
  const pushVersion = async (chainId: string, v: Pick<MatrixVersion, 'levels' | 'effectiveFrom' | 'reason'>) => {
    const ver = await appr.createMatrixVersion({ chainId, effectiveFrom: v.effectiveFrom, reason: v.reason || undefined })
    await writeLevels(ver.id, v)
    await appr.publishMatrixVersion(ver.id, ver.rowVersion)
  }
  /** one chain per project (company: one), each with its first version; returns the new chain ids */
  const pushChain = async (c: Omit<ApprovalChain, 'id' | 'versions'>, v: Pick<MatrixVersion, 'levels' | 'effectiveFrom' | 'reason'>) => {
    const targets = c.scopeType === 'Company' ? [undefined] : c.scopeIds.filter((x) => appr.asUuid(x))
    if (!targets.length) throw notSaved('The chosen projects are not stored on the server')
    const ids: string[] = []
    for (const projectId of targets) {
      const rec = await appr.createChain({
        scopeType: projectId ? 'project' : 'company', projectId, requestType: c.requestType, module: c.module, name: c.name, timeoutHours: c.timeoutHours, isActive: c.isActive,
      })
      ids.push(rec.id)
      await pushVersion(rec.id, v)
    }
    return ids
  }
  const patchProject = (projectId: string, fn: (p: Project) => Project) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? fn(p) : p)) }))

  return {
    company: EMPTY_COMPANY,
    policies: [],
    customPolicies: [],
    customVersions: [],
    policiesSource: 'none',
    policiesLoad: 'idle',
    policiesError: '',
    policyIds: {},
    customSource: 'none',
    projects: [],
    sites: [],
    stores: [],
    materials: [],
    stock: [],
    planLines: [],
    peoplePlan: [],
    materialPlan: [],
    units: [],
    unitsLoad: 'idle',
    unitsError: '',
    assignments: [],
    cashLimits: [],
    policyRulesByVersion: {},
    ackedRuleIds: [],
    users: [],
    chains: [],
    requests: [],
    grievances: [],
    tickets: [],
    departments: [],
    roles: [],
    orgLoad: 'idle',
    orgError: '',
    offerLetterRevisions: [],
    offerLetterRevisionsError: '',
    calendarSource: 'none',
    calendarLoad: 'idle',
    calendarError: '',
    holidayRows: [],
    shiftRows: [],

    loadPolicies: async () => {
      set({ policiesLoad: 'loading', policiesError: '' })
      try {
        const [rows, versions] = await Promise.all([pol.listPolicies(), pol.listPolicyVersions()])
        const policyIds: Partial<Record<PolicyKey, string>> = {}
        const remote: PolicyVersion[] = []
        for (const r of rows) {
          if (!pol.isPolicyKeyCode(r.code)) continue
          policyIds[r.code] = r.id
          // only published versions count: a draft left by an interrupted save is not in force
          for (const v of versions) if (v.policyId === r.id && v.publishedAt) remote.push(pol.policyVersionFrom(r.code, v))
        }
        const keys = new Set(remote.map((v) => v.key))
        set((s) => ({ policies: [...s.policies.filter((p) => !keys.has(p.key)), ...remote], policyIds, policiesSource: 'api', policiesLoad: 'ready' }))
      } catch (err) {
        set({ policiesLoad: 'error', policiesError: errorText(err) })
      }
    },

    savePolicyVersion: async (key, effectiveFrom, reason, data) => {
      needSource(get().policiesSource, 'Policies')
      const push = async (v: { effectiveFrom: string; reason: string; data: unknown }) => {
        let policyId = get().policyIds[key]
        if (!policyId) {
          policyId = (await pol.createPolicy(key)).id
          const id = policyId
          set((s) => ({ policyIds: { ...s.policyIds, [key]: id } }))
        }
        const draft = await pol.createPolicyVersion(policyId, v)
        // the rules of a version are rows of their own and can only be written before it is published
        if (key === 'rules') for (const rule of (v.data as PolicyData['rules']).rules) await pol.createPolicyRule(draft.id, rule)
        await pol.publishPolicyVersion(draft.id, draft.rowVersion)
      }
      await push({ effectiveFrom, reason, data })
      await get().loadPolicies()
      if (effectiveFrom <= nowISO().slice(0, 10)) {
        // the flat OT and leave rows follow the version in force; a failure here must not undo the saved version
        try {
          if (key === 'overtime') await mirrorOvertime(data as PolicyData['overtime'])
          if (key === 'leave') await mirrorLeave(data as PolicyData['leave'], effectiveFrom)
        } catch { /* secondary copy: the policy version above is the record */ }
      }
    },

    loadCustomPolicies: async () => {
      try {
        const [defs, fields, versions] = await Promise.all([pol.listCustomPolicies(), pol.listCustomFields(), pol.listCustomVersions()])
        set({
          customPolicies: defs.map((d) => pol.customDefFrom(d, fields)),
          customVersions: versions.map(pol.customVersionFrom),
          customSource: 'api',
        })
      } catch { /* nothing is shown from custom policies that were not read */ }
    },

    createCustomPolicyRemote: async (def, first) => {
      needSource(get().customSource, 'Custom policies')
      const row = await pol.createCustomPolicyRow({ name: def.name, description: def.description })
      // values are keyed by field id, and the API assigns the ids
      const idMap: Record<string, string> = {}
      for (const [i, f] of def.fields.entries()) idMap[f.id] = (await pol.createCustomField(row.id, f, i)).id
      const values: Record<string, CustomValue> = {}
      for (const [k, v] of Object.entries(first.values)) values[idMap[k] ?? k] = v
      await pol.createCustomVersion(row.id, { effectiveFrom: first.effectiveFrom, reason: first.reason, values })
      await get().loadCustomPolicies()
      return row.id
    },

    deleteCustomPolicyRemote: async (policyId) => {
      await pol.deleteCustomPolicy(policyId)
      set((s) => ({
        customPolicies: s.customPolicies.filter((d) => d.id !== policyId),
        customVersions: s.customVersions.filter((v) => v.policyId !== policyId),
      }))
    },

    addCustomVersionRemote: async (policyId, effectiveFrom, reason, values) => {
      needSource(get().customSource, 'Custom policies')
      await pol.createCustomVersion(policyId, { effectiveFrom, reason, values })
      await get().loadCustomPolicies()
    },

    projectsSource: 'none',
    projectsLoad: 'idle',
    projectsError: '',

    loadProjects: async () => {
      set({ projectsLoad: 'loading', projectsError: '' })
      try {
        const records = await listProjects()
        set((s) => ({
          projects: records.map((r) => fromRecord(r, s.projectsSource === 'api' ? s.projects.find((p) => p.id === r.id) : undefined)),
          projectsSource: 'api',
          projectsLoad: 'ready',
        }))
      } catch (err) {
        set({ projectsLoad: 'error', projectsError: errorText(err) })
      }
    },

    createProjectRemote: async (v, key) => {
      const project = fromRecord(await createProject(v, key))
      set((s) => ({ projects: upsert(s.projects, project) }))
      return project
    },

    updateProjectRemote: async (id, v, key) => {
      const prev = get().projects.find((p) => p.id === id)
      if (!prev?.rowVersion) throw new ApiError(409, 'NOT_SAVED', 'This project is not stored on the server. Reload the list and try again.')
      const project = fromRecord(await updateProject(id, prev.rowVersion, v, key), prev)
      set((s) => ({ projects: upsert(s.projects, project) }))
      return project
    },

    saveChainageRangeRemote: async (id, startKm, endKm, key) => {
      const prev = get().projects.find((p) => p.id === id)
      if (prev?.rowVersion === undefined) throw notSaved('This project is not stored on the server')
      try {
        const project = fromRecord(await updateChainageRange(id, prev.rowVersion, startKm, endKm, key), prev)
        set((s) => ({ projects: upsert(s.projects, project) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadProjects()
        throw err
      }
    },

    partsLoad: {},
    partsError: {},

    loadProjectParts: async (projectId) => {
      if (!isRemote(get().projects.find((p) => p.id === projectId))) return
      set((s) => ({ partsLoad: { ...s.partsLoad, [projectId]: 'loading' }, partsError: { ...s.partsError, [projectId]: '' } }))
      try {
        const [wbsRows, msRows, markerRows, zoneRows, locRows] = await Promise.all([
          parts.listWbs(projectId), parts.listMilestones(projectId), parts.listMarkers(projectId), parts.listZones(projectId), parts.listLocations(projectId),
        ])
        const wbs = wbsRows.map(parts.wbsFrom)
        const markers = markerRows.map((r) => parts.markerFrom(r, wbs)).sort((a, b) => a.km - b.km)
        const sites = locRows.map(parts.siteFrom)
        patchProject(projectId, (p) => ({
          ...p,
          wbs,
          milestones: msRows.map(parts.milestoneFrom),
          zones: zoneRows.map(parts.zoneFrom),
          chainage: { ...rangeFor(p.chainage, markers), markers },
          locationIds: sites.map((x) => x.id),
        }))
        set((s) => ({ sites: sites.reduce(upsert, s.sites), partsLoad: { ...s.partsLoad, [projectId]: 'ready' } }))
      } catch (err) {
        set((s) => ({ partsLoad: { ...s.partsLoad, [projectId]: 'error' }, partsError: { ...s.partsError, [projectId]: errorText(err) } }))
      }
    },

    loadAllZones: async () => {
      try {
        const rows = await parts.listZones()
        const byProject = new Map<string, GeoZone[]>()
        for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), parts.zoneFrom(r)])
        set((s) => ({ projects: s.projects.map((p) => (isRemote(p) ? { ...p, zones: byProject.get(p.id) ?? [] } : p)) }))
      } catch (err) { console.warn('[core] Geo-fence zones were not read from the server', errorText(err)) }
    },

    saveMilestone: async (projectId, m, id) => {
      const project = need(projectId)
      const prev = project.milestones.find((x) => x.id === id)
      if (id && prev?.rowVersion === undefined) throw notSaved('This milestone is not stored on the server')
      const saved: Milestone = parts.milestoneFrom(prev?.rowVersion ? await parts.updateMilestone(prev.id, prev.rowVersion, m) : await parts.createMilestone(projectId, m))
      patchProject(projectId, (p) => ({ ...p, milestones: prev ? p.milestones.map((x) => (x.id === saved.id ? saved : x)) : [...p.milestones, saved] }))
    },

    removeMilestone: async (projectId, id) => {
      const project = need(projectId)
      const prev = project.milestones.find((x) => x.id === id)
      if (!prev) return
      await parts.deleteMilestone(id)
      patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.filter((x) => x.id !== id) }))
    },

    addWbsNode: async (projectId, n) => {
      need(projectId)
      const node = parts.wbsFrom(await parts.createWbs(projectId, n))
      patchProject(projectId, (p) => ({ ...p, wbs: [...p.wbs, node] }))
    },

    removeWbsNode: async (projectId, id) => {
      const project = need(projectId)
      const prev = project.wbs.find((x) => x.id === id)
      if (!prev) return
      await parts.deleteWbs(id)
      patchProject(projectId, (p) => ({ ...p, wbs: p.wbs.filter((x) => x.id !== id) }))
    },

    editWbsNode: async (projectId, id, n) => {
      const project = need(projectId)
      const prev = project.wbs.find((x) => x.id === id)
      if (!prev) return
      if (prev.rowVersion === undefined) throw notSaved('This WBS item is not stored on the server')
      const next: Project['wbs'][number] = parts.wbsFrom(await parts.updateWbs(id, prev.rowVersion, n))
      // markers point at a WBS item by code, so a renamed code follows them
      patchProject(projectId, (p) => ({
        ...p,
        wbs: p.wbs.map((x) => (x.id === id ? next : x)),
        chainage: { ...p.chainage, markers: p.chainage.markers.map((m) => (m.wbsCode === prev.code ? { ...m, wbsCode: next.code } : m)) },
      }))
    },

    addMarkers: async (projectId, list) => {
      const project = need(projectId)
      const added: ChainageMarker[] = []
      const failed: string[] = []
      for (const m of list) {
        try {
          added.push(parts.markerFrom(await parts.createMarker(projectId, m, project.wbs), project.wbs))
        } catch (err) {
          if (list.length === 1) throw err
          failed.push(`${m.km} km: ${errorText(err)}`)
        }
      }
      if (added.length) {
        patchProject(projectId, (p) => ({ ...p, chainage: { ...p.chainage, markers: [...p.chainage.markers, ...added].sort((a, b) => a.km - b.km) } }))
      }
      return failed
    },

    removeMarker: async (projectId, id) => {
      const project = need(projectId)
      const prev = project.chainage.markers.find((x) => x.id === id)
      if (!prev) return
      await parts.deleteMarker(id)
      patchProject(projectId, (p) => ({ ...p, chainage: { ...p.chainage, markers: p.chainage.markers.filter((x) => x.id !== id) } }))
    },

    editMarker: async (projectId, id, m) => {
      const project = need(projectId)
      const prev = project.chainage.markers.find((x) => x.id === id)
      if (!prev) return
      if (prev.rowVersion === undefined) throw notSaved('This marker is not stored on the server')
      const next: ChainageMarker = parts.markerFrom(await parts.updateMarker(id, prev.rowVersion, m, project.wbs), project.wbs)
      patchProject(projectId, (p) => ({
        ...p,
        chainage: { ...p.chainage, markers: p.chainage.markers.map((x) => (x.id === id ? next : x)).sort((a, b) => a.km - b.km) },
      }))
    },

    saveZoneDraft: async (projectId, z, zoneId, key) => {
      const project = need(projectId)
      const prev = project.zones.find((x) => x.id === zoneId)
      if (zoneId && prev?.rowVersion === undefined) throw notSaved('This zone is not stored on the server')
      const zone = parts.zoneFrom(prev?.rowVersion ? await parts.updateZone(prev.id, prev.rowVersion, z, key) : await parts.createZone(projectId, z, key))
      patchProject(projectId, (p) => ({ ...p, zones: prev ? p.zones.map((x) => (x.id === zone.id ? zone : x)) : [...p.zones, zone] }))
      return zone
    },

    removeZone: async (projectId, zoneId) => {
      const project = need(projectId)
      const prev = project.zones.find((x) => x.id === zoneId)
      if (!prev) return
      await parts.deleteZone(zoneId)
      patchProject(projectId, (p) => ({ ...p, zones: p.zones.filter((x) => x.id !== zoneId) }))
    },

    sitesLoad: 'idle',
    sitesError: '',
    storesLoad: 'idle',
    storesError: '',

    loadSites: async () => {
      set({ sitesLoad: 'loading', sitesError: '' })
      try {
        const sites = (await masters.listAllLocations()).map(parts.siteFrom)
        set((s) => ({
          sites,
          sitesLoad: 'ready',
          // a location names its one project, so each API project's list comes from the locations
          projects: s.projects.map((p) => (isRemote(p) ? { ...p, locationIds: sites.filter((x) => x.projectId === p.id).map((x) => x.id) } : p)),
        }))
      } catch (err) {
        set({ sitesLoad: 'error', sitesError: errorText(err) })
      }
    },

    loadStores: async () => {
      set({ storesLoad: 'loading', storesError: '' })
      try {
        const [storeRows, markerRows] = await Promise.all([masters.listStores(), masters.listAllMarkers()])
        set((s) => ({
          stores: storeRows.map(masters.storeFrom),
          storesLoad: 'ready',
          projects: s.projects.map((p) => {
            if (!isRemote(p)) return p
            const markers = markerRows
              .filter((r) => r.projectId === p.id)
              .map((r) => masters.mergeMarker(r, p.chainage.markers.find((m) => m.id === r.id)))
              .sort((a, b) => a.km - b.km)
            return { ...p, chainage: { ...rangeFor(p.chainage, markers), markers } }
          }),
        }))
      } catch (err) {
        set({ storesLoad: 'error', storesError: errorText(err) })
      }
    },

    createSiteRemote: async (projectId, v, key) => {
      need(projectId)
      const site = parts.siteFrom(await masters.createLocation(projectId, v, key))
      set((s) => ({
        sites: upsert(s.sites, site),
        projects: s.projects.map((p) => (p.id === projectId ? { ...p, locationIds: [...p.locationIds, site.id] } : p)),
      }))
      return site
    },

    updateSiteRemote: async (id, v, key) => {
      const prev = get().sites.find((x) => x.id === id)
      if (prev?.rowVersion === undefined) throw new ApiError(409, 'NOT_SAVED', 'This location is not stored on the server. Reload and try again.')
      const site = parts.siteFrom(await masters.updateLocation(id, prev.rowVersion, v, key))
      set((s) => ({ sites: upsert(s.sites, site) }))
      return site
    },

    createStoreRemote: async (v, key) => {
      const store = masters.storeFrom(await masters.createStore(v, key))
      set((s) => ({ stores: upsert(s.stores, store) }))
      return store
    },

    updateStoreRemote: async (id, v, key) => {
      const prev = get().stores.find((x) => x.id === id)
      if (prev?.rowVersion === undefined) throw new ApiError(409, 'NOT_SAVED', 'This store is not stored on the server. Reload and try again.')
      const store = masters.storeFrom(await masters.updateStore(id, prev.rowVersion, v, key))
      set((s) => ({ stores: upsert(s.stores, store) }))
      return store
    },

    materialsSource: 'none',
    materialsLoad: 'idle',
    materialsError: '',
    planSource: 'none',
    planLoad: 'idle',
    planError: '',
    equipmentTypes: [],

    uoms: [],
    uomsError: '',
    loadUoms: async () => {
      set({ uomsError: '' })
      try {
        set({ uoms: await uomApi.listUoms() })
      } catch (err) {
        set({ uoms: [], uomsError: errorText(err) })
      }
    },

    loadMaterials: async () => {
      set({ materialsLoad: 'loading', materialsError: '' })
      try {
        const rows = await mat.listMaterials()
        set((s) => ({
          materials: rows.map((r) => mat.materialFrom(r, s.uoms, s.materialsSource === 'api' ? s.materials.find((x) => x.id === r.id) : undefined)),
          materialsSource: 'api',
          materialsLoad: 'ready',
        }))
      } catch (err) {
        set({ materialsLoad: 'error', materialsError: errorText(err) })
      }
    },

    loadPlanning: async () => {
      set({ planLoad: 'loading', planError: '' })
      try {
        const [types, assigned, lines] = await Promise.all([eq.listEquipmentTypes(), eq.listAssignments().catch(() => null), plans.listPlanLines()])
        const live = lines.filter((l) => l.status !== 'cancelled')
        set((s) => ({
          equipmentTypes: types,
          planLines: live.filter((l) => l.resourceKind === 'equipment').map((l) => plans.planLineFrom(l, types)),
          peoplePlan: live.filter((l) => l.resourceKind === 'people').map(plans.peopleFrom),
          materialPlan: live.filter((l) => l.resourceKind === 'material').map((l) => plans.materialPlanFrom(l, s.uoms)),
          assignments: assigned ? assigned.map((a) => eq.assignmentFrom(a, types)) : s.assignments,
          planSource: 'api',
          planLoad: 'ready',
        }))
      } catch (err) {
        set({ planLoad: 'error', planError: errorText(err) })
      }
    },

    stockSource: 'none',
    stockLoad: 'idle',
    stockError: '',

    loadStock: async () => {
      set({ stockLoad: 'loading', stockError: '' })
      try {
        const rows = await stk.listStock()
        set((s) => ({
          stock: rows.map((r) => stk.stockFrom(r, s.stockSource === 'api' ? s.stock.find((x) => x.id === r.id) : undefined)),
          stockSource: 'api',
          stockLoad: 'ready',
        }))
      } catch (err) {
        // a failed read leaves the stock list as it was
        set({ stockLoad: 'error', stockError: errorText(err) })
      }
    },

    loadUnits: async () => {
      set({ unitsLoad: 'loading', unitsError: '' })
      try {
        const rows = await unitApi.listUnits()
        set({ units: rows.map(unitApi.unitFrom), unitsLoad: 'ready' })
      } catch (err) {
        // no sample units: a failed read leaves the register empty and says why
        set({ units: [], unitsLoad: 'error', unitsError: errorText(err) })
      }
    },

    saveUnitRemote: async (u, key) => {
      const existing = get().equipmentTypes.find((t) => t.code === eq.COMPANY_EQUIPMENT_TYPE.code)
      const type = existing ?? await (async () => {
        const rec = await eq.createEquipmentType({ code: eq.COMPANY_EQUIPMENT_TYPE.code, name: eq.COMPANY_EQUIPMENT_TYPE.name, active: true })
        set((s) => ({ equipmentTypes: upsert(s.equipmentTypes, rec) }))
        return rec
      })()
      const typeId = type.id
      // a chainage marker is not a location: the link is sent only when a server location has that id, else the unit is unassigned (null)
      const locationId = get().sites.some((s) => s.id === u.chainageId) ? u.chainageId : null
      const draft = unitApi.draftFrom(u, typeId, locationId)
      const rec = u.rowVersion !== undefined
        ? await unitApi.updateUnit(u.id, u.rowVersion, draft, key)
        : await unitApi.createUnit(draft, key)
      const saved = unitApi.unitFrom(rec)
      set((s) => ({ units: upsert(s.units, saved) }))
      return saved
    },

    attachUnitFiles: async (u, chosen) => {
      const failed: string[] = []
      const upload = async (label: string, f: unitApi.UnitUpload): Promise<string | null> => {
        const type = files.uploadTypeOf(f.name, f.blob.type)
        const problem = files.uploadProblem(f.name, f.blob.type, f.blob.size)
        if (problem) { failed.push(`${label}: ${problem}`); return null }
        try {
          const row = await files.createFile({ ownerType: 'equipment_unit', ownerId: u.id, fileName: f.name, contentType: type, sizeBytes: f.blob.size, objectKey: `equipment-units/${u.id}/${newId()}/${f.name}`, visibility: 'company' })
          await files.uploadFileContent(row.id, f.blob, type)
          return row.id
        } catch (err) {
          failed.push(`${label}: ${errorText(err)}`)
          return null
        }
      }
      let photoFileId = u.photoFileId
      if (chosen.photo) photoFileId = (await upload('Machine photo', chosen.photo)) ?? photoFileId
      const documents = { ...u.documents }
      let changed = photoFileId !== u.photoFileId
      for (const k of unitApi.UNIT_DOC_KEYS) {
        const f = chosen.docs?.[k]
        if (!f) continue
        const id = await upload(unitApi.UNIT_DOC_LABEL[k], f)
        if (id) { documents[k] = id; changed = true }
      }
      if (!changed || u.rowVersion === undefined) return { unit: u, failed }
      try {
        const rec = await unitApi.updateUnit(u.id, u.rowVersion, { photoFileId: photoFileId ?? null, documents: unitApi.docsOrNull(documents) })
        const saved = unitApi.unitFrom(rec)
        set((s) => ({ units: upsert(s.units, saved) }))
        return { unit: saved, failed }
      } catch (err) {
        failed.push(`Linking the uploaded files to the unit: ${errorText(err)}`)
        return { unit: u, failed }
      }
    },

    saveMaterialRemote: async (m, key) => {
      needSource(get().materialsSource, 'Materials')
      const prev = get().materials.find((x) => x.id === m.id)
      // the unit text is looked up in GET /uoms; a unit the server does not list is refused before the call
      const uomId = uomApi.requireUomId(get().uoms, m.uom)
      const details: mat.MaterialDetails = { code: m.code, name: m.name, category: m.category, uom: m.uom, hsn: m.hsn, reorderLevel: m.reorderLevel, storeIds: m.storeIds, status: m.status }
      const id = m.id
      const rec = prev?.rowVersion !== undefined
        ? await mat.updateMaterial(id, prev.rowVersion, details, uomId, key)
        : await mat.createMaterial(details, uomId, key)
      const saved = mat.materialFrom(rec, get().uoms, m)
      set((s) => ({ materials: prev ? s.materials.map((x) => (x.id === id ? saved : x)) : upsert(s.materials, saved) }))
      return saved
    },

    saveEquipmentPlanRemote: async (l, key) => {
      needSource(get().planSource, 'Plan lines')
      // a planner can name a type the company has not used before ("Other"): it is created on the server from its name
      if (!eq.typeIdByName(get().equipmentTypes, l.equipmentType) && l.equipmentType.trim()) {
        const name = l.equipmentType.trim()
        const taken = new Set(get().equipmentTypes.map((t) => t.code.toUpperCase()))
        const base = (name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'EQUIPMENT').replace(/^[^A-Z]/, 'T$&').slice(0, 30)
        let code = base
        for (let n = 2; taken.has(code); n += 1) code = `${base}_${n}`
        const created = await eq.createEquipmentType({ code, name, active: true })
        set((s) => ({ equipmentTypes: upsert(s.equipmentTypes, created) }))
      }
      const body = plans.planLineBody(l, get().equipmentTypes)
      if (!body) throw new ApiError(400, 'TYPE_UNKNOWN', `"${l.equipmentType}" is not an equipment type on the server yet.`)
      const prev = get().planLines.find((x) => x.id === l.id)
      const rec = prev?.rowVersion !== undefined ? await plans.updatePlanLine(l.id, prev.rowVersion, body, key) : await plans.createPlanLine(l.projectId, 'equipment', body, key)
      const saved = plans.planLineFrom(rec, get().equipmentTypes)
      set((s) => ({ planLines: prev ? s.planLines.map((x) => (x.id === l.id ? saved : x)) : upsert(s.planLines, saved) }))
      return saved
    },

    savePeoplePlanRemote: async (l, key) => {
      needSource(get().planSource, 'Plan lines')
      const body = plans.peopleBody(l)
      const prev = get().peoplePlan.find((x) => x.id === l.id)
      const rec = prev?.rowVersion !== undefined ? await plans.updatePlanLine(l.id, prev.rowVersion, body, key) : await plans.createPlanLine(l.projectId, 'people', body, key)
      const saved = plans.peopleFrom(rec)
      set((s) => ({ peoplePlan: prev ? s.peoplePlan.map((x) => (x.id === l.id ? saved : x)) : upsert(s.peoplePlan, saved) }))
      return saved
    },

    saveMaterialPlanRemote: async (l, key) => {
      needSource(get().planSource, 'Plan lines')
      // the line's unit is looked up in GET /uoms; with no unit text the material's unit is sent
      const uomId = l.uom.trim() ? uomApi.requireUomId(get().uoms, l.uom) : get().materials.find((m) => m.id === l.materialId)?.uomId
      const body = plans.materialPlanBody(l, uomId)
      const prev = get().materialPlan.find((x) => x.id === l.id)
      const rec = prev?.rowVersion !== undefined ? await plans.updatePlanLine(l.id, prev.rowVersion, body, key) : await plans.createPlanLine(l.projectId, 'material', body, key)
      const saved = plans.materialPlanFrom(rec, get().uoms)
      set((s) => ({ materialPlan: prev ? s.materialPlan.map((x) => (x.id === l.id ? saved : x)) : upsert(s.materialPlan, saved) }))
      return saved
    },

    cancelPlanRemote: async (kind, id) => {
      const s0 = get()
      const prev = kind === 'equipment' ? s0.planLines.find((x) => x.id === id) : kind === 'people' ? s0.peoplePlan.find((x) => x.id === id) : s0.materialPlan.find((x) => x.id === id)
      if (!prev) return
      if (prev.rowVersion === undefined) throw notSaved('This plan line is not stored on the server')
      try {
        await plans.cancelPlanLine(id, prev.rowVersion)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadPlanning()
        throw rowConflict(err, 'plan lines')
      }
      if (kind === 'equipment') set((s) => ({ planLines: s.planLines.filter((x) => x.id !== id) }))
      else if (kind === 'people') set((s) => ({ peoplePlan: s.peoplePlan.filter((x) => x.id !== id) }))
      else set((s) => ({ materialPlan: s.materialPlan.filter((x) => x.id !== id) }))
    },

    saveEquipmentTypeRemote: async (t, key) => {
      const { id, rowVersion, code, ...draft } = t
      const rec = id && rowVersion !== undefined
        ? await eq.updateEquipmentType(id, rowVersion, draft, key)
        : await eq.createEquipmentType({ code, ...draft }, key)
      set((s) => ({ equipmentTypes: upsert(s.equipmentTypes, rec) }))
      return rec
    },

    assignEquipmentRemote: async (a, key) => {
      const typeId = eq.typeIdByName(get().equipmentTypes, a.equipmentType)
      if (!typeId) throw new ApiError(400, 'TYPE_UNKNOWN', `"${a.equipmentType}" is not an equipment type on the server yet.`)
      const rec = await eq.createAssignment({ projectId: a.projectId, equipmentTypeId: typeId, qty: a.qty }, key)
      const entry = eq.assignmentFrom(rec, get().equipmentTypes)
      set((s) => ({ assignments: upsert(s.assignments, entry) }))
    },

    unassignEquipmentRemote: async (id) => {
      await eq.deleteAssignment(id)
      set((s) => ({ assignments: s.assignments.filter((x) => x.id !== id) }))
    },

    usersLoad: 'idle',
    usersError: '',
    usersTotal: 0,

    loadUsers: async () => {
      set({ usersLoad: 'loading', usersError: '' })
      try {
        const page = await usr.listUsers({ limit: 100, offset: 0 })
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        set((s) => {
          const served = page.rows.map((r) => usr.userFrom(r, s.users.find((x) => x.id === r.id) ?? s.users.find((x) => x.loginId.toLowerCase() === r.loginId.toLowerCase())))
          const servedIds = new Set(served.map((u) => u.id))
          const servedLogins = new Set(served.map((u) => u.loginId.toLowerCase()))
          // users not on the server keep working: approval chains and requests still name them
          const local = s.users.filter((u) => !uuid.test(u.id) && !servedIds.has(u.id) && !servedLogins.has(u.loginId.toLowerCase()))
          return { users: [...served, ...local], usersLoad: 'ready', usersTotal: page.total }
        })
      } catch (err) {
        set({ usersLoad: 'error', usersError: errorText(err) })
      }
    },

    setUserActiveRemote: async (id, active, reason) => {
      if (!appr.asUuid(id)) throw notSaved('This user is not stored on the server')
      const res = await acc.setUserSuspended(id, !active, reason)
      // a reactivation with no open suspension (res null) leaves the user active on the server
      const suspended = !!res && res.restoredAt === null
      set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, status: suspended ? 'Inactive' : 'Active' } : u)) }))
    },

    createUserRemote: async (loginId, d, key) => {
      const { temporaryPassword, ...rec } = await usr.createUser(loginId, d, key)
      const user = usr.userFrom(rec)
      set((s) => ({ users: upsert(s.users, user), usersTotal: s.usersTotal + 1 }))
      return { id: user.id, loginId: user.loginId, temporaryPassword }
    },

    updateUserRemote: async (id, d, key) => {
      const prev = get().users.find((u) => u.id === id)
      if (prev?.rowVersion === undefined) throw notSaved('This user is not stored on the server')
      try {
        const user = usr.userFrom(await usr.updateUser(id, prev.rowVersion, d, key), prev)
        set((s) => ({ users: upsert(s.users, user) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadUsers()
        throw err
      }
    },

    resetUserPasswordRemote: async (id, key) => {
      if (!appr.asUuid(id)) throw notSaved('This user is not stored on the server')
      const { temporaryPassword } = await usr.resetUserPassword(id, key)
      set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, mustChangePassword: true } : u)) }))
      return temporaryPassword
    },

    loadOrganisation: async (force) => {
      if (!force && (get().orgLoad === 'loading' || get().orgLoad === 'ready')) return
      set({ orgLoad: 'loading', orgError: '' })
      const [company, depts, positions, templates] = await Promise.allSettled([
        org.getCompanyProfile(), org.listDepartments(), org.listPositions(), files.listDocumentTemplates(),
      ])
      // a company profile not set up yet answers 404: there is nothing to read, so the profile stays empty
      const failed = [company, depts, positions, templates].filter((r) => r.status === 'rejected' && !(r === company && r.reason instanceof ApiError && r.reason.status === 404)) as PromiseRejectedResult[]
      set((s) => {
        const next: Partial<CoreState> = {}
        if (company.status === 'fulfilled') next.company = org.companyFrom(company.value, s.company)
        if (depts.status === 'fulfilled') next.departments = depts.value.map(org.departmentFrom)
        if (positions.status === 'fulfilled') next.roles = positions.value.map((r) => org.roleFrom(r, s.roles.find((x) => x.id === r.id)))
        if (templates.status === 'fulfilled') {
          const t = latestOfferTemplate(templates.value)
          if (t) next.company = { ...(next.company ?? s.company), offerLetter: files.offerLetterFrom(t, s.company.offerLetter, me()) }
        }
        return { ...next, orgLoad: failed.length ? 'error' : 'ready', orgError: failed.length ? errorText(failed[0].reason) : '' }
      })
      // the offer letter bytes come from /files/{id}/content, read through the template's file id
      const tpl = templates.status === 'fulfilled' ? latestOfferTemplate(templates.value) : undefined
      if (tpl?.fileId) {
        const fileId = tpl.fileId
        files.fetchFileContent(fileId)
          .then(blobToDataUrl)
          .then((dataUrl) => set((s) => {
            const cur = s.company.offerLetter
            if (!cur || cur.fileId !== fileId) return {}
            return { company: { ...s.company, offerLetter: { ...cur, dataUrl } } }
          }))
          .catch(() => undefined)
      }
      // the logo bytes come from /files/{id}/content; a profile without a logo clears the local copy
      if (company.status === 'fulfilled') {
        const logoId = company.value.logoFileId
        if (logoId) {
          files.fetchFileContent(logoId)
            .then(blobToDataUrl)
            .then((logo) => set((s) => ({ company: { ...s.company, logo } })))
            .catch(() => undefined)
        } else {
          set((s) => ({ company: { ...s.company, logo: '' } }))
        }
      }
    },

    updateCompanyRemote: async (c, key, logo) => {
      const before = get().company
      /** Stores a chosen logo as a file row owned by the profile; the profile must exist to own it. */
      const storeLogo = async (profileId: string, chosen: { file: File; dataUrl: string }) => {
        const blob = await (await fetch(chosen.dataUrl)).blob()
        const row = await files.createFile({ ownerType: 'company_profile', ownerId: profileId, fileName: chosen.file.name, contentType: chosen.file.type, sizeBytes: blob.size, objectKey: `logos/${newId()}/${chosen.file.name}`, visibility: 'company' })
        await files.uploadFileContent(row.id, blob, chosen.file.type)
        return row.id
      }
      const newLogo = logo && logo !== 'remove' ? logo : undefined
      // the file goes up first when the profile already exists, so one save carries the details and the logo link
      let logoFileId = logo === 'remove' ? null : before.logoFileId ?? null
      if (newLogo && before.id) logoFileId = await storeLogo(before.id, newLogo)
      let saved = await org.putCompanyProfile(c, { ...before, logoFileId }, key)
      if (newLogo && !before.id) {
        // a first save creates the profile; only then can the logo file belong to it
        saved = await org.putCompanyProfile(c, { code: saved.code, rowVersion: saved.rowVersion, logoFileId: await storeLogo(saved.id, newLogo) })
      }
      set((s) => ({ company: { ...org.companyFrom(saved, s.company), ...(logo ? { logo: newLogo ? newLogo.dataUrl : '' } : {}) } }))
    },

    setOfferLetterRemote: async (f, key) => {
      const company = get().company
      const prev = company.offerLetter
      // the offer letter is a tenant-wide format, not part of the company profile, so it needs no saved profile
      const file = await files.createFile({ ownerType: 'offer_letter', ownerId: files.OFFER_LETTER_OWNER_ID, fileName: f.fileName, contentType: f.mimeType, sizeBytes: f.size, objectKey: `offer-letters/${newId()}/${f.fileName}`, visibility: 'company' }, key)
      // the bytes go to /files/{id}/content; the template points at this file row
      await files.uploadFileContent(file.id, await (await fetch(f.dataUrl)).blob(), f.mimeType)
      const revision = (prev?.revision ?? 0) + 1
      const body = { name: 'Offer letter format', templateVersion: `r${revision}`, status: 'active' as const, fileId: file.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.size, revision }
      // reuse the server's template when the store has not read it yet, so the format is replaced rather than duplicated
      const current = prev?.templateId && prev.templateRowVersion !== undefined
        ? { id: prev.templateId, rowVersion: prev.templateRowVersion }
        : await files.listDocumentTemplates().then((list) => {
          const x = latestOfferTemplate(list)
          return x ? { id: x.id, rowVersion: x.rowVersion } : null
        })
      const t = current
        ? await files.updateDocumentTemplate(current.id, current.rowVersion, body)
        : await files.createDocumentTemplate({ code: files.OFFER_LETTER_CODE, ...body })
      const offerLetter: OfferLetterFile = { ...files.offerLetterFrom(t, null, me()), dataUrl: f.dataUrl, updatedBy: me() }
      set((s) => ({ company: { ...s.company, offerLetter } }))
      // the upload is kept as the next revision. The replacement has already succeeded, so a failed revision write
      // is reported in the history section and does not fail the save.
      try {
        await offer.addOfferLetterRevision({ fileId: file.id, fileName: f.fileName, mimeType: f.mimeType, size: f.size }, key ? `${key}:revision` : undefined)
      } catch (err) {
        set({ offerLetterRevisionsError: errorText(err) })
        return
      }
      await get().loadOfferLetterRevisions()
    },

    loadOfferLetterRevisions: async () => {
      try {
        set({ offerLetterRevisions: await offer.listOfferLetterRevisions(), offerLetterRevisionsError: '' })
      } catch (err) {
        set({ offerLetterRevisions: [], offerLetterRevisionsError: errorText(err) })
      }
    },

    saveDepartmentRemote: async (d, key) => {
      const prev = get().departments.find((x) => x.id === d.id)
      if (prev && prev.rowVersion === undefined) throw new ApiError(409, 'NOT_SAVED', 'This department is not stored on the server. Reload and try again.')
      const saved = org.departmentFrom(prev ? await org.updateDepartment(d, prev.rowVersion!, key) : await org.createDepartment(d, key))
      set((s) => ({ departments: upsert(s.departments, saved) }))
      return saved
    },

    saveRoleRemote: async (r, key) => {
      const prev = get().roles.find((x) => x.id === r.id)
      if (prev && prev.rowVersion === undefined) throw new ApiError(409, 'NOT_SAVED', 'This role is not stored on the server. Reload and try again.')
      if (!org.isUuid(r.departmentId) || get().departments.find((x) => x.id === r.departmentId)?.rowVersion === undefined) throw new ApiError(409, 'NOT_SAVED', 'This role’s department is not stored on the server. Choose a department read from the server.')
      const saved = org.roleFrom(prev ? await org.updatePosition(r, prev.rowVersion!, key) : await org.createPosition(r, key), r)
      set((s) => ({ roles: upsert(s.roles, saved) }))
      return saved
    },

    loadCalendarRows: async () => {
      set({ calendarLoad: 'loading', calendarError: '' })
      try {
        const [hol, shifts] = await Promise.all([org.listHolidays(), org.listShifts()])
        const holidayRows = hol.map(org.holidayFrom)
        const shiftRows = shifts.map(org.shiftFrom)
        set((s) => ({ holidayRows, shiftRows, calendarSource: 'api', calendarLoad: 'ready', policies: rowsIntoPolicies(s.policies, holidayRows, shiftRows) }))
      } catch (err) {
        set({ calendarLoad: 'error', calendarError: errorText(err) })
      }
    },

    saveHolidayRowsRemote: async (baseYear, data) => {
      if (get().calendarSource !== 'api') throw new ApiError(409, 'NOT_SAVED', 'Holidays were not read from the server. Reload and try again.')
      const before = get().holidayRows
      const wanted: { h: Holiday; scopeProjectId: string | null }[] = [
        ...data.holidays.map((h) => ({ h, scopeProjectId: null })),
        ...data.variants.flatMap((v) => v.holidays.map((h) => ({ h, scopeProjectId: v.scopeId }))),
      ]
      // a project created on this device has no id the API knows: refuse before any row is written
      if (wanted.some((w) => w.scopeProjectId && !org.isUuid(w.scopeProjectId))) throw new ApiError(409, 'NOT_SAVED', 'A project in this calendar is not stored on the server. Choose a project read from the server.')
      // only the rows of the year being edited can be removed; other years are not in the form
      const inYear = before.filter((r) => r.date.startsWith(String(baseYear)))
      const kept = new Set(wanted.map((w) => w.h.rowId).filter(Boolean))
      try {
        for (const r of inYear) if (!kept.has(r.id)) await org.deleteHoliday(r.id)
        for (const { h, scopeProjectId } of wanted) {
          const prev = h.rowId ? before.find((r) => r.id === h.rowId) : undefined
          if (!prev) { await org.createHoliday(h, scopeProjectId, newId()); continue }
          const changed = prev.name !== h.name || prev.date !== h.date || (prev.endDate ?? '') !== (h.endDate ?? '') || prev.type !== h.type || prev.scopeProjectId !== scopeProjectId
          if (changed) await org.updateHoliday(prev.id, prev.rowVersion, h, scopeProjectId, newId())
        }
      } catch (err) {
        await get().loadCalendarRows()
        throw rowConflict(err, 'holidays')
      }
      await get().loadCalendarRows()
    },

    saveShiftRowsRemote: async (data) => {
      if (get().calendarSource !== 'api') throw new ApiError(409, 'NOT_SAVED', 'Shift timings were not read from the server. Reload and try again.')
      // an absent list is not "no shifts": refuse rather than deactivate every shift
      const timings = data.timings
      if (!timings) throw new ApiError(400, 'NO_TIMINGS', 'Define the shift timings before saving.')
      const before = get().shiftRows
      const kept = new Set(timings.map((t) => t.rowId).filter(Boolean))
      const stop = before.filter((r) => r.isActive && !kept.has(r.id))
      const reused = new Set<string>()
      // TODO(backend): shift notes and week-off pattern are not in the shift rows API, so they are not saved here
      try {
        // a shift is deactivated, never deleted
        for (const r of stop) await org.updateShift(r.id, r.rowVersion, { isActive: false }, newId())
        for (const t of timings) {
          const prev = t.rowId ? before.find((r) => r.id === t.rowId) : undefined
          if (prev) {
            if (prev.name !== t.name || prev.start !== t.start || prev.end !== t.end) await org.updateShift(prev.id, prev.rowVersion, t, newId())
            continue
          }
          // a shift that was deactivated earlier under the same name is switched back on rather than created again
          const old = before.find((r) => !r.isActive && !reused.has(r.id) && r.name.trim().toLowerCase() === t.name.trim().toLowerCase())
          if (old) {
            reused.add(old.id)
            await org.updateShift(old.id, old.rowVersion, { ...t, isActive: true }, newId())
          } else {
            await org.createShift(t, newId())
          }
        }
      } catch (err) {
        await get().loadCalendarRows()
        throw rowConflict(err, 'shift timings')
      }
      await get().loadCalendarRows()
    },

    approvalsLoad: 'idle',
    grievancesLoad: 'idle',
    ticketsLoad: 'idle',

    loadChains: async () => {
      try {
        const [c, v, l] = await Promise.all([appr.listChains(), appr.listMatrixVersions(), appr.listMatrixLevels()])
        set((s) => ({ chains: appr.chainsFrom(c, v, l, s.chains) }))
      } catch (err) { console.warn('[core] Approval chains were not read from the server; the data is not shown', errorText(err)) }
    },

    loadCashLimits: async () => {
      try {
        const rows = await appr.listCashLimitRows()
        set({ cashLimits: rows.map((r) => appr.cashLimitFrom(r)) })
      } catch (err) { console.warn('[core] cash limit rows were not read from the server; the data is not shown', errorText(err)) }
    },

    saveCashLimitRemote: async (r, key) => {
      const body = appr.cashLimitBody(r)
      const rec = r.id && r.rowVersion !== undefined
        ? await appr.updateCashLimitRow(r.id, r.rowVersion, body, key)
        : await appr.createCashLimitRow(body, key)
      const saved = appr.cashLimitFrom(rec)
      set((s) => ({ cashLimits: s.cashLimits.some((x) => x.id === saved.id) ? s.cashLimits.map((x) => (x.id === saved.id ? saved : x)) : [...s.cashLimits, saved] }))
    },

    removeCashLimitRemote: async (id) => {
      await appr.deleteCashLimitRow(id)
      set((s) => ({ cashLimits: s.cashLimits.filter((x) => x.id !== id) }))
    },

    loadPolicyRules: async (versionId) => {
      // versions created on this device have no server id, so there is nothing to read
      if (!appr.asUuid(versionId)) return
      try {
        const rows = await pol.listPolicyRules(versionId)
        set((s) => ({ policyRulesByVersion: { ...s.policyRulesByVersion, [versionId]: rows } }))
      } catch (err) { console.warn('[core] Policy rules were not read from the server', errorText(err)) }
    },

    loadAcknowledgements: async () => {
      try {
        const acks = await pol.listMyAcknowledgements()
        set({ ackedRuleIds: acks.map((a) => a.ruleId) })
      } catch (err) { console.warn('[core] Policy acknowledgements were not read from the server', errorText(err)) }
    },

    acknowledgeRuleRemote: async (ruleId) => {
      await pol.acknowledgePolicyRule(ruleId)
      set((s) => ({ ackedRuleIds: s.ackedRuleIds.includes(ruleId) ? s.ackedRuleIds : [...s.ackedRuleIds, ruleId] }))
    },

    raiseRequestRemote: async (body, key) => {
      const rec = await appr.raiseRequest(body, key)
      await get().loadRequests()
      return rec.code
    },

    loadRequests: async () => {
      set({ approvalsLoad: 'loading' })
      try {
        const rows = await appr.listRequests()
        set((s) => ({ requests: rows.map((r) => appr.requestFrom(r, s.requests.find((x) => x.id === r.id))), approvalsLoad: 'ready' }))
      } catch (err) { set({ approvalsLoad: 'error' }); console.warn('[core] Approval requests were not read from the server; the data is not shown', errorText(err)) }
    },

    loadRequestActions: async (id) => {
      const req = get().requests.find((r) => r.id === id)
      if (req?.rowVersion === undefined) return
      try {
        const nameOf = (uid: string | null) => get().users.find((u) => u.id === uid)?.name ?? (uid ? 'Approver' : '')
        const history = (await appr.listRequestActions(id)).map((a) => appr.actionFrom(a, nameOf))
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, history: [{ level: 0, by: r.raisedBy, action: 'Raised' as const, at: r.raisedAt, comment: '' }, ...history] } : r)) }))
      } catch (err) { notify(`The request history was not read from the server: ${errorText(err)}`, 6000) }
    },

    loadGrievances: async () => {
      set({ grievancesLoad: 'loading' })
      try {
        const rows = await grv.listGrievances()
        set((s) => ({ grievances: rows.map((r) => grv.grievanceFrom(r, s.grievances.find((x) => x.id === r.id))), grievancesLoad: 'ready' }))
      } catch (err) { set({ grievancesLoad: 'error' }); console.warn('[core] Grievances were not read from the server; the data is not shown', errorText(err)) }
    },

    loadTickets: async () => {
      set({ ticketsLoad: 'loading' })
      try {
        set({ tickets: (await tkt.listTickets()).map(tkt.ticketFrom), ticketsLoad: 'ready' })
      } catch (err) { set({ ticketsLoad: 'error' }); console.warn('[core] Tickets were not read from the server; the data is not shown', errorText(err)) }
    },

    addChainVersion: async (chainId, v) => {
      const chain = get().chains.find((c) => c.id === chainId)
      if (chain?.rowVersion === undefined) throw notSaved('This approval chain is not stored on the server')
      try {
        await pushVersion(chainId, v)
      } finally {
        // a version written part-way (e.g. a level refused) is re-read too, so the screen shows what the server holds
        await get().loadChains()
      }
    },

    addChain: async (c, v) => {
      try {
        const [first] = await pushChain(c, v)
        return first
      } finally {
        await get().loadChains()
      }
    },

    decide: async (id, action, comment, key, decision) => {
      const req = get().requests.find((r) => r.id === id)
      if (!req) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Request not found. Reload the page.')
      if (req.rowVersion === undefined) throw notSaved('This request is not stored on the server')
      const amountApproved = action === 'Approved' && req.payload.kind === 'payment' ? req.payload.amount : undefined
      try {
        const rec = await appr.actOnRequest(id, req.rowVersion, { action: appr.toApiAction(action), comment: comment || undefined, amountApproved, decision: decision ? decision.slice(0, 100) : undefined }, key)
        set((s) => ({ requests: s.requests.map((x) => (x.id === id ? appr.requestFrom(rec, x) : x)) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadRequests()
        throw err
      }
      await get().loadRequestActions(id)
    },

    clarifyRemote: async (id, action, comment, key) => {
      const req = get().requests.find((r) => r.id === id)
      if (!req) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Request not found. Reload the page.')
      if (req.rowVersion === undefined) throw notSaved('This request is not stored on the server')
      try {
        const rec = await appr.actOnRequest(id, req.rowVersion, { action, comment }, key)
        set((s) => ({ requests: s.requests.map((x) => (x.id === id ? appr.requestFrom(rec, x) : x)) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadRequests()
        throw err
      }
      await get().loadRequestActions(id)
    },

    publishJobRemote: async (id, locationId, key) => {
      const req = get().requests.find((r) => r.id === id)
      if (!req) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Request not found. Reload the page.')
      if (req.rowVersion === undefined) throw notSaved('This request is not stored on the server')
      try {
        const rec = await appr.publishJobOpening(id, req.rowVersion, locationId, key)
        set((s) => ({ requests: s.requests.map((x) => (x.id === id ? appr.requestFrom(rec, x) : x)) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadRequests()
        throw err
      }
    },

    updateVisit: async (id, to, visitDate, key, note) => {
      const g = get().grievances.find((x) => x.id === id)
      if (!g) throw new ApiError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance not found. Reload the page.')
      if (g.rowVersion === undefined) throw notSaved('This grievance is not stored on the server')
      const date = visitDate ?? g.visitDate
      try {
        const text = note?.trim()
        const rec = await grv.updateGrievance(id, g.rowVersion, { status: grv.toApiStatus(to), visitStatus: grv.toApiVisit(to), visitDate: date || undefined, employeeCode: g.employeeCode ?? undefined, ...(text ? { note: text } : {}) }, key)
        // TODO(backend): the status history is not stored by the API (GET /grievances has no history); the status the
        // server now holds is shown as the next step, with the note it saved.
        set((s) => ({ grievances: s.grievances.map((x) => (x.id === id ? grv.grievanceFrom(rec, { ...x, history: [...x.history, { status: grv.visitStatusOf(rec), at: nowISO(), note: rec.note ?? text ?? '' }] }) : x)) }))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') await get().loadGrievances()
        throw err
      }
    },

    addTicket: async (t, key) => {
      // TODO(backend): priority is not in the create body (the server sets it); the raiser is the signed-in user
      const rec = await tkt.createTicket({ code: nextCode('TKT', get().tickets), subject: t.subject, category: t.category, description: t.description || undefined }, key)
      const saved = tkt.ticketFrom(rec)
      set((s) => ({ tickets: upsert(s.tickets, saved) }))
      return saved.code
    },
  }
})

/** A change refused because the record was not read from the server: it is never kept in the browser instead. */
const notSaved = (what: string) => new ApiError(409, 'NOT_SAVED', `${what}, so the change was not saved. Reload the page and try again.`)

/** A version conflict means someone else changed the rows: say so, the list has been reloaded. */
const rowConflict = (err: unknown, what: string) =>
  err instanceof ApiError && err.code === 'VERSION_CONFLICT'
    ? new ApiError(409, 'VERSION_CONFLICT', `These ${what} changed on the server. The list has been reloaded: check it and save again.`)
    : err

const holidayPolicyFromRows = (rows: org.HolidayRow[], year: number): HolidayPolicy => {
  const ofYear = rows.filter((r) => r.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date))
  const toHoliday = (r: org.HolidayRow): Holiday => ({ name: r.name, date: r.date, endDate: r.endDate, type: r.type, rowId: r.id, rowVersion: r.rowVersion })
  const groups = new Map<string, HolidayPolicy['variants'][number]>()
  for (const r of ofYear) {
    if (!r.scopeProjectId) continue
    if (!groups.has(r.scopeProjectId)) groups.set(r.scopeProjectId, { scope: 'Project', scopeId: r.scopeProjectId, holidays: [] })
    groups.get(r.scopeProjectId)!.holidays.push(toHoliday(r))
  }
  return { year, holidays: ofYear.filter((r) => !r.scopeProjectId).map(toHoliday), variants: [...groups.values()] }
}

/** Active shifts only: a deactivated shift is no longer in the timings. Notes and week-off stay as they were in the version. */
const shiftPolicyFromRows = (rows: org.ShiftRow[], prev: ShiftPolicy): ShiftPolicy => {
  const timings = rows.filter((r) => r.isActive).map((r) => ({ name: r.name, start: r.start, end: r.end, rowId: r.id, rowVersion: r.rowVersion }))
  return { ...prev, shiftsPerDay: timings.length, timings }
}

/** Puts the rows into the latest holidays and shifts versions, which the policy pages show. */
const rowsIntoPolicies = (policies: PolicyVersion[], holidayRows: org.HolidayRow[], shiftRows: org.ShiftRow[]): PolicyVersion[] => {
  const latestHol = policyState(policies, 'holidays').latest
  const latestShf = policyState(policies, 'shifts').latest
  return policies.map((p) => {
    if (latestHol && p === latestHol) return { ...p, data: holidayPolicyFromRows(holidayRows, (p.data as HolidayPolicy).year) } as PolicyVersion
    if (latestShf && p === latestShf) return { ...p, data: shiftPolicyFromRows(shiftRows, p.data as ShiftPolicy) } as PolicyVersion
    return p
  })
}

export function policyState<K extends PolicyKey>(all: PolicyVersion[], key: K, today = nowISO().slice(0, 10)) {
  const versions = (all.filter((p) => p.key === key) as PolicyVersion<K>[]).sort((a, b) => a.version - b.version)
  const effective = versions.filter((v) => v.effectiveFrom <= today)
  const current = effective[effective.length - 1] ?? versions[0]
  const scheduled = versions.filter((v) => v.effectiveFrom > today)
  const latest = versions[versions.length - 1]
  return { versions, current, scheduled, latest }
}

/** Same as policyState, for one admin-defined policy. */
export function customPolicyState(all: CustomPolicyVersion[], policyId: string, today = nowISO().slice(0, 10)) {
  const versions = all.filter((v) => v.policyId === policyId).sort((a, b) => a.version - b.version)
  const effective = versions.filter((v) => v.effectiveFrom <= today)
  const current = effective[effective.length - 1] ?? versions[0]
  const scheduled = versions.filter((v) => v.effectiveFrom > today)
  return { versions, current, scheduled, latest: versions[versions.length - 1] }
}

/** The project that owns a chainage marker (markers live on Project.chainage). */
export function projectOf(projects: Project[], chainageId: string) {
  return projects.find((p) => p.chainage?.markers?.some((m) => m.id === chainageId))
}

/** Geo-fence zones belong to the project. A stable empty array keeps zustand selectors from re-rendering. */
const NO_ZONES: GeoZone[] = []
export function zonesOf(projects: Project[], projectId: string): GeoZone[] {
  return projects.find((p) => p.id === projectId)?.zones ?? NO_ZONES
}

/** The chain a request from this chainage uses: a Project chain, else the Company chain. */
export function chainFor(chains: ApprovalChain[], projects: Project[], type: ApprovalChain['requestType'], chainageId: string) {
  const projectId = projectOf(projects, chainageId)?.id
  const ofType = chains.filter((c) => c.requestType === type)
  return ofType.find((c) => c.scopeType === 'Project' && !!projectId && c.scopeIds.includes(projectId))
    ?? ofType.find((c) => c.scopeType === 'Company')
}

/**
 * The last level (1-based) a request must pass. Without an amount, that is the last level set.
 * With a Payments amount, it is the first set level whose cash limit covers the amount
 * (a level with no limit covers any amount), so later levels are not needed.
 */
export function stopLevel(levels: { approverId: string; cashLimit?: number }[], amount?: number) {
  const configured = levels.map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.approverId)
  const last = configured[configured.length - 1]?.n ?? 0
  if (amount === undefined) return last
  const hit = configured.find((x) => x.l.cashLimit === undefined || amount <= x.l.cashLimit)
  return hit?.n ?? last
}

/** Latest matrix version in force today, plus whether L1 is configured. */
export function chainState(chain: ApprovalChain, today = nowISO().slice(0, 10)) {
  const sorted = [...chain.versions].sort((a, b) => a.version - b.version)
  const inForce = sorted.filter((v) => v.effectiveFrom <= today)
  const current = inForce[inForce.length - 1] ?? sorted[0]
  return { current, latest: sorted[sorted.length - 1], ready: !!current.levels[0]?.approverId, levelsSet: current.levels.filter((l) => l.approverId).length }
}
