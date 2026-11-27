// Loads the frontend sample data (core-data/data/seed.ts in the frontend repo) into one tenant THROUGH THE API,
// so every row passes the real validation. Local development only. It is not a migration and it is not run in deployment.
//
// Usage (the API must already be running, and the tenant migrated):
//   DATABASE_URL=... DEMO_LOGIN_ID=... DEMO_PASSWORD=... npm run seed:frontend -- <tenantId> [apiBaseUrl]
// The seed file is imported with tsx (see the npm script). FRONTEND_SEED overrides its path.
//
// Safe to re-run: each row is looked up first and created only when missing (ensure), so existing rows are reused.
// Nothing is deleted. Seed users are not created (they need passwords and the API has no create-user route);
// the loader reports which of them already exist. Passwords and tokens are never printed.
//
// Dependency order: company profile, projects (with milestones, WBS, chainage markers, zones), locations, stores,
// materials, stock levels, equipment types, equipment assignments, plan lines, departments, positions (then the
// department heads), vendors, PMS limit rows, approval chains with versions and levels, approval requests,
// grievances, tickets, policies with versions and rules.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const seedPath =
  process.env.FRONTEND_SEED ??
  resolve(here, '../../CORE__V__0.4/veloxiq-core/src/modules/core-data/data/seed.ts');

const tenantId = process.argv[2];
const apiBase = (process.argv[3] ?? process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

if (!tenantId || !loginId || !password || !databaseUrl) {
  console.error(
    'Usage: DATABASE_URL=... DEMO_LOGIN_ID=... DEMO_PASSWORD=... npm run seed:frontend -- <tenantId> [apiBaseUrl]',
  );
  process.exit(1);
}

const seed = await import(pathToFileURL(seedPath).href);
const {
  COMPANY, PROJECTS, SITES, STORES, MATERIALS, STOCK, EQUIPMENT_TYPES, EQUIPMENT_TYPE_MASTER, ASSIGNMENTS,
  PLAN_LINES, PEOPLE_PLAN, MATERIAL_PLAN, CHAINS, REQUESTS, GRIEVANCES, POLICIES, TICKETS, DEPARTMENTS, ROLES,
  VENDORS, USERS,
  CASH_LIMITS: PMS_LIMITS,
} = seed;

let token = '';

/** One API call. Throws with the method, path, status and error code only, never the body or the token. */
async function api(method, path, opts) {
  // Calls pass either the request body directly (login) or { body, ... } (every other call).
  const body = opts && typeof opts === 'object' && 'body' in opts ? opts.body : opts;
  const headers = { 'content-type': 'application/json' };
  if (path === '/auth/login') headers['x-tenant-id'] = tenantId;
  else headers.authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['idempotency-key'] = randomUUID();

  let res;
  let json;
  for (let attempt = 1; ; attempt += 1) {
    res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    json = await res.json().catch(() => ({}));
    // 429 means the request was not processed, so waiting and sending it again is safe.
    if (res.status !== 429 || attempt >= 10) break;
    const wait = Number(json?.error?.details?.retryAfterSeconds ?? 5);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  if (!res.ok) {
    const code = json?.error?.code ?? 'ERROR';
    const message = json?.error?.message ?? 'no message';
    // details are field errors from validation; they never hold secrets or SQL (see src/core/errors.ts)
    const details = json?.error?.details ? ` ${JSON.stringify(json.error.details).slice(0, 400)}` : '';
    throw new Error(`${method} ${path} -> ${res.status} ${code}: ${message}${details}`);
  }
  return json.data;
}

/** Like api, but a 404 returns null (used for "does this row exist yet" reads). */
async function apiOrNull(method, path) {
  try {
    return await api(method, path);
  } catch (err) {
    if (err instanceof Error && err.message.includes(' -> 404 ')) return null;
    throw err;
  }
}

const made = {};
const reused = {};
const failures = [];
const intentionallySkipped = [];
function tally(kind, created) {
  const bag = created ? made : reused;
  bag[kind] = (bag[kind] ?? 0) + 1;
}

/** Runs one row. A failure is recorded and the load goes on, so one bad row does not hide the others. */
async function run(kind, label, fn) {
  try {
    return await fn();
  } catch (err) {
    failures.push(`${kind} [${label}]: ${err instanceof Error ? err.message : 'unknown error'}`);
    return undefined;
  }
}

/** Returns the existing row that matches, or creates it. The GET-then-POST keeps re-runs safe. */
// Lists are read once per path and kept up to date with the rows this run creates (keeps the request rate low).
const listCache = new Map();
async function listRows(listPath) {
  if (!listCache.has(listPath)) listCache.set(listPath, (await api('GET', listPath)) ?? []);
  return listCache.get(listPath);
}
async function ensure(kind, listPath, match, create) {
  const rows = await listRows(listPath);
  const existing = rows.find(match);
  if (existing) {
    tally(kind, false);
    return existing;
  }
  const row = await create();
  tally(kind, true);
  rows.push(row);
  return row;
}

const orNull = (s) => (s !== undefined && s !== null && String(s).trim() ? String(s).trim() : null);
const query = (params) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
};
const need = (map, key, what) => {
  const v = map[key];
  if (!v) throw new Error(`${what} ${key} is not loaded`);
  return v;
};
/** Orders items so each one comes after its parent (parentOf returns the parent's seed id or null). */
function parentFirst(items, parentOf) {
  const out = [];
  const placed = new Set();
  let pending = [...items];
  while (pending.length) {
    const ready = pending.filter((i) => {
      const p = parentOf(i);
      return !p || placed.has(p);
    });
    if (!ready.length) {
      failures.push(`parent cycle or missing parent in ${pending.length} rows; left out`);
      break;
    }
    for (const r of ready) {
      out.push(r);
      placed.add(r.id);
    }
    pending = pending.filter((i) => !ready.includes(i));
  }
  return out;
}

// Units of measure. shared.uom is owned by Platform Administration; like load-demo-data.mjs, the dev reference rows
// the seed needs are inserted directly (ON CONFLICT DO NOTHING). Seed unit text maps to a code.
const UOM_ROWS = [
  ['NOS', 'Numbers'], ['KG', 'Kilogram'], ['M', 'Metre'], ['LTR', 'Litre'], ['HR', 'Hour'],
  ['Bag (50 kg)', 'Bag (50 kg)'], ['MT', 'Metric tonne'], ['Cum', 'Cubic metre'], ['Rmt', 'Running metre'],
];
const UOM_CODE_FOR_TEXT = { Kg: 'KG', Litre: 'LTR', Nos: 'NOS' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Equipment type codes must match /^[A-Za-z][A-Za-z0-9_]{0,39}$/ (seed codes such as ET-E use hyphens).
const equipmentCode = (m) => m.code.replace(/[^A-Za-z0-9_]/g, '_');
async function seedUoms(client) {
  for (const [code, name] of UOM_ROWS) {
    await client.query(
      'INSERT INTO shared.uom (uom_code, uom_name) VALUES ($1, $2) ON CONFLICT (uom_code) DO NOTHING',
      [code, name],
    );
  }
  const { rows } = await client.query('SELECT id, uom_code FROM shared.uom');
  return Object.fromEntries(rows.map((r) => [r.uom_code, r.id]));
}
const uomIdFor = (byCode, text) => {
  const id = byCode[UOM_CODE_FOR_TEXT[text] ?? text];
  if (!id) throw new Error(`unit "${text}" has no shared.uom row`);
  return id;
};

// Seed vocabularies mapped to API values (the same rules as the frontend api/*.ts mappers).
const PROJECT_STATUS = (s) => (s === 'Completed' ? 'inactive' : 'active');
const MILESTONE_STATUS = { 'Not started': 'pending', 'In progress': 'pending', Done: 'achieved', Cancelled: 'cancelled' };
const ZONE_SHAPE = { Radius: 'circle', Polygon: 'polygon', Linear: 'corridor' };
const METER_KIND = { Hours: 'hours', Kilometres: 'km', None: 'none' };
const FUEL_NORM = { 'L/hr': 'litre_per_hour' };
const PEOPLE_STATUS = { Planned: 'draft', Confirmed: 'approved', Fulfilled: 'approved' };
const MATERIAL_PLAN_STATUS = { Planned: 'draft', Requested: 'approved', Ordered: 'approved', Received: 'approved' };
const PMS_PRIORITY = { Emergency: 'urgent', Normal: 'normal' };
const TIMEOUT_TO_API = { 'Escalate to next level': 'escalate', 'Escalate to Tenant Admin': 'escalate', 'Remind approver only': 'hold' };
const GRIEVANCE_STATUS = (s) =>
  s === 'Requested' ? 'open' : s === 'Visited' ? 'resolved' : s === 'Not visited' ? 'closed' : 'in_review';
const TICKET_STATUS = (s) => (s === 'Open' ? 'open' : s === 'Answered' ? 'in_progress' : 'closed');
const POLICY_KIND = {
  shifts: 'attendance', holidays: 'attendance', overtime: 'overtime', leave: 'leave', 'payment-threshold': 'general', rules: 'conduct',
};
const POLICY_NAME = {
  shifts: 'Shift timings', holidays: 'Holidays', overtime: 'Overtime', leave: 'Leave', 'payment-threshold': 'Payment threshold', rules: 'Company rules',
};

async function main() {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  let uomByCode;
  try {
    uomByCode = await seedUoms(db);
  } finally {
    await db.end();
  }
  console.log(`uom rows ready: ${Object.keys(uomByCode).length}`);

  const login = await api('POST', '/auth/login', { loginId, password });
  token = login.accessToken;
  const me = await api('GET', '/auth/me');
  const approverStandIn = me.user.id;
  console.log(`signed in as ${loginId} in tenant_${tenantId}`);

  // Users: the seed users need passwords, so none is created. Report which of them already exist.
  const existingUsers = (await api('GET', '/users')) ?? [];
  const existingLogins = new Set(existingUsers.map((u) => u.loginId));
  const seedUsersPresent = USERS.filter((u) => existingLogins.has(u.loginId)).map((u) => u.loginId);
  const seedUsersMissing = USERS.length - seedUsersPresent.length;

  // Company profile. PUT replaces the whole profile, so it runs only when the profile is missing or differs.
  await run('company profile', COMPANY.legalName, async () => {
    const prof = await apiOrNull('GET', '/organisation/company-profile');
    const same =
      prof && prof.legalName === COMPANY.legalName && (prof.tradeName ?? '') === (COMPANY.tradeName ?? '') &&
      (prof.gstin ?? '') === (COMPANY.gstin ?? '') && (prof.pin ?? '') === (COMPANY.pin ?? '');
    if (same) {
      tally('company profile', false);
      return;
    }
    await api('PUT', '/organisation/company-profile', {
      code: prof?.code || 'COMPANY',
      status: 'active',
      legalName: COMPANY.legalName,
      tradeName: orNull(COMPANY.tradeName),
      cin: orNull(COMPANY.cin), gstin: orNull(COMPANY.gstin), pan: orNull(COMPANY.pan), tan: orNull(COMPANY.tan),
      addressLine1: orNull(COMPANY.addressLine1), addressLine2: orNull(COMPANY.addressLine2),
      city: orNull(COMPANY.city), state: orNull(COMPANY.state), pin: orNull(COMPANY.pin), country: orNull(COMPANY.country),
      contactName: orNull(COMPANY.contactName), contactEmail: orNull(COMPANY.contactEmail), contactPhone: orNull(COMPANY.contactPhone),
      website: orNull(COMPANY.website),
      logoFileId: prof?.logoFileId ?? null,
      settings: null,
      ...(prof ? { rowVersion: prof.rowVersion } : {}),
    });
    tally('company profile', !prof);
  });

  // Projects, and the parts each project owns: milestones, WBS nodes, chainage markers, geo zones.
  const projectId = {};
  const markerId = {};
  const markerProject = {};
  const wbsIdByProject = {};
  for (const p of PROJECTS) {
    const row = await run('project', p.code, () =>
      ensure('project', '/projects', (r) => r.code === p.code, () =>
        api('POST', '/projects', {
          body: {
            code: p.code, name: p.name, status: PROJECT_STATUS(p.status), client: orNull(p.client),
            startDate: p.startDate || null, endDate: p.endDate || null, valueAmount: p.value ?? null,
            description: orNull(p.description),
          },
        }),
      ),
    );
    if (!row) continue;
    projectId[p.id] = row.id;
    const pid = row.id;

    for (const m of p.milestones ?? []) {
      await run('milestone', m.id, () =>
        ensure('milestone', `/milestones${query({ projectId: pid })}`, (r) => r.name === m.name, () =>
          api('POST', '/milestones', {
            body: { projectId: pid, name: m.name, dueDate: m.due || null, weight: m.weight, status: MILESTONE_STATUS[m.status] ?? 'pending' },
          }),
        ),
      );
    }

    const wbsByCode = {};
    const wbsIds = {};
    for (const w of parentFirst(p.wbs ?? [], (x) => x.parentId)) {
      const r = await run('wbs node', w.code, () =>
        ensure('wbs node', `/wbs-nodes${query({ projectId: pid })}`, (x) => x.code === w.code, () =>
          api('POST', '/wbs-nodes', {
            body: { projectId: pid, code: w.code, name: w.name, parentWbsNodeId: w.parentId ? wbsIds[w.parentId] ?? null : null },
          }),
        ),
      );
      if (r) {
        wbsIds[w.id] = r.id;
        wbsByCode[w.code] = r.id;
      }
    }
    wbsIdByProject[p.id] = wbsByCode;

    for (const mk of p.chainage?.markers ?? []) {
      const code = mk.code ?? mk.id;
      const r = await run('chainage marker', code, () =>
        ensure('chainage marker', `/chainage-markers${query({ projectId: pid })}`, (x) => x.code === code, () =>
          api('POST', '/chainage-markers', {
            body: {
              projectId: pid, code, label: orNull(mk.label), chainageKm: mk.km,
              wbsNodeId: mk.wbsCode ? wbsByCode[mk.wbsCode] ?? null : null,
            },
          }),
        ),
      );
      if (r) {
        markerId[mk.id] = r.id;
        markerProject[mk.id] = pid;
      }
    }

    for (const z of p.zones ?? []) {
      const shape = ZONE_SHAPE[z.shape] ?? 'circle';
      await run('geo zone', z.id, () =>
        ensure('geo zone', `/geo-zones${query({ projectId: pid })}`, (x) => x.label === z.label && x.shape === shape, () =>
          api('POST', '/geo-zones', {
            body: {
              projectId: pid, label: z.label, zoneType: 'attendance', shape,
              centerLat: z.centerLat, centerLng: z.centerLng,
              radiusM: shape === 'circle' ? z.radiusM : null,
              points: shape === 'circle' ? null : z.points,
              bufferM: shape === 'corridor' ? z.bufferM : null,
            },
          }),
        ),
      );
    }
  }

  // Locations. Seed sites carry no projectId: the project whose locationIds lists the site is used.
  const locationId = {};
  const locationProject = {};
  for (const s of SITES) {
    const owner = PROJECTS.find((p) => (p.locationIds ?? []).includes(s.id));
    const row = await run('location', s.code, async () => {
      if (!owner) throw new Error('no project lists this site');
      return ensure('location', '/locations', (r) => r.code === s.code, () =>
        api('POST', '/locations', {
          body: {
            projectId: need(projectId, owner.id, 'project'), code: s.code, name: s.name,
            status: s.status === 'Inactive' ? 'inactive' : 'active', addressLine: orNull(s.addressLine), city: orNull(s.city),
            state: orNull(s.state), pin: orNull(s.pin), inCharge: orNull(s.inCharge), phone: orNull(s.phone), email: orNull(s.email),
          },
        }),
      );
    });
    if (row) {
      locationId[s.id] = row.id;
      // the project of the row as the API holds it (a reused location keeps its own project)
      locationProject[s.id] = row.projectId;
    }
  }

  // Stores. The API requires a chainage marker to belong to the store's location project, so a marker from another
  // project is not linked (the seed links some stores to markers of other packages); such links are left empty.
  const storeId = {};
  const storeProject = {};
  const sameProjectMarker = (s) => {
    const mid = s.chainageId ? markerId[s.chainageId] : undefined;
    return mid && markerProject[s.chainageId] === locationProject[s.locationId] ? mid : null;
  };
  for (const s of STORES) {
    const row = await run('store', s.code, () =>
      ensure('store', '/stores', (r) => r.code === s.code, () =>
        api('POST', '/stores', {
          body: {
            code: s.code, name: s.name, locationId: need(locationId, s.locationId, 'location'),
            status: s.status === 'Inactive' ? 'inactive' : 'active', locationText: orNull(s.location), keeper: orNull(s.keeper),
            phone: orNull(s.phone), chainageMarkerId: sameProjectMarker(s),
          },
        }),
      ),
    );
    if (row) {
      storeId[s.id] = row.id;
      storeProject[s.id] = locationProject[s.locationId];
      // a store loaded before its marker was valid is linked on a later pass (never unlinked)
      const wanted = sameProjectMarker(s);
      if (wanted && row.chainageMarkerId !== wanted) {
        await run('store chainage link', s.code, () =>
          api('PATCH', `/stores/${encodeURIComponent(row.id)}`, { body: { chainageMarkerId: wanted, rowVersion: row.rowVersion } }),
        );
        tally('store chainage link set', true);
      }
    }
  }

  // Materials. The unit text maps to a shared.uom row.
  const materialId = {};
  const materialUom = {};
  for (const m of MATERIALS) {
    const row = await run('material', m.code, () => {
      const uomId = uomIdFor(uomByCode, m.uom);
      return ensure('material', '/materials', (r) => r.code === m.code, () =>
        api('POST', '/materials', {
          body: {
            code: m.code, name: m.name, uomId, status: m.status === 'Inactive' ? 'inactive' : 'active', hsn: orNull(m.hsn),
            reorderLevel: m.reorderLevel ?? 0, category: orNull(m.category),
          },
        }),
      );
    });
    if (row) {
      materialId[m.id] = row.id;
      materialUom[m.id] = row.uomId ?? uomIdFor(uomByCode, m.uom);
    }
  }

  // Stock levels: one row per store and material pair.
  for (const s of STOCK) {
    await run('stock level', `${s.storeId}/${s.materialId}`, async () => {
      const sid = need(storeId, s.storeId, 'store');
      const mid = need(materialId, s.materialId, 'material');
      return ensure('stock level', `/stock-levels${query({ storeId: sid, materialId: mid })}`, (r) => r.storeId === sid && r.materialId === mid, () =>
        api('POST', '/stock-levels', { body: { storeId: sid, materialId: mid, qty: s.qty, reserved: s.reserved ?? 0 } }),
      );
    });
  }

  // Equipment types. Code and meter fields come from the master list that pairs with the names.
  const typeId = {};
  for (const name of EQUIPMENT_TYPES) {
    const m = EQUIPMENT_TYPE_MASTER.find((x) => x.name === name);
    const row = await run('equipment type', name, () => {
      if (!m) throw new Error('no master row for this type');
      return ensure('equipment type', '/equipment-types', (r) => r.code === equipmentCode(m), () =>
        api('POST', '/equipment-types', {
          body: {
            code: equipmentCode(m), name: m.name, meterKind: METER_KIND[m.meterKind] ?? 'none', meterPrecision: m.meterPrecision ?? null,
            fuelNormUnit: FUEL_NORM[m.fuelNormUnit] ?? null, active: m.active !== false,
          },
        }),
      );
    });
    if (row) typeId[name] = row.id;
  }

  for (const a of ASSIGNMENTS) {
    await run('equipment assignment', a.id, () => {
      const pid = need(projectId, a.projectId, 'project');
      const tid = need(typeId, a.equipmentType, 'equipment type');
      return ensure('equipment assignment', `/equipment-assignments${query({ projectId: pid })}`, (r) => r.equipmentTypeId === tid, () =>
        api('POST', '/equipment-assignments', { body: { projectId: pid, equipmentTypeId: tid, qty: a.qty } }),
      );
    });
  }

  // Plan lines: equipment, people and material plans share one endpoint, split by resourceKind.
  for (const l of PLAN_LINES) {
    await run('plan line (equipment)', l.id, () => {
      const pid = need(projectId, l.projectId, 'project');
      const tid = need(typeId, l.equipmentType, 'equipment type');
      return ensure('plan line (equipment)', `/plan-lines${query({ projectId: pid, resourceKind: 'equipment' })}`,
        (r) => r.equipmentTypeId === tid && r.fromDate === (l.from || null) && r.toDate === (l.to || null), () =>
          api('POST', '/plan-lines', {
            body: {
              projectId: pid, resourceKind: 'equipment', equipmentTypeId: tid, quantity: l.plannedQty,
              fromDate: l.from || null, toDate: l.to || null, reason: orNull(l.reason),
            },
          }),
      );
    });
  }
  for (const l of MATERIAL_PLAN) {
    await run('plan line (material)', l.id, () => {
      const pid = need(projectId, l.projectId, 'project');
      const mid = need(materialId, l.materialId, 'material');
      return ensure('plan line (material)', `/plan-lines${query({ projectId: pid, resourceKind: 'material' })}`,
        (r) => r.materialId === mid && r.requiredBy === (l.requiredBy || null), () =>
          api('POST', '/plan-lines', {
            body: {
              projectId: pid, resourceKind: 'material', materialId: mid, uomId: materialUom[l.materialId] ?? null,
              // a store must belong to the plan line's project (MASTERS_REFERENCE_MISMATCH otherwise)
              storeId: l.storeId && storeProject[l.storeId] === pid ? storeId[l.storeId] : null,
              quantity: l.qty, requiredBy: l.requiredBy || null,
              status: MATERIAL_PLAN_STATUS[l.status] ?? 'draft',
            },
          }),
      );
    });
  }

  // Departments: parents first. Heads are set after positions exist.
  const deptId = {};
  const deptRow = {};
  for (const d of parentFirst(DEPARTMENTS, (x) => x.parentId)) {
    const row = await run('department', d.code, () =>
      ensure('department', '/organisation/departments', (r) => r.code.toLowerCase() === d.code.toLowerCase(), () =>
        api('POST', '/organisation/departments', {
          body: {
            code: d.code, name: d.name, status: d.status === 'Inactive' ? 'inactive' : 'active',
            parentDepartmentId: d.parentId ? deptId[d.parentId] ?? null : null, description: orNull(d.description),
            colorIndex: null, colorHex: null,
          },
        }),
      ),
    );
    if (row) {
      deptId[d.id] = row.id;
      deptRow[d.id] = row;
    }
  }

  // Positions (the frontend calls them roles). A position can report to another, so the same ordering applies.
  const posId = {};
  for (const r of parentFirst(ROLES, (x) => x.reportsToId)) {
    const row = await run('position', r.code, () =>
      ensure('position', '/organisation/positions', (x) => x.code.toLowerCase() === r.code.toLowerCase(), () =>
        api('POST', '/organisation/positions', {
          body: {
            code: r.code, title: r.title, departmentId: need(deptId, r.departmentId, 'department'), grade: orNull(r.grade),
            reportsToPositionId: r.reportsToId ? posId[r.reportsToId] ?? null : null, plannedPositions: r.positions ?? 1,
            description: orNull(r.description), status: r.status === 'Inactive' ? 'inactive' : 'active',
          },
        }),
      ),
    );
    if (row) posId[r.id] = row.id;
  }

  // Department heads: set with a PATCH once the position exists, only when the head is not set yet.
  for (const d of DEPARTMENTS) {
    if (!d.headRoleId || !deptRow[d.id] || !posId[d.headRoleId]) continue;
    const cur = deptRow[d.id];
    if (cur.headPositionId === posId[d.headRoleId]) {
      tally('department head', false);
      continue;
    }
    await run('department head', d.code, async () => {
      await api('PATCH', `/organisation/departments/${encodeURIComponent(cur.id)}`, {
        body: {
          code: cur.code, name: cur.name, status: cur.status, parentDepartmentId: cur.parentDepartmentId ?? null,
          headPositionId: posId[d.headRoleId], description: cur.description ?? null, colorIndex: null, colorHex: null,
          rowVersion: cur.rowVersion,
        },
      });
      tally('department head', true);
    });
  }

  // People plans need a position (the API rejects a people line without one). The position is matched by title.
  const positionRows = await listRows('/organisation/positions');
  // Intentionally not loaded: the seed role has no position, and no position is added to the seed for it.
  const INTENTIONALLY_SKIPPED_PEOPLE = new Set(['Heavy vehicle operator']);
  for (const l of PEOPLE_PLAN) {
    if (INTENTIONALLY_SKIPPED_PEOPLE.has(l.role)) {
      intentionallySkipped.push(`plan line (people) ${l.id} (role "${l.role}": no position in the seed)`);
      continue;
    }
    await run('plan line (people)', l.id, () => {
      const pid = need(projectId, l.projectId, 'project');
      const pos = positionRows.find((p) => p.title.trim().toLowerCase() === String(l.role).trim().toLowerCase());
      if (!pos) throw new Error(`no position titled "${l.role}"`);
      return ensure('plan line (people)', `/plan-lines${query({ projectId: pid, resourceKind: 'people' })}`,
        (r) => r.positionId === pos.id && r.fromDate === (l.from || null), () =>
          api('POST', '/plan-lines', {
            body: {
              projectId: pid, resourceKind: 'people', positionId: pos.id, role: l.role, quantity: l.headcount,
              fromDate: l.from || null, toDate: l.to || null, status: PEOPLE_STATUS[l.status] ?? 'draft',
            },
          }),
      );
    });
  }

  // Vendors. A vendor with verifiedAt set is verified (the API has no Pending state).
  for (const v of VENDORS) {
    await run('vendor', v.code, async () => {
      const row = await ensure('vendor', '/vendors', (r) => r.code === v.code, () =>
        api('POST', '/vendors', {
          body: {
            code: v.code, name: v.name, status: v.status === 'Inactive' ? 'inactive' : 'active', gstin: orNull(v.gstin),
            pan: orNull(v.pan), email: orNull(v.email), phone: orNull(v.phone), address: orNull(v.address),
          },
        }),
      );
      if (v.verifiedAt && !row.verifiedAt) {
        await api('POST', `/vendors/${encodeURIComponent(row.id)}/verify`, { body: { rowVersion: row.rowVersion } });
        tally('vendor verified', true);
      }
    });
  }

  for (const r of PMS_LIMITS) {
    const priority = PMS_PRIORITY[r.priority] ?? 'normal';
    // a final row has no amount on screen; the API needs a number, so it is sent as 100000 and marked final
    const amountInr = r.amount ?? 100000;
    await run('pms limit row', `${r.tier}/${priority}`, async () => {
      const row = await ensure('pms limit row', '/pms-limit-rows', (x) => x.tier === r.tier && x.priority === priority, () =>
        api('POST', '/pms-limit-rows', {
          body: {
            tier: r.tier, priority, amountInr, isFinal: r.amount == null,
            days: r.days, hours: r.hours, minutes: r.minutes,
          },
        }),
      );
      // rows created by an earlier pass with the old placeholder (0) are corrected, never deleted
      if (row.amountInr !== amountInr) {
        await api('PATCH', `/pms-limit-rows/${encodeURIComponent(row.id)}`, { body: { amountInr, rowVersion: row.rowVersion } });
        tally('pms limit row amount corrected', true);
      }
    });
  }

  // Approval chains with their versions and levels. Seed approvers are not in the database: the login user stands in.
  let approverStandIns = 0;
  for (const c of CHAINS) {
    await run('approval chain', c.name, async () => {
      const scopeProject = c.scopeType === 'Project' ? need(projectId, (c.scopeIds ?? [])[0], 'project') : undefined;
      const chain = await ensure('approval chain', '/approval-chains', (r) => r.name === c.name, () =>
        api('POST', '/approval-chains', {
          body: {
            scopeType: c.scopeType === 'Project' ? 'project' : 'company', projectId: scopeProject, requestType: c.requestType,
            module: c.module, name: c.name, timeoutHours: c.timeoutHours ?? null, isActive: c.isActive !== false,
          },
        }),
      );
      for (const v of c.versions ?? []) {
        const version = await ensure('matrix version', `/matrix-versions${query({ chainId: chain.id })}`, (r) => r.effectiveFrom === v.effectiveFrom, () =>
          api('POST', '/matrix-versions', {
            body: { chainId: chain.id, effectiveFrom: v.effectiveFrom, reason: orNull(v.reason), versionNo: v.version },
          }),
        );
        // Approval matrices have four levels (L1 to L4) per version.
        for (const [i, l] of (v.levels ?? []).slice(0, 4).entries()) {
          const levelNo = i + 1;
          await ensure('matrix level', `/matrix-levels${query({ matrixVersionId: version.id })}`, (r) => r.levelNo === levelNo, () => {
            approverStandIns += 1;
            return api('POST', '/matrix-levels', {
              body: {
                matrixVersionId: version.id, levelNo, approverUserId: approverStandIn,
                timeoutHours: l.timeoutHours ?? null, onTimeout: TIMEOUT_TO_API[l.onTimeout] ?? 'hold',
              },
            });
          });
        }
        if (!version.publishedAt) {
          await api('POST', `/matrix-versions/${encodeURIComponent(version.id)}/publish`, { body: { rowVersion: version.rowVersion } });
          tally('matrix version published', true);
        }
      }
    });
  }

  // Approval requests get their code from a number series. The series is created from the seed codes (REQ-2025 ...),
  // so new codes continue after the highest seed number. Decided states and history are not replayed.
  const nextReq = Math.max(0, ...REQUESTS.map((r) => Number(String(r.id).replace(/\D/g, '')) || 0)) + 1;
  // approvals/service.ts allocates request codes from the series "APR"; the prefix keeps the seed's REQ- style.
  await run('number series', 'APR', () =>
    ensure('number series', '/organisation/number-series', (r) => r.seriesCode === 'APR', () =>
      api('POST', '/organisation/number-series', { body: { seriesCode: 'APR', prefix: 'REQ-', yearScope: 0, nextValue: nextReq } }),
    ),
  );
  // SKIP_APPROVAL_REQUESTS=1 leaves requests out: the login user would raise them, and a tenant admin does not raise
  // requests. Requests are then raised by module users (see the tenant's own data setup).
  for (const r of process.env.SKIP_APPROVAL_REQUESTS ? [] : REQUESTS) {
    await run('approval request', r.id, () =>
      ensure('approval request', '/approval-requests', (x) => x.title === r.title && x.module === r.module, () =>
        api('POST', '/approval-requests', {
          body: {
            requestType: r.type, module: r.module, amount: 0, title: r.title, payload: r.payload ?? {},
            emergency: !!r.emergency, chainageMarkerId: r.chainageId ? markerId[r.chainageId] ?? undefined : undefined,
          },
        }),
      ),
    );
  }

  // Quotations waiting for the administrator (sample data from scripts/sample-quotations.json; each starts PENDING).
  for (const q of JSON.parse(readFileSync(resolve(here, 'sample-quotations.json'), 'utf8'))) {
    await run('quotation', q.ref, () =>
      ensure('quotation', '/quotations', (r) => r.ref === q.ref, () => api('POST', '/quotations', { body: q })),
    );
  }

  // Grievances: the visit status is set with a PATCH when it differs from the default.
  for (const g of GRIEVANCES) {
    await run('grievance', g.code, async () => {
      const row = await ensure('grievance', '/grievances', (r) => r.code === g.code, () =>
        api('POST', '/grievances', {
          body: {
            code: g.code, subject: g.subject, message: orNull(g.message), visitDate: g.visitDate || undefined,
            // the API takes a user id here; seed employee codes (EMP-2118) are not ids, so they are not sent
            employeeId: UUID_RE.test(g.employeeId ?? '') ? g.employeeId : undefined,
            // the employee code as HR holds it (EMP-2118); the API keeps it as employeeCode
            employeeCode: orNull(g.employeeId) ?? undefined,
            raisedByName: orNull(g.raisedBy) ?? undefined,
          },
        }),
      );
      const target = GRIEVANCE_STATUS(g.status);
      const wantedCode = orNull(g.employeeId);
      const codeMissing = wantedCode !== null && row.employeeCode !== wantedCode;
      if (row.status !== target || codeMissing) {
        // one PATCH sets whatever differs: the visit status and, for rows created before the column, the code
        const body = { rowVersion: row.rowVersion };
        if (row.status !== target) body.status = target;
        if (codeMissing) body.employeeCode = wantedCode;
        await api('PATCH', `/grievances/${encodeURIComponent(row.id)}`, { body });
        if (row.status !== target) tally('grievance status set', true);
        if (codeMissing) tally('grievance employee code set', true);
      }
    });
  }

  // Tickets: priority and status are set with a PATCH when they differ from the defaults of a new ticket.
  for (const t of TICKETS) {
    await run('ticket', t.code, async () => {
      const row = await ensure('ticket', '/tickets', (r) => r.code === t.code, () =>
        api('POST', '/tickets', {
          body: { code: t.code, subject: t.subject, category: t.category, description: orNull(t.description) ?? undefined },
        }),
      );
      const priority = String(t.priority).toLowerCase();
      const status = TICKET_STATUS(t.status);
      if ((row.priority ?? 'medium') !== priority || row.status !== status) {
        await api('PATCH', `/tickets/${encodeURIComponent(row.id)}`, { body: { priority, status, rowVersion: row.rowVersion } });
        tally('ticket updated', true);
      }
    });
  }

  // Policies: one policy per key, each saved version is published, and the company rules are rows of their version.
  const keys = [...new Set(POLICIES.map((p) => p.key))];
  for (const key of keys) {
    await run('policy', key, async () => {
      const policy = await ensure('policy', '/policies', (r) => r.code === key, () =>
        api('POST', '/policies', { body: { kind: POLICY_KIND[key], code: key, name: POLICY_NAME[key] } }),
      );
      const versions = POLICIES.filter((p) => p.key === key).sort((a, b) => a.version - b.version);
      for (const v of versions) {
        const pv = await ensure('policy version', '/policy-versions', (r) => r.policyId === policy.id && r.effectiveFrom === v.effectiveFrom && (r.reason ?? '') === (v.reason ?? ''), () =>
          api('POST', '/policy-versions', {
            body: { policyId: policy.id, body: { data: v.data }, effectiveFrom: v.effectiveFrom, reason: orNull(v.reason) },
          }),
        );
        if (key === 'rules') {
          for (const rule of v.data?.rules ?? []) {
            await run('policy rule', rule.title, () =>
              ensure('policy rule', `/policy-rules${query({ policyVersionId: pv.id })}`, (r) => r.title === rule.title, () =>
                api('POST', '/policy-rules', {
                  body: { policyVersionId: pv.id, title: rule.title, category: rule.category, body: rule.body, ackRequired: !!rule.ackRequired },
                }),
              ),
            );
          }
        }
        if (!pv.publishedAt) {
          await api('POST', `/policy-versions/${encodeURIComponent(pv.id)}/publish`, { body: { rowVersion: pv.rowVersion } });
          tally('policy version published', true);
        }
      }
    });
  }

  console.log('created:');
  for (const [kind, n] of Object.entries(made)) console.log(`  ${kind}: ${n}`);
  console.log('already present (reused):');
  for (const [kind, n] of Object.entries(reused)) console.log(`  ${kind}: ${n}`);
  console.log(`seed users already present: ${seedUsersPresent.join(', ') || 'none'}; not created (no password, no create route): ${seedUsersMissing}`);
  console.log(`approval levels that used the login user as approver stand-in (this run): ${approverStandIns}`);
  if (intentionallySkipped.length) {
    console.log(`intentionally skipped (not failures): ${intentionallySkipped.join('; ')}`);
  }
  if (failures.length) {
    console.log(`rows not loaded: ${failures.length}`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Load stopped: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exitCode = 1;
});
