import { z } from 'zod';

/** Dotted lowercase names, for example access.manage. The name must not be empty and has at least one dot. */
const PRIVILEGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** Modules named in migration 0003 and handoff section 8. */
export const ACCESS_MODULES = ['core', 'hrms', 'pm', 'pms', 'stores'] as const;

const privilegeSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(PRIVILEGE_PATTERN, 'must be dotted lowercase, for example access.manage');

const reasonSchema = z.string().trim().min(1).max(500);

/** Optional scope of a grant. Each id must exist in its table; the database checks that on insert. */
const scopeSchema = z.object({
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
});

export const grantBodySchema = z.discriminatedUnion('accessType', [
  z.object({
    accessType: z.literal('role'),
    roleId: z.uuid(),
    scope: scopeSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.object({
    accessType: z.literal('privilege'),
    privilege: privilegeSchema,
    scope: scopeSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.object({
    accessType: z.literal('module_head'),
    module: z.enum(ACCESS_MODULES),
    scope: scopeSchema.optional(),
    reason: reasonSchema.optional(),
  }),
]);

export const suspensionBodySchema = z.object({
  reason: reasonSchema,
});

export const userParamsSchema = z.object({
  userId: z.uuid(),
});

export const idParamsSchema = z.object({
  id: z.uuid(),
});

/** GET /users: optional status and search filters, and offset paging. limit defaults to 50 and is at most 200. */
export const userListQuery = z.object({
  status: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

/** The UI role of a user (stored in core_user.user_role). It describes the user; privileges still come from grants. */
export const USER_ROLES = ['module_head', 'approver'] as const;
/** Modules a module head can head (core_user.modules). pm is Plant and Machinery. */
export const USER_MODULES = ['hrms', 'pms', 'stores', 'pm'] as const;
/** The user's scope (core_user.scope): the whole company, or the projects in scopeIds. */
export const USER_SCOPE_TYPES = ['company', 'project'] as const;

/** Sign-in id: letters, digits, dot, underscore, at sign and hyphen, no spaces. Unique per tenant, ignoring case. */
const loginIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._@-]+$/, 'use letters, digits, dot, underscore, @ or hyphen');

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The roles a user holds, given by the request: `roles` when sent, else the single `role`, else the fallback. A user
 * may hold both roles (a module head can also sit on approval levels). module_head comes first.
 */
export function rolesFrom(input: { role?: UserRole | undefined; roles?: UserRole[] | undefined }, fallback: UserRole[]): UserRole[] {
  const list = input.roles ?? (input.role ? [input.role] : fallback);
  return USER_ROLES.filter((r) => list.includes(r));
}

/** The one role older readers expect: a module head when the user holds that role, otherwise an approver. */
export function primaryRole(roles: readonly string[]): UserRole {
  return roles.includes('module_head') ? 'module_head' : 'approver';
}

const profileFields = {
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().min(1).max(30).nullable().optional(),
  designation: z.string().trim().min(1).max(200).nullable().optional(),
  role: z.enum(USER_ROLES),
  roles: z
    .array(z.enum(USER_ROLES))
    .min(1)
    .max(USER_ROLES.length)
    .refine(unique, 'roles must not repeat'),
  modules: z
    .array(z.enum(USER_MODULES))
    .max(USER_MODULES.length)
    .refine(unique, 'modules must not repeat'),
  scopeType: z.enum(USER_SCOPE_TYPES),
  scopeIds: z.array(z.uuid()).max(200).refine(unique, 'scopeIds must not repeat'),
};

/**
 * POST /users. The server sets the status (active) and a temporary password, which is returned once. Role, modules
 * and scope default to an approver with company scope.
 */
export const userCreateBody = z
  .object({
    loginId: loginIdSchema,
    ...profileFields,
    role: profileFields.role.optional(),
    roles: profileFields.roles.optional(),
    modules: profileFields.modules.default([]),
    scopeType: profileFields.scopeType.default('company'),
    scopeIds: profileFields.scopeIds.default([]),
  })
  .strict();

/** PATCH /users/:id. The login id cannot change, so it is refused like any unknown key. */
export const userPatchBody = z
  .object({
    name: profileFields.name.optional(),
    email: profileFields.email,
    phone: profileFields.phone,
    designation: profileFields.designation,
    role: profileFields.role.optional(),
    roles: profileFields.roles.optional(),
    modules: profileFields.modules.optional(),
    scopeType: profileFields.scopeType.optional(),
    scopeIds: profileFields.scopeIds.optional(),
    rowVersion: z.number().int().min(1),
  })
  .strict();

export type GrantInput = z.infer<typeof grantBodySchema>;
export type UserListQuery = z.infer<typeof userListQuery>;
export type UserCreateInput = z.infer<typeof userCreateBody>;
export type UserPatchInput = z.infer<typeof userPatchBody>;
