// Development only. Fills in the project tabs for every project of one tenant THROUGH THE API: BOQ items, at least two
// geofences, and at least one resource, material and equipment plan line. Adds only what is missing, so re-running is safe.
// Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-project-details.mjs <tenantId> [apiBaseUrl]
import { randomUUID } from 'node:crypto';

const [tenantId, apiArg] = process.argv.slice(2);
const apiBase = (apiArg ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
if (!tenantId || !loginId || !password) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-project-details.mjs <tenantId> [apiBaseUrl]');
  process.exit(1);
}

let token = '';
let stepUp = { token: '', expires: 0 };
const failures = [];

async function call(method, path, body, extra = {}) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`, 'x-tenant-id': tenantId, ...extra };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = randomUUID();
  }
  const res = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error?.code ?? ''}`);
  return json.data ?? json;
}

// Geofence writes need a fresh identity check. The password check gives a token valid for five minutes.
async function stepUpHeader() {
  if (stepUp.token && Date.now() < stepUp.expires - 30000) return { 'x-step-up-token': stepUp.token };
  const res = await call('POST', '/auth/step-up/password', { password });
  stepUp = { token: res.stepUpToken, expires: new Date(res.expiresAt).getTime() };
  return { 'x-step-up-token': stepUp.token };
}

const dayOff = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function main() {
  const si = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ loginId, password }),
  });
  const sj = await si.json();
  if (!si.ok || !sj.data) throw new Error('sign-in failed');
  token = sj.data.accessToken;

  const [projects, locations, stores, materials, uoms, types, zones, boq, plan] = await Promise.all([
    call('GET', '/projects?limit=200'),
    call('GET', '/locations?limit=500'),
    call('GET', '/stores?limit=200'),
    call('GET', '/materials?limit=500'),
    call('GET', '/uoms?limit=200'),
    call('GET', '/equipment-types?limit=200'),
    call('GET', '/geo-zones?limit=500'),
    call('GET', '/boq-items?limit=1000'),
    call('GET', '/plan-lines?limit=1000'),
  ]);
  // a people line needs a position: the company's positions are used in turn
  const positions = await call('GET', '/organisation/positions?limit=200');
  const unitBy = (code) => uoms.find((u) => u.code === code) ?? uoms[0];
  const cum = unitBy('Cum');
  const nos = unitBy('NOS');
  const counts = { boq: 0, zones: 0, people: 0, material: 0, equipment: 0 };

  for (const p of projects) {
    const locs = locations.filter((l) => l.projectId === p.id);
    const lat = locs.find((l) => l.lat != null)?.lat ?? 17.385 + (p.code.charCodeAt(0) % 7) * 0.01;
    const lng = locs.find((l) => l.lng != null)?.lng ?? 78.4867 + (p.code.charCodeAt(1) % 5) * 0.01;
    const siteStore = stores.find((s) => locs.some((l) => l.id === s.locationId)) ?? stores[0];

    // BOQ: two items per project
    const haveBoq = boq.filter((b) => b.projectId === p.id).length;
    for (let i = haveBoq; i < 2; i++) {
      const isEarthwork = i === 0;
      try {
        await call('POST', '/boq-items', {
          projectId: p.id,
          itemCode: `BOQ-${p.code}-${String(i + 1).padStart(2, '0')}`,
          description: isEarthwork ? `Earthwork and compaction, ${p.name}` : `Supply and fix precast units, ${p.name}`,
          uomId: (isEarthwork ? cum : nos).id,
          quantity: isEarthwork ? 1200 : 240,
          rate: isEarthwork ? 185 : 950,
        });
        counts.boq++;
      } catch (e) {
        failures.push(`BOQ ${p.code}: ${e.message}`);
      }
    }

    // Geofences: at least two per project, one attendance zone and one equipment zone
    const haveZones = zones.filter((z) => z.projectId === p.id).length;
    const zoneSpecs = [
      { label: `${p.code} site attendance`, zoneType: 'attendance', radiusM: 400 },
      { label: `${p.code} equipment yard`, zoneType: 'equipment', radiusM: 250 },
    ];
    for (const spec of zoneSpecs.slice(Math.min(haveZones, 2))) {
      try {
        await call(
          'POST',
          '/geo-zones',
          { projectId: p.id, label: spec.label, zoneType: spec.zoneType, shape: 'circle', centerLat: lat, centerLng: lng, radiusM: spec.radiusM },
          await stepUpHeader(),
        );
        counts.zones++;
      } catch (e) {
        failures.push(`geofence ${p.code}: ${e.message}`);
      }
    }

    // Resource plan: one people line
    if (!plan.some((l) => l.projectId === p.id && l.resourceKind === 'people')) {
      try {
        await call('POST', '/plan-lines', {
          projectId: p.id,
          resourceKind: 'people',
          positionId: positions[counts.people % Math.max(positions.length, 1)]?.id ?? null,
          role: 'Site engineer',
          quantity: 4,
          fromDate: dayOff(0),
          toDate: dayOff(180),
          reason: `Supervision, ${p.name}`,
          stage: 'planned',
        });
        counts.people++;
      } catch (e) {
        failures.push(`resource plan ${p.code}: ${e.message}`);
      }
    }

    // Material plan: one material line, from an active material and the project's store
    if (!plan.some((l) => l.projectId === p.id && l.resourceKind === 'material')) {
      const mat = materials.find((m) => m.status === 'Active') ?? materials[0];
      if (mat) {
        try {
          await call('POST', '/plan-lines', {
            projectId: p.id,
            resourceKind: 'material',
            materialId: mat.id,
            uomId: mat.uomId ?? cum.id,
            storeId: siteStore?.id ?? null,
            quantity: 50,
            requiredBy: dayOff(30),
            stage: 'planned',
          });
          counts.material++;
        } catch (e) {
          failures.push(`material plan ${p.code}: ${e.message}`);
        }
      }
    }

    // Equipment plan: one equipment line
    if (!plan.some((l) => l.projectId === p.id && l.resourceKind === 'equipment')) {
      const type = types.find((t) => t.name === 'Excavator') ?? types[0];
      if (type) {
        try {
          await call('POST', '/plan-lines', {
            projectId: p.id,
            resourceKind: 'equipment',
            equipmentTypeId: type.id,
            quantity: 2,
            fromDate: dayOff(0),
            toDate: dayOff(120),
            reason: `Excavation, ${p.name}`,
            capacity: '20-ton (210)',
            model: 'Hitachi ZX200',
            stage: 'planned',
          });
          counts.equipment++;
        } catch (e) {
          failures.push(`equipment plan ${p.code}: ${e.message}`);
        }
      }
    }
  }
  console.log(
    `projects: ${projects.length}; added: BOQ items ${counts.boq}, geofences ${counts.zones}, ` +
      `resource lines ${counts.people}, material lines ${counts.material}, equipment lines ${counts.equipment}`,
  );
  for (const f of failures) console.log('  not added: ' + f);
}

await main().catch((err) => {
  console.error('Stopped:', err.message);
  process.exit(1);
});
