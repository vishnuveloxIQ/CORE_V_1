import { describe, expect, it } from 'vitest'
import * as seed from './seed'

// Integrity checks for the mock seed. They run against whatever ids the seed uses today
// (display codes) and keep running after the uuid rewrite, so the seed stays self-consistent.

const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))

const collections: Record<string, { id: string }[]> = {
  PROJECTS: seed.PROJECTS,
  SITES: seed.SITES,
  STORES: seed.STORES,
  MATERIALS: seed.MATERIALS,
  UNITS: seed.UNITS,
  USERS: seed.USERS,
  CHAINS: seed.CHAINS,
  REQUESTS: seed.REQUESTS,
  GRIEVANCES: seed.GRIEVANCES,
  POLICIES: seed.POLICIES,
  AUDIT: seed.AUDIT,
  TICKETS: seed.TICKETS,
  DEPARTMENTS: seed.DEPARTMENTS,
  ROLES: seed.ROLES,
}

describe('seed ids', () => {
  for (const [name, rows] of Object.entries(collections)) {
    it(`${name} ids are unique`, () => {
      const all = rows.map((r) => r.id)
      expect(new Set(all).size).toBe(all.length)
    })
  }
})

describe('seed references', () => {
  const chainageIds = new Set(seed.PROJECTS.flatMap((p) => p.chainage.markers.map((m) => m.id)))

  it('store chainage ids resolve to chainage markers', () => {
    for (const s of seed.STORES) expect(chainageIds.has(s.chainageId), `${s.id} -> ${s.chainageId}`).toBe(true)
  })

  it('material store ids resolve to stores', () => {
    const stores = ids(seed.STORES)
    for (const m of seed.MATERIALS) for (const s of m.storeIds) expect(stores.has(s), `${m.id} -> ${s}`).toBe(true)
  })

  it('unit chainage ids resolve to chainage markers', () => {
    for (const u of seed.UNITS) expect(chainageIds.has(u.chainageId), `${u.id} -> ${u.chainageId}`).toBe(true)
  })

  it('stock rows reference known stores and materials', () => {
    const stores = ids(seed.STORES)
    const materials = ids(seed.MATERIALS)
    for (const row of seed.STOCK) {
      expect(stores.has(row.storeId), `stock store ${row.storeId}`).toBe(true)
      expect(materials.has(row.materialId), `stock material ${row.materialId}`).toBe(true)
    }
  })

  it('approval chains reference known projects for project scope', () => {
    const projects = ids(seed.PROJECTS)
    for (const c of seed.CHAINS) {
      if (c.scopeType !== 'Project') continue
      for (const p of c.scopeIds) expect(projects.has(p), `${c.id} -> ${p}`).toBe(true)
    }
  })

  it('requests reference known users, chainages, materials, stores and sites', () => {
    const users = ids(seed.USERS)
    const materials = ids(seed.MATERIALS)
    const stores = ids(seed.STORES)
    const sites = ids(seed.SITES)
    for (const r of seed.REQUESTS) {
      if (r.raisedById) expect(users.has(r.raisedById), `${r.id} raisedBy ${r.raisedById}`).toBe(true)
      expect(chainageIds.has(r.chainageId), `${r.id} chainage ${r.chainageId}`).toBe(true)
      const p = r.payload as Record<string, unknown>
      if (typeof p.materialId === 'string') expect(materials.has(p.materialId), `${r.id} material`).toBe(true)
      if (typeof p.storeId === 'string') expect(stores.has(p.storeId), `${r.id} store`).toBe(true)
      for (const k of ['fromSiteId', 'toSiteId']) {
        if (typeof p[k] === 'string') expect(sites.has(p[k] as string), `${r.id} ${k}`).toBe(true)
      }
    }
  })

  it('department parents and heads resolve', () => {
    const depts = ids(seed.DEPARTMENTS)
    const roles = ids(seed.ROLES)
    for (const d of seed.DEPARTMENTS) {
      if (d.parentId) expect(depts.has(d.parentId), `${d.id} parent`).toBe(true)
      if (d.headRoleId) expect(roles.has(d.headRoleId), `${d.id} head`).toBe(true)
    }
  })

  it('role department and reporting line resolve', () => {
    const depts = ids(seed.DEPARTMENTS)
    const roles = ids(seed.ROLES)
    for (const r of seed.ROLES) {
      expect(depts.has(r.departmentId), `${r.id} dept`).toBe(true)
      if (r.reportsToId) expect(roles.has(r.reportsToId), `${r.id} reportsTo`).toBe(true)
    }
  })
})
