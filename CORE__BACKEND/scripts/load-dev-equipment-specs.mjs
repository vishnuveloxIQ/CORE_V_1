// Development only. Adds capacity/size and model to the equipment plan lines of one tenant that have none, THROUGH THE API
// (PATCH /plan-lines/{id}). Lines of the same type in the same project get different specs, in the order they were read.
// Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-equipment-specs.mjs <tenantId> [apiBaseUrl]
const [tenantId, apiArg] = process.argv.slice(2);
const apiBase = (apiArg ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
if (!tenantId || !loginId || !password) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-equipment-specs.mjs <tenantId> [apiBaseUrl]');
  process.exit(1);
}

// [capacity, model] options per equipment type, used in turn
const SPECS = {
  Excavator: [['20-ton (210)', 'Hitachi ZX200'], ['30-ton (300)', 'Tata Hitachi EX300'], ['40-ton (400)', 'Hitachi ZX350']],
  'Dump Truck': [['10-wheel', 'Tata Prima 2830.K'], ['12-wheel', 'Ashok Leyland 3125'], ['16-wheel', 'BharatBenz 2523C']],
  Tipper: [['10-wheel', 'Tata Prima 2830.K'], ['12-wheel', 'Ashok Leyland 3125']],
  'Road Roller': [['10-ton', 'Dynapac CA251D'], ['12-ton', 'Bomag BW219']],
  'Concrete Mixer': [['9 m³', 'Schwing Stetter AM 9']],
  'Tower Crane': [['5-ton', 'Liebherr 85 EC-B']],
  'Motor Grader': [['3.7 m blade', 'Caterpillar 120K']],
  'Mobile Crane': [['14-ton', 'Escorts Hydra 14XL']],
  'Concrete Pump': [['70 m³/h', 'Putzmeister BSA 1407']],
  'Wheel Loader': [['2 m³ bucket', 'JCB 436ZX'], ['3 m³ bucket', 'Komatsu WA320']],
  'Asphalt Paver': [['3.5 m paving width', 'Vogele Super 1800']],
  Bulldozer: [['20-ton', 'Komatsu D65']],
  'Backhoe Loader (JCB)': [['1 m³', 'JCB 3DX']],
  'Diesel Generator': [['125 kVA', 'Kirloskar KG1-125']],
  'Air Compressor': [['186 cfm', 'Atlas Copco XAS 186']],
  Forklift: [['3-ton', 'Godrej GX 30']],
  'Plate Compactor': [['0.55 m', 'Wacker Neuson VP1550']],
  'Water Pump': [['3 HP', 'Kirloskar KDS 3-HP']],
  'Concrete Batching Plant': [['60 m³/h', 'Ammann Elba 60']],
};

let token = '';
async function call(method, path, body) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = crypto.randomUUID();
  }
  const res = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error?.code ?? ''}`);
  return json.data ?? json;
}

async function main() {
  const si = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ loginId, password }),
  });
  const sj = await si.json();
  if (!si.ok || !sj.data) throw new Error('sign-in failed');
  token = sj.data.accessToken;

  const [types, lines, projects] = await Promise.all([
    call('GET', '/equipment-types?limit=200'),
    call('GET', '/plan-lines?limit=1000&resourceKind=equipment'),
    call('GET', '/projects?limit=200'),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const used = new Map(); // project + type -> how many specs were handed out
  let done = 0;
  const skipped = [];
  const failures = [];
  for (const l of lines.filter((x) => x.resourceKind === 'equipment' && !x.capacity && !x.model)) {
    const name = typeName.get(l.equipmentTypeId);
    const options = SPECS[name];
    if (!options) { skipped.push(`${name ?? 'unknown type'} (no spec set)`); continue; }
    const key = `${l.projectId}|${name}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    const [capacity, model] = options[n % options.length];
    try {
      await call('PATCH', `/plan-lines/${l.id}`, { capacity, model, rowVersion: l.rowVersion });
      done++;
    } catch (e) {
      failures.push(`${name} at ${projectName.get(l.projectId)}: ${e.message}`);
    }
  }
  console.log(`equipment lines given capacity and model: ${done}`);
  const uniqueSkipped = [...new Set(skipped)];
  for (const s of uniqueSkipped) console.log('  skipped: ' + s);
  for (const f of failures) console.log('  not saved: ' + f);
}

await main().catch((err) => {
  console.error('Stopped:', err.message);
  process.exit(1);
});
