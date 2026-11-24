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
