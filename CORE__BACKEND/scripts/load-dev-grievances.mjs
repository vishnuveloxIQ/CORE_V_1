// Development only. Adds sample grievances to one tenant THROUGH THE API (POST /grievances). Codes are new per run; existing codes are skipped.
// Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-grievances.mjs <tenantId> <prefix> [apiBaseUrl]
const [tenantId, prefix, apiArg] = process.argv.slice(2);
const apiBase = (apiArg ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
if (!tenantId || !prefix || !loginId || !password) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-grievances.mjs <tenantId> <prefix> [apiBaseUrl]');
  process.exit(1);
}

const ROWS = [
  ['Water supply interrupted at camp B for two days', 'Workers at camp B reported no water supply since Monday. Tanker supply was late.', 'open', 'camp B', 'Anil Kumar', 'EMP-1101', 'Site visit planned', 'confirmed'],
  ['Unpaid overtime for night shift at canal lining', 'Night shift overtime for the last fortnight has not appeared in the payslip.', 'in_review', 'canal lining', 'Sunita Rao', 'EMP-1102', 'Visit done', 'visited'],
  ['Safety helmets not issued to new labour', 'Eleven new labourers joined this week without helmets.', 'open', 'NH-65 widening', 'Ramesh Babu', 'EMP-1103', 'Not planned', null],
  ['Canteen food quality at depot', 'Repeated complaints about the quality of food served in the depot canteen.', 'resolved', 'depot', 'Priya Nair', 'EMP-1104', 'Visit done', 'visited'],
  ['Leave application not processed for two weeks', 'Casual leave applied on the 4th has not been approved or rejected.', 'in_review', 'head office', 'Mahesh Reddy', 'EMP-1105', 'Not planned', null],
  ['Transport bus timing changed without notice', 'The camp bus now leaves 30 minutes earlier with no notice to workers.', 'open', 'camp A', 'Kavita Shah', 'EMP-1106', 'Site visit planned', 'confirmed'],
  ['Medical kit empty at equipment yard', 'The first-aid kit at the equipment yard has been empty since last month.', 'resolved', 'equipment yard', 'Vikram Joshi', 'EMP-1107', 'Visit done', 'visited'],
  ['Salary slip shows wrong PF deduction', 'The PF deduction on the last salary slip is higher than the statutory amount.', 'closed', 'head office', 'Lakshmi Iyer', 'EMP-1108', 'Visit done', 'visited'],
];

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

  const existing = new Set((await call('GET', '/grievances?limit=200')).map((g) => g.code));
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  let added = 0;
  const failures = [];
  for (const [i, [subject, message, status, site, raisedByName, employeeCode, visit, visitStatus]] of ROWS.entries()) {
    const code = `GRV-${prefix}${String(i + 1).padStart(3, '0')}`;
    if (existing.has(code)) continue;
    try {
      await call('POST', '/grievances', {
        code,
        subject,
        message,
        status,
        sourceModule: 'hrms',
        raisedByName,
        employeeCode,
        visitDate: visitStatus ? day(-(i + 2)) : undefined,
        visitStatus: visitStatus ?? undefined,
      });
      added++;
    } catch (e) {
      failures.push(`${code} (${site}, ${visit}): ${e.message}`);
    }
  }
  console.log(`grievances added: ${added}`);
  for (const f of failures) console.log('  not added: ' + f);
}

await main().catch((err) => {
  console.error('Stopped:', err.message);
  process.exit(1);
});
