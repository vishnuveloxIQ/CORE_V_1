/**
 * The company (tenant) each login ID prefix belongs to. The login ID's letters before its digits pick the company:
 * ACME9999 signs in to acme. Add a line when a new company is set up. A prefix not listed here cannot sign in.
 */
export const TENANT_BY_LOGIN_PREFIX: Record<string, string> = {
  ACME: 'acme',
  VELOX: 'acme',
  BETA: 'beta',
  GAMMA: 'gamma',
  DELTA: 'delta',
  EPSILON: 'epsilon',
}

/**
 * The prefix every new login ID in a company starts with: the prefix, then 4 digits (owner decision, 2026-11-22).
 * acme also accepts ACME at sign-in, but its users are created as VELOX, as the existing ones are.
 */
export const LOGIN_PREFIX_BY_TENANT: Record<string, string> = {
  acme: 'VELOX',
  beta: 'BETA',
  gamma: 'GAMMA',
  delta: 'DELTA',
  epsilon: 'EPSILON',
}

/** The fixed login ID prefix of a company, or undefined when none is set for it. */
export const loginPrefixFor = (tenant: string | null | undefined): string | undefined => (tenant ? LOGIN_PREFIX_BY_TENANT[tenant] : undefined)

/** True when a login ID is the company prefix followed by exactly 4 digits. */
export const matchesCompanyPrefix = (loginId: string, prefix: string) => {
  const id = loginId.trim().toUpperCase()
  return id.startsWith(prefix) && /^\d{4}$/.test(id.slice(prefix.length))
}

/**
 * Login IDs typed in a form: just the 4 digits are completed with the company prefix (DELTA + 24 = DELTA0024);
 * anything else is upper-cased and checked as typed.
 */
export const withCompanyPrefix = (typed: string, prefix: string | undefined) => {
  const t = typed.trim().toUpperCase()
  return prefix && /^\d{1,4}$/.test(t) ? `${prefix}${t.padStart(4, '0')}` : t
}

/** The tenant for a login ID, or undefined when its prefix is not listed. */
export function tenantForLogin(loginId: string): string | undefined {
  const prefix = loginId.trim().match(/^([A-Za-z]+)\d+$/)?.[1]?.toUpperCase()
  return prefix ? TENANT_BY_LOGIN_PREFIX[prefix] : undefined
}
