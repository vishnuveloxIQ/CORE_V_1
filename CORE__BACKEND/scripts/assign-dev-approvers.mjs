// Development only. Assigns the dev approver users to every approval chain, one matrix version per chain, through the API.
// Published versions cannot change, so for each chain a new version is created from today with the same number of levels,
// each level's approver is set from the module and level, the module head is the escalation target, and the version is published.
//
// Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/assign-dev-approvers.mjs <tenantId> <loginPrefix> <firstLoginNumber> [apiBaseUrl]
// Login numbers: first = module heads (4), then 16 approvers (HRMS, P&M, PMS, Stores x L1..L4), as created for the dev users.
import { randomUUID } from 'node:crypto';

const [tenantId, prefix, firstArg, apiArg] = process.argv.slice(2);
const apiBase = (apiArg ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginId = process.env.DEMO_LOGIN_ID;
const password = process.env.DEMO_PASSWORD;
if (!tenantId || !prefix || !firstArg || !loginId || !password) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/assign-dev-approvers.mjs <tenantId> <prefix> <firstLoginNumber> [apiBaseUrl]');
  process.exit(1);
}
const first = Number(firstArg);
const MODULES = ['HRMS', 'P&M', 'PMS', 'Stores'];
let token = '';

async function call(method, path, body) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
  if (body !== undefined) { headers['content-type'] = 'application/json'; headers['idempotency-key'] = randomUUID(); }
  const res = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${json.error?.code ?? ''}`), { status: res.status });
  return json.data ?? json;
}

async function main() {
  const si = await fetch(apiBase + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ loginId, password }) });
  const sj = await si.json();
  if (!si.ok || !sj.data) throw new Error('sign-in failed');
  token = sj.data.accessToken;

  // the dev users: heads by module, approvers by module and level
  const users = await call('GET', '/users?limit=200');
  const byLogin = new Map(users.map((u) => [u.loginId, u]));
  const head = {};
  const approver = {};
  MODULES.forEach((m, i) => {
    head[m] = byLogin.get(`${prefix}${first + i}`)?.id;
    for (let lvl = 1; lvl <= 4; lvl++) approver[`${m}|${lvl}`] = byLogin.get(`${prefix}${first + 4 + i * 4 + (lvl - 1)}`)?.id;
  });
  const moduleKey = (m) => (m === 'P&M' || m === 'PM' ? 'P&M' : m);

  const chains = await call('GET', '/approval-chains?limit=200');
  const versions = await call('GET', '/matrix-versions?limit=200');
  const levels = await call('GET', '/matrix-levels?limit=500');
  const report = { chains: 0, versions: 0, levels: 0, failures: [] };

  for (const chain of chains) {
    const m = moduleKey(chain.module);
    if (!MODULES.includes(m)) { report.failures.push(`chain ${chain.name}: module ${chain.module} has no dev approvers`); continue; }
    if (!head[m] || !approver[`${m}|1`]) { report.failures.push(`no dev user for ${m}`); continue; }
    // the published version that applies today: the latest effective one
    const published = versions
      .filter((v) => v.chainId === chain.id && v.publishedAt && v.effectiveFrom <= today())
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.versionNo - a.versionNo))[0];
    if (!published) { report.failures.push(`chain ${chain.name}: no published version`); continue; }
    const current = levels.filter((l) => l.matrixVersionId === published.id).sort((a, b) => a.levelNo - b.levelNo);
    try {
      const created = await call('POST', '/matrix-versions', { chainId: chain.id, effectiveFrom: today(), reason: 'Dev approvers assigned' });
      report.versions++;
      for (const l of current) {
        const lvl = Math.min(l.levelNo, 4);
        await call('POST', '/matrix-levels', {
          matrixVersionId: created.id,
          levelNo: l.levelNo,
          amountFrom: l.amountFrom,
          amountTo: l.amountTo,
          approverUserId: approver[`${m}|${lvl}`],
          escalateToUserId: head[m],
          timeoutHours: l.timeoutHours,
          onTimeout: l.onTimeout,
          cashLimitInr: l.cashLimitInr,
        });
        report.levels++;
      }
      await call('POST', `/matrix-versions/${created.id}/publish`, { rowVersion: created.rowVersion });
      report.chains++;
    } catch (err) {
      report.failures.push(`chain ${chain.name}: ${err.message}`);
    }
  }
  console.log(`chains updated: ${report.chains}, versions created: ${report.versions}, levels set: ${report.levels}`);
  for (const f of report.failures) console.log('  not updated: ' + f);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

await main().catch((err) => { console.error('Stopped:', err.message); process.exit(1); });
