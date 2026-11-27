// Development only. Creates two module-head users in one tenant and raises pending requests AS those users, so the tenant
// admin has requests to accept. The admin raises nothing. Everything goes THROUGH THE API. Safe to re-run: existing users
// and existing request titles are reused, and nothing is deleted.
//
// Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-module-requests.mjs <tenantId> [apiBaseUrl]
// The admin is the login used for DEMO_*. New users get the development password DEV_USER_PASSWORD (or
// DEMO_PASSWORD when unset) after their temporary password is changed at the first sign-in. Nothing is printed except
// login IDs and request titles.
import { randomUUID } from 'node:crypto';

const [tenantId, apiArg] = process.argv.slice(2);
const apiBase = (apiArg ?? 'http://127.0.0.1:3200').replace(/\/$/, '');
const adminLogin = process.env.DEMO_LOGIN_ID;
const adminPassword = process.env.DEMO_PASSWORD;
const devPassword = process.env.DEV_USER_PASSWORD ?? adminPassword;
if (!tenantId || !adminLogin || !adminPassword) {
  console.error('Usage: DEMO_LOGIN_ID=... DEMO_PASSWORD=... node scripts/load-dev-module-requests.mjs <tenantId> [apiBaseUrl]');
  process.exit(1);
}

// Two module heads. The login prefix is the tenant's own prefix (upper case), numbers start at 2001.
const prefix = adminLogin.replace(/\d+$/, '');
const USERS = [
  { loginId: `${prefix}2001`, name: 'Ananya Gupta', designation: 'Stores module head', modules: ['stores'] },
  { loginId: `${prefix}2002`, name: 'Rahul Shah', designation: 'P&M module head', modules: ['pm'] },
];
// Requests each head raises (type and module match the seed approval chains). Titles are the duplicate check.
const REQUESTS = {
  [`${prefix}2001`]: [
    { requestType: 'Material', module: 'Stores', title: 'Cement for intake well base slab', amount: 0 },
    { requestType: 'Material', module: 'Stores', title: 'Steel and sand for canal end works', amount: 0 },
    { requestType: 'Material', module: 'Stores', title: 'Bitumen for road patch repair', amount: 0 },
  ],
  [`${prefix}2002`]: [
    { requestType: 'Equipment', module: 'P&M', title: '1 concrete pump for pier P1', amount: 0 },
    { requestType: 'Equipment', module: 'P&M', title: 'Wheel loader for embankment work', amount: 0 },
  ],
};

async function call(token, method, path, body, extra = {}) {
  const headers = { accept: 'application/json', 'x-tenant-id': tenantId, ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = randomUUID();
  }
  const res = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error?.code ?? ''}`);
  return json.data ?? json;
}

async function signIn(loginId, password) {
  const res = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ loginId, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.data) throw new Error(`sign-in ${loginId} -> ${res.status} ${json.error?.code ?? ''}`);
  return json.data;
}

async function main() {
  const admin = await signIn(adminLogin, adminPassword);
  const adminToken = admin.accessToken;
  const existingUsers = await call(adminToken, 'GET', '/users?limit=200');
  const known = new Set((existingUsers.items ?? existingUsers).map((u) => u.loginId));

  for (const u of USERS) {
    if (!known.has(u.loginId)) {
      const created = await call(adminToken, 'POST', '/users', {
        loginId: u.loginId, name: u.name, designation: u.designation, role: 'module_head', modules: u.modules,
        scopeType: 'company', scopeIds: [],
      });
      // The temporary password is used once, here, to set the development password. It is not stored or printed.
      const first = await signIn(u.loginId, created.temporaryPassword);
      await call(first.accessToken, 'POST', '/auth/change-password', {
        currentPassword: created.temporaryPassword, newPassword: devPassword,
      });
      console.log(`user created: ${u.loginId} (${u.name})`);
    } else {
      console.log(`user exists: ${u.loginId}`);
    }
  }

  const existingRequests = await call(adminToken, 'GET', '/approval-requests?limit=200');
  const titles = new Set((existingRequests.items ?? existingRequests).map((r) => r.title));
  for (const u of USERS) {
    const head = await signIn(u.loginId, devPassword);
    for (const r of REQUESTS[u.loginId]) {
      if (titles.has(r.title)) {
        console.log(`request exists: ${r.title}`);
        continue;
      }
      const raised = await call(head.accessToken, 'POST', '/approval-requests', {
        requestType: r.requestType, module: r.module, amount: r.amount, title: r.title, payload: {}, emergency: false,
      });
      console.log(`request raised by ${u.loginId}: ${raised.code ?? raised.id} ${r.title}`);
    }
  }
}

await main().catch((err) => {
  console.error('Stopped:', err.message);
  process.exit(1);
});
