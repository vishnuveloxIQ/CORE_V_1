import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { parseInput } from '../../core/validation.js';
import { isValidTenantId } from '../../db/migrate.js';
import { withTenant } from '../../db/tenant.js';
import { findUserIdByLogin } from './repo.js';
import { grantBodySchema } from './schema.js';
import { grantAccess } from './service.js';

export interface BootstrapGrantInput {
  tenantId: string;
  loginId: string;
  privilege: string;
}

/**
 * Grants a privilege to a user from the command line, for the first access.manage holder (Phase 4d, point i).
 * It calls the same service function as the admin endpoint, so it writes the same audit row, with no actor.
 */
export async function grantPrivilegeByLogin(
  pool: Pool,
  input: BootstrapGrantInput,
): Promise<{ grantId: string; userId: string }> {
  if (!isValidTenantId(input.tenantId)) {
    throw new AppError('VALIDATION_ERROR', 400, 'The tenant id is not valid');
  }
  const body = parseInput(grantBodySchema, {
    accessType: 'privilege',
    privilege: input.privilege,
    reason: 'Bootstrap grant from the command line',
  });
  const loginId = parseInput(z.string().trim().min(1).max(254), input.loginId);

  return withTenant(pool, input.tenantId, async (client) => {
    const userId = await findUserIdByLogin(client, loginId);
    if (!userId) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found');
    }
    const grant = await grantAccess(client, { actorId: null, correlationId: null }, userId, body);
    return { grantId: grant.id, userId };
  });
}
