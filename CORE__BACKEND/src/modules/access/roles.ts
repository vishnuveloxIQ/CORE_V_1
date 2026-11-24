/** The privilege that manages access grants and suspensions (Phase 4d, design point g). */
export const ACCESS_MANAGE = 'access.manage';

/**
 * Privileges of each system role, keyed by core_role.code (Phase 4d, design point b). A tenant-defined
 * role has no privileges until the owning modules publish their privilege catalogue.
 */
const SYSTEM_ROLE_PRIVILEGES = new Map<string, readonly string[]>([
  ['access_admin', [ACCESS_MANAGE]],
]);

/** Privileges a role grants. Only system roles have any in Phase 4d. */
export function privilegesOfRole(role: { code: string; isSystem: boolean }): readonly string[] {
  if (!role.isSystem) {
    return [];
  }
  return SYSTEM_ROLE_PRIVILEGES.get(role.code) ?? [];
}
