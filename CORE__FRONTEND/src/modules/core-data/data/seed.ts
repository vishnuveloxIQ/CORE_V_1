/** Sample data for the CORE screens. Replace with API calls when the contracts (PRD Â§5) exist. */
import { dataUrlBytes, textPdfDataUrl } from '../utils/pdf'
import type {
  ApprovalChain, ApprovalRequest, AuditEntry, CompanyProfile, Department, EquipmentTypeMaster, EquipmentUnit, Grievance, Material, CoreUser,
  OfferLetterFile, PeoplePlanLine, CashLimitRow, MaterialPlanLine, EquipmentAssignment, PlanLine, PolicyVersion, Project, Role, Site, StockRow, Store, Ticket, TimeoutRule, Vendor,
} from '../types'

export const TENANT_ADMIN = 'Anil Mehta'

const OFFER_PDF = textPdfDataUrl([
  'VeloxIQ Infra Projects Pvt Ltd',
  'Plot 42, Cyber Towers Road, Hitech City, Hyderabad 500081',
  '',
  'OFFER OF EMPLOYMENT',
  '',
  'Date: {{offer_date}}',
  'Dear {{candidate_name}},',
  '',
  'We are pleased to offer you the position of {{designation}} at {{site_name}},',
  'reporting to {{reporting_manager}}, with an annual CTC of {{ctc}}.',
  '',
  'Your date of joining is {{joining_date}}. This offer is subject to verification',
  'of your documents and a pre-employment medical check.',
  '',
  'Probation: 6 months. Notice period: 60 days after confirmation.',
  'Working hours, overtime and leave follow the company policies in force.',
  '',
  'Please sign and return a copy of this letter to accept the offer.',
  '',
  'For VeloxIQ Infra Projects Pvt Ltd',
  '{{signatory}}',
])

/** The one offer letter format HRMS uses. Only the Tenant Admin replaces it. */
export const OFFER_LETTER: OfferLetterFile = {
  fileId: 'FILE-OL-1', fileName: 'VeloxIQ-offer-letter-format.pdf', mimeType: 'application/pdf', size: dataUrlBytes(OFFER_PDF), dataUrl: OFFER_PDF,
  revision: 3, updatedAt: '2026-11-04T12:00:00', updatedBy: TENANT_ADMIN,
}

export const COMPANY: CompanyProfile = {
  legalName: 'VeloxIQ Infra Projects Pvt Ltd',
  tradeName: 'VeloxIQ Infra',
  companyType: 'pvt_ltd',
  cin: 'U45200TG2019PTC134567',
  gstin: '36AAHCV1234K1Z8',
  pan: 'AAHCV1234K',
  tan: 'HYDV01234B',
  addressLine1: 'Plot 42, Cyber Towers Road',
  addressLine2: 'Hitech City, Madhapur',
  city: 'Hyderabad',
  state: 'Telangana',
  pin: '500081',
  country: 'India',
  contactName: 'Anil Mehta',
  contactEmail: 'admin@veloxiq.example',
  contactPhone: '9876543210',
  website: 'https://veloxiq.example',
  logo: '',
  offerLetter: OFFER_LETTER,
}

const PROJECTS_RAW: Project[] = [
  {
    id: 'P-101', code: 'NH65-PKG2', name: 'NH-65 widening, package 2', client: 'National Highways Authority', startDate: '2026-01-15', endDate: '2027-12-31',
    status: 'Active', value: 4_85_00_00_000, description: 'Four-laning of 38 km stretch including two minor bridges.',
    plan: { startDate: '2026-01-20', endDate: '2027-06-30', peakWorkforce: 240, workingDays: 'Monâ€“Sat', notes: 'Monsoon slowdown Julâ€“Sep.' },
    zones: [{ id: 'Z-S1', label: 'Main location', type: 'Other', shape: 'Linear', centerLat: 17.14, centerLng: 79.6247, radiusM: 0, points: [[17.15, 79.57], [17.146, 79.6], [17.1405, 79.6233], [17.135, 79.65], [17.1305, 79.68]], bufferM: 250, version: 3, updatedAt: '2026-10-20T11:30:00', updatedBy: TENANT_ADMIN }],
    milestones: [
      { id: 'MS-1', name: 'Mobilisation complete', due: '2026-03-31', weight: 10, status: 'Done' },
      { id: 'MS-2', name: 'Earthwork km 0â€“20', due: '2026-12-15', weight: 30, status: 'In progress' },
      { id: 'MS-3', name: 'Minor bridge 1 deck cast', due: '2027-04-30', weight: 25, status: 'Not started' },
      { id: 'MS-4', name: 'Bituminous surfacing', due: '2027-11-30', weight: 35, status: 'Not started' },
    ],
    chainage: { startKm: 0, endKm: 38, markers: [
      { id: 'CH-1', km: 0, label: 'Start of package' },
      { id: 'CH-2', km: 8.5, label: 'Minor bridge 1' },
      { id: 'CH-3', km: 20, label: 'Camp A boundary' },
      { id: 'CH-6', km: 20, label: 'Camp B start' },
    ] },
  },
  {
    id: 'P-102', code: 'MTR-DEP', name: 'Metro depot civil works', client: 'City Metro Rail Corp', startDate: '2026-04-01', endDate: '2027-09-30',
    status: 'Active', value: 1_92_00_00_000, description: 'Depot buildings, inspection bays and stabling lines.',
    plan: { startDate: '2026-04-05', endDate: '2027-09-15', peakWorkforce: 320, workingDays: 'Monâ€“Sun (rotational)', notes: 'Night work permitted.' },
    zones: [{ id: 'Z-S2', label: 'Main location', type: 'Other', shape: 'Polygon', centerLat: 17.4012, centerLng: 78.5591, radiusM: 0, points: [[17.4031, 78.557], [17.403, 78.5612], [17.3994, 78.5614], [17.3995, 78.5569]], bufferM: 0, version: 1, updatedAt: '2026-04-02T09:00:00', updatedBy: TENANT_ADMIN }],
    milestones: [
      { id: 'MS-5', name: 'Foundations', due: '2026-10-31', weight: 40, status: 'In progress' },
      { id: 'MS-6', name: 'Superstructure', due: '2027-05-31', weight: 60, status: 'Not started' },
    ],
    chainage: { startKm: 0, endKm: 0, markers: [{ id: 'CH-7', km: 0, label: 'Depot gate 1' }] },
  },
  {
    id: 'P-103', code: 'WTP-SRK', name: 'Water treatment plant, Srikakulam', client: 'State Water Board', startDate: '2027-01-10', endDate: '2028-03-31',
    status: 'Planning', value: 86_00_00_000, description: '120 MLD plant with clear water reservoir.', milestones: [],
    chainage: { startKm: 0, endKm: 2.5, markers: [
      { id: 'CH-8', km: 0, label: 'Intake well' },
      { id: 'CH-9', km: 2.5, label: 'Clarifier tanks' },
    ] },
    plan: { startDate: '2027-01-10', endDate: '2028-03-31', peakWorkforce: 0, workingDays: 'Monâ€“Sat', notes: '' }, zones: [],
  },
  {
    id: 'P-104', code: 'FLY-KKP', name: 'Kukatpally junction flyover', client: 'Greater Hyderabad Municipal Corp', startDate: '2026-02-01', endDate: '2027-07-31',
    status: 'On hold', value: 2_40_00_00_000, description: 'Six-lane flyover; on hold until the client shifts utilities.',
    plan: { startDate: '2026-02-01', endDate: '2027-07-31', peakWorkforce: 0, workingDays: 'Monâ€“Sat', notes: 'On hold until the client shifts utilities.' },
    zones: [],
    milestones: [{ id: 'MS-7', name: 'Pile load test', due: '2026-06-30', weight: 20, status: 'Done' }, { id: 'MS-8', name: 'Pier caps', due: '2027-01-31', weight: 30, status: 'Not started' }],
    chainage: { startKm: 0, endKm: 0, markers: [{ id: 'CH-10', km: 0, label: 'Pier P1 junction' }] },
  },
  {
    id: 'P-105', code: 'CNL-PH1', name: 'Canal lining, phase 1', client: 'State Irrigation Department', startDate: '2025-04-01', endDate: '2026-09-30',
    status: 'Completed', value: 64_00_00_000, description: '14 km concrete lining of the main canal.',
    plan: { startDate: '2025-04-10', endDate: '2026-09-20', peakWorkforce: 140, workingDays: 'Monâ€“Sat', notes: 'Demobilised after handover on 25 Sep 2026.' },
    zones: [{ id: 'Z-S3', label: 'Main location', type: 'Other', shape: 'Radius', centerLat: 16.8722, centerLng: 79.5625, radiusM: 400, points: [], bufferM: 0, version: 1, updatedAt: '2025-04-08T10:00:00', updatedBy: TENANT_ADMIN }],
    milestones: [{ id: 'MS-9', name: 'Lining km 0â€“14', due: '2026-08-31', weight: 100, status: 'Done' }],
    chainage: { startKm: 0, endKm: 14, markers: [{ id: 'CH-4', km: 0, label: 'Head regulator' }, { id: 'CH-5', km: 14, label: 'End of phase 1' }] },
  },
]

const SITES_RAW: Site[] = [
  {
    id: 'S-201', code: 'NH65-A', name: 'NH-65 camp A (km 0â€“20)', addressLine: 'Camp office, km 4.2', city: 'Suryapet', state: 'Telangana', pin: '508213',
    inCharge: 'Ravi Kumar', phone: '9811122233', email: 'site.a@veloxiq.example', status: 'Active',
  },
  {
    id: 'S-202', code: 'NH65-B', name: 'NH-65 camp B (km 20â€“38)', addressLine: 'Camp office, km 27.8', city: 'Kodad', state: 'Telangana', pin: '508206',
    inCharge: 'Meera Das', phone: '9822233344', email: 'site.b@veloxiq.example', status: 'Active',
  },
  {
    id: 'S-203', code: 'MTR-D1', name: 'Metro depot location', addressLine: 'Survey no. 118, Uppal', city: 'Hyderabad', state: 'Telangana', pin: '500039',
    inCharge: 'Priya Sharma', phone: '9833344455', email: 'depot@veloxiq.example', status: 'Active',
  },
  {
    id: 'S-204', code: 'CNL-1', name: 'Canal lining camp', addressLine: 'Camp office, Nagarjuna Sagar left canal', city: 'Miryalaguda', state: 'Telangana', pin: '508207',
    inCharge: 'Gopal Krishna', phone: '9844411122', email: 'canal@veloxiq.example', status: 'Active',
  },
  {
    id: 'S-205', code: 'FLY-1', name: 'Kukatpally flyover camp', addressLine: 'Kukatpally junction, NH-65', city: 'Hyderabad', state: 'Telangana', pin: '500072',
    inCharge: 'Lakshmi Devi', phone: '9888899900', email: 'flyover@veloxiq.example', status: 'Active',
  },
  {
    id: 'S-206', code: 'WTP-1', name: 'WTP site camp', addressLine: 'Intake well yard', city: 'Srikakulam', state: 'Andhra Pradesh', pin: '532001',
    inCharge: 'Suresh Babu', phone: '9877788899', email: 'wtp@veloxiq.example', status: 'Active',
  },
]

const STORES_RAW: Store[] = [
  { id: 'ST-301', code: 'STR-A', name: 'Camp A main store', chainageId: 'CH-1', projectId: 'P-101', location: 'Camp A, shed 2', keeper: 'Kiran Rao', phone: '9844455566', status: 'Active' },
  { id: 'ST-302', code: 'STR-B', name: 'Camp B store', chainageId: 'CH-6', projectId: 'P-101', location: 'Camp B, yard', keeper: 'Arun Reddy', phone: '9855566677', status: 'Active' },
  { id: 'ST-303', code: 'STR-D', name: 'Depot store', chainageId: 'CH-7', projectId: 'P-102', location: 'Depot gate 1', keeper: 'Ananya Rao', phone: '9866677788', status: 'Active' },
  { id: 'ST-304', code: 'STR-C', name: 'Canal camp store', chainageId: 'CH-4', projectId: 'P-105', location: 'Camp yard (closed)', keeper: 'Gopal Krishna', phone: '9844411122', status: 'Inactive' },
  { id: 'ST-305', code: 'STR-WTP', name: 'WTP site store', chainageId: 'CH-8', projectId: 'P-103', location: 'Intake well yard', keeper: 'Suresh Babu', phone: '9877788899', status: 'Active' },
  { id: 'ST-306', code: 'STR-FLY', name: 'Flyover store', chainageId: 'CH-10', projectId: 'P-104', location: 'Pier P1 yard', keeper: 'Lakshmi Devi', phone: '9888899900', status: 'Active' },
  { id: 'ST-307', code: 'STR-CNL', name: 'Canal phase 1 store', chainageId: 'CH-5', projectId: 'P-105', location: 'End of phase 1 yard', keeper: 'Ramesh Naidu', phone: '9899900011', status: 'Active' },
]

const ALL = ['ST-301', 'ST-302', 'ST-303']
const MATERIALS_RAW: Material[] = [
  { id: 'M-401', code: 'CEM-OPC53', name: 'Cement OPC 53 grade', category: 'Cement', uom: 'Bag (50 kg)', hsn: '2523', reorderLevel: 500, storeIds: ALL, status: 'Active' },
  { id: 'M-402', code: 'STL-TMT16', name: 'TMT bar Fe 500D 16 mm', category: 'Steel', uom: 'MT', hsn: '7214', reorderLevel: 20, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-403', code: 'AGG-20', name: 'Coarse aggregate 20 mm', category: 'Aggregates', uom: 'Cum', hsn: '2517', reorderLevel: 300, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-404', code: 'BIT-VG30', name: 'Bitumen VG-30', category: 'Bitumen', uom: 'MT', hsn: '2713', reorderLevel: 15, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-405', code: 'DSL', name: 'High-speed diesel', category: 'Fuel', uom: 'LTR', hsn: '2710', reorderLevel: 5000, storeIds: ALL, status: 'Active' },
  { id: 'M-406', code: 'CEM-PPC', name: 'Cement PPC', category: 'Cement', uom: 'Bag (50 kg)', hsn: '2523', reorderLevel: 300, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-407', code: 'STL-TMT12', name: 'TMT bar Fe 500D 12 mm', category: 'Steel', uom: 'MT', hsn: '7214', reorderLevel: 15, storeIds: ALL, status: 'Active' },
  { id: 'M-408', code: 'STL-TMT25', name: 'TMT bar Fe 500D 25 mm', category: 'Steel', uom: 'MT', hsn: '7214', reorderLevel: 10, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-409', code: 'STL-BW', name: 'Binding wire 18 gauge', category: 'Steel', uom: 'KG', hsn: '7217', reorderLevel: 200, storeIds: ALL, status: 'Active' },
  { id: 'M-410', code: 'AGG-10', name: 'Coarse aggregate 10 mm', category: 'Aggregates', uom: 'Cum', hsn: '2517', reorderLevel: 150, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-411', code: 'AGG-GSB', name: 'Granular sub-base (GSB)', category: 'Aggregates', uom: 'Cum', hsn: '2517', reorderLevel: 500, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-412', code: 'SND-RIV', name: 'River sand', category: 'Sand', uom: 'Cum', hsn: '2505', reorderLevel: 200, storeIds: ALL, status: 'Active' },
  { id: 'M-413', code: 'SND-MSD', name: 'Manufactured sand (M-sand)', category: 'Sand', uom: 'Cum', hsn: '2517', reorderLevel: 200, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-414', code: 'BIT-EML', name: 'Bitumen emulsion RS-1', category: 'Bitumen', uom: 'MT', hsn: '2715', reorderLevel: 5, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-415', code: 'ADM-SP', name: 'Superplasticiser admixture', category: 'Admixtures', uom: 'LTR', hsn: '3824', reorderLevel: 400, storeIds: ['ST-303'], status: 'Active' },
  { id: 'M-416', code: 'FRM-PLY', name: 'Shuttering plywood 12 mm', category: 'Formwork', uom: 'NOS', hsn: '4412', reorderLevel: 100, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-417', code: 'ELC-CBL4', name: 'Armoured cable 4 sq mm', category: 'Electrical', uom: 'Rmt', hsn: '8544', reorderLevel: 500, storeIds: ['ST-303'], status: 'Active' },
  { id: 'M-418', code: 'PLB-HDPE', name: 'HDPE pipe 110 mm', category: 'Plumbing', uom: 'Rmt', hsn: '3917', reorderLevel: 120, storeIds: ['ST-302', 'ST-303'], status: 'Active' },
  { id: 'M-419', code: 'SAF-HLM', name: 'Safety helmet', category: 'Safety', uom: 'NOS', hsn: '6506', reorderLevel: 150, storeIds: ALL, status: 'Active' },
  { id: 'M-420', code: 'SAF-VST', name: 'High-visibility vest', category: 'Safety', uom: 'NOS', hsn: '6211', reorderLevel: 150, storeIds: ALL, status: 'Active' },
  { id: 'M-421', code: 'CNS-WLD', name: 'Welding electrode 3.15 mm', category: 'Consumables', uom: 'KG', hsn: '8311', reorderLevel: 50, storeIds: ['ST-301', 'ST-303'], status: 'Active' },
  { id: 'M-422', code: 'PNT-RM', name: 'Road marking paint', category: 'Paint', uom: 'LTR', hsn: '3208', reorderLevel: 100, storeIds: ['ST-301', 'ST-302'], status: 'Active' },
  { id: 'M-423', code: 'CEM-SRC', name: 'Sulphate-resisting cement', category: 'Cement', uom: 'Bag (50 kg)', hsn: '2523', reorderLevel: 100, storeIds: ['ST-304'], status: 'Inactive' },
]

const ts = '2026-11-06T08:45:00'
const STOCK_RAW: Omit<StockRow, 'id'>[] = [
  { storeId: 'ST-301', materialId: 'M-401', qty: 1240, reserved: 300, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-401', qty: 0, reserved: 0, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-401', qty: 860, reserved: 120, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-402', qty: 42, reserved: 10, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-402', qty: 12, reserved: 4, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-403', qty: 520, reserved: 80, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-403', qty: 210, reserved: 0, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-404', qty: 18, reserved: 6, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-404', qty: 4, reserved: 0, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-405', qty: 8200, reserved: 1500, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-405', qty: 3100, reserved: 400, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-405', qty: 6400, reserved: 900, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-406', qty: 640, reserved: 100, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-406', qty: 180, reserved: 60, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-407', qty: 26, reserved: 4, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-407', qty: 9, reserved: 2, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-409', qty: 820, reserved: 120, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-411', qty: 1400, reserved: 300, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-411', qty: 0, reserved: 0, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-412', qty: 380, reserved: 40, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-412', qty: 150, reserved: 30, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-415', qty: 900, reserved: 200, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-416', qty: 60, reserved: 10, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-419', qty: 410, reserved: 0, updatedAt: ts },
  { storeId: 'ST-302', materialId: 'M-419', qty: 90, reserved: 0, updatedAt: ts },
  { storeId: 'ST-303', materialId: 'M-419', qty: 260, reserved: 20, updatedAt: ts },
  { storeId: 'ST-301', materialId: 'M-421', qty: 75, reserved: 10, updatedAt: ts },
  // ST-305 (CH-8): in stock, low, out of stock
  { storeId: 'ST-305', materialId: 'M-401', qty: 800, reserved: 0, updatedAt: ts },
  { storeId: 'ST-305', materialId: 'M-402', qty: 15, reserved: 0, updatedAt: ts },
  { storeId: 'ST-305', materialId: 'M-403', qty: 0, reserved: 0, updatedAt: ts },
  // ST-306 (CH-7): in stock, low, out of stock
  { storeId: 'ST-306', materialId: 'M-405', qty: 9000, reserved: 0, updatedAt: ts },
  { storeId: 'ST-306', materialId: 'M-404', qty: 10, reserved: 0, updatedAt: ts },
  { storeId: 'ST-306', materialId: 'M-411', qty: 0, reserved: 0, updatedAt: ts },
  // ST-307 (CH-9): in stock, low, out of stock
  { storeId: 'ST-307', materialId: 'M-412', qty: 400, reserved: 0, updatedAt: ts },
  { storeId: 'ST-307', materialId: 'M-409', qty: 50, reserved: 0, updatedAt: ts },
  { storeId: 'ST-307', materialId: 'M-407', qty: 0, reserved: 0, updatedAt: ts },
]

export const EQUIPMENT_TYPES = [
  'Excavator', 'Bulldozer', 'Wheel Loader', 'Backhoe Loader (JCB)', 'Motor Grader', 'Road Roller', 'Dump Truck',
  'Mobile Crane', 'Tower Crane', 'Concrete Mixer', 'Concrete Batching Plant', 'Concrete Pump', 'Concrete Vibrator',
  'Plate Compactor', 'Soil Compactor', 'Asphalt Paver', 'Road Milling Machine', 'Forklift', 'Scissor Lift', 'Boom Lift',
  'Air Compressor', 'Diesel Generator', 'Water Pump', 'Hydraulic Breaker', 'Bar Bending Machine', 'Bar Cutting Machine',
  'Concrete Cutting Machine', 'Welding Machine', 'Scaffolding System', 'Material Hoist',
]

/** Every equipment type should have at least this many units in the register. */
const MIN_UNITS_PER_TYPE = 5

const PLAN_LINES_RAW: PlanLine[] = [
  { id: 'EP-1', equipmentType: 'Excavator', projectId: 'P-101', plannedQty: 4, from: '2026-02-01', to: '2027-03-31', reason: 'Earthwork km 0â€“20' },
  { id: 'EP-2', equipmentType: 'Dump Truck', projectId: 'P-101', plannedQty: 12, from: '2026-02-01', to: '2027-03-31', reason: 'Haulage' },
  { id: 'EP-3', equipmentType: 'Road Roller', projectId: 'P-101', plannedQty: 3, from: '2026-04-01', to: '2027-10-31', reason: 'Compaction both camps' },
  { id: 'EP-4', equipmentType: 'Tower Crane', projectId: 'P-102', plannedQty: 1, from: '2026-05-01', to: '2026-12-31', reason: 'Pile foundations' },
  { id: 'EP-5', equipmentType: 'Concrete Mixer', projectId: 'P-102', plannedQty: 5, from: '2026-05-01', to: '2027-08-31', reason: 'Concrete supply' },
  { id: 'EP-6', equipmentType: 'Motor Grader', projectId: 'P-101', plannedQty: 1, from: '2026-06-01', to: '2027-06-30', reason: 'Sub-grade levelling km 20â€“38' },
  { id: 'EP-7', equipmentType: 'Excavator', projectId: 'P-101', plannedQty: 1, from: '2026-03-15', to: '2027-03-31', reason: 'Drain excavation, camp B' },
]

// TODO(backend): mock manpower plan; replace with GET /projects/{id}/people-plan.
const PEOPLE_PLAN_RAW: PeoplePlanLine[] = [
  { id: 'PP-1', projectId: 'P-101', department: 'Engineering and design', role: 'Site Engineer', headcount: 6, from: '2026-02-01', to: '2027-03-31', status: 'Confirmed' },
  { id: 'PP-2', projectId: 'P-101', department: 'Plant and machinery', role: 'Heavy vehicle operator', headcount: 18, from: '2026-02-01', to: '2027-03-31', status: 'Planned' },
  { id: 'PP-3', projectId: 'P-101', department: 'Projects', role: 'Surveyor', headcount: 4, from: '2026-01-15', to: '2026-10-31', status: 'Fulfilled' },
]

// Sample cash limit matrix for demo data; the server copy comes from GET /cash-limit-rows.
export const CASH_LIMITS: CashLimitRow[] = [
  { tier: 1, priority: 'Emergency', amount: 10000, days: 0, hours: 4, minutes: 0 },
  { tier: 1, priority: 'Normal', amount: 10000, days: 1, hours: 0, minutes: 0 },
  { tier: 2, priority: 'Emergency', amount: 15000, days: 0, hours: 8, minutes: 0 },
  { tier: 2, priority: 'Normal', amount: 15000, days: 2, hours: 0, minutes: 0 },
  { tier: 3, priority: 'Emergency', amount: 30000, days: 0, hours: 12, minutes: 0 },
  { tier: 3, priority: 'Normal', amount: 30000, days: 3, hours: 0, minutes: 0 },
  { tier: 4, priority: 'Emergency', amount: null, days: 0, hours: 0, minutes: 0, final: true },
  { tier: 4, priority: 'Normal', amount: null, days: 0, hours: 0, minutes: 0, final: true },
]

// TODO(backend): mock material plan; replace with GET /projects/{id}/material-plan.
const MATERIAL_PLAN_RAW: MaterialPlanLine[] = [
  { id: 'MP-1', projectId: 'P-101', materialId: 'M-401', qty: 5000, uom: 'Bag (50 kg)', requiredBy: '2026-12-15', storeId: 'ST-301', status: 'Ordered' },
  { id: 'MP-2', projectId: 'P-101', materialId: 'M-402', qty: 120, uom: 'MT', requiredBy: '2027-01-31', storeId: 'ST-301', status: 'Requested' },
  { id: 'MP-3', projectId: 'P-101', materialId: 'M-401', qty: 2000, uom: 'Bag (50 kg)', requiredBy: '2026-10-01', storeId: 'ST-302', status: 'Received' },
]

const HAND_UNITS: EquipmentUnit[] = [
  { id: 'EQ-501', assetCode: 'EXC-014', type: 'Excavator', makeModel: 'Tata Hitachi EX210', regNo: 'TS09EX1401', chainageId: 'CH-1', lat: 17.1411, lng: 79.6240, lastPing: '2026-11-06T09:12:00', availability: 'In use' },
  { id: 'EQ-502', assetCode: 'EXC-015', type: 'Excavator', makeModel: 'Komatsu PC210', regNo: 'TS09EX1502', chainageId: 'CH-1', lat: 17.1388, lng: 79.6201, lastPing: '2026-11-06T09:10:00', availability: 'In use' },
  { id: 'EQ-503', assetCode: 'EXC-021', type: 'Excavator', makeModel: 'JCB JS205', regNo: 'TS10EX2103', chainageId: 'CH-6', lat: null, lng: null, lastPing: null, availability: 'Available' },
  { id: 'EQ-504', assetCode: 'TIP-101', type: 'Dump Truck', makeModel: 'BharatBenz 2828C', regNo: 'TS09TP1011', chainageId: 'CH-1', lat: 17.1420, lng: 79.6260, lastPing: '2026-11-06T09:05:00', availability: 'In use' },
  { id: 'EQ-505', assetCode: 'ROL-007', type: 'Road Roller', makeModel: 'Hamm 311', regNo: 'TS09RL0071', chainageId: 'CH-6', lat: 16.9862, lng: 79.9631, lastPing: '2026-11-06T08:58:00', availability: 'Under maintenance' },
  { id: 'EQ-506', assetCode: 'PIL-002', type: 'Tower Crane', makeModel: 'Soilmec SR-45', regNo: 'TS07PR0022', chainageId: 'CH-7', lat: 17.4010, lng: 78.5590, lastPing: '2026-11-06T09:14:00', availability: 'In use' },
  { id: 'EQ-507', assetCode: 'TM-031', type: 'Concrete Mixer', makeModel: 'Schwing Stetter 7 cum', regNo: 'TS07TM0311', chainageId: 'CH-7', lat: 17.4002, lng: 78.5601, lastPing: '2026-11-06T09:01:00', availability: 'Breakdown' },
  // two graders on a one-grader line: the "Over plan" example
  { id: 'EQ-508', assetCode: 'GRD-004', type: 'Motor Grader', makeModel: 'CAT 120K', regNo: 'TS10GR0041', chainageId: 'CH-6', lat: 16.9870, lng: 79.9644, lastPing: '2026-11-06T09:08:00', availability: 'In use' },
  { id: 'EQ-509', assetCode: 'GRD-006', type: 'Motor Grader', makeModel: 'Mahindra G9075', regNo: 'TS10GR0062', chainageId: 'CH-6', lat: 16.9851, lng: 79.9612, lastPing: '2026-11-06T08:50:00', availability: 'Available' },
]

const unitPrefix = (type: string) =>
  type.replace(/\(.*\)/, '').trim().split(' ').map((w) => w[0]).join('').toUpperCase()

const meterKindOf = (type: string): EquipmentTypeMaster['meterKind'] =>
  type === 'Dump Truck' ? 'Kilometres' : type === 'Scaffolding System' || type === 'Concrete Vibrator' ? 'None' : 'Hours'

/** Equipment type master (handoff equipment_type): one row per type, with the meter and fuel-norm unit it uses. */
export const EQUIPMENT_TYPE_MASTER: EquipmentTypeMaster[] = EQUIPMENT_TYPES.map((name, i, all) => {
  const prefix = unitPrefix(name)
  const repeats = all.slice(0, i).filter((t) => unitPrefix(t) === prefix).length
  const code = 'ET-' + prefix + (repeats ? String(repeats + 1) : '')
  const meterKind = meterKindOf(name)
  return {
    id: 'ET-' + (i + 1), code, name, meterKind, meterPrecision: 1,
    fuelNormUnit: meterKind === 'Kilometres' ? 'km/L' : meterKind === 'Hours' ? 'L/hr' : 'None',
    toleranceSettingKey: 'fuel.tolerance.' + code, active: true,
  }
})

/** Fills each type up to MIN_UNITS_PER_TYPE with generic units; the last one of each type is in use at CH-6. */
const FILLER_UNITS: EquipmentUnit[] = EQUIPMENT_TYPES.flatMap((type, ti) => {
  const have = HAND_UNITS.filter((u) => u.type === type).length
  const n = Math.max(0, MIN_UNITS_PER_TYPE - have)
  return Array.from({ length: n }, (_, i) => {
    const last = i === n - 1
    const seq = 600 + ti * 10 + i
    return {
      id: `EQ-${seq}`,
      assetCode: `${unitPrefix(type)}-${String(i + 1).padStart(3, '0')}`,
      type,
      makeModel: 'Fleet unit',
      regNo: `TS09GN${seq}`,
      chainageId: last ? 'CH-6' : 'CH-1',
      lat: null,
      lng: null,
      lastPing: null,
      availability: last ? 'In use' : 'Available',
    }
  })
})

/** Dummy compliance records, derived from the unit's position so every unit gets distinct, plausible values. */
const docsFor = (n: number): Partial<EquipmentUnit> => {
  const md = (k: number) => `${String((k % 12) + 1).padStart(2, '0')}-${String((k % 27) + 1).padStart(2, '0')}`
  return {
    invoiceNo: `INV-2024-${String(100 + n).padStart(4, '0')}`,
    invoiceDate: `2024-${md(n)}`,
    chasisNo: `CH${String(781000 + n * 37)}`,
    regExpiry: `2029-${md(n + 3)}`,
    insuranceNo: `INS-${String(55000 + n * 13)}`,
    insuranceExpiry: `2027-${md(n + 5)}`,
    pucNo: `PUC-${String(40100 + n * 7)}`,
    pollutionExpiry: `2027-${md(n + 7)}`,
    fitnessCert: `FIT-${String(9000 + n * 11)}`,
    fitnessExpiry: `2031-${md(n + 1)}`,
    ownershipType: n % 4 === 0 ? 'Hired' : 'Owned',
    manufacturer: ['Tata Hitachi', 'Komatsu', 'JCB', 'BharatBenz', 'Hamm', 'Soilmec', 'Schwing Stetter', 'CAT', 'Mahindra'][n % 9],
    model: `M${200 + n}`,
    mfgYear: String(2018 + (n % 7)),
    engineNo: `ENG-${String(70000 + n * 17)}`,
    capacity: String(5 + (n % 9)),
    capacityUnit: 'Ton',
    meterType: n % 2 ? 'Hour meter' : 'Odometer',
    meterReading: String(1200 + n * 85),
    fuelType: 'Diesel',
    fuelNorm: `${3 + (n % 5)} L/hr`,
    tankCapacity: String(150 + (n % 4) * 50),
    owner: n % 4 === 0 ? 'Hire vendor' : 'Company',
    vendorId: n % 4 === 0 ? 'V-1' : undefined,
    hireRef: n % 4 === 0 ? `HA-${2600 + n}` : undefined,
    agreementStart: n % 4 === 0 ? `2026-${md(n)}` : undefined,
    agreementEnd: n % 4 === 0 ? `2027-${md(n + 2)}` : undefined,
    warrantyEnd: `2028-${md(n + 4)}`,
    warrantyReading: String(5000 + n * 100),
    currentLocation: n % 2 ? 'Yard, camp A' : 'Work front, CH-1',
  }
}

const UNITS_RAW: EquipmentUnit[] = [...HAND_UNITS, ...FILLER_UNITS].map((u, i) => ({ ...docsFor(i + 1), ...u }))

/** Dummy assignments: admin has placed some units of a type at a chainage marker. */
const ASSIGNMENTS_RAW: EquipmentAssignment[] = [
  { id: 'EA-1', equipmentType: 'Excavator', chainageId: 'CH-1', projectId: 'P-101', qty: 1, assignedAt: '2026-11-10T10:00:00', assignedBy: 'U-600' },
  { id: 'EA-2', equipmentType: 'Dump Truck', chainageId: 'CH-6', projectId: 'P-101', qty: 2, assignedAt: '2026-11-12T14:30:00', assignedBy: 'U-600' },
]

/** Hire vendors (handoff vendor). EquipmentUnit.vendorId points here; owner stays as the display label. */
const VENDORS_RAW: Vendor[] = [
  { id: 'V-1', code: 'VEN-001', name: 'Hire vendor', status: 'Active', gstin: '36AABCH1234K1Z5', pan: 'AABCH1234K', email: 'accounts@hirevendor.example', phone: '9811122233', address: 'Plot 12, IDA Jeedimetla, Hyderabad', registeredBy: 'U-603', verifiedAt: '2026-01-20T10:00:00' },
  { id: 'V-2', code: 'VEN-002', name: 'Sri Sai Earthmovers', status: 'Pending', gstin: '36AAFCS5678M1Z2', pan: 'AAFCS5678M', email: 'info@srisai.example', phone: '9822233344', address: 'Survey 45, Medchal, Hyderabad', registeredBy: 'U-603', verifiedAt: null },
]

const USERS_RAW: CoreUser[] = [
  { id: 'U-601', name: 'Sunita Iyer', email: 'sunita.iyer@veloxiq.example', phone: '9900011122', designation: 'Head, HR', employeeId: 'EMP-1021', positionId: 'R-04', loginId: 'VELOX1021', role: 'Module head', modules: ['HRMS'], scopeType: 'Company', scopeIds: [], privileges: ['hrms.users.manage', 'hrms.requests.raise', 'hrms.reports.view', 'hrms.approve'], status: 'Active', mustChangePassword: false, lastLogin: '2026-11-06T08:30:00', createdAt: '2026-01-05T10:00:00' },
  { id: 'U-602', name: 'Vikram Singh', email: 'vikram.singh@veloxiq.example', phone: '9900022233', designation: 'Project director', employeeId: 'EMP-1045', positionId: 'R-05', loginId: 'VELOX1045', role: 'Module head', modules: ['PMS'], scopeType: 'Project', scopeIds: ['P-101'], privileges: ['pms.requests.raise', 'pms.payments.release', 'pms.reports.view', 'pms.approve'], status: 'Active', mustChangePassword: false, lastLogin: '2026-11-05T17:45:00', createdAt: '2026-01-12T10:00:00' },
  { id: 'U-603', name: 'Deepa Nair', email: 'deepa.nair@veloxiq.example', phone: '9900033344', designation: 'Head, stores and plant', employeeId: 'EMP-1102', positionId: 'R-14', loginId: 'VELOX1102', role: 'Module head', modules: ['Stores', 'P&M'], scopeType: 'Company', scopeIds: [], privileges: ['stores.requests.raise', 'stores.transfer.raise', 'stores.reports.view', 'stores.approve', 'pm.register.manage', 'pm.reports.view'], status: 'Active', mustChangePassword: true, lastLogin: '2026-10-30T11:10:00', createdAt: '2026-02-01T10:00:00' },
  { id: 'U-604', name: 'Rahul Verma', email: 'rahul.verma@veloxiq.example', phone: '9900044455', designation: 'Manager, plant and machinery', employeeId: 'EMP-1130', positionId: 'R-15', loginId: 'VELOX1130', role: 'Approver', modules: [], scopeType: 'Project', scopeIds: ['P-101'], privileges: [], status: 'Active', mustChangePassword: false, lastLogin: '2026-11-04T09:00:00', createdAt: '2026-02-15T10:00:00' },
  { id: 'U-605', name: 'Farhan Ali', email: 'farhan.ali@veloxiq.example', phone: '9900055566', designation: 'Project manager', employeeId: 'EMP-1188', loginId: 'VELOX1188', role: 'Module head', modules: ['PMS', 'Stores'], scopeType: 'Project', scopeIds: ['P-102'], privileges: ['pms.requests.raise', 'pms.reports.view', 'stores.reports.view'], status: 'Inactive', mustChangePassword: false, lastLogin: '2026-08-21T12:00:00', createdAt: '2026-03-02T10:00:00' },
  { id: 'U-606', name: 'Kavya Reddy', email: 'kavya.reddy@veloxiq.example', phone: '9900066677', designation: 'Chief financial officer', employeeId: 'EMP-1003', positionId: 'R-03', loginId: 'VELOX1003', role: 'Approver', modules: [], scopeType: 'Company', scopeIds: [], privileges: [], status: 'Active', mustChangePassword: false, lastLogin: '2026-11-05T19:20:00', createdAt: '2026-01-03T10:00:00' },
  { id: 'U-607', name: 'Ramesh Chandra', email: 'ramesh.chandra@veloxiq.example', phone: '9900077788', designation: 'Director, operations', employeeId: 'EMP-1007', positionId: 'R-02', loginId: 'VELOX1007', role: 'Approver', modules: [], scopeType: 'Project', scopeIds: ['P-101', 'P-102'], privileges: [], status: 'Active', mustChangePassword: true, lastLogin: null, createdAt: '2026-11-02T10:00:00' },
]

/** Privilege catalogue per module. Placeholder until each module publishes its catalogue (PRD Â§6, blocking question 2). */
export const PRIVILEGES: Record<string, { id: string; label: string }[]> = {
  HRMS: [
    { id: 'hrms.users.manage', label: 'Manage module users' }, { id: 'hrms.requests.raise', label: 'Raise requests' },
    { id: 'hrms.reports.view', label: 'View module reports' }, { id: 'hrms.approve', label: 'Approve as approver' },
  ],
  PMS: [
    { id: 'pms.users.manage', label: 'Manage module users' }, { id: 'pms.requests.raise', label: 'Raise requests' },
    { id: 'pms.payments.release', label: 'Release payments below threshold' }, { id: 'pms.reports.view', label: 'View module reports' }, { id: 'pms.approve', label: 'Approve as approver' },
  ],
  Stores: [
    { id: 'stores.users.manage', label: 'Manage module users' }, { id: 'stores.requests.raise', label: 'Raise requests' },
    { id: 'stores.transfer.raise', label: 'Raise store-to-store transfers' }, { id: 'stores.reports.view', label: 'View module reports' }, { id: 'stores.approve', label: 'Approve as approver' },
  ],
  'P&M': [
    { id: 'pm.users.manage', label: 'Manage module users' }, { id: 'pm.requests.raise', label: 'Raise requests' },
    { id: 'pm.register.manage', label: 'Register equipment units' }, { id: 'pm.reports.view', label: 'View module reports' }, { id: 'pm.approve', label: 'Approve as approver' },
  ],
}

/** The Tenant Admin can approve at any level too. */
const ADMIN_APPROVER_RAW = { id: 'U-600', name: TENANT_ADMIN }

const v1 = (levels: [string, number][], effectiveFrom = '2026-01-01') => ({
  version: 1, effectiveFrom, reason: 'Initial approval chain', updatedBy: TENANT_ADMIN, updatedAt: `${effectiveFrom}T09:00:00`,
  levels: [0, 1, 2, 3].map((i) => ({
    approverId: levels[i]?.[0] ?? '', timeoutHours: levels[i]?.[1] ?? 48,
    onTimeout: (i === 3 ? 'Remind approver only' : 'Escalate to next level') as TimeoutRule,
  })),
})

type ChainSeed = Omit<ApprovalChain, 'name' | 'isActive' | 'timeoutHours'> & Partial<Pick<ApprovalChain, 'name' | 'isActive' | 'timeoutHours'>>

const CHAIN_SEEDS: ChainSeed[] = [
  { id: 'AC-1', requestType: 'Onboarded employee list', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 24], ['U-600', 48]])] },
  { id: 'AC-2', requestType: 'Offer letter', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 24], ['U-600', 48]])] },
  { id: 'AC-3', requestType: 'Job opening', module: 'HRMS', raisedBy: 'Any module, via HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 48], ['U-600', 72]])] },
  { id: 'AC-4', requestType: 'Manpower requisition', module: 'HRMS', raisedBy: 'HRMS or module head', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 48], ['U-600', 72]])] },
  { id: 'AC-5', requestType: 'Equipment', module: 'P&M', raisedBy: 'Module head', scopeType: 'Company', scopeIds: [], versions: [v1([['U-604', 24], ['U-607', 48], ['U-600', 48]])] },
  { id: 'AC-6', requestType: 'Material', module: 'Stores', raisedBy: 'Module head or store', scopeType: 'Company', scopeIds: [], versions: [v1([['U-603', 12], ['U-600', 24]])] },
  {
    id: 'AC-7', requestType: 'Advance payment', module: 'PMS', raisedBy: 'Module head or user', scopeType: 'Company', scopeIds: [], versions: [
      v1([['U-602', 24], ['U-600', 48]]),
      { ...v1([['U-602', 24], ['U-601', 24], ['U-600', 48]], '2026-07-01'), version: 2, reason: 'Added HR check for advances to staff' },
    ],
  },
  { id: 'AC-8', requestType: 'Recruitment', module: 'HRMS', raisedBy: 'Module head', scopeType: 'Company', scopeIds: [], versions: [{ ...v1([]), reason: 'Not configured yet' }] },
  // PRD v2 Â§3.6 â€” CORE approves, HRMS executes
  { id: 'AC-9', requestType: 'Employee transfer', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 24], ['U-600', 48]], '2026-11-01')] },
  { id: 'AC-10', requestType: 'Promotion', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 48], ['U-600', 72]], '2026-11-01')] },
  { id: 'AC-11', requestType: 'Bonus and incentive', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 48], ['U-600', 72]], '2026-11-01')] },
  { id: 'AC-12', requestType: 'Loan and advance', module: 'HRMS', raisedBy: 'HRMS', scopeType: 'Company', scopeIds: [], versions: [v1([['U-601', 24], ['U-606', 48], ['U-600', 48]], '2026-11-01')] },
  // scoped chains: the most specific one wins for a request from that site
  { id: 'AC-13', name: 'Material chain, Metro depot', requestType: 'Material', module: 'Stores', raisedBy: 'Module head or store', scopeType: 'Project', scopeIds: ['P-102'], versions: [{ ...v1([['U-603', 8], ['U-607', 24], ['U-600', 24]], '2026-10-01'), reason: 'Metro depot: night concreting needs faster material decisions and the operations director' }] },
  { id: 'AC-14', name: 'Advance payment chain, Metro depot', requestType: 'Advance payment', module: 'PMS', raisedBy: 'Module head or user', scopeType: 'Project', scopeIds: ['P-102'], versions: [{
    ...v1([['U-607', 24], ['U-606', 48], ['U-600', 48]], '2026-10-01'),
    reason: 'Metro depot project: CFO checks every advance under the client contract',
  }] },
  // Payments: L1 clears payments up to â‚¹50,000, L2 up to â‚¹5,00,000; anything above goes to L3.
  { id: 'AC-15', requestType: 'Payments', module: 'PMS', raisedBy: 'Module head or user', scopeType: 'Company', scopeIds: [], versions: [{
    ...v1([['U-602', 24], ['U-601', 48], ['U-600', 48]]),
    levels: v1([['U-602', 24], ['U-601', 48], ['U-600', 48]]).levels.map((l, i) => ({ ...l, cashLimit: [50000, 500000][i] })),
  }] },
]

/** Every chain gets a display name, an active flag and a default 48-hour level timeout. */
const CHAINS_RAW: ApprovalChain[] = CHAIN_SEEDS.map((c) => ({ ...c, name: c.name ?? `${c.requestType} chain`, isActive: c.isActive ?? true, timeoutHours: c.timeoutHours ?? 48 }))

const d = (iso: string) => iso
// `code` is not written here: remap() derives it from the raw REQ-xxxx id.
const REQUESTS_RAW: Omit<ApprovalRequest, 'code'>[] = [
  {
    id: 'REQ-2043', type: 'Material', module: 'Stores', title: 'Cement for intake well base slab', raisedBy: 'Suresh Babu', raisedById: null, raisedAt: d('2026-11-10T09:30:00'),
    chainageId: 'CH-8', emergency: false, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [
      { level: 0, by: 'Suresh Babu', action: 'Raised', at: '2026-11-10T09:30:00', comment: 'Base slab pour scheduled next week.' },
    ],
    payload: { kind: 'material', materialId: 'M-401', qty: 300, neededBy: '2026-11-20', storeId: 'ST-305' },
  },
  {
    id: 'REQ-2044', type: 'Equipment', module: 'P&M', title: '1 concrete pump for pier P1', raisedBy: 'Lakshmi Devi', raisedById: null, raisedAt: d('2026-11-11T11:00:00'),
    chainageId: 'CH-10', emergency: false, status: 'In review', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Lakshmi Devi', action: 'Raised', at: '2026-11-11T11:00:00', comment: '' },
      { level: 1, by: 'Deepa Nair', action: 'Approved', at: '2026-11-12T10:00:00', comment: 'Forwarding for fleet allocation.' },
    ],
    payload: { kind: 'equipment', equipmentType: 'Concrete Pump', qty: 1, from: '2026-12-01', to: '2027-02-28', justification: 'Pier P1 pour; no pump available on site.' },
  },
  {
    id: 'REQ-2045', type: 'Material', module: 'Stores', title: 'Steel and sand for canal end works', raisedBy: 'Ramesh Naidu', raisedById: null, raisedAt: d('2026-11-12T15:20:00'),
    chainageId: 'CH-5', emergency: false, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [
      { level: 0, by: 'Ramesh Naidu', action: 'Raised', at: '2026-11-12T15:20:00', comment: 'Closure works at km 14.' },
    ],
    payload: { kind: 'material', materialId: 'M-409', qty: 150, neededBy: '2026-11-25', storeId: 'ST-307' },
  },
  {
    id: 'REQ-2041', type: 'Equipment', module: 'P&M', title: '2 excavators for km 12â€“18 cutting', raisedBy: 'Rahul Verma', raisedById: 'U-604', raisedAt: d('2026-11-05T10:15:00'),
    chainageId: 'CH-1', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Rahul Verma', action: 'Raised', at: '2026-11-05T10:15:00', comment: 'Rock strata slower than estimated.' },
      { level: 1, by: 'Rahul Verma', action: 'Escalated', at: '2026-11-06T10:15:00', comment: 'L1 cannot approve own request â€” routed to L2.' },
    ],
    payload: { kind: 'equipment', equipmentType: 'Excavator', qty: 2, from: '2026-11-15', to: '2027-01-31', justification: 'Hard rock at km 12â€“18; current fleet behind schedule by 3 weeks.' },
  },
  {
    id: 'REQ-2039', type: 'Material', module: 'Stores', title: 'Cement for camp B culverts', raisedBy: 'Arun Reddy', raisedById: null, raisedAt: d('2026-11-04T14:40:00'),
    chainageId: 'CH-6', emergency: true, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Arun Reddy', action: 'Raised', at: '2026-11-04T14:40:00', comment: 'Store out of stock.' },
      { level: 1, by: 'Deepa Nair', action: 'Approved', at: '2026-11-04T18:00:00', comment: 'Genuine shortfall; forwarding to Head Office.' },
    ],
    payload: { kind: 'material', materialId: 'M-401', qty: 400, neededBy: '2026-11-10', storeId: 'ST-302' },
  },
  {
    id: 'REQ-2037', type: 'Advance payment', module: 'PMS', title: 'Mobilisation advance â€” earthwork subcontractor', raisedBy: 'Vikram Singh', raisedById: 'U-602', raisedAt: d('2026-11-03T11:00:00'),
    chainageId: 'CH-1', emergency: false, status: 'In review', currentLevel: 3, matrixVersion: 2,
    history: [
      { level: 0, by: 'Vikram Singh', action: 'Raised', at: '2026-11-03T11:00:00', comment: '' },
      { level: 1, by: 'System', action: 'Escalated', at: '2026-11-03T11:00:00', comment: 'Raiser is the L1 approver â€” segregation of duties.' },
      { level: 2, by: 'Sunita Iyer', action: 'Approved', at: '2026-11-04T09:30:00', comment: 'Contract clause 7.2 allows 10% advance.' },
    ],
    payload: { kind: 'payment', amount: 18_50_000, payee: 'Sri Lakshmi Earthmovers', purpose: '10% mobilisation advance per subcontract SC-118' },
  },
  {
    id: 'REQ-2035', type: 'Advance payment', module: 'PMS', title: 'Location imprest top-up', raisedBy: 'Meera Das', raisedById: null, raisedAt: d('2026-11-02T16:20:00'),
    chainageId: 'CH-6', emergency: false, status: 'Approved', currentLevel: 1, matrixVersion: 2,
    history: [
      { level: 0, by: 'Meera Das', action: 'Raised', at: '2026-11-02T16:20:00', comment: '' },
      { level: 1, by: 'Vikram Singh', action: 'Approved', at: '2026-11-02T18:00:00', comment: 'Below threshold â€” PMS pays.' },
    ],
    payload: { kind: 'payment', amount: 75_000, payee: 'Camp B imprest', purpose: 'Petty cash for November' },
  },
  {
    // pending for the Tenant Admin (U-600): L1 has approved, so the request waits at L2
    id: 'REQ-2042', type: 'Offer letter', module: 'HRMS', title: 'Offer — QA/QC engineer', raisedBy: 'Priya Sharma', raisedById: null, raisedAt: d('2026-11-24T11:30:00'),
    chainageId: 'CH-6', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Priya Sharma', action: 'Raised', at: '2026-11-24T11:30:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Approved', at: '2026-11-25T09:15:00', comment: 'Candidate profile checked.' },
    ],
    payload: { kind: 'offer', candidate: 'Anjali Sen', position: 'QA/QC engineer', ctc: 7_20_000, joining: '2026-12-15' },
  },
  {
    id: 'REQ-2033', type: 'Recruitment', module: 'HRMS', title: '3 surveyors for camp B', raisedBy: 'Meera Das', raisedById: null, raisedAt: d('2026-11-01T09:00:00'),
    chainageId: 'CH-6', emergency: false, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [{ level: 0, by: 'Meera Das', action: 'Raised', at: '2026-11-01T09:00:00', comment: 'Raised via HRMS.' }],
    payload: { kind: 'recruitment', position: 'Surveyor', count: 3 },
  },
  {
    id: 'REQ-2031', type: 'Offer letter', module: 'HRMS', title: 'Offer â€” Site engineer (structures)', raisedBy: 'Sunita Iyer', raisedById: 'U-601', raisedAt: d('2026-10-31T12:00:00'),
    chainageId: 'CH-7', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Sunita Iyer', action: 'Raised', at: '2026-10-31T12:00:00', comment: '' },
      { level: 1, by: 'System', action: 'Escalated', at: '2026-10-31T12:00:00', comment: 'Raiser is the L1 approver â€” segregation of duties.' },
    ],
    payload: { kind: 'offer', candidate: 'Karthik Menon', position: 'Site engineer (structures)', ctc: 9_60_000, joining: '2026-12-01' },
  },
  {
    id: 'REQ-2029', type: 'Job opening', module: 'HRMS', title: 'Opening â€” QA/QC engineer', raisedBy: 'Priya Sharma', raisedById: null, raisedAt: d('2026-10-29T10:00:00'),
    chainageId: 'CH-7', emergency: false, status: 'Approved', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Priya Sharma', action: 'Raised', at: '2026-10-29T10:00:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Approved', at: '2026-10-29T15:00:00', comment: '' },
      { level: 2, by: TENANT_ADMIN, action: 'Approved', at: '2026-10-30T10:00:00', comment: 'Approved.' },
    ],
    payload: { kind: 'job', position: 'QA/QC engineer', openings: 1, ctcMin: 6_00_000, ctcMax: 8_40_000, experience: '4â€“6 years', route: 'Head Office posts and sends candidate', postedOnHrms: true, publishedToSite: null },
  },
  {
    id: 'REQ-2027', type: 'Manpower requisition', module: 'HRMS', title: 'Additional helpers for shuttering', raisedBy: 'Ravi Kumar', raisedById: null, raisedAt: d('2026-10-28T09:30:00'),
    chainageId: 'CH-1', emergency: false, status: 'Rejected', currentLevel: 1, matrixVersion: 1,
    history: [
      { level: 0, by: 'Ravi Kumar', action: 'Raised', at: '2026-10-28T09:30:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Rejected', at: '2026-10-28T17:00:00', comment: 'Use subcontractor labour per contract.' },
    ],
    payload: { kind: 'mrf', position: 'Helper (shuttering)', count: 15, reason: 'Bridge 1 deck shuttering', requiredBy: '2026-11-20' },
  },
  {
    id: 'REQ-2025', type: 'Onboarded employee list', module: 'HRMS', title: 'October joiners â€” depot location', raisedBy: 'Sunita Iyer', raisedById: 'U-601', raisedAt: d('2026-10-27T11:00:00'),
    chainageId: 'CH-7', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Sunita Iyer', action: 'Raised', at: '2026-10-27T11:00:00', comment: '' },
      { level: 1, by: 'System', action: 'Escalated', at: '2026-10-27T11:00:00', comment: 'Raiser is the L1 approver â€” segregation of duties.' },
    ],
    payload: { kind: 'onboarding', employees: [
      { name: 'Lakshmi Prasad', position: 'Surveyor', joining: '2026-10-20' },
      { name: 'Imran Shaikh', position: 'Electrician', joining: '2026-10-22' },
      { name: 'Neha Gupta', position: 'Store assistant', joining: '2026-10-24' },
    ] },
  },
  {
    id: 'REQ-2051', type: 'Job opening', module: 'HRMS', title: 'Opening â€” Surveyor (camp B)', raisedBy: 'Sunita Iyer', raisedById: 'U-601', raisedAt: '2026-11-06T09:20:00',
    chainageId: 'CH-6', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Sunita Iyer', action: 'Raised', at: '2026-11-06T09:20:00', comment: 'Requirement from camp B posted on the HRMS recruitment page.' },
      { level: 1, by: 'System', action: 'Escalated', at: '2026-11-06T09:20:00', comment: 'Raiser is the L1 approver â€” segregation of duties.' },
    ],
    payload: { kind: 'job', position: 'Surveyor', openings: 3, ctcMin: 3_60_000, ctcMax: 4_80_000, experience: '2â€“4 years', postedOnHrms: true },
  },
  {
    id: 'REQ-2063', type: 'Job opening', module: 'HRMS', title: 'Opening â€” Electrician (depot)', raisedBy: 'Priya Sharma', raisedById: null, raisedAt: '2026-10-26T10:00:00',
    chainageId: 'CH-7', emergency: false, status: 'Approved', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Priya Sharma', action: 'Raised', at: '2026-10-26T10:00:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Approved', at: '2026-10-26T15:00:00', comment: '' },
      { level: 2, by: TENANT_ADMIN, action: 'Approved', at: '2026-10-27T10:00:00', comment: 'Location hires locally.' },
    ],
    payload: { kind: 'job', position: 'Electrician', openings: 2, ctcMin: 2_40_000, ctcMax: 3_00_000, experience: 'ITI and 3 years', route: 'Site hires directly', postedOnHrms: true, publishedToSite: null },
  },
  {
    id: 'REQ-2065', type: 'Job opening', module: 'HRMS', title: 'Opening â€” Planning engineer (camp A)', raisedBy: 'Ravi Kumar', raisedById: null, raisedAt: '2026-10-20T09:00:00',
    chainageId: 'CH-1', emergency: false, status: 'Approved', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Ravi Kumar', action: 'Raised', at: '2026-10-20T09:00:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Approved', at: '2026-10-20T14:00:00', comment: '' },
      { level: 2, by: TENANT_ADMIN, action: 'Approved', at: '2026-10-21T10:00:00', comment: 'Head Office to post and send a candidate.' },
    ],
    payload: { kind: 'job', position: 'Planning engineer', openings: 1, ctcMin: 7_20_000, ctcMax: 9_00_000, experience: '5â€“8 years', route: 'Head Office posts and sends candidate', postedOnHrms: true, publishedToSite: '2026-10-22T11:00:00' },
  },
  {
    id: 'REQ-2067', type: 'Job opening', module: 'HRMS', title: 'Opening â€” Driver (camp B)', raisedBy: 'Meera Das', raisedById: null, raisedAt: '2026-10-18T09:00:00',
    chainageId: 'CH-6', emergency: false, status: 'Rejected', currentLevel: 1, matrixVersion: 1,
    history: [
      { level: 0, by: 'Meera Das', action: 'Raised', at: '2026-10-18T09:00:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Rejected', at: '2026-10-18T16:00:00', comment: 'Use drivers from the transport contractor.' },
    ],
    payload: { kind: 'job', position: 'Driver', openings: 2, ctcMin: 2_16_000, ctcMax: 2_64_000, experience: 'Heavy licence and 3 years', postedOnHrms: true },
  },
  {
    id: 'REQ-2053', type: 'Employee transfer', module: 'HRMS', title: 'Transfer â€” Lakshmi Prasad to camp A', raisedBy: 'Meera Das', raisedById: null, raisedAt: '2026-11-05T15:00:00',
    chainageId: 'CH-6', emergency: false, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [{ level: 0, by: 'Meera Das', action: 'Raised', at: '2026-11-05T15:00:00', comment: 'Raised in HRMS.' }],
    payload: { kind: 'transfer', employee: 'Lakshmi Prasad', empId: 'EMP-2210', designation: 'Surveyor', fromSiteId: 'S-203', toSiteId: 'S-201', effective: '2026-11-16', reason: 'Camp A chainage survey for km 12â€“18.' },
  },
  {
    id: 'REQ-2055', type: 'Promotion', module: 'HRMS', title: 'Promotion â€” Ravi Kumar to senior site engineer', raisedBy: 'Vikram Singh', raisedById: 'U-602', raisedAt: '2026-11-04T11:30:00',
    chainageId: 'CH-1', emergency: false, status: 'In review', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Vikram Singh', action: 'Raised', at: '2026-11-04T11:30:00', comment: '' },
      { level: 1, by: 'Sunita Iyer', action: 'Approved', at: '2026-11-05T10:00:00', comment: 'Appraisal rating 4.5/5.' },
    ],
    payload: { kind: 'promotion', employee: 'Ravi Kumar', empId: 'EMP-1310', fromRole: 'Site engineer', toRole: 'Senior site engineer', currentCtc: 8_40_000, newCtc: 10_20_000, effective: '2026-12-01', justification: 'Led camp A mobilisation ahead of schedule.' },
  },
  {
    id: 'REQ-2057', type: 'Bonus and incentive', module: 'HRMS', title: 'Monsoon productivity incentive â€” camp A', raisedBy: 'Sunita Iyer', raisedById: 'U-601', raisedAt: '2026-11-03T16:00:00',
    chainageId: 'CH-1', emergency: false, status: 'Pending', currentLevel: 2, matrixVersion: 1,
    history: [
      { level: 0, by: 'Sunita Iyer', action: 'Raised', at: '2026-11-03T16:00:00', comment: '' },
      { level: 1, by: 'System', action: 'Escalated', at: '2026-11-03T16:00:00', comment: 'Raiser is the L1 approver â€” segregation of duties.' },
    ],
    payload: { kind: 'bonus', basis: 'Incentive', scope: 'Camp A earthwork crew', headcount: 64, amount: 3_20_000, period: 'Julâ€“Sep 2026', criteria: 'Earthwork target met three months running.' },
  },
  {
    id: 'REQ-2059', type: 'Loan and advance', module: 'HRMS', title: 'Housing loan â€” Kiran Rao', raisedBy: 'Deepa Nair', raisedById: 'U-603', raisedAt: '2026-11-02T10:00:00',
    chainageId: 'CH-1', emergency: false, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [{ level: 0, by: 'Deepa Nair', action: 'Raised', at: '2026-11-02T10:00:00', comment: 'Raised in HRMS for a store keeper.' }],
    payload: { kind: 'loan', employee: 'Kiran Rao', empId: 'EMP-1402', amount: 12_00_000, tenureMonths: 60, purpose: 'Housing loan under staff welfare scheme.' },
  },
  {
    id: 'REQ-2061', type: 'Loan and advance', module: 'HRMS', title: 'Salary advance â€” Imran Shaikh', raisedBy: 'Priya Sharma', raisedById: null, raisedAt: '2026-11-06T08:10:00',
    chainageId: 'CH-7', emergency: true, status: 'Pending', currentLevel: 1, matrixVersion: 1,
    history: [{ level: 0, by: 'Priya Sharma', action: 'Raised', at: '2026-11-06T08:10:00', comment: 'Medical emergency in family.' }],
    payload: { kind: 'loan', employee: 'Imran Shaikh', empId: 'EMP-2231', amount: 40_000, tenureMonths: 4, purpose: 'Medical emergency.' },
  },
]

/** Grievances: ID, who raised it, a message of at most 10 words, and the Head Office visit date they picked. */
const GRIEVANCES_RAW: Omit<Grievance, 'code'>[] = [
  {
    id: 'GRV-0118', raisedBy: 'Mahesh Yadav', raisedById: 'EMP-2118', employeeId: 'EMP-2118', subject: 'Overtime for October not paid in my payslip', message: 'Overtime for October not paid in my payslip', visitDate: '2026-11-10', status: 'Requested', raisedAt: '2026-11-06T08:20:00',
    history: [{ status: 'Requested', at: '2026-11-06T08:20:00', note: 'Visit date picked by the employee.' }],
  },
  {
    id: 'GRV-0117', raisedBy: 'Lakshmi Prasad', raisedById: 'EMP-2117', employeeId: 'EMP-2117', subject: 'Need to discuss transfer back to home district', message: 'Need to discuss transfer back to home district', visitDate: '2026-11-12', status: 'Requested', raisedAt: '2026-11-05T17:40:00',
    history: [{ status: 'Requested', at: '2026-11-05T17:40:00', note: 'Visit date picked by the employee.' }],
  },
  {
    id: 'GRV-0116', raisedBy: 'Asha Kumari', raisedById: 'EMP-2116', employeeId: 'EMP-2116', subject: 'Canteen food quality at depot location is poor', message: 'Canteen food quality at depot location is poor', visitDate: '2026-11-06', status: 'Confirmed', raisedAt: '2026-11-04T12:30:00',
    history: [
      { status: 'Requested', at: '2026-11-04T12:30:00', note: 'Visit date picked by the employee.' },
      { status: 'Confirmed', at: '2026-11-04T16:00:00', note: 'Meet the admin manager at Head Office, 15:00.' },
    ],
  },
  {
    id: 'GRV-0115', raisedBy: 'Joseph Thomas', raisedById: 'EMP-2115', employeeId: 'EMP-2115', subject: 'Unsafe scaffolding at bay 3 reported twice', message: 'Unsafe scaffolding at bay 3 reported twice', visitDate: '2026-11-09', status: 'Confirmed', raisedAt: '2026-11-03T10:00:00',
    history: [
      { status: 'Requested', at: '2026-11-03T10:00:00', note: 'Visit date picked by the employee.' },
      { status: 'Confirmed', at: '2026-11-03T15:30:00', note: 'Meet at Head Office reception, 11:00.' },
    ],
  },
  {
    id: 'GRV-0112', raisedBy: 'Imran Shaikh', raisedById: 'EMP-2112', employeeId: 'EMP-2112', subject: 'Leave rejected without any reason given', message: 'Leave rejected without any reason given', visitDate: '2026-11-14', status: 'Rescheduled', raisedAt: '2026-11-01T09:15:00',
    history: [
      { status: 'Requested', at: '2026-11-01T09:15:00', note: 'Visit date picked by the employee: 8 Nov 2026.' },
      { status: 'Rescheduled', at: '2026-11-02T11:00:00', note: '8 Nov is Diwali. Moved to 14 Nov 2026.' },
    ],
  },
  {
    id: 'GRV-0108', raisedBy: 'Ramesh Babu', raisedById: 'EMP-2108', employeeId: 'EMP-2108', subject: 'Drinking water RO unit at camp A not working', message: 'Drinking water RO unit at camp A not working', visitDate: '2026-10-24', status: 'Visited', raisedAt: '2026-10-20T08:00:00',
    history: [
      { status: 'Requested', at: '2026-10-20T08:00:00', note: 'Visit date picked by the employee.' },
      { status: 'Confirmed', at: '2026-10-20T12:00:00', note: '' },
      { status: 'Visited', at: '2026-10-24T16:00:00', note: 'Met at Head Office. RO unit replaced the same day.' },
    ],
  },
  {
    id: 'GRV-0104', raisedBy: 'Neha Gupta', raisedById: 'EMP-2104', employeeId: 'EMP-2104', subject: 'Hostel room allotment issue at depot location', message: 'Hostel room allotment issue at depot location', visitDate: '2026-10-28', status: 'Not visited', raisedAt: '2026-10-22T14:10:00',
    history: [
      { status: 'Requested', at: '2026-10-22T14:10:00', note: 'Visit date picked by the employee.' },
      { status: 'Confirmed', at: '2026-10-23T10:00:00', note: '' },
      { status: 'Not visited', at: '2026-10-28T18:00:00', note: 'Did not come to Head Office. They can raise it again.' },
    ],
  },
]

const pv = <K extends PolicyVersion['key']>(key: K, version: number, effectiveFrom: string, reason: string, data: PolicyVersion<K>['data']): PolicyVersion<K> => ({
  projectId: null,
  id: `${key}-v${version}`, key, version, effectiveFrom, reason, createdBy: TENANT_ADMIN, createdAt: `${effectiveFrom}T09:00:00`, data,
})

const POLICIES_RAW: PolicyVersion[] = [
  pv('shifts', 1, '2026-01-01', 'Initial setup', { shiftsPerDay: 2, notes: 'Day and night shifts.', weekOff: { type: 'Every Sunday' }, timings: [{ name: 'Day', start: '06:00', end: '18:00' }, { name: 'Night', start: '18:00', end: '06:00' }] }),
  pv('shifts', 2, '2026-06-01', 'Metro depot needs a third shift for night concreting', { shiftsPerDay: 3, notes: 'Third shift only where HRMS rosters allow.', weekOff: { type: 'Alternate Saturdays', saturdays: '1st & 3rd' }, timings: [{ name: 'Day', start: '06:00', end: '14:00' }, { name: 'Evening', start: '14:00', end: '22:00' }, { name: 'Night', start: '22:00', end: '06:00' }] }),
  pv('holidays', 1, '2026-01-01', 'Calendar year 2026', {
    year: 2026,
    holidays: [
      { name: 'Republic Day', date: '2026-01-26', type: 'National' }, { name: 'Holi', date: '2026-03-04', type: 'Festival' },
      { name: 'Independence Day', date: '2026-08-15', type: 'National' }, { name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' },
      { name: 'Diwali', date: '2026-11-08', type: 'Festival' }, { name: 'Christmas', date: '2026-12-25', type: 'Optional' },
    ],
    variants: [{ scope: 'Project', scopeId: 'P-102', holidays: [{ name: 'Bonalu', date: '2026-07-20', type: 'Regional' }] }],
  }),
  pv('overtime', 1, '2026-01-01', 'Initial setup', { mode: 'Manual', weekdayRate: 1.5, holidayRate: 2, minMinutes: 30, dailyCapHours: 4, monthlyCapHours: 50, requiresApproval: true }),
  pv('overtime', 2, '2026-12-01', 'Automatic overtime from biometric attendance at all locations', { mode: 'Automatic', weekdayRate: 1.5, holidayRate: 2, minMinutes: 30, dailyCapHours: 4, monthlyCapHours: 50, requiresApproval: true }),
  pv('leave', 1, '2026-01-01', 'Initial setup', {
    leaveTypes: [
      { name: 'Casual leave', code: 'CL', annualDays: 12, accrual: 'Monthly', carryForward: false, maxCarryDays: 0, expiryMonths: 0, encashable: false, paid: true },
      { name: 'Earned leave', code: 'EL', annualDays: 18, accrual: 'Monthly', carryForward: true, maxCarryDays: 30, expiryMonths: 24, encashable: true, paid: true },
      { name: 'Sick leave', code: 'SL', annualDays: 7, accrual: 'Yearly', carryForward: false, maxCarryDays: 0, expiryMonths: 0, encashable: false, paid: true },
    ],
    legalNote: 'Subject to the Factories Act and the applicable state Shops and Establishments Act.',
  }),
  pv('payment-threshold', 1, '2026-01-01', 'Initial setup', { amount: 5_00_000, currency: 'INR' }),
  pv('payment-threshold', 2, '2026-08-01', 'Board resolution BR-2026-14 raised the cash limit', { amount: 10_00_000, currency: 'INR' }),
  pv('rules', 1, '2026-01-01', 'Initial setup', {
    rules: [
      { title: 'PPE on site', category: 'Safety', body: 'Helmet, shoes and high-visibility vest are mandatory in all work zones.', ackRequired: true },
      { title: 'Attendance by geo-fence', category: 'Attendance', body: 'Attendance is marked only inside the location geo-fence.', ackRequired: true },
      { title: 'Code of conduct', category: 'Conduct', body: 'Treat colleagues, clients and communities with respect.', ackRequired: true },
    ],
  }),
]

const AUDIT_RAW: AuditEntry[] = [
  { id: 'AU-9007', at: '2026-10-20T11:30:00', user: TENANT_ADMIN, action: 'Geo-fence updated (step-up verified)', entity: 'Location', entityId: 'S-201', before: 'Circle 750 m at 17.14050, 79.62330', after: 'Linear, 5 pins, 250 m each side' },
  { id: 'AU-9006', at: '2026-11-04T12:00:00', user: TENANT_ADMIN, action: 'Offer letter format replaced', entity: 'Company', entityId: 'offer-letter', before: 'Revision 2', after: 'Revision 3 Â· VeloxIQ-offer-letter-format.pdf' },
  { id: 'AU-9005', at: '2026-11-04T09:30:00', user: 'Sunita Iyer', action: 'Approved L2', entity: 'Request', entityId: 'REQ-2037', before: 'Pending at L2', after: 'In review at L3' },
  { id: 'AU-9004', at: '2026-11-03T09:00:00', user: TENANT_ADMIN, action: 'Status changed', entity: 'Grievance', entityId: 'GRV-0106', before: 'UNDER_REVIEW', after: 'ESCALATED' },
  { id: 'AU-9003', at: '2026-09-14T10:20:00', user: TENANT_ADMIN, action: 'Geo-fence updated (step-up verified)', entity: 'Location', entityId: 'S-201', before: 'Radius 600 m', after: 'Radius 750 m' },
  { id: 'AU-9002', at: '2026-08-01T09:00:00', user: TENANT_ADMIN, action: 'New policy version v2', entity: 'Policy', entityId: 'payment-threshold', before: 'â‚¹5,00,000', after: 'â‚¹10,00,000' },
  { id: 'AU-9001', at: '2026-07-01T09:00:00', user: TENANT_ADMIN, action: 'New matrix version v2', entity: 'Approval chain', entityId: 'AC-7', before: 'L1 Vikram Singh â†’ L2 Anil Mehta', after: 'L1 Vikram Singh â†’ L2 Sunita Iyer â†’ L3 Anil Mehta' },
]

const TICKETS_RAW: Ticket[] = [
  { id: 'TKT-033', code: 'TKT-033', raisedById: 'U-600', subject: 'Geo-fence map does not load on location laptop', category: 'Projects and locations', priority: 'High', description: 'Map tiles stay grey on the camp B laptop behind the location proxy.', status: 'Open', createdAt: '2026-11-05T16:30:00' },
  { id: 'TKT-031', code: 'TKT-031', raisedById: 'U-600', subject: 'Cannot see stock for depot store', category: 'Stores and stock', priority: 'Medium', description: 'Live stock shows blank for ST-303 since morning.', status: 'Answered', createdAt: '2026-11-03T12:00:00' },
  { id: 'TKT-027', code: 'TKT-027', raisedById: 'U-600', subject: 'Approval matrix export has blank columns', category: 'Approval matrix', priority: 'Low', description: 'CSV export of the matrix had empty approver names.', status: 'Closed', createdAt: '2026-10-21T10:00:00' },
]

/** Organisation structure kept in CORE. People sit in HRMS; holders here are shown for single-position roles. */
const DEPARTMENTS_RAW: Department[] = [
  { id: 'D-01', code: 'MGT', name: 'Management', parentId: null, headRoleId: 'R-01', description: 'Board and executive management.', color: 0, status: 'Active' },
  { id: 'D-02', code: 'PRJ', name: 'Projects', parentId: null, headRoleId: 'R-05', description: 'Project delivery at every location.', color: 1, status: 'Active' },
  { id: 'D-03', code: 'ENG', name: 'Engineering and design', parentId: 'D-02', headRoleId: 'R-09', description: 'Design, drawings and surveys for the projects.', color: 2, status: 'Active' },
  { id: 'D-04', code: 'QHS', name: 'Quality and safety', parentId: null, headRoleId: 'R-12', description: 'QA/QC and location safety.', color: 3, status: 'Active' },
  { id: 'D-05', code: 'SCM', name: 'Stores and procurement', parentId: null, headRoleId: 'R-14', description: 'Stores, purchase and material movement.', color: 4, status: 'Active' },
  { id: 'D-06', code: 'PNM', name: 'Plant and machinery', parentId: 'D-05', headRoleId: 'R-15', description: 'Equipment fleet, maintenance and mechanics.', color: 5, status: 'Active' },
  { id: 'D-07', code: 'FIN', name: 'Finance and accounts', parentId: null, headRoleId: 'R-03', description: 'Accounts, payments and treasury.', color: 6, status: 'Active' },
  { id: 'D-08', code: 'HR', name: 'Human resources', parentId: null, headRoleId: 'R-04', description: 'Hiring, payroll inputs and employee relations.', color: 7, status: 'Active' },
  { id: 'D-09', code: 'ADM', name: 'Administration and IT', parentId: null, headRoleId: 'R-21', description: 'Office, transport and IT support.', color: 2, status: 'Active' },
  { id: 'D-10', code: 'COM', name: 'Corporate communications', parentId: 'D-01', headRoleId: null, description: 'Merged into Management in 2026.', color: 3, status: 'Inactive' },
]

const ROLES_RAW: Role[] = [
  { id: 'R-01', code: 'MD', title: 'Managing director', departmentId: 'D-01', grade: 'E1', reportsToId: null, positions: 1, holder: 'Arvind Rao', description: 'Leads the company and reports to the board.', status: 'Active' },
  { id: 'R-02', code: 'DIR-OPS', title: 'Director, operations', departmentId: 'D-01', grade: 'E2', reportsToId: 'R-01', positions: 1, holder: 'Ramesh Chandra', description: 'Runs all project, plant and stores operations.', status: 'Active' },
  { id: 'R-03', code: 'CFO', title: 'Chief financial officer', departmentId: 'D-07', grade: 'E2', reportsToId: 'R-01', positions: 1, holder: 'Kavya Reddy', description: 'Finance, treasury and Head Office payments.', status: 'Active' },
  { id: 'R-04', code: 'HD-HR', title: 'Head, human resources', departmentId: 'D-08', grade: 'E3', reportsToId: 'R-01', positions: 1, holder: 'Sunita Iyer', description: 'HR policy, hiring and employee relations.', status: 'Active' },
  { id: 'R-05', code: 'PD', title: 'Project director', departmentId: 'D-02', grade: 'E3', reportsToId: 'R-02', positions: 1, holder: 'Vikram Singh', description: 'Delivers every project to time and budget.', status: 'Active' },
  { id: 'R-06', code: 'PM', title: 'Project manager', departmentId: 'D-02', grade: 'M1', reportsToId: 'R-05', positions: 3, holder: '', description: 'One per project.', status: 'Active' },
  { id: 'R-07', code: 'SE', title: 'Site engineer', departmentId: 'D-02', grade: 'S2', reportsToId: 'R-06', positions: 12, holder: '', description: 'Runs daily work at a location.', status: 'Active' },
  { id: 'R-08', code: 'PLN', title: 'Planning engineer', departmentId: 'D-02', grade: 'S1', reportsToId: 'R-05', positions: 2, holder: '', description: 'Schedules, progress and reports.', status: 'Active' },
  { id: 'R-09', code: 'HD-ENG', title: 'Head, engineering and design', departmentId: 'D-03', grade: 'M1', reportsToId: 'R-05', positions: 1, holder: '', description: 'Owns designs and drawings.', status: 'Active' },
  { id: 'R-10', code: 'DE', title: 'Design engineer', departmentId: 'D-03', grade: 'S2', reportsToId: 'R-09', positions: 4, holder: '', description: 'Structural and highway design.', status: 'Active' },
  { id: 'R-11', code: 'SUR', title: 'Surveyor', departmentId: 'D-03', grade: 'S3', reportsToId: 'R-09', positions: 6, holder: '', description: 'Chainage, levels and setting out.', status: 'Active' },
  { id: 'R-12', code: 'QA-MGR', title: 'QA/QC manager', departmentId: 'D-04', grade: 'M2', reportsToId: 'R-02', positions: 1, holder: '', description: 'Quality plans, tests and audits.', status: 'Active' },
  { id: 'R-13', code: 'SO', title: 'Safety officer', departmentId: 'D-04', grade: 'S2', reportsToId: 'R-12', positions: 5, holder: '', description: 'One per active location, plus Head Office.', status: 'Active' },
  { id: 'R-14', code: 'HD-SCM', title: 'Head, stores and plant', departmentId: 'D-05', grade: 'M1', reportsToId: 'R-02', positions: 1, holder: 'Deepa Nair', description: 'Stores, purchase and the plant fleet.', status: 'Active' },
  { id: 'R-15', code: 'PNM-MGR', title: 'Manager, plant and machinery', departmentId: 'D-06', grade: 'M2', reportsToId: 'R-14', positions: 1, holder: 'Rahul Verma', description: 'Fleet planning and maintenance.', status: 'Active' },
  { id: 'R-16', code: 'SK', title: 'Store keeper', departmentId: 'D-05', grade: 'S3', reportsToId: 'R-14', positions: 4, holder: '', description: 'One per store.', status: 'Active' },
  { id: 'R-17', code: 'PO', title: 'Purchase officer', departmentId: 'D-05', grade: 'S2', reportsToId: 'R-14', positions: 2, holder: '', description: 'Vendor purchase for material.', status: 'Active' },
  { id: 'R-18', code: 'ACC-MGR', title: 'Accounts manager', departmentId: 'D-07', grade: 'M2', reportsToId: 'R-03', positions: 1, holder: 'Suresh Pillai', description: 'Books, payables and location imprest.', status: 'Active' },
  { id: 'R-19', code: 'ACC', title: 'Accountant', departmentId: 'D-07', grade: 'S3', reportsToId: 'R-18', positions: 4, holder: '', description: 'Location and Head Office accounts.', status: 'Active' },
  { id: 'R-20', code: 'HRX', title: 'HR executive', departmentId: 'D-08', grade: 'S2', reportsToId: 'R-04', positions: 3, holder: '', description: 'Onboarding, attendance and payroll inputs.', status: 'Active' },
  { id: 'R-21', code: 'ADM-MGR', title: 'Admin and IT manager', departmentId: 'D-09', grade: 'M2', reportsToId: 'R-01', positions: 1, holder: '', description: 'Office, transport and IT.', status: 'Active' },
  { id: 'R-22', code: 'MEC', title: 'Mechanic', departmentId: 'D-06', grade: 'W1', reportsToId: 'R-15', positions: 8, holder: '', description: 'Field repairs and servicing.', status: 'Active' },
  { id: 'R-23', code: 'COM-OFF', title: 'Communications officer', departmentId: 'D-10', grade: 'S2', reportsToId: 'R-01', positions: 1, holder: '', description: 'Role closed when the department merged.', status: 'Inactive' },
]

// ---------------------------------------------------------------------------
// Stable ids. Each seed record keeps its readable id (P-101, CH-1, U-600 ...).
// A record with no `code` of its own takes that id as its `code`; a readable
// code it already has (NH65-PKG2, CEM-OPC53 ...) is left as it is.
// ---------------------------------------------------------------------------

const fnv = (s: string, seed: number): string => {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Deterministic v4-shaped uuid from a raw seed id, so tests and screenshots stay stable. */
export const uuidOf = (raw: string): string => {
  const h = fnv(raw, 0x811c9dc5) + fnv(raw, 0x9e3779b9) + fnv(raw, 0x85ebca6b) + fnv(raw, 0xc2b2ae35)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const RAW_IDS = new Set<string>()

const collectIds = (v: unknown): void => {
  if (Array.isArray(v)) v.forEach(collectIds)
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'id' && typeof x === 'string') RAW_IDS.add(x)
      else collectIds(x)
    }
  }
}

// Ids stay as the seed's readable codes (R-05, D-07, AC-7, GRV-0117) so routes and references resolve by them.
// A record that already has a readable `code` (CEM-OPC53, STR-A ...) keeps it; only a record without one takes its id as `code`.
const remap = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(remap)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = remap(x)
    const o = v as { id?: unknown; code?: unknown }
    if (typeof o.id === 'string' && RAW_IDS.has(o.id) && typeof o.code !== 'string') out.code = o.id
    return out
  }
  return v
}

const fix = <T>(v: T): T => remap(v) as T

;[PROJECTS_RAW, SITES_RAW, STORES_RAW, MATERIALS_RAW, STOCK_RAW, PLAN_LINES_RAW, PEOPLE_PLAN_RAW, MATERIAL_PLAN_RAW,
  UNITS_RAW, ASSIGNMENTS_RAW, USERS_RAW, ADMIN_APPROVER_RAW, CHAINS_RAW, REQUESTS_RAW, GRIEVANCES_RAW, POLICIES_RAW,
  AUDIT_RAW, TICKETS_RAW, DEPARTMENTS_RAW, ROLES_RAW, VENDORS_RAW].forEach(collectIds)

export const PROJECTS = fix(PROJECTS_RAW)
export const SITES = fix(SITES_RAW)
export const STORES = fix(STORES_RAW)
export const MATERIALS = fix(MATERIALS_RAW)
// Stock rows had no id in the seed; they get one here, derived from their position.
export const STOCK = fix(STOCK_RAW).map((r, i) => ({ ...r, id: uuidOf('STK-' + (i + 1)) }))
export const PLAN_LINES = fix(PLAN_LINES_RAW)
export const PEOPLE_PLAN = fix(PEOPLE_PLAN_RAW)
export const MATERIAL_PLAN = fix(MATERIAL_PLAN_RAW)
export const UNITS = fix(UNITS_RAW)
export const ASSIGNMENTS = fix(ASSIGNMENTS_RAW)
// Users have no `code`: loginId is the readable id (handoff core_user.login_id), so drop the one remap() adds.
export const USERS: CoreUser[] = USERS_RAW.map((u) => ({ ...u }))
export const ADMIN_APPROVER = fix(ADMIN_APPROVER_RAW)
export const CHAINS = fix(CHAINS_RAW)
export const REQUESTS = fix(REQUESTS_RAW) as ApprovalRequest[]
export const GRIEVANCES = fix(GRIEVANCES_RAW) as Grievance[]
export const POLICIES = fix(POLICIES_RAW)
export const AUDIT = fix(AUDIT_RAW)
export const TICKETS = fix(TICKETS_RAW)
export const DEPARTMENTS = fix(DEPARTMENTS_RAW)
export const ROLES = fix(ROLES_RAW)
export const VENDORS = fix(VENDORS_RAW)
