/** Domain types for VeloxIQ CORE (PRD v1.0 draft). */

export type ModuleName = 'HRMS' | 'PMS' | 'Stores' | 'P&M'
export const MODULES: ModuleName[] = ['HRMS', 'PMS', 'Stores', 'P&M']

export type ScopeType = 'Company' | 'Project'

/** Base shape of every stored entity: `id` is a uuid (the key); `code` is the display code, e.g. "P-101". */
export interface Entity { id: string; code?: string; shortCode?: string }

// ---------- 3.1 Company setup ----------
/** A logo change chosen on the company profile form, applied when the profile is saved. */
export type LogoChange = { file: File; dataUrl: string } | 'remove'

export interface CompanyProfile {
  /** set once the profile has been read from or saved to the API */
  id?: string
  code?: string
  rowVersion?: number
  /** the logo's file row (/files); its bytes are read from /files/{id}/content */
  logoFileId?: string | null
  legalName: string
  tradeName: string
  cin: string
  gstin: string
  pan: string
  tan: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pin: string
  country: string
  contactName: string
  contactEmail: string
  contactPhone: string
  website: string
  /** data URL of the uploaded logo */
  logo: string
  /** the one offer letter format HRMS uses — uploaded and replaced only by the Tenant Admin */
  offerLetter: OfferLetterFile | null
}

/** Offer letter format file. There is one current file; uploading a new one replaces it. */
export interface OfferLetterFile {
  /** stable id of the stored file (file_id); a new id on every replacement */
  fileId: string
  fileName: string
  mimeType: string
  size: number
  /** data URL of the file */
  dataUrl: string
  /** counts replacements so people can tell which file is current */
  revision: number
  updatedAt: string
  updatedBy: string
  /** the document template row that holds this format on the API */
  templateId?: string
  templateRowVersion?: number
}

/** Working hours of one shift, as "HH:mm". An end before the start means the shift crosses midnight. */
export interface ShiftTiming {
  name: string; start: string; end: string
  /** API row id and row version, set on shifts read from /organisation/shifts */
  rowId?: string; rowVersion?: number
}
/** `timings` is absent on versions saved before shift timings existed. */
/** Weekly-off pattern (Shift Timings policy; a site may override it). */
export type WeekOffType = 'Every Sunday' | 'Alternate Saturdays' | 'Rotating' | 'Custom days'
export interface WeekOff { type: WeekOffType; saturdays?: '1st & 3rd' | '2nd & 4th'; days?: string }
/** `timings` and `weekOff` are absent on versions saved before they existed. */
export interface ShiftPolicy { shiftsPerDay: number; notes: string; timings?: ShiftTiming[]; weekOff?: WeekOff }

export type HolidayType = 'National' | 'Festival' | 'Optional' | 'Regional'
/** `date` is the first day; `endDate` is the last day of a multi-day holiday (absent = one day). */
export interface Holiday {
  name: string; date: string; endDate?: string; type: HolidayType
  /** API row id and row version, set on holidays read from /organisation/holidays */
  rowId?: string; rowVersion?: number
}
export interface HolidayVariant { scope: 'Project'; scopeId: string; holidays: Holiday[] }
export interface HolidayPolicy { year: number; holidays: Holiday[]; variants: HolidayVariant[] }

export interface OvertimePolicy {
  mode: 'Automatic' | 'Manual'
  weekdayRate: number
  holidayRate: number
  minMinutes: number
  dailyCapHours: number
  monthlyCapHours: number
  requiresApproval: boolean
  /** Off turns overtime calculation off for every location. Missing means on. */
  enabled?: boolean
}

export interface LeaveType {
  name: string
  code: string
  annualDays: number
  accrual: 'Yearly' | 'Monthly'
  carryForward: boolean
  maxCarryDays: number
  expiryMonths: number
  encashable: boolean
  paid: boolean
}
export interface LeavePolicy { leaveTypes: LeaveType[]; legalNote: string }

export interface PaymentThresholdPolicy { amount: number; currency: 'INR' }

export interface RuleItem { title: string; category: 'Conduct' | 'Safety' | 'Attendance' | 'IT' | 'General'; body: string; ackRequired: boolean }
export interface RulesPolicy { rules: RuleItem[] }

export interface PolicyData {
  shifts: ShiftPolicy
  holidays: HolidayPolicy
  overtime: OvertimePolicy
  leave: LeavePolicy
  'payment-threshold': PaymentThresholdPolicy
  rules: RulesPolicy
}
export type PolicyKey = keyof PolicyData

export interface PolicyVersion<K extends PolicyKey = PolicyKey> {
  id: string
  key: K
  version: number
  effectiveFrom: string
  reason: string
  createdBy: string
  createdAt: string
  data: PolicyData[K]
}

// ---------- Custom policies: defined by the admin, with their own fields ----------
export type CustomFieldType = 'text' | 'longtext' | 'number' | 'date' | 'yesno' | 'select'
export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  /** choices, for the select type */
  options?: string[]
}
export interface CustomPolicyDef {
  id: string
  name: string
  description: string
  fields: CustomField[]
  createdBy: string
  createdAt: string
}
export type CustomValue = string | number | boolean
export interface CustomPolicyVersion {
  id: string
  policyId: string
  version: number
  effectiveFrom: string
  reason: string
  createdBy: string
  createdAt: string
  /** answers keyed by field id */
  values: Record<string, CustomValue>
}

// ---------- Organisation: departments, roles, organogram ----------
export interface Department {
  id: string
  code: string
  name: string
  /** optional parent department (e.g. Stores under Supply chain) */
  parentId: string | null
  /** role that heads the department, shown on the organogram */
  headRoleId: string | null
  description: string
  /** accent on the organogram, 0-7 */
  color: number
  /** optional custom hex colour; overrides the preset when set */
  colorHex?: string
  status: 'Active' | 'Inactive'
  rowVersion?: number
}

/** A position in the structure. People are held in HRMS; CORE keeps the structure. */
export interface Role {
  id: string
  code: string
  title: string
  departmentId: string
  /** e.g. E1 (executive), M2 (manager), S3 (staff), W1 (workmen) */
  grade: string
  /** the role this one reports to; null only for the top of the organisation */
  reportsToId: string | null
  /** planned positions for this role */
  positions: number
  /** who holds a single-position role, if known (CORE user or name from HRMS) */
  holder: string
  description: string
  status: 'Active' | 'Inactive'
  rowVersion?: number
}

// ---------- 3.2 Projects ----------
export type ProjectStatus = 'Planning' | 'Active' | 'On hold' | 'Completed'
/** `In progress` is kept only for sample data; the API stores pending, achieved or cancelled. */
export interface Milestone { id: string; name: string; due: string; weight: number; status: 'Not started' | 'In progress' | 'Done' | 'Cancelled'; rowVersion?: number }
export interface WbsNode { id: string; code: string; name: string; parentId: string | null; rowVersion?: number
  /** an inactive item is kept for history but no longer used for new work (core_wbs_node.status) */
  status?: 'Active' | 'Inactive' }
export interface Project {
  id: string
  code: string
  name: string
  client: string
  startDate: string
  endDate: string
  status: ProjectStatus
  value: number
  description: string
  milestones: Milestone[]
  wbs: WbsNode[]
  /** project-level plan (planning moved here from the site) */
  plan: SitePlan
  /** project-level geo-fence zones (moved here from the site) */
  zones: GeoZone[]
  /** project-owned chainage: the km range and the markers (CH-n) the project's stores, equipment and requests reference */
  chainage: {
    startKm: number; endKm: number; markers: ChainageMarker[]
    /** true when the range is the one stored on the server (chainageStartKm/EndKm); otherwise it is widened to cover the markers */
    rangeSaved?: boolean
  }
  /** locations (Site ids) assigned to this project; a site itself holds no project link */
  locationIds: string[]
  /** optimistic-lock version from the API (core_project.row_version); absent on rows created on this device */
  rowVersion?: number
}

// ---------- 3.3 Sites ----------
// A site is a plain location. It is not linked to a project; chainage belongs to the project.
export type LatLng = [number, number]
export type GeoShape = 'Radius' | 'Polygon' | 'Linear'
export interface GeoFence {
  /** Radius = circle, Polygon = closed boundary, Linear = corridor along a centre line (roads, canals, pipelines) */
  shape: GeoShape
  /** circle centre; for a polygon or line, the middle of its points */
  centerLat: number
  centerLng: number
  /** used when shape = Radius */
  radiusM: number
  /** boundary pins in order (Polygon), or centre-line pins in order (Linear) */
  points: LatLng[]
  /** Linear only: corridor width on each side of the centre line, in metres */
  bufferM: number
  version: number
  updatedAt: string
  updatedBy: string
}
/** `code` is the API's marker code (core_chainage_marker.code); absent on sample data. */
export interface ChainageMarker { id: string; km: number; label: string; wbsCode: string; code?: string; rowVersion?: number }
export type GeoZoneType = 'Head Office' | 'Mess' | 'Store yard' | 'Gate' | 'Other'
/** `purpose` is what the API stores (core_geo_zone.zone_type); `type` is the sample-data place label. */
export interface GeoZone extends GeoFence { id: string; label: string; type: GeoZoneType; purpose?: 'Attendance' | 'Equipment'; rowVersion?: number }
/** `weekOff` is an optional site override of the company week-off pattern; `workingDays` is the legacy free text. */
export interface SitePlan { startDate: string; endDate: string; peakWorkforce: number; workingDays: string; weekOff?: WeekOff; notes: string }
export interface Site {
  id: string
  code: string
  name: string
  addressLine: string
  city: string
  state: string
  pin: string
  inCharge: string
  phone: string
  email: string
  status: 'Active' | 'Inactive'
  /** API only: the one project the location belongs to (core_location.project_id) */
  projectId?: string
  /** GPS position of the location, in decimal degrees (core_location.latitude / longitude); null when not set */
  latitude?: number | null
  longitude?: number | null
  rowVersion?: number
}

// ---------- 3.4 Stores ----------
export interface Store { id: string; code: string; name: string; chainageId: string
  /** site the store sits at (core_store.location_id → core_location) */
  locationId: string
  location: string; keeper: string; phone: string; status: 'Active' | 'Inactive'
  /** optimistic-lock version from the API (core_store.row_version); absent on sample data */
  rowVersion?: number }
export interface Material { id: string; code: string; name: string; category: string; uom: string; hsn: string; reorderLevel: number; storeIds: string[]; status: 'Active' | 'Inactive'
  /** API only: shared.uom id and optimistic-lock version (core_material). TODO(backend): storeIds is not in the API. */
  uomId?: string; rowVersion?: number }
/** `rowVersion` is the API's optimistic-lock version (absent on sample data). */
export interface StockRow { id: string; storeId: string; materialId: string; qty: number; reserved: number; updatedAt: string; rowVersion?: number }

// ---------- 3.5 Equipment ----------
export type PeoplePlanStatus = 'Planned' | 'Confirmed' | 'Fulfilled'
/** Planned manpower for a project. TODO(backend): GET/POST/PUT/DELETE /projects/{id}/people-plan. */
export interface PeoplePlanLine { id: string; projectId: string; role: string; headcount: number; from: string; to: string; status: PeoplePlanStatus; rowVersion?: number
  /** the organisation position the line is for (core_plan_line.position_id); the API requires it for people lines */
  positionId?: string }
export type CashLimitPriority = 'Emergency' | 'Normal'
/** One row of the cash limit matrix (tier x priority). Final tier rows have no cash or time limit. Server: /cash-limit-rows (formerly /pms-limit-rows, still served). */
export interface CashLimitRow { id?: string; rowVersion?: number; tier: number; priority: CashLimitPriority; amount: number | null; days: number; hours: number; minutes: number; final?: boolean }
export type MaterialPlanStatus = 'Planned' | 'Requested' | 'Ordered' | 'Received'
/** Planned material requirement for a project. TODO(backend): GET/POST/PUT/DELETE /projects/{id}/material-plan. */
export interface MaterialPlanLine { id: string; projectId: string; materialId: string; qty: number; uom: string; requiredBy: string; storeId: string; status: MaterialPlanStatus; rowVersion?: number }
/** Planned equipment for a project. Planning is done at project level only. */
export interface PlanLine { id: string; equipmentType: string; projectId: string; plannedQty: number; from: string; to: string; reason: string; rowVersion?: number }
export type Availability = 'Available' | 'In use' | 'Under maintenance' | 'Breakdown'
export interface EquipmentUnit {
  id: string; assetCode: string; type: string; makeModel: string; regNo: string; chainageId: string; lat: number | null; lng: number | null; lastPing: string | null; availability: Availability
  /** Equipment name given at registration (e.g. "Excavator EX-1"). Optional for records registered before it existed. */
  name?: string
  /** Compliance and purchase records shown in the unit details. Optional until P&M captures them on upload. */
  invoiceNo?: string; invoiceDate?: string; chasisNo?: string; regExpiry?: string
  insuranceNo?: string; insuranceExpiry?: string; pucNo?: string; pollutionExpiry?: string
  fitnessCert?: string; fitnessExpiry?: string
  /** Identity, technical, meter and fuel details from the registration wizard. */
  ownershipType?: string; manufacturer?: string; model?: string; mfgYear?: string; engineNo?: string
  capacity?: string; capacityUnit?: string; meterType?: string; meterReading?: string
  fuelType?: string; fuelNorm?: string; tankCapacity?: string
  /** Owner or hire vendor, hire agreement, warranty and the location at registration. */
  owner?: string
  /** hired units: the vendor that owns it (core_vendor) */
  vendorId?: string
  hireRef?: string; agreementStart?: string; agreementEnd?: string
  warrantyEnd?: string; warrantyReading?: string; currentLocation?: string
  /** API row version (set for units read from the server; a PATCH sends it back) */
  rowVersion?: number
  /** API equipment type id (set for units read from the server) */
  equipmentTypeId?: string
  /** file id of the machine photo (GET /files/{id}/content) */
  photoFileId?: string
  /** file ids of the stored photos and papers, by key */
  documents?: UnitDocuments
}
/** Photo and document keys a unit stores (equipment_unit.documents). */
export type UnitDocKey = 'chasisPhoto' | 'enginePhoto' | 'meterPhoto' | 'invoiceDoc' | 'insuranceDoc' | 'pucDoc'
export type UnitDocuments = Partial<Record<UnitDocKey, string>>
/** A count of units of one equipment type allocated to a requested location (chainage marker). */
export interface EquipmentAssignment { id: string; equipmentType: string
  /** project the assignment belongs to (project_id) */
  projectId: string
  chainageId: string; qty: number; assignedAt: string
  /** user id of whoever assigned it (assigned_by_user_id) */
  assignedBy: string }

// ---------- 3.6 Users ----------
/**
 * People created in CORE (not taken from HRMS). A CORE user is either
 *  - a module head of one or more modules (each module has one active head; privileges come from those modules), or
 *  - a high-level approver (picked at any level of the approval matrix).
 * Module users stay in HRMS.
 */
export type UserRole = 'Module head' | 'Approver'
export const USER_ROLES: UserRole[] = ['Module head', 'Approver']
export interface CoreUser {
  id: string
  /** sign-in id (core_user.login_id, case-insensitive, unique per tenant), e.g. VELOX1021 */
  loginId: string
  name: string
  email: string
  phone: string
  designation: string
  role: UserRole
  /** module heads only: every module this person heads */
  modules: ModuleName[]
  scopeType: ScopeType
  scopeIds: string[]
  /** module heads only */
  privileges: string[]
  status: 'Active' | 'Inactive'
  mustChangePassword: boolean
  lastLogin: string | null
  createdAt: string
  /** HR employee number when the user is also an employee (hrms_employee.user_id) */
  employeeId?: string
  /** org position: the id of a Role on the organogram (position_id) */
  positionId?: string
  /** set when read from the API; edits send it */
  rowVersion?: number
}

// ---------- 3.7 Approval matrix ----------
export type RequestType =
  | 'Onboarded employee list'
  | 'Offer letter'
  | 'Job opening'
  | 'Manpower requisition'
  | 'Equipment'
  | 'Material'
  | 'Advance payment'
  | 'Recruitment'
  // PRD v2 §3.6 — employee lifecycle actions: CORE approves, HRMS executes
  | 'Employee transfer'
  | 'Promotion'
  | 'Bonus and incentive'
  | 'Loan and advance'
  // PMS payments: the chain can carry cash-limit bands (see MatrixLevel.cashLimit)
  | 'Payments'

export type TimeoutRule = 'Escalate to next level' | 'Escalate to Tenant Admin' | 'Remind approver only'
/**
 * cashLimit (INR, optional): a payment up to this amount stops at this level.
 * Only the Payments chain uses it. Levels with no limit take the payments above the limits.
 */
/**
 * escalateToId (optional, levels 1 to 3): who takes the request when this approver is absent.
 * The Tenant Admin, or another person. Never the level's own approver.
 */
export interface MatrixLevel {
  approverId: string; timeoutHours: number; onTimeout: TimeoutRule; cashLimit?: number; escalateToId?: string
  /** a role whose holders may also decide at this level (read from the server; the editor does not set it) */
  approverRoleId?: string
}
export interface MatrixVersion { version: number; effectiveFrom: string; reason: string; updatedBy: string; updatedAt: string; levels: MatrixLevel[] }
/**
 * One chain per request type and scope. A request uses the most specific chain that covers its chainage's project:
 * a Project chain, else the Company chain.
 */
export interface ApprovalChain {
  id: string
  /** display name of the chain, e.g. "Material chain" */
  name: string
  requestType: RequestType
  module: ModuleName
  /** who raises this request type (origin system or role, free text) */
  raisedBy: string
  /** an inactive chain is kept for history but no longer routes new requests */
  isActive: boolean
  /** default per-level timeout in hours; a level's own timeoutHours overrides it */
  timeoutHours: number
  scopeType: ScopeType
  /** project ids (Project scope); empty for Company */
  scopeIds: string[]
  versions: MatrixVersion[]
  /** set when read from the API (approval chain row version) */
  rowVersion?: number
}

// ---------- 3.9 Requests ----------
/** 'Clarification requested': an approver asked the raiser a question; the request waits at the same level for the answer. */
export type RequestStatus = 'Pending' | 'In review' | 'Clarification requested' | 'Approved' | 'Rejected'
export interface RequestAction {
  level: number; by: string; action: 'Approved' | 'Rejected' | 'Escalated' | 'Raised' | 'Commented' | 'Clarification requested' | 'Responded'; at: string; comment: string
  /** the approver's choice sent with the action (store or vendor, local or Head Office hire, who fills a job opening) */
  decision?: string
  /** payments: amount this approver cleared (INR); may be less than requested */
  amountApproved?: number
  /** line-level edits the approver made (field → { from, to }) */
  lineChanges?: Record<string, { from: unknown; to: unknown }>
}

export type RequestPayload =
  | { kind: 'equipment'; equipmentType: string; qty: number; from: string; to: string; justification: string }
  | { kind: 'material'; materialId: string; qty: number; /** unit code (GET /uoms); absent on older requests, which use the material's unit */ uom?: string; neededBy: string; storeId: string; decision?: { route: 'Transfer' | 'Vendor purchase'; fromStoreId?: string; vendor?: string } }
  | { kind: 'payment'; amount: number; payee: string; purpose: string }
  | { kind: 'recruitment'; position: string; count: number; decision?: 'Local' | 'Head Office'; candidate?: string }
  | {
    kind: 'job'; position: string; openings: number; ctcMin: number; ctcMax: number; experience: string
    /** PRD v2 §3.11 — who fills the opening, decided by CORE */
    route?: 'Site hires directly' | 'Head Office posts and sends candidate'
    /** requirement posted on the HRMS recruitment page */
    postedOnHrms: boolean
    /** Head Office-posted openings are published to the site by CORE */
    publishedToSite?: string | null
  }
  | { kind: 'offer'; candidate: string; position: string; ctc: number; joining: string }
  | { kind: 'onboarding'; employees: { name: string; position: string; joining: string }[] }
  | { kind: 'mrf'; position: string; count: number; reason: string; requiredBy: string }
  | { kind: 'transfer'; employee: string; empId: string; designation: string; fromSiteId: string; toSiteId: string; effective: string; reason: string }
  | { kind: 'promotion'; employee: string; empId: string; fromRole: string; toRole: string; currentCtc: number; newCtc: number; effective: string; justification: string }
  | { kind: 'bonus'; basis: 'Bonus' | 'Incentive'; scope: string; headcount: number; amount: number; period: string; criteria: string }
  | { kind: 'loan'; employee: string; empId: string; amount: number; tenureMonths: number; purpose: string }

export interface ApprovalRequest {
  id: string
  /** readable request number shown to people, e.g. REQ-2043; `id` is the stable key */
  code: string
  type: RequestType
  module: ModuleName
  title: string
  /** raiser's name, kept as a snapshot (raised_by_name) */
  raisedBy: string
  /** raiser's user id (raised_by_id); null when raised by a module user outside CORE */
  raisedById: string | null
  raisedAt: string
  /** chainage the request is raised against (a ChainageMarker id; its project is found with projectOf) */
  chainageId: string
  emergency: boolean
  /** the date the request is needed by (API 1.4.0); none for an emergency or an older request */
  neededBy?: string | null
  status: RequestStatus
  currentLevel: number
  /** chain and matrix version snapshot used for this request (changes never affect requests in flight) */
  chainId?: string
  matrixVersion: number
  history: RequestAction[]
  payload: RequestPayload
  /** set when read from the API; acting on a request sends it */
  rowVersion?: number
  /** user the request now waits on (the raiser while a clarification is open) */
  assignedActorId?: string | null
  /** job openings published by Head Office: the location and when (POST /approval-requests/{id}/publish) */
  publishedLocationId?: string | null
  publishedAt?: string | null
  /** the levels fixed when the request was raised (server snapshot); later matrix changes do not alter them */
  levelsSnapshot?: Array<MatrixLevel & { levelNo: number }>
  /** the site (location) the request is for; none means the whole company */
  locationId?: string | null
}

// ---------- 3.8 Grievances ----------
/**
 * A grievance carries only: its ID, the name of the person who raised it,
 * a short message (at most 10 words) and the date they want to visit Head Office.
 * CORE confirms, moves or closes the visit.
 */
export type GrievanceStatus = 'Requested' | 'Confirmed' | 'Rescheduled' | 'Visited' | 'Not visited'
export interface Grievance {
  id: string
  /** readable grievance code shown to people, e.g. G-101; `id` stays the stable key */
  code: string
  /** name of the person who raised it */
  raisedBy: string
  /** user id of the person who raised it (raised_by → core_user) */
  raisedById: string
  /** employee number of the raiser, when known */
  employeeId?: string
  /** employee code as HR holds it (e.g. EMP-1021), when known */
  employeeCode?: string
  subject?: string
  /** module and record the grievance came from, when raised from another module */
  sourceModule?: string
  sourceRecordId?: string
  /** at most 10 words */
  message: string
  /** date of the Head Office visit (yyyy-MM-dd); picked by the raiser, may be moved by CORE */
  visitDate: string
  status: GrievanceStatus
  raisedAt: string
  history: { status: GrievanceStatus; at: string; note: string }[]
  /** CORE's note on the visit (PATCH /grievances/{id} note, max 2000) */
  note?: string
  /** set when read from the API */
  rowVersion?: number
}

// ---------- 4. Audit + 3.10 support ----------
export interface AuditEntry { id: string; at: string; user: string; action: string; entity: string; entityId: string; before: string; after: string }
export interface Ticket { id: string; code: string; subject: string; category: string; priority: 'Low' | 'Medium' | 'High'; description: string; status: 'Open' | 'Answered' | 'Closed'; createdAt: string
  /** user id of whoever raised it (raised_by_user_id) */
  raisedById: string
  /** set when read from the API */
  rowVersion?: number }

// ---------- masters added for the database handoff ----------
/** core_equipment_type: equipment type master. Units and assignments still refer to the type by name. */
export interface EquipmentTypeMaster {
  id: string
  code: string
  name: string
  meterKind: 'Hours' | 'Kilometres' | 'None'
  meterPrecision: number
  fuelNormUnit: 'L/hr' | 'km/L' | 'None'
  /** settings key for the fuel tolerance, fuel.tolerance.<code> */
  toleranceSettingKey: string
  active: boolean
}
/** core_vendor: vendor master (equipment owners and hire vendors). */
export interface Vendor {
  id: string
  code: string
  name: string
  status: 'Pending' | 'Active' | 'Inactive'
  approvalRequestId?: string
  gstin: string
  pan: string
  email: string
  phone: string
  address: string
  /** user id of whoever registered the vendor */
  registeredBy: string
  /** bank verification time; null until verified */
  verifiedAt: string | null
}
