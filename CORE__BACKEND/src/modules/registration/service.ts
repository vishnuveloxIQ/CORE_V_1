import { createHash, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertPasswordPolicy, hashSecret } from '../../core/password.js';
import { AppError } from '../../core/errors.js';
import { grantPrivilegeByLogin } from '../access/bootstrap.js';
import { provisionTenant } from '../../db/migrate.js';
import { tenantExists, withTenant } from '../../db/tenant.js';
import { loginPrefixOf } from './directory.js';
import type { RegisterInput, RegistrationOtpInput } from './schema.js';

/** How long a code stays valid, and how many wrong tries one code allows. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** At most this many codes to one address or number in the window below. */
export const OTP_MAX_PER_TARGET = 5;
export const OTP_WINDOW_MINUTES = 15;

/** The code is stored as a hash of channel, target and code, so a stored row cannot be read back as a code. */
function codeHash(channel: string, target: string, code: string): string {
  return createHash('sha256').update(`${channel}:${target}:${code}`).digest('hex');
}

function normalTarget(channel: 'email' | 'mobile', target: string): string {
  return channel === 'email' ? target.trim().toLowerCase() : target.replace(/[\s-]/g, '');
}

/** Masks the target for the log line: a@example.com becomes a***@example.com. */
function maskTarget(channel: 'email' | 'mobile', target: string): string {
  if (channel === 'email') return target.replace(/^(.).*(@.*)$/, '$1***$2');
  return `***${target.slice(-3)}`;
}

export interface RegistrationLog {
  info(fields: object, message: string): void;
}

/**
 * Issues a one-time code to an email address or mobile number.
 * Delivery: there is no email or SMS provider yet (decision D10), so in development the code is written to the server
 * log. In production nothing is sent and registration is refused until a provider is added.
 */
export async function issueRegistrationOtp(
  pool: Pool,
  log: RegistrationLog,
  environment: string,
  input: RegistrationOtpInput,
): Promise<{ expiresAt: string; developmentCode?: string }> {
  if (environment === 'production') {
    throw new AppError('REGISTRATION_UNAVAILABLE', 503, 'Registration is not available yet: codes cannot be sent.');
  }
  const target = normalTarget(input.channel, input.target);
  const recent = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM core_registration_otp
     WHERE channel = $1 AND target = $2 AND created_at > now() - make_interval(mins => $3)`,
    [input.channel, target, OTP_WINDOW_MINUTES],
  );
  if ((recent.rows[0]?.n ?? 0) >= OTP_MAX_PER_TARGET) {
    throw new AppError('RATE_LIMITED', 429, 'Too many codes were requested. Wait a few minutes and try again.');
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { rows } = await pool.query<{ expires_at: Date }>(
    `INSERT INTO core_registration_otp (channel, target, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     RETURNING expires_at`,
    [input.channel, target, codeHash(input.channel, target, code), OTP_TTL_MINUTES],
  );
  // Development only: the code is returned so the registration page can show it. Production is refused above.
  log.info({ channel: input.channel, target: maskTarget(input.channel, target) }, 'registration code issued (development: no provider)');
  return { expiresAt: rows[0]!.expires_at.toISOString(), developmentCode: code };
}

/** Checks a code inside a transaction. A right code is used up; each wrong try counts against the code. */
async function takeCode(client: PoolClient, channel: 'email' | 'mobile', target: string, code: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM core_registration_otp
     WHERE channel = $1 AND target = $2 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [channel, target],
  );
  const row = rows[0];
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  if (row.code_hash === codeHash(channel, target, code)) {
    await client.query('UPDATE core_registration_otp SET consumed_at = now(), attempts = attempts + 1 WHERE id = $1', [row.id]);
    return true;
  }
  await client.query('UPDATE core_registration_otp SET attempts = attempts + 1 WHERE id = $1', [row.id]);
  return false;
}

/**
 * Checks a one-time code sent to a mobile number or email address, outside registration (for example before a company
 * profile saves a changed mobile number). A right code is used up, as at registration.
 */
export async function checkOneTimeCode(pool: Pool, channel: 'email' | 'mobile', target: string, code: string): Promise<boolean> {
  return withTransaction(pool, (client) => takeCode(client, channel, target, code));
}

export interface RegisterResult {
  tenantId: string;
  loginId: string;
}

/**
 * Creates a company: its own schema, its first administrator (who holds access.manage), and its directory entry, so the
 * administrator can sign in with the login ID. Both codes must be right. If a step fails after the schema exists, the
 * schema and the directory entry are removed again.
 */
export async function registerCompany(pool: Pool, provisionPool: Pool | undefined, input: RegisterInput): Promise<RegisterResult> {
  if (!provisionPool) {
    throw new AppError('REGISTRATION_UNAVAILABLE', 503, 'Registration is not set up on this server yet.');
  }
  const loginId = input.loginId.toUpperCase();
  const prefix = loginPrefixOf(loginId);
  if (!prefix) throw new AppError('VALIDATION_ERROR', 400, 'Use 3 to 6 letters and 4 digits, for example ACME1234.');
  assertPasswordPolicy(input.password, loginId);
  const tenantId = prefix.toLowerCase();

  const taken = await pool.query('SELECT 1 FROM core_tenant_directory WHERE login_prefix = $1 OR tenant_id = $2', [prefix, tenantId]);
  if ((taken.rowCount ?? 0) > 0 || (await tenantExists(pool, tenantId))) {
    throw new AppError('CONFLICT', 409, 'That login prefix is already used by another company. Choose another login ID.');
  }

  // Both codes must be right. They are used up here, so a second try needs new codes.
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile.replace(/[\s-]/g, '');
  // the admin and the owner store the ten-digit number, as the company profile does
  const nationalMobile = mobile.replace(/^\+91/, '');
  const codesOk = await withTransaction(pool, async (client) => {
    const emailOk = await takeCode(client, 'email', email, input.emailCode);
    const mobileOk = await takeCode(client, 'mobile', mobile, input.mobileCode);
    return emailOk && mobileOk;
  });
  if (!codesOk) {
    throw new AppError('REGISTRATION_CODE_INVALID', 400, 'The email or mobile code is wrong or has expired. Request new codes.');
  }

  // Reserve the prefix first, so two registrations for the same prefix cannot both get through.
  try {
    await pool.query('INSERT INTO core_tenant_directory (login_prefix, tenant_id, company_name) VALUES ($1, $2, $3)', [prefix, tenantId, input.company]);
  } catch {
    throw new AppError('CONFLICT', 409, 'That login prefix is already used by another company. Choose another login ID.');
  }

  let schemaCreated = false;
  try {
    await provisionTenant(provisionPool, tenantId);
    schemaCreated = true;
    await grantApplicationAccess(provisionPool, tenantId);
    const hash = await hashSecret(input.password);
    await withTenant(pool, tenantId, async (client) => {
      // the email and mobile the company registered with are its primary contact, so the profile starts with them
      await client.query(
        'INSERT INTO core_company_profile (legal_name, trade_name, contact_email, contact_phone) VALUES ($1, $1, $2, $3)',
        [input.company, email, nationalMobile],
      );
      await client.query(
        `INSERT INTO core_user (login_id, name, email, phone, status, password_hash, failed_count)
         VALUES ($1, $2, $3, $4, 'active', $5, 0)`,
        [loginId, `${input.company} administrator`, email, nationalMobile, hash],
      );
    });
    await grantPrivilegeByLogin(pool, { tenantId, loginId, privilege: 'access.manage' });
    return { tenantId, loginId };
  } catch (err) {
    // Undo what this run created: the schema (only if this run made it) and the directory entry.
    if (schemaCreated) {
      await provisionPool.query(`DROP SCHEMA IF EXISTS "tenant_${tenantId}" CASCADE`).catch(() => undefined);
    }
    await pool.query('DELETE FROM core_tenant_directory WHERE login_prefix = $1', [prefix]).catch(() => undefined);
    throw err;
  }
}

/**
 * Gives the application role (core_app, which core_app_login belongs to) the same access to a new company schema as the
 * admin script gives the existing ones: read and write rows, no change to schema, and no change to the audit history or
 * the migration ledger. Run with the provisioning login, which owns the schema.
 */
async function grantApplicationAccess(provisionPool: Pool, tenantId: string): Promise<void> {
  const role = await provisionPool.query("SELECT 1 FROM pg_roles WHERE rolname = 'core_app'");
  if ((role.rowCount ?? 0) === 0) {
    throw new AppError('REGISTRATION_UNAVAILABLE', 503, 'The application role is not set up on this server.');
  }
  const schema = `"tenant_${tenantId}"`;
  await provisionPool.query(`GRANT USAGE ON SCHEMA ${schema} TO core_app`);
  await provisionPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO core_app`);
  await provisionPool.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${schema}.audit_row_change FROM core_app`);
  await provisionPool.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ${schema}.core_migration FROM core_app`);
}

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
