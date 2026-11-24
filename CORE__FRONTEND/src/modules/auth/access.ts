import type { ReactNode } from 'react'
import { useAuth } from './store/useAuth'

/**
 * The privileges that gate master-data changes, as the server names them. The screens show a create or edit control
 * only when the signed-in user holds the privilege; the server still refuses the request if they do not (403).
 */
export const MANAGE = {
  /** projects, locations, stores, geo-fence zones, milestones and WBS */
  projects: 'projects.manage',
  /** materials, vendors, equipment types, equipment units and plan lines */
  masters: 'masters.manage',
  /** departments, roles, holidays and shifts */
  organisation: 'organisation.manage',
  /** users and access grants */
  access: 'access.manage',
  /** policies, their versions and company-defined (custom) policies */
  policies: 'policies.manage',
} as const

/** True when the signed-in user holds the privilege. Reads the list kept at sign-in. */
export function useCanManage(privilege: string): boolean {
  return useAuth((s) => s.privileges.includes(privilege))
}

/** Renders its children only when the signed-in user holds the privilege. */
export function Can({ privilege, children }: { privilege: string; children?: ReactNode }): ReactNode {
  return useCanManage(privilege) ? (children ?? null) : null
}
