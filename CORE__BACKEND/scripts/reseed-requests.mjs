// Replaces the approval requests the frontend-seed loader raised (codes REQ--0xxxx, raised by the loader account, with no
// raiser name and the loader as every approver) with complete requests, THROUGH THE API. Local development only.
//
// Usage (the API must be running; the approval chains must already name the seed approvers):
//   RESEED_PASSWORD=... node --import tsx scripts/reseed-requests.mjs [tenantId] [apiBaseUrl]
// Defaults: tenant acme, http://127.0.0.1:3200. LOADER_LOGIN_ID (default ACME9999) is the loader account; its password is
// LOADER_PASSWORD, or RESEED_PASSWORD when that is not set. FRONTEND_SEED overrides the seed path. Passwords and tokens are
// never printed.
//
// Steps:
//   1. Cancel, as the loader, each request it raised whose code starts with REQ-- and that is still pending or waiting
//      for a clarification (cancel is for the raiser alone, in those two states: approvals/service.ts).
//   2. Raise one request per seed request, in seed order, signed in as a seed user who is not an approver on the chain the
//      API picks (the module head when possible, otherwise VELOX1188). The seed's free-text raiser is kept in the payload
//      as onBehalfOf. A request is matched to its seed request by request type and title among the requests not raised
//      by the loader, so a second run raises nothing.
//   3. Replay the seed outcome by signing in as each level's approver. A level whose approver is the Tenant Admin
//      (ACME1234) is not acted on: the request stops there and is reported. Nobody acts on their own request.
//   4. Publish an approved job opening that the seed marks as published to a site (as the loader, approvals.manage).
//
// Re-runs: each step reads the current state first and only acts on what is missing, so a second run changes nothing.

import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seedPath =
  process.env.FRONTEND_SEED ??
  resolve(here, '../../CORE__V__0.4/veloxiq-core/src/modules/core-data/data/seed.ts');
const tenantId = process.argv[2] ?? 'acme';
const apiBase = (process.argv[3] ?? process.env.API_BASE ?? 'http://127.0.0.1:3200').replace(/\/$/, '');
const userPassword = process.env.RESEED_PASSWORD;
const loaderLogin = process.env.LOADER_LOGIN_ID ?? 'ACME9999';
const loaderPassword = process.env.LOADER_PASSWORD ?? userPassword;
if (!userPassword) {
  console.error('Usage: RESEED_PASSWORD=... node --import tsx scripts/reseed-requests.mjs [tenantId] [apiBaseUrl]');
  process.exit(1);
}

const { REQUESTS, PROJECTS, SITES, STORES, MATERIALS } = await import(pathToFileURL(seedPath).href);

/** The Tenant Admin: never signed in here. A level that needs this user is reported instead. */
const TENANT_ADMIN_LOGIN = 'ACME1234';
/** The head of each module, preferred as the raiser; FALLBACK_RAISER when the head is an approver on the chain. */
const MODULE_HEAD = { HRMS: 'VELOX1021', PMS: 'VELOX1045', Stores: 'VELOX1102', 'P&M': 'VELOX1102' };
const FALLBACK_RAISER = 'VELOX1188';
/** Payload kinds whose payload amount is the request amount (frontend AMOUNT_KINDS). */
const AMOUNT_KINDS = new Set(['payment', 'loan', 'bonus']);
const OPEN = new Set(['pending', 'clarification_requested']);

// ---------------------------------------------------------------------------------------------------------------------
// API access. One session per login, signed in once per run.

const sessions = new Map(); // loginId -> { token } | { blocked: reason }

async function call(token, method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  else headers['x-tenant-id'] = tenantId;
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
    if (res.status !== 429 || attempt >= 10) break;
    const wait = Number(json?.error?.details?.retryAfterSeconds ?? 5);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  if (!res.ok) {
    const code = json?.error?.code ?? 'ERROR';
    const message = json?.error?.message ?? 'no message';
    const details = json?.error?.details ? ` ${JSON.stringify(json.error.details).slice(0, 300)}` : '';
    throw new Error(`${method} ${path} -> ${res.status} ${code}: ${message}${details}`);
  }
  return json.data;
}

/** Signs in once. A login that must change its password is blocked (not changed) and reported. */
async function session(loginId) {
  if (!sessions.has(loginId)) {
    if (loginId === TENANT_ADMIN_LOGIN) {
      sessions.set(loginId, { blocked: 'Tenant Admin (ACME1234) is not signed in by this script' });
    } else {
      const password = loginId === loaderLogin ? loaderPassword : userPassword;
      try {
        const login = await call(null, 'POST', '/auth/login', { loginId, password });
        if (login.mustChangePassword) {
          sessions.set(loginId, { blocked: `${loginId} must change its password (not changed here)` });
        } else {
          sessions.set(loginId, { token: login.accessToken });
        }
      } catch (err) {
        sessions.set(loginId, { blocked: `${loginId} could not sign in: ${err.message}` });
      }
    }
  }
  return sessions.get(loginId);
}

async function as(loginId, method, path, body) {
  const s = await session(loginId);
  if (s.blocked) throw new Error(s.blocked);
  return call(s.token, method, path, body);
}

// ---------------------------------------------------------------------------------------------------------------------

const report = { cancelled: [], cancelFailed: [], raised: [], reused: [], raiseFailed: [], actions: 0, stopped: [], published: [], notes: [] };

async function main() {
  const loader = await session(loaderLogin);
  if (loader.blocked) throw new Error(loader.blocked);
  const L = (method, path, body) => as(loaderLogin, method, path, body);

  const users = await L('GET', '/users');
  const loginOf = Object.fromEntries(users.map((u) => [u.id, u.loginId]));
  const idOf = Object.fromEntries(users.map((u) => [u.loginId, u.id]));
  const loaderId = idOf[loaderLogin];

  const [projects, locations, markers, stores, materials, uoms, chains, versions, levels] = await Promise.all([
    L('GET', '/projects'), L('GET', '/locations'), L('GET', '/chainage-markers'), L('GET', '/stores'),
    L('GET', '/materials'), L('GET', '/uoms'), L('GET', '/approval-chains'), L('GET', '/matrix-versions'),
    L('GET', '/matrix-levels'),
  ]);

  // Step 1: cancel the loader's requests.
  let requests = await L('GET', '/approval-requests');
  for (const r of requests) {
    if (!String(r.code).startsWith('REQ--') || r.raisedById !== loaderId) continue;
    if (r.status === 'cancelled') continue;
    if (!OPEN.has(r.status)) {
      report.cancelFailed.push(`${r.code}: status ${r.status} cannot be cancelled`);
      continue;
    }
    try {
      await L('POST', `/approval-requests/${r.id}/actions`, {
        action: 'cancel', comment: 'Replaced by a complete request (reseed).', rowVersion: r.rowVersion,
      });
      report.cancelled.push(r.code);
    } catch (err) {
      report.cancelFailed.push(`${r.code}: ${err.message}`);
    }
  }

  // Seed id -> server id maps (matched by code).
  const seedProjectOfMarker = {};
  for (const p of PROJECTS) for (const m of p.chainage?.markers ?? []) seedProjectOfMarker[m.id] = p;
  const serverProject = (seedProject) => projects.find((x) => x.code === seedProject.code);
  const siteCode = Object.fromEntries(SITES.map((s) => [s.id, s.code]));
  const locationByCode = (code) => locations.filter((l) => l.code === code);
  const serverLocationOfSite = (siteId) => locationByCode(siteCode[siteId])[0]?.id;
  const storeOf = Object.fromEntries(STORES.map((s) => [s.id, stores.find((x) => x.code === s.code)?.id]));
  const uomCode = Object.fromEntries(uoms.map((u) => [u.id, u.code ?? u.uomCode]));
  const materialOf = Object.fromEntries(
    MATERIALS.map((m) => [m.id, materials.find((x) => x.code === m.code)]),
  );

  /** The project's location for a seed request: the site of the store at the request's marker, else the only one. */
  function locationFor(seedReq, projectId) {
    const inProject = locations.filter((l) => l.projectId === projectId);
    const store = STORES.find((s) => s.chainageId === seedReq.chainageId);
    if (store) {
      const match = inProject.find((l) => l.code === siteCode[store.locationId]);
      if (match) return match.id;
      if (inProject.length) {
        report.notes.push(
          `${seedReq.id}: site ${siteCode[store.locationId]} is not a location of the project on the server; location left empty`,
        );
        return undefined;
      }
    }
    if (inProject.length === 1) return inProject[0].id;
    return undefined;
  }

  /** The seed payload with seed ids mapped to server ids, plus the free-text raiser as onBehalfOf. */
  function payloadFor(seedReq) {
    const p = structuredClone(seedReq.payload ?? {});
    const need = (v, what) => {
      if (!v) throw new Error(`${what} has no server row`);
      return v;
    };
    if (p.kind === 'material') {
      const mat = need(materialOf[p.materialId], `material ${p.materialId}`);
      p.materialId = mat.id;
      if (!p.uom && mat.uomId && uomCode[mat.uomId]) p.uom = uomCode[mat.uomId];
      p.storeId = need(storeOf[p.storeId], `store ${p.storeId}`);
    }
    if (p.kind === 'transfer') {
      p.fromSiteId = need(serverLocationOfSite(p.fromSiteId), `site ${p.fromSiteId}`);
      p.toSiteId = need(serverLocationOfSite(p.toSiteId), `site ${p.toSiteId}`);
    }
    // The raise dialog sends job openings unpublished; publishing is step 4.
    if (p.kind === 'job') p.publishedToSite = null;
    if (seedReq.raisedBy) p.onBehalfOf = seedReq.raisedBy;
    return p;
  }

  /** The chain and published version the API will pick (service.ts chainFor and publishedVersionFor). */
  const today = new Date().toISOString().slice(0, 10);
  function approverLoginsFor(requestType, projectId) {
    const chain =
      chains.find((c) => c.requestType === requestType && c.projectId === projectId && c.isActive && projectId) ??
      chains.find((c) => c.requestType === requestType && c.scopeType === 'company' && c.isActive);
    if (!chain) return null;
    const version = versions
      .filter((v) => v.chainId === chain.id && v.publishedAt && v.effectiveFrom <= today)
      .sort((a, b) => (b.effectiveFrom.localeCompare(a.effectiveFrom)) || b.versionNo - a.versionNo)[0];
    if (!version) return null;
    return new Set(
      levels.filter((l) => l.matrixVersionId === version.id).map((l) => loginOf[l.approverUserId]).filter(Boolean),
    );
  }

  // Step 2: raise, in seed order.
  requests = await L('GET', '/approval-requests');
  const pairs = [];
  for (const s of REQUESTS) {
    try {
      const existing = requests.find(
        (r) => r.raisedById !== loaderId && r.requestType === s.type && r.title === s.title,
      );
      if (existing) {
        report.reused.push(existing.code);
        pairs.push({ seed: s, id: existing.id, raiser: loginOf[existing.raisedById] });
        continue;
      }
      const seedProject = seedProjectOfMarker[s.chainageId];
      const project = seedProject ? serverProject(seedProject) : undefined;
      const marker = project ? markers.find((m) => m.projectId === project.id && m.code === s.chainageId) : undefined;
      if (seedProject && !project) throw new Error(`project ${seedProject.code} has no server row`);
      if (project && !marker) throw new Error(`marker ${s.chainageId} is not in project ${project.code}`);
      const approvers = approverLoginsFor(s.type, project?.id);
      if (!approvers) throw new Error(`no published chain for ${s.type}`);
      const head = MODULE_HEAD[s.module];
      let raiser = head && !approvers.has(head) ? head : FALLBACK_RAISER;
      if (raiser !== FALLBACK_RAISER && (await session(raiser)).blocked) {
        report.notes.push(`${s.id}: ${(await session(raiser)).blocked}; raised by ${FALLBACK_RAISER} instead`);
        raiser = FALLBACK_RAISER;
      }
      if (approvers.has(raiser)) throw new Error(`${raiser} is an approver on the ${s.type} chain`);
      const payload = payloadFor(s);
      const body = {
        requestType: s.type,
        module: s.module,
        title: s.title,
        amount: AMOUNT_KINDS.has(payload.kind) ? Number(payload.amount ?? 0) : 0,
        emergency: !!s.emergency,
        projectId: project?.id,
        locationId: project ? locationFor(s, project.id) : undefined,
        chainageMarkerId: marker?.id,
        payload,
      };
      const row = await as(raiser, 'POST', '/approval-requests', body);
      report.raised.push(row.code);
      pairs.push({ seed: s, id: row.id, raiser });
    } catch (err) {
      report.raiseFailed.push(`${s.id}: ${err.message}`);
    }
  }

  // Step 3: replay the seed outcome.
  for (const pair of pairs) {
    const s = pair.seed;
    const status = String(s.status);
    const n = Number(s.currentLevel) || 1;
    // approveBelow: levels below this number approve; rejectAt: the level that rejects (if any).
    const plan =
      status === 'Approved' ? { approveBelow: Infinity, rejectAt: null }
        : status === 'Rejected' ? { approveBelow: n, rejectAt: n }
          : { approveBelow: n, rejectAt: null };
    if (plan.approveBelow <= 1 && plan.rejectAt === null) continue;
    const commentAt = (level, action) =>
      (s.history ?? []).find((h) => h.level === level && h.action === action && h.comment)?.comment;
    const decision = s.payload?.kind === 'job' && s.payload.route ? s.payload.route : undefined;

    for (let guard = 0; guard < 10; guard += 1) {
      const r = await L('GET', `/approval-requests/${pair.id}`);
      if (r.status !== 'pending') break;
      const level = r.currentLevel;
      const snapshot = r.levelsSnapshot ?? [];
      const isLast = !snapshot.some((l) => l.levelNo > level);
      let action = null;
      if (plan.rejectAt === level) action = 'reject';
      else if (level < plan.approveBelow && (plan.approveBelow === Infinity || !isLast)) action = 'approve';
      if (!action) break;
      const lvl = snapshot.find((l) => l.levelNo === level);
      const approver = loginOf[lvl?.approverUserId];
      if (!approver) {
        report.stopped.push(`${r.code} (${s.id}) stopped at L${level}: the level names no user approver`);
        break;
      }
      if (approver === pair.raiser) {
        report.stopped.push(`${r.code} (${s.id}) stopped at L${level}: the approver raised the request`);
        break;
      }
      const sess = await session(approver);
      if (sess.blocked) {
        report.stopped.push(`${r.code} (${s.id}) stopped at L${level} (${action} needed): ${sess.blocked}`);
        break;
      }
      const comment = commentAt(level, action === 'approve' ? 'Approved' : 'Rejected');
      await as(approver, 'POST', `/approval-requests/${pair.id}/actions`, {
        action,
        rowVersion: r.rowVersion,
        ...(comment ? { comment } : {}),
        ...(action === 'approve' && decision ? { decision } : {}),
      });
      report.actions += 1;
    }
  }

  // Step 4: publish approved job openings the seed marks as published to a site.
  for (const pair of pairs) {
    const s = pair.seed;
    if (s.payload?.kind !== 'job' || !s.payload.publishedToSite || s.status !== 'Approved') continue;
    const r = await L('GET', `/approval-requests/${pair.id}`);
    const store = STORES.find((x) => x.chainageId === s.chainageId);
    const target = store ? serverLocationOfSite(store.locationId) : r.locationId;
    if (r.status !== 'approved') {
      report.stopped.push(`${r.code} (${s.id}) not published: it is ${r.status}, not approved`);
      continue;
    }
    if (r.publishedLocationId === target) continue;
    if (!target) {
      report.stopped.push(`${r.code} (${s.id}) not published: no server location for the site`);
      continue;
    }
    await L('POST', `/approval-requests/${pair.id}/publish`, { locationId: target, rowVersion: r.rowVersion });
    report.published.push(r.code);
  }

  // Summary table.
  const final = await L('GET', '/approval-requests');
  const oldBySeed = {};
  for (const r of final) {
    if (r.raisedById !== loaderId || !String(r.code).startsWith('REQ--')) continue;
    const s = REQUESTS.find((x) => x.type === r.requestType && x.title === r.title);
    if (s) oldBySeed[s.id] = r;
  }
  console.log('\nseed      | old code (status)          | new code   | raised by | status (level)');
  for (const pair of pairs) {
    const r = final.find((x) => x.id === pair.id);
    const o = oldBySeed[pair.seed.id];
    console.log(
      `${pair.seed.id.padEnd(9)} | ${(o ? `${o.code} (${o.status})` : '-').padEnd(26)} | ${r.code.padEnd(10)} | ${String(pair.raiser).padEnd(9)} | ${r.status}${r.status === 'pending' ? ` (L${r.currentLevel})` : ''}`,
    );
  }
  console.log(`\ncancelled: ${report.cancelled.length}${report.cancelled.length ? ` (${report.cancelled.join(', ')})` : ''}`);
  console.log(`cancel failures: ${report.cancelFailed.length}`);
  for (const f of report.cancelFailed) console.log(`  ${f}`);
  console.log(`raised: ${report.raised.length}; already present (reused): ${report.reused.length}`);
  console.log(`raise failures: ${report.raiseFailed.length}`);
  for (const f of report.raiseFailed) console.log(`  ${f}`);
  console.log(`approval actions taken: ${report.actions}`);
  console.log(`published: ${report.published.length}${report.published.length ? ` (${report.published.join(', ')})` : ''}`);
  console.log(`stopped early: ${report.stopped.length}`);
  for (const f of report.stopped) console.log(`  ${f}`);
  for (const f of report.notes) console.log(`note: ${f}`);
}

main().catch((err) => {
  console.error(`failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exit(1);
});
