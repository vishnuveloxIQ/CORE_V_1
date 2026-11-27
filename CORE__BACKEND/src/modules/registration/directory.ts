import type { Pool } from 'pg';

/**
 * The company directory (migration 0043): which company a login-ID prefix belongs to. Sign-in uses it to find the
 * company from the login ID alone, so every company that registers can sign in without a code change.
 */

/** The letters of a login ID before its digits, upper-cased: ACME1234 gives ACME. Null when the shape is wrong. */
export function loginPrefixOf(loginId: string): string | null {
  const match = loginId.trim().match(/^([A-Za-z]+)\d+$/);
  return match ? match[1]!.toUpperCase() : null;
}

/** The tenant id for a login ID's prefix, or null when no company uses that prefix. Read through the app login. */
export async function resolveTenantForLogin(pool: Pool, loginId: string): Promise<string | null> {
  const prefix = loginPrefixOf(loginId);
  if (!prefix) return null;
  const { rows } = await pool.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM core_tenant_directory WHERE login_prefix = $1',
    [prefix],
  );
  return rows[0]?.tenant_id ?? null;
}
