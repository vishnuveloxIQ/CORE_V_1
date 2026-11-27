/**
 * Reference lists the screens use as plain constants: the equipment type names and the privilege catalogue.
 * They are not records from the server, so the store does not load them.
 */

/** Equipment type names offered when a type is picked from a list. */
export const EQUIPMENT_TYPES = [
  'Excavator', 'Bulldozer', 'Wheel Loader', 'Backhoe Loader (JCB)', 'Motor Grader', 'Road Roller', 'Dump Truck',
  'Mobile Crane', 'Tower Crane', 'Concrete Mixer', 'Concrete Batching Plant', 'Concrete Pump', 'Concrete Vibrator',
  'Plate Compactor', 'Soil Compactor', 'Asphalt Paver', 'Road Milling Machine', 'Forklift', 'Scissor Lift', 'Boom Lift',
  'Air Compressor', 'Diesel Generator', 'Water Pump', 'Hydraulic Breaker', 'Bar Bending Machine', 'Bar Cutting Machine',
  'Concrete Cutting Machine', 'Welding Machine', 'Scaffolding System', 'Material Hoist',
]

/** Privilege catalogue per module. Placeholder until each module publishes its catalogue (PRD §6, blocking question 2). */
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

/** The equipment types offered first on a plan line; any other type is added with "Other". */
export const PLAN_EQUIPMENT_TYPES = ['Tipper', 'Excavator', 'Wheel Loader', 'Roller'] as const

/** Suggested capacities or sizes for a plan line, by equipment type. The planner can also type their own. */
export const CAPACITY_OPTIONS: Record<string, readonly string[]> = {
  Tipper: ['6-wheel', '10-wheel', '12-wheel', '14-wheel', '16-wheel'],
  Excavator: ['20-ton (210)', '30-ton (300)', '40-ton (400)', 'Mini excavator'],
  'Wheel Loader': ['1.5 m³ bucket', '2 m³ bucket', '3 m³ bucket'],
  Roller: ['8-ton', '10-ton', '12-ton', '14-ton'],
}

/** Equipment categories for the register: the category is the unit's equipment type. "Other" is typed on the form. */
export const EQUIPMENT_CATEGORIES = [
  'Excavator', 'Wheel Loader', 'Backhoe Loader', 'Motor Grader', 'Dozer', 'Crane', 'Sensor Paver', 'Tandem Roller',
  'Soil Compactor', 'Pad Foot Roller', 'Bitumen Sprayer', 'Tipper', 'Mini Truck', 'Transit Mixer', 'Water Tanker',
  'Diesel Tanker / Bowser', 'Service Van', 'Trailer', 'LMV (Light Motor Vehicle)',
] as const

/** Manufacturers (OEM) offered for each category. A manufacturer not listed is typed on the form. Sample list; edit as needed. */
export const EQUIPMENT_MANUFACTURERS: Record<string, readonly string[]> = {
  Excavator: ['Caterpillar', 'Komatsu', 'Hitachi', 'Tata Hitachi', 'Volvo CE', 'JCB', 'Hyundai', 'Doosan', 'Kobelco', 'Liebherr', 'L&T'],
  'Wheel Loader': ['Caterpillar', 'Komatsu', 'Volvo CE', 'JCB', 'Hyundai', 'SDLG', 'Liugong', 'L&T'],
  'Backhoe Loader': ['JCB', 'Case', 'New Holland', 'Caterpillar', 'Mahindra', 'Escorts Kubota'],
  'Motor Grader': ['Caterpillar', 'Komatsu', 'John Deere', 'Volvo CE', 'Liebherr', 'XCMG', 'SANY'],
  Dozer: ['Caterpillar', 'Komatsu', 'Shantui', 'Liebherr', 'John Deere', 'Case'],
  Crane: ['Liebherr', 'Tadano', 'Grove', 'Escorts Kubota', 'XCMG', 'Manitowoc'],
  'Sensor Paver': ['Vogele', 'Caterpillar', 'Volvo CE', 'Ammann'],
  'Tandem Roller': ['Dynapac', 'Bomag', 'Hamm', 'Caterpillar', 'Volvo CE', 'Sakai'],
  'Soil Compactor': ['Dynapac', 'Bomag', 'Hamm', 'Caterpillar', 'Ammann'],
  'Pad Foot Roller': ['Dynapac', 'Bomag', 'Hamm', 'Caterpillar', 'Ammann'],
  'Bitumen Sprayer': ['Vogele', 'Ammann', 'Dynapac', 'Bitelli'],
  Tipper: ['Tata Motors', 'Ashok Leyland', 'BharatBenz', 'Eicher', 'Mahindra', 'Volvo'],
  'Mini Truck': ['Tata Motors', 'Mahindra', 'Ashok Leyland', 'Maruti Suzuki', 'Piaggio'],
  'Transit Mixer': ['Schwing Stetter', 'Putzmeister', 'Liebherr', 'Ashok Leyland', 'Tata Motors', 'BharatBenz'],
  'Water Tanker': ['Tata Motors', 'Ashok Leyland', 'BharatBenz', 'Eicher', 'Mahindra'],
  'Diesel Tanker / Bowser': ['Tata Motors', 'Ashok Leyland', 'BharatBenz', 'Eicher'],
  'Service Van': ['Tata Motors', 'Mahindra', 'Maruti Suzuki', 'Force Motors', 'Toyota'],
  Trailer: ['Tata Motors', 'Ashok Leyland', 'Mahindra'],
  'LMV (Light Motor Vehicle)': ['Maruti Suzuki', 'Mahindra', 'Tata Motors', 'Toyota', 'Hyundai', 'Honda'],
}
