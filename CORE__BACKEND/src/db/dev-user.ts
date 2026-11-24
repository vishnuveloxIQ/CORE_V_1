import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../core/errors.js';
import { hashSecret, assertPasswordPolicy } from '../core/password.js';
import { parseInput } from '../core/validation.js';
import { grantPrivilegeByLogin } from '../modules/access/bootstrap.js';
import { findUserIdByLogin } from '../modules/access/repo.js';
import { isValidTenantId } from './migrate.js';
import { withTenant } from './tenant.js';

export interface DevUserInput {
  tenantId: string;
  loginId: string;
  name: string;
  password: string;
  /** Optional privilege to grant at once, such as access.manage. */
  privilege?: string;
}

const nameSchema = z.string().trim().min(1).max(200);
const loginIdSchema = z.string().trim().min(1).max(254);

/**
 * Creates an active user in tenant_<tenantId> for local testing, and optionally grants one privilege.
 * It is a development helper: it refuses to run when NODE_ENV is production. The password is never returned or logged.
 */
export async function createDevUser(pool: Pool, input: DevUserInput): Promise<{ userId: string }> {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('FORBIDDEN', 403, 'Dev user creation is not available in production');
  }
  if (!isValidTenantId(input.tenantId)) {
    throw new AppError('VALIDATION_ERROR', 400, 'The tenant id is not valid');
  }
  const loginId = parseInput(loginIdSchema, input.loginId);
  const name = parseInput(nameSchema, input.name);
  assertPasswordPolicy(input.password, loginId);
  const hash = await hashSecret(input.password);

  const userId = await withTenant(pool, input.tenantId, async (client) => {
    if (await findUserIdByLogin(client, loginId)) {
      throw new AppError('CONFLICT', 409, 'A user with this login id already exists');
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO core_user (login_id, name, status, password_hash, failed_count)
       VALUES ($1, $2, 'active', $3, 0)
       RETURNING id`,
      [loginId, name, hash],
    );
    return rows[0]!.id;
  });

  if (input.privilege) {
    await grantPrivilegeByLogin(pool, {
      tenantId: input.tenantId,
      loginId,
      privilege: input.privilege,
    });
  }
  return { userId };
}
