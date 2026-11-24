import { z } from 'zod'
import type { Department, Role } from '@/modules/core-data'
import { code, req } from '@/shared/lib/core'

/** Department accents (CSS tokens), picked by Department.color. */
export const DEPT_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--c-green)', 'var(--c-amber)', 'var(--c-red)', 'var(--sky)', 'var(--c-blue)', 'var(--slate)'] as const
export const deptColor = (d?: Department) => d?.colorHex || DEPT_COLORS[(d?.color ?? 0) % DEPT_COLORS.length]

export const GRADES = ['E1', 'E2', 'E3', 'M1', 'M2', 'M3', 'S1', 'S2', 'S3', 'S4', 'W1', 'W2'] as const
export const GRADE_INFO: Record<string, string> = { E: 'Executive', M: 'Manager', S: 'Staff', W: 'Workmen' }
export const gradeBand = (g: string) => GRADE_INFO[g[0]] ?? 'Other'

/** ids of every role below this one (direct and indirect reports) */
export function descendants(roles: Role[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => roles.filter((r) => r.reportsToId === pid).forEach((r) => { if (!out.has(r.id)) { out.add(r.id); walk(r.id) } })
  walk(id)
  return out
}

/** ids of every department below this one */
export function subDepartments(depts: Department[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => depts.filter((d) => d.parentId === pid).forEach((d) => { if (!out.has(d.id)) { out.add(d.id); walk(d.id) } })
  walk(id)
  return out
}

/** "Vacant" for a single-position role nobody holds; otherwise the holder or the number of positions */
export const isVacant = (r: Role) => r.status === 'Active' && r.positions === 1 && !r.holder.trim()
export const heldText = (r: Role) => (r.positions > 1 ? `${r.positions} positions` : r.holder.trim() || 'Vacant')

export const deptSchema = z.object({
  code: code('Department code'),
  name: req('Department name').max(60, 'Keep it under 60 characters.'),
  parentId: z.string(),
  headRoleId: z.string(),
  description: z.string().trim().max(300, 'Keep it under 300 characters.'),
  color: z.number().int().min(0).max(7),
  colorHex: z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Enter a valid hex colour, for example #1A73E8.')]).optional(),
  status: z.enum(['Active', 'Inactive']),
})
export type DeptValues = z.infer<typeof deptSchema>

export const roleSchema = z.object({
  title: req('Role title').max(60, 'Keep it under 60 characters.'),
  code: code('Role code'),
  departmentId: z.string().min(1, 'Choose the department.'),
  grade: z.enum(GRADES, { error: 'Choose a grade.' }),
  reportsToId: z.string(),
  positions: z.number({ error: 'Enter the number of positions.' }).int('Whole positions only.').min(1, 'At least 1 position.').max(500, 'At most 500 positions.'),
  holder: z.string().trim().max(60, 'Keep it under 60 characters.'),
  description: z.string().trim().max(300, 'Keep it under 300 characters.'),
  status: z.enum(['Active', 'Inactive']),
})
export type RoleValues = z.infer<typeof roleSchema>

/**
 * Structure rules shared by the form and the bulk upload. Returns [field, message] pairs.
 * - one top role (reports to no one); no reporting loops
 * - an inactive role keeps no active direct reports; roles sit in active departments
 */
export function roleRules(v: RoleValues, id: string | undefined, roles: Role[], depts: Department[]): [keyof RoleValues, string][] {
  const out: [keyof RoleValues, string][] = []
  const others = roles.filter((r) => r.id !== id)
  if (others.some((r) => r.code === v.code)) out.push(['code', 'Another role uses this code.'])
  const dept = depts.find((d) => d.id === v.departmentId)
  if (dept && dept.status === 'Inactive' && v.status === 'Active') out.push(['departmentId', `${dept.name} is inactive. Choose an active department.`])
  if (!v.reportsToId) {
    const top = others.find((r) => r.reportsToId === null && r.status === 'Active')
    if (top && v.status === 'Active') out.push(['reportsToId', `Only one role reports to no one: ${top.title}. Choose who this role reports to.`])
  } else {
    if (id && (v.reportsToId === id || descendants(roles, id).has(v.reportsToId))) out.push(['reportsToId', 'That would make a reporting loop. Choose a role above this one.'])
    const boss = roles.find((r) => r.id === v.reportsToId)
    if (boss && boss.status === 'Inactive' && v.status === 'Active') out.push(['reportsToId', `${boss.title} is inactive.`])
  }
  if (id && v.status === 'Inactive') {
    const reports = roles.filter((r) => r.reportsToId === id && r.status === 'Active')
    if (reports.length) out.push(['status', `${reports.length} active role${reports.length === 1 ? ' reports' : 's report'} to it (${reports.map((r) => r.title).join(', ')}). Move them first.`])
  }
  return out
}
