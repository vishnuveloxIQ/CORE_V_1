/** Where a privilege applies: a project and a store. A null dimension is not constrained by that dimension. */
export interface AccessScope {
  projectId: string | null;
  storeId: string | null;
}

/** A privilege held through one live grant, with the scope that grant covers. */
export interface HeldPrivilege {
  privilege: string;
  source: 'role' | 'privilege';
  grantId: string;
  scope: AccessScope;
}

/** The scope a route or caller names. Any dimension left out means "not given". */
export interface AccessScopeInput {
  projectId?: string | undefined;
  storeId?: string | undefined;
}

/** Fills missing dimensions with null. A route that names no scope asks for the company as a whole. */
export function scopeFrom(input: AccessScopeInput): AccessScope {
  return {
    projectId: input.projectId ?? null,
    storeId: input.storeId ?? null,
  };
}

/**
 * A grant constrains each dimension it sets: the request must carry the same value. A dimension the grant
 * leaves null matches any value, so a company-wide grant covers every scope. A request that does not
 * carry a dimension the grant sets does not match.
 */
export function scopeMatches(grant: AccessScope, requested: AccessScope): boolean {
  return (
    (grant.projectId === null || grant.projectId === requested.projectId) &&
    (grant.storeId === null || grant.storeId === requested.storeId)
  );
}

/** True when some held privilege has this name and its scope covers the requested scope. */
export function holdsPrivilege(
  held: readonly HeldPrivilege[],
  privilege: string,
  requested: AccessScope,
): boolean {
  return held.some(
    (entry) => entry.privilege === privilege && scopeMatches(entry.scope, requested),
  );
}
