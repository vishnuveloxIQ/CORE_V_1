// Development only. Loads sample equipment units, maintenance schedules, module events and module audit entries into one
// tenant THROUGH THE API, so every row passes the real validation. Not a migration; never run in deployment.
//
// Usage (the API must be running and the tenant migrated and seeded):
//   DEMO_LOGIN_ID=ACME1234 DEMO_PASSWORD=... node scripts/load-dev-equipment.mjs <tenantId> <prefix> [apiBaseUrl]
// Re-running adds the same rows again only when their asset codes are new; existing asset codes are skipped.
// Passwords and tokens are never printed.

import { randomUUID } from 'node:crypto';

const tenantId = process.argv[2];
const prefix = process.argv[3];
const apiBase = (process.argv[4] ?? process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
if (!tenantId || !prefix || !loginId || !password) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-equipment.mjs <tenantId> <prefix> [apiBaseUrl]');
  process.exit(1);
}

let token = '';
let base = {};
const day = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const iso = (offsetHours) => new Date(Date.now() + offsetHours * 3600000).toISOString();

async function call(method, path, body) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = randomUUID();
  }
  const res = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${json.error?.code ?? ''}`), { status: res.status });
  return json.data;
}

async function signIn() {
  const res = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ loginId, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(`sign-in failed (${res.status})`);
  token = json.data.accessToken;
}

// ----- sample units: [name, type, make model, model, manufacturer, year, capacity, capacityUnit, status, location code, owner]
const UNITS = [
  ['Excavator', 'Excavator', 'Caterpillar 320D', '320D', 'Caterpillar', '2021', '20', 'Ton', 'Available', 'CNL-1', 'Owned'],
  ['Excavator', 'Excavator', 'Hitachi ZX200', 'ZX200', 'Hitachi', '2020', '20', 'Ton', 'In use', 'FLY-1', 'Owned'],
  ['Excavator', 'Excavator', 'Tata Hitachi EX300', 'EX300', 'Tata Hitachi', '2022', '30', 'Ton', 'Available', 'MTR-D1', 'Hired'],
  ['Dump Truck', 'Dump Truck', 'Tata Prima 2830.K', '2830.K', 'Tata Motors', '2021', '16', 'Ton', 'In use', 'CNL-1', 'Owned'],
  ['Dump Truck', 'Dump Truck', 'BharatBenz 2523C', '2523C', 'BharatBenz', '2022', '16', 'Ton', 'In use', 'FLY-1', 'Hired'],
  ['Dump Truck', 'Dump Truck', 'Ashok Leyland 3125', '3125', 'Ashok Leyland', '2020', '25', 'Ton', 'Available', 'MTR-D1', 'Owned'],
  ['Wheel Loader', 'Wheel Loader', 'JCB 436ZX', '436ZX', 'JCB', '2021', '2', 'm³', 'In use', 'MTR-D1', 'Owned'],
  ['Wheel Loader', 'Wheel Loader', 'Komatsu WA320', 'WA320', 'Komatsu', '2022', '3', 'm³', 'Under maintenance', 'CNL-1', 'Owned'],
  ['Road Roller', 'Road Roller', 'Dynapac CA251D', 'CA251D', 'Dynapac', '2021', '10', 'Ton', 'In use', 'FLY-1', 'Owned'],
  ['Road Roller', 'Road Roller', 'Bomag BW219', 'BW219', 'Bomag', '2020', '12', 'Ton', 'Available', 'CNL-1', 'Hired'],
  ['Backhoe Loader (JCB)', 'Backhoe Loader (JCB)', 'JCB 3DX', '3DX', 'JCB', '2022', '1', 'm³', 'Available', 'MTR-D1', 'Owned'],
  ['Bulldozer', 'Bulldozer', 'Komatsu D65', 'D65', 'Komatsu', '2019', '18', 'Ton', 'Under maintenance', 'FLY-1', 'Owned'],
  ['Motor Grader', 'Motor Grader', 'Caterpillar 120K', '120K', 'Caterpillar', '2020', '14', 'ft blade', 'Available', 'CNL-1', 'Owned'],
  ['Mobile Crane', 'Mobile Crane', 'Escorts Hydra 14XL', '14XL', 'Escorts', '2021', '14', 'Ton', 'In use', 'MTR-D1', 'Hired'],
  ['Tower Crane', 'Tower Crane', 'Liebherr 85 EC-B', '85 EC-B', 'Liebherr', '2019', '5', 'Ton', 'Available', 'FLY-1', 'Owned'],
  ['Concrete Mixer', 'Concrete Mixer', 'Schwing Stetter AM 9', 'AM 9', 'Schwing Stetter', '2021', '9', 'm³', 'Under maintenance', 'CNL-1', 'Owned'],
  ['Concrete Pump', 'Concrete Pump', 'Putzmeister BSA 1407', 'BSA 1407', 'Putzmeister', '2020', '70', 'm³/h', 'Available', 'FLY-1', 'Hired'],
  ['Asphalt Paver', 'Asphalt Paver', 'Vogele Super 1800', 'Super 1800', 'Vogele', '2021', '3.5', 'm', 'Available', 'MTR-D1', 'Owned'],
  ['Forklift', 'Forklift', 'Godrej GX 30', 'GX 30', 'Godrej', '2022', '3', 'Ton', 'Breakdown', 'CNL-1', 'Owned'],
  ['Diesel Generator', 'Diesel Generator', 'Kirloskar KG1-125', 'KG1-125', 'Kirloskar', '2021', '125', 'kVA', 'In use', 'FLY-1', 'Owned'],
  ['Air Compressor', 'Air Compressor', 'Atlas Copco XAS 186', 'XAS 186', 'Atlas Copco', '2020', '186', 'cfm', 'Under maintenance', 'MTR-D1', 'Owned'],
  ['Water Pump', 'Water Pump', 'Kirloskar KDS 3-HP', 'KDS 3-HP', 'Kirloskar', '2022', '3', 'HP', 'Available', 'CNL-1', 'Owned'],
  ['Plate Compactor', 'Plate Compactor', 'Wacker Neuson VP1550', 'VP1550', 'Wacker Neuson', '2021', '0.55', 'm', 'Available', 'FLY-1', 'Owned'],
];

const SCHEDULE_TASKS = ['General service'];
const HEAVY = new Set(['Excavator', 'Wheel Loader', 'Bulldozer', 'Mobile Crane', 'Motor Grader', 'Concrete Pump']);

async function main() {
  await signIn();
  const [locations, types, vendors] = await Promise.all([call('GET', '/locations'), call('GET', '/equipment-types'), call('GET', '/vendors')]);
  const locByCode = new Map(locations.map((l) => [l.code, l]));
  const typeByName = new Map(types.map((t) => [t.name, t]));
  const vendorId = vendors[0]?.id ?? null;
  const existing = new Set((await call('GET', '/equipment-units?limit=200')).map((u) => u.assetCode));
  const counter = {};
  const created = [];
  const report = { units: 0, skippedUnits: 0, schedules: 0, events: 0, audit: 0, failures: [] };

  for (const [i, row] of UNITS.entries()) {
    const [name, typeName, makeModel, model, manufacturer, year, capacity, capUnit, status, locCode, owner] = row;
    const type = typeByName.get(typeName);
    if (!type) { report.failures.push(`type missing: ${typeName}`); continue; }
    const pre = (type.code ?? typeName).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    counter[pre] = (counter[pre] ?? 0) + 1;
    const assetCode = `${prefix}-${pre}-${String(counter[pre]).padStart(2, '0')}`;
    if (existing.has(assetCode)) { report.skippedUnits++; continue; }
    const loc = locByCode.get(locCode);
    const hired = owner === 'Hired';
    const meter = 900 + i * 137;
    const body = {
      assetCode,
      equipmentTypeId: type.id,
      name,
      makeModel,
      model,
      manufacturer,
      mfgYear: year,
      regNo: `TS${String(9 + (i % 4)).padStart(2, '0')}${'ABCDEFGH'[i % 8]}${'UKMNPRSTW'[i % 9]}${String(1000 + i * 137).slice(-4)}`,
      engineNo: `ENG-${assetCode}-${1000 + i * 91}`,
      chasisNo: `CH-${assetCode}-${5000 + i * 173}`,
      availability: status,
      locationId: loc?.id ?? null,
      currentLocation: loc?.name ?? null,
      capacity,
      capacityUnit: capUnit,
      meterType: 'HMR',
      meterReading: String(meter),
      fuelType: 'Diesel',
      fuelNorm: String(8 + (i % 10)),
      tankCapacity: String(150 + (i % 6) * 50),
      ownershipType: hired ? 'Hired' : 'Owned',
      owner: hired ? 'Hire vendor' : 'Company',
      vendorId: hired ? vendorId : null,
      hireRef: hired ? `HIRE-${assetCode}` : null,
      agreementStart: hired ? day(-200) : null,
      agreementEnd: hired ? day(160) : null,
      warrantyEnd: day(400 - i * 20),
      warrantyReading: String(meter + 1000),
      invoiceNo: `INV-${year}-${String(120 + i * 7).padStart(4, '0')}`,
      invoiceDate: `${year}-03-15`,
      insuranceNo: `INS-${assetCode}-${700 + i}`,
      insuranceExpiry: day(120 + (i % 5) * 60),
      regExpiry: day(360 - (i % 4) * 40),
      pucNo: `PUC-${assetCode}`,
      pollutionExpiry: day(90 + (i % 3) * 80),
      fitnessCert: `FIT-${assetCode}`,
      fitnessExpiry: day(150 + (i % 4) * 50),
      lat: 17.385 + (i % 7) * 0.004,
      lng: 78.4867 + (i % 5) * 0.005,
      lastPingAt: iso(-(i % 9) * 3),
    };
    try {
      const unit = await call('POST', '/equipment-units', body);
      report.units++;
      created.push({ id: unit.id, name, typeName, meter, heavy: HEAVY.has(typeName) });
    } catch (err) {
      report.failures.push(`unit ${assetCode}: ${err.message}`);
    }
  }

  // Service schedules: one General service for each new unit, due dates spread so the statuses differ.
  for (const [i, u] of created.entries()) {
    const lastDays = [20, 45, 80, 100, 120, 60][i % 6];
    const lastHours = u.meter - (30 + (i % 5) * 40);
    const tasks = [{ task: SCHEDULE_TASKS[0], intervalMonths: 3, intervalHours: 250, lastServiceDate: day(-lastDays), lastServiceHours: lastHours }];
    if (u.heavy) tasks.push({ task: 'Hydraulic oil check', intervalMonths: 6, intervalHours: 500, lastServiceDate: day(-(lastDays + 30)), lastServiceHours: lastHours - 80 });
    for (const t of tasks) {
      try {
        await call('POST', '/maintenance-schedules', { equipmentUnitId: u.id, ...t });
        report.schedules++;
      } catch (err) {
        report.failures.push(`schedule ${u.name}: ${err.message}`);
      }
    }
  }

  // Module events (inbound): what HRMS, P&M, PMS and Stores report about their records.
  const events = [
    ['hrms', 'employee', 'created', 'EMP-' + prefix + '1', { employeeCode: 'EMP-' + prefix + '1', name: 'Kiran Rao', designation: 'Project Manager', department: 'Projects', status: 'Active' }],
    ['hrms', 'employee', 'created', 'EMP-' + prefix + '2', { employeeCode: 'EMP-' + prefix + '2', name: 'Arun Reddy', designation: 'Site Engineer', department: 'Civil', status: 'Active' }],
    ['pm', 'equipment_status', 'created', 'EQ-' + prefix + '1', { assetCode: prefix + '-EXC-01', status: 'In use', meterHours: 1263 }],
    ['pm', 'equipment_status', 'updated', 'EQ-' + prefix + '1', { assetCode: prefix + '-EXC-01', status: 'In use', meterHours: 1291 }],
    ['pm', 'maintenance_job', 'created', 'MJ-' + prefix + '1', { jobNo: 'MJ-' + prefix + '01', task: 'General service', state: 'Open' }],
    ['pms', 'payment_voucher', 'created', 'PV-' + prefix + '1', { voucherNo: 'PV-' + prefix + '01', vendor: 'Sri Sai Earthmovers', amount: 184000, currency: 'INR', status: 'Approved' }],
    ['pms', 'payment_voucher', 'updated', 'PV-' + prefix + '1', { voucherNo: 'PV-' + prefix + '01', vendor: 'Sri Sai Earthmovers', amount: 184000, currency: 'INR', status: 'Paid' }],
    ['stores', 'stock_receipt', 'created', 'GRN-' + prefix + '1', { grnNo: 'GRN-' + prefix + '01', material: 'Cement OPC 53', quantity: 300, uom: 'bag' }],
  ];
  const seqOf = new Map();
  for (const [mod, entity, verb, key, payload] of events) {
    const aggregateId = randomUUID();
    const seq = (seqOf.get(key) ?? 0) + 1;
    seqOf.set(key, seq);
    try {
      await call('POST', '/integration-events/inbound', {
        eventId: randomUUID(),
        eventType: `${entity}.${verb}`,
        eventVersion: '1',
        schemaVersion: '1',
        aggregateType: entity,
        aggregateId,
        aggregateSeq: seq,
        occurredAt: iso(-(events.length - events.indexOf(events.find((e) => e[3] === key)))),
        sourceModule: mod,
        payload,
      });
      report.events++;
    } catch (err) {
      report.failures.push(`event ${entity}: ${err.message}`);
    }
  }

  // Module audit entries (sign-ins and activity sent to POST /audit-log/external).
  const audit = [
    ['hrms', 'signed_in', 'session', 'EMP-' + prefix + '1', 'Kiran Rao', 'kiran.rao', 'Kiran Rao signed in to HRMS', 46],
    ['hrms', 'leave_requested', 'leave_request', 'LV-' + prefix + '1', 'Arun Reddy', 'arun.reddy', 'Arun Reddy applied for 2 days of casual leave', 44],
    ['hrms', 'leave_approved', 'leave_request', 'LV-' + prefix + '1', 'Kiran Rao', 'kiran.rao', 'Kiran Rao approved the casual leave of Arun Reddy', 42],
    ['pms', 'signed_in', 'session', 'USR-PMS-' + prefix, 'Suresh Babu', 'suresh.babu', 'Suresh Babu signed in to PMS', 36],
    ['pms', 'request_raised', 'payment_request', 'PR-' + prefix + '1', 'Suresh Babu', 'suresh.babu', 'Suresh Babu raised a payment request of INR 1,84,000', 35],
    ['pms', 'request_rejected', 'payment_request', 'PR-' + prefix + '2', 'Lakshmi Devi', 'lakshmi.devi', 'Lakshmi Devi rejected payment request PR-' + prefix + '2: missing invoice', 22],
    ['pm', 'signed_in', 'session', 'USR-PM-' + prefix, 'Ramesh Naidu', 'ramesh.naidu', 'Ramesh Naidu signed in to P&M', 20],
    ['pm', 'fault_reported', 'equipment_fault', 'FLT-' + prefix + '1', 'Ramesh Naidu', 'ramesh.naidu', 'Ramesh Naidu reported a hydraulic leak on ' + prefix + '-EXC-02', 19],
    ['stores', 'signed_in', 'session', 'USR-ST-' + prefix, 'Ananya Rao', 'ananya.rao', 'Ananya Rao signed in to Stores', 12],
    ['stores', 'goods_received', 'stock_receipt', 'GRN-' + prefix + '1', 'Ananya Rao', 'ananya.rao', 'Ananya Rao received 300 bags of Cement OPC 53', 11],
    ['stores', 'login_failed', 'session', 'USR-ST-X' + prefix, 'Unknown user', 'store.temp', 'Failed sign-in to Stores for store.temp (wrong password)', 5],
  ];
  for (const [mod, action, entity, ref, who, login, summary, hours] of audit) {
    try {
      await call('POST', '/audit-log/external', {
        sourceModule: mod,
        action,
        entityType: entity,
        recordRef: ref,
        actorName: who,
        actorLogin: login,
        summary,
        occurredAt: iso(-hours),
      });
      report.audit++;
    } catch (err) {
      report.failures.push(`audit ${action}: ${err.message}`);
    }
  }

  console.log(`units added: ${report.units} (already present: ${report.skippedUnits})`);
  console.log(`maintenance schedules added: ${report.schedules}`);
  console.log(`module events added: ${report.events}`);
  console.log(`module audit entries added: ${report.audit}`);
  if (report.failures.length) {
    console.log(`not loaded (${report.failures.length}):`);
    for (const f of report.failures.slice(0, 20)) console.log('  ' + f);
  }
}

await main().catch((err) => {
  console.error('Load stopped:', err.message);
  process.exit(1);
});
void base;
