// Development only. Creates the first administrator (holder of access.manage) for every company that has none, using the
// same steps as company registration: the user row, the company profile, then the access.manage grant. Companies that
// already have an administrator are left alone. The login ID is <PREFIX>1234.
//
// Usage: DEV_ADMIN_PASSWORD=... node --env-file-if-exists=.env --import tsx scripts/bootstrap-dev-admins.ts
// DATABASE_URL is the application role (the same one registration uses). The password is never printed.
import pg from 'pg';
import { hashSecret } from '../src/core/password.js';
import { withTenant } from '../src/db/tenant.js';
import { grantPrivilegeByLogin } from '../src/modules/access/bootstrap.js';

const password = process.env.DEV_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
if (!password || !databaseUrl) {
  console.error('Usage: DEV_ADMIN_PASSWORD=... DATABASE_URL=... node --import tsx scripts/bootstrap-dev-admins.ts');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const companies = (
    await pool.query<{ tenant_id: string; login_prefix: string; company_name: string }>(
      'SELECT tenant_id, login_prefix, company_name FROM core_tenant_directory ORDER BY login_prefix',
    )
  ).rows;
  // one row per tenant (VELOX and ACME share acme)
  const seen = new Set<string>();
  const hash = await hashSecret(password);
  for (const c of companies) {
    if (seen.has(c.tenant_id)) continue;
    seen.add(c.tenant_id);
    const loginId = `${c.login_prefix}1234`;
    const hasAdmin = await withTenant(pool, c.tenant_id, async (client) => {
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM core_user_access WHERE privilege = 'access.manage' AND access_type = 'privilege'`,
      );
      return (rows[0]?.n ?? 0) > 0;
    });
    if (hasAdmin) {
      console.log(`${c.tenant_id}: already has an administrator, left alone`);
      continue;
    }
    await withTenant(pool, c.tenant_id, async (client) => {
      const exists = await client.query('SELECT 1 FROM core_user WHERE login_id = $1', [loginId]);
      if (exists.rowCount) return;
      await client.query('INSERT INTO core_company_profile (legal_name, trade_name) SELECT $1, $1 WHERE NOT EXISTS (SELECT 1 FROM core_company_profile)', [c.company_name]);
      await client.query(
        `INSERT INTO core_user (login_id, name, status, password_hash, failed_count) VALUES ($1, $2, 'active', $3, 0)`,
        [loginId, `${c.company_name} administrator`, hash],
      );
    });
    await grantPrivilegeByLogin(pool, { tenantId: c.tenant_id, loginId, privilege: 'access.manage' });
    console.log(`${c.tenant_id}: administrator created: ${loginId}`);
  }
} finally {
  await pool.end();
}
