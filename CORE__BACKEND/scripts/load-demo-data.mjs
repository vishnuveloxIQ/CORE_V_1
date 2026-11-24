// Loads demo master data into one tenant through the running API, so every row passes the real validation.
// Local development only. It is not a migration and it is not run in deployment.
//
// Usage (the API must already be running, and the tenant migrated):
//   DATABASE_URL=... DEMO_LOGIN_ID=demo.loader DEMO_PASSWORD=... npm run demo:load -- <tenantId> [apiBaseUrl]
//
// Safe to re-run: each row is looked up first and created only when missing, so existing rows are reused.
// The login user needs the write privileges listed in README.md. DATABASE_URL is used only to add the
// dev UOM rows to shared.uom, which Core reads but does not own (Platform Administration owns it).
// Passwords and tokens are never printed.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

const tenantId = process.argv[2];
const apiBase = (process.argv[3] ?? process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

if (!tenantId || !loginId || !password || !databaseUrl) {
  console.error(
    'Usage: DATABASE_URL=... DEMO_LOGIN_ID=... DEMO_PASSWORD=... npm run demo:load -- <tenantId> [apiBaseUrl]',
  );
  process.exit(1);
}

let token = '';

/** One API call. Throws with the method, path, status and error code only, never the body or the token. */
async function api(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (path === '/auth/login') headers['x-tenant-id'] = tenantId;
  else headers.authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['idempotency-key'] = randomUUID();

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code ?? 'ERROR';
    const message = json?.error?.message ?? 'no message';
    throw new Error(`${method} ${path} -> ${res.status} ${code}: ${message}`);
  }
  return json.data;
}

const made = {};
const reused = {};
function tally(kind, created) {
  const bag = created ? made : reused;
  bag[kind] = (bag[kind] ?? 0) + 1;
}

/** Returns the existing row that matches, or creates it. The GET-then-POST keeps re-runs safe. */
async function ensure(kind, listPath, match, createPath, body) {
  const rows = (await api('GET', listPath)) ?? [];
  const existing = rows.find(match);
  if (existing) {
    tally(kind, false);
    return existing;
  }
  const row = await api('POST', createPath, body);
  tally(kind, true);
  return row;
}

// Dev-only reference rows for shared.uom (Core reads this table and does not own it).
async function seedUoms(client) {
  const codes = [
    ['NOS', 'Numbers'],
    ['KG', 'Kilogram'],
    ['M', 'Metre'],
    ['LTR', 'Litre'],
    ['HR', 'Hour'],
  ];
  for (const [code, name] of codes) {
    await client.query(
      'INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, $2) ON CONFLICT (uom_code) DO NOTHING',
      [code, name],
    );
  }
  const { rows } = await client.query('SELECT id, uom_code FROM shared.uom');
  return Object.fromEntries(rows.map((r) => [r.uom_code, r.id]));
}

async function main() {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  let uom;
  try {
    uom = await seedUoms(db);
  } finally {
    await db.end();
  }
  console.log(`uom rows ready: ${Object.keys(uom).join(', ')}`);

  const login = await api('POST', '/auth/login', { loginId, password });
  token = login.accessToken;
  const me = await api('GET', '/auth/me');
  console.log(`signed in as ${loginId} in tenant_${tenantId}`);

  // Organisation. The profile is replaced whole; its row version is read first when it exists.
  const profile = await api('GET', '/organisation/company-profile');
  await api('PUT', '/organisation/company-profile', {
    code: 'DEMO-CO',
    legalName: 'Demo Construction Pvt Ltd',
    status: 'active',
    tradeName: 'Demo Construction',
    cin: null,
    gstin: null,
    pan: null,
    tan: null,
    addressLine1: '12 Demo Road',
    addressLine2: null,
    city: 'Pune',
    state: 'Maharashtra',
    pin: '411001',
    country: 'India',
    contactName: 'Site Office',
    contactEmail: null,
    contactPhone: null,
    website: null,
    logoFileId: null,
    settings: null,
    ...(profile?.rowVersion ? { rowVersion: profile.rowVersion } : {}),
  });
  tally('company profile', !profile);

  await ensure(
    'holiday',
    '/organisation/holidays',
    (r) => r.holidayDate === '2026-01-26' && r.name === 'Republic Day',
    '/organisation/holidays',
    { holidayDate: '2026-01-26', name: 'Republic Day', holidayType: 'national', isOptional: false },
  );
  await ensure('shift', '/organisation/shifts', (r) => r.code === 'GEN', '/organisation/shifts', {
    code: 'GEN',
    name: 'General shift',
    timezone: 'Asia/Kolkata',
    inTime: '09:00',
    outTime: '18:00',
    weekOffDays: [7],
    effectiveFrom: '2026-01-01',
  });
  await ensure(
    'number series',
    '/organisation/number-series',
    (r) => r.seriesCode === 'PRJ',
    '/organisation/number-series',
    { seriesCode: 'PRJ', prefix: 'PRJ-', yearScope: 0 },
  );
  const dept = await ensure(
    'department',
    '/organisation/departments',
    (r) => r.code === 'OPS',
    '/organisation/departments',
    { code: 'OPS', name: 'Operations' },
  );
  await ensure('position', '/organisation/positions', (r) => r.code === 'SUPV', '/organisation/positions', {
    code: 'SUPV',
    title: 'Site supervisor',
    departmentId: dept.id,
    plannedPositions: 2,
  });

  // Projects
  const project = await ensure('project', '/projects', (r) => r.code === 'PRJ-001', '/projects', {
    code: 'PRJ-001',
    name: 'Highway section A',
    client: 'Demo Client',
    status: 'active',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    valueAmount: 1000000,
    description: 'Demo project for local testing',
  });
  const location = await ensure('location', '/locations', (r) => r.code === 'LOC-01', '/locations', {
    code: 'LOC-01',
    name: 'Camp 0 to 10 km',
    projectId: project.id,
    latitude: 18.52,
    longitude: 73.85,
    city: 'Pune',
    state: 'Maharashtra',
    chainageStartKm: 0,
    chainageEndKm: 10,
  });
  const store = await ensure('store', '/stores', (r) => r.code === 'STR-01', '/stores', {
    code: 'STR-01',
    name: 'Main store',
    locationId: location.id,
    keeper: 'Store keeper',
  });
  const wbs = await ensure('wbs node', '/wbs-nodes', (r) => r.code === 'WBS-1', '/wbs-nodes', {
    code: 'WBS-1',
    name: 'Earthworks',
    projectId: project.id,
  });
  await ensure('chainage marker', '/chainage-markers', (r) => r.code === 'CM-0', '/chainage-markers', {
    code: 'CM-0',
    label: 'Km 0',
    projectId: project.id,
    chainageKm: 0,
    wbsNodeId: wbs.id,
  });
  // Geo-fences change where attendance is accepted, so the API requires a passkey check (step-up). A script cannot
  // give one, so this step is skipped and reported; add the geo-fence on the Geofences screen with a passkey.
  try {
    await ensure(
      'geo zone',
      '/geo-zones',
      (r) => r.label === 'Camp perimeter' && r.projectId === project.id,
      '/geo-zones',
      {
        projectId: project.id,
        label: 'Camp perimeter',
        zoneType: 'attendance',
        shape: 'circle',
        centerLat: 18.52,
        centerLng: 73.85,
        radiusM: 300,
      },
    );
  } catch (err) {
    if (!String(err.message).includes('STEP_UP_REQUIRED')) throw err;
    console.log('skipped: geo zone needs a passkey check (add it on the Geofences screen)');
  }
  await ensure(
    'milestone',
    '/milestones',
    (r) => r.name === 'Foundation complete' && r.projectId === project.id,
    '/milestones',
    {
      projectId: project.id,
      name: 'Foundation complete',
      dueDate: '2026-06-30',
      weight: 40,
      status: 'pending',
    },
  );

  // Masters
  await ensure('vendor', '/vendors', (r) => r.code === 'VND-01', '/vendors', {
    code: 'VND-01',
    name: 'Demo Supplies Pvt Ltd',
    phone: '9800000000',
  });
  const material = await ensure('material', '/materials', (r) => r.code === 'MAT-CEM', '/materials', {
    code: 'MAT-CEM',
    name: 'Cement',
    uomId: uom.KG,
    reorderLevel: 10,
    category: 'Construction',
  });
  const equipment = await ensure(
    'equipment type',
    '/equipment-types',
    (r) => r.code === 'EXC01',
    '/equipment-types',
    {
      code: 'EXC01',
      name: 'Excavator',
      meterKind: 'hours',
      meterPrecision: 1,
      fuelNormUnit: 'litre_per_hour',
    },
  );
  await ensure(
    'allocation',
    '/major-material-allocations',
    (r) => r.projectId === project.id && r.materialId === material.id,
    '/major-material-allocations',
    {
      projectId: project.id,
      materialId: material.id,
      uomId: uom.KG,
      quantity: 500,
      requiredBy: '2026-03-01',
    },
  );
  await ensure(
    'assignment',
    '/equipment-assignments',
    (r) => r.projectId === project.id && r.equipmentTypeId === equipment.id,
    '/equipment-assignments',
    { projectId: project.id, equipmentTypeId: equipment.id, qty: 2 },
  );
  await ensure(
    'plan line',
    '/plan-lines',
    (r) => r.projectId === project.id && r.materialId === material.id,
    '/plan-lines',
    {
      projectId: project.id,
      resourceKind: 'material',
      materialId: material.id,
      uomId: uom.KG,
      storeId: store.id,
      quantity: 100,
      fromDate: '2026-02-01',
      toDate: '2026-06-30',
      requiredBy: '2026-02-01',
    },
  );

  // Policies, leave and overtime
  const policy = await ensure('policy', '/policies', (r) => r.code === 'ATT-01', '/policies', {
    kind: 'attendance',
    code: 'ATT-01',
    name: 'Attendance policy',
  });
  const version = await ensure(
    'policy version',
    '/policy-versions',
    (r) => r.policyId === policy.id,
    '/policy-versions',
    {
      policyId: policy.id,
      body: { summary: 'Demo attendance policy' },
      effectiveFrom: '2026-01-01',
    },
  );
  await ensure(
    'policy rule',
    '/policy-rules',
    (r) => r.policyVersionId === version.id && r.title === 'Mark attendance daily',
    '/policy-rules',
    {
      policyVersionId: version.id,
      title: 'Mark attendance daily',
      category: 'attendance',
      body: 'Mark attendance at the start and end of every shift.',
      ackRequired: true,
    },
  );
  await ensure('leave type', '/leave-types', (r) => r.code === 'CL', '/leave-types', {
    code: 'CL',
    name: 'Casual leave',
    isPaid: true,
    annualDays: 12,
    accrual: 'yearly',
    carryForward: false,
    maxCarryDays: 0,
    expiryMonths: 12,
    encashable: false,
  });
  await ensure('ot policy', '/ot-policies', (r) => r.code === 'OT-STD', '/ot-policies', {
    code: 'OT-STD',
    name: 'Standard overtime',
    settlementMode: 'comp_off',
    rateWorkingDay: 1.5,
    rateWeekOff: 2,
    rateHoliday: 2,
    compOffMultiplier: 1,
    compOffExpiryDays: 30,
    maxHoursPerDay: 4,
    maxHoursPerMonth: 60,
    claimWithinDays: 7,
    minMinutes: 30,
    requiresApproval: true,
  });

  // Approvals
  const chain = await ensure(
    'approval chain',
    '/approval-chains',
    (r) => r.name === 'Store purchase approval',
    '/approval-chains',
    {
      scopeType: 'company',
      requestType: 'purchase',
      module: 'stores',
      name: 'Store purchase approval',
    },
  );
  const matrix = await ensure(
    'matrix version',
    '/matrix-versions',
    (r) => r.chainId === chain.id,
    '/matrix-versions',
    { chainId: chain.id, effectiveFrom: '2026-01-01' },
  );
  // A level needs an approver: the loader's own user stands in for the approver role here.
  await ensure(
    'matrix level',
    '/matrix-levels',
    (r) => r.matrixVersionId === matrix.id && r.levelNo === 1,
    '/matrix-levels',
    {
      matrixVersionId: matrix.id,
      levelNo: 1,
      amountFrom: 0,
      amountTo: 100000,
      approverUserId: me.user.id,
      timeoutHours: 48,
      onTimeout: 'escalate',
    },
  );
  await ensure('pms limit row', '/pms-limit-rows', (r) => r.tier === 1 && r.priority === 'normal', '/pms-limit-rows', {
    tier: 1,
    priority: 'normal',
    amountInr: 10000,
    days: 0,
    hours: 4,
    minutes: 0,
  });

  // Records
  await ensure(
    'file',
    '/files',
    (r) => r.objectKey === 'demo/site-plan.pdf',
    '/files',
    {
      ownerType: 'project',
      ownerId: project.id,
      fileName: 'site-plan.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      objectKey: 'demo/site-plan.pdf',
      visibility: 'team',
    },
  );
  await ensure(
    'ticket',
    '/tickets',
    (r) => r.code === 'TKT-001',
    '/tickets',
    { code: 'TKT-001', subject: 'Gate access query', category: 'general' },
  );
  await ensure(
    'grievance',
    '/grievances',
    (r) => r.code === 'GRV-001',
    '/grievances',
    { code: 'GRV-001', subject: 'Site access query', message: 'Demo grievance' },
  );
  await ensure(
    'import batch',
    '/import-batches',
    (r) => r.batchCode === 'IMP-001',
    '/import-batches',
    { batchCode: 'IMP-001', importType: 'materials', templateVersion: '1.0' },
  );
  await ensure(
    'timeline entry',
    '/record-timeline',
    (r) => r.entityId === project.id && r.action === 'created',
    '/record-timeline',
    {
      entityType: 'project',
      entityId: project.id,
      action: 'created',
      remarks: 'Demo project loaded',
    },
  );

  console.log('created:');
  for (const [kind, n] of Object.entries(made)) console.log(`  ${kind}: ${n}`);
  console.log('already present (reused):');
  for (const [kind, n] of Object.entries(reused)) console.log(`  ${kind}: ${n}`);
}

main().catch((err) => {
  console.error(`Load stopped: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exitCode = 1;
});
