import type { CoreRequest } from '../http/app.js';
import type { Pool } from 'pg';
import { AppError } from '../core/errors.js';
import { withTenant } from '../db/tenant.js';
import { type AccessScopeInput, scopeFrom } from '../modules/access/policy.js';
import { isSuspended } from '../modules/access/repo.js';
import { userMayAct } from '../modules/access/service.js';
import { findSessionForToken, recordAuthEvent } from '../modules/auth/repo.js';
import {
  invalidAccessToken,
  verifyAccessToken,
} from '../modules/auth/tokens.js';

/** Three base64url parts separated by dots. Anything else is rejected before the token is checked. */
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export interface AuthGuardOptions {
  pool: Pool;
  signingKey: Uint8Array;
}

/**
 * Builds the preHandler for protected routes. It verifies the bearer token and then reads the session,
 * so a logged-out session stops working at once instead of at token expiry.
 *
 * A user who must change a temporary password is refused with 403 PASSWORD_CHANGE_REQUIRED, except on the routes
 * built with allowPasswordChangePending (change password, read the signed-in user and its access, sign out).
 */
export function createRequireAuth(
  options: AuthGuardOptions,
  guard: { allowPasswordChangePending?: boolean } = {},
) {
  return async function requireAuth(request: CoreRequest): Promise<void> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    if (!token) {
      throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
    }

    const claims = await verifyAccessToken(options.signingKey, token);
    const { session, suspended } = await withTenant(
      options.pool,
      claims.tenantId,
      async (client) => ({
        session: await findSessionForToken(client, claims.sessionId, claims.userId),
        suspended: await isSuspended(client, claims.userId),
      }),
    );
    const live =
      session !== null &&
      session.revoked_at === null &&
      session.status === 'active' &&
      session.expires_at !== null &&
      session.expires_at.getTime() > Date.now();
    if (!live) {
      throw invalidAccessToken();
    }
    // A suspension denies protected routes from the next request. It does not revoke the session (Phase 4d, point e).
    if (suspended) {
      throw new AppError('ACCESS_SUSPENDED', 403, 'This account is suspended');
    }
    if (session?.must_change_password === true && guard.allowPasswordChangePending !== true) {
      throw new AppError(
        'PASSWORD_CHANGE_REQUIRED',
        403,
        'Change your temporary password before you continue',
      );
    }
    request.auth = claims;
  };
}

/**
 * Builds the preHandler that needs a privilege. It runs after requireAuth and reads the live grants on
 * every request. The scope comes from the route; without scopeOf the route asks for the company as a whole.
 * Failure is 403 ACCESS_DENIED, which does not name the privilege.
 */
export function requireAccess(
  options: AuthGuardOptions,
  privilege: string,
  scopeOf?: (request: CoreRequest) => AccessScopeInput,
) {
  return async function requireGrant(request: CoreRequest): Promise<void> {
    const claims = request.auth;
    if (!claims) {
      throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
    }
    const requested = scopeFrom(scopeOf ? scopeOf(request) : {});
    const allowed = await withTenant(options.pool, claims.tenantId, (client) =>
      userMayAct(client, claims.userId, privilege, requested),
    );
    if (!allowed) {
      // access history: who was refused what. The route pattern is recorded, never the request body or ids.
      // A failure to record must not change the answer, so it is swallowed.
      await withTenant(options.pool, claims.tenantId, (client) =>
        recordAuthEvent(client, claims.userId, 'access_denied', `${request.method} ${request.routeOptions.url ?? ''}`),
      ).catch(() => undefined);
      throw new AppError('ACCESS_DENIED', 403, 'You do not have access to this action');
    }
  };
}
