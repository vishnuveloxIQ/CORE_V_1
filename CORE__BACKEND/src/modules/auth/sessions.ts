import type { Pool } from 'pg';
import { AppError } from '../../core/errors.js';
import { many } from '../../core/rows.js';
import { withTenant } from '../../db/tenant.js';
import * as repo from './repo.js';

/** One device session of the signed-in user, as the API shows it. */
export interface SessionView {
  id: string;
  deviceLabel: string | null;
  issuedAt: string;
  expiresAt: string;
  /** true for the session the request is using, so the screen can say "this device". */
  current: boolean;
}

interface SessionRowDb {
  id: string;
  device_label: string | null;
  issued_at: Date;
  expires_at: Date;
}

/** The user's live sessions: not revoked and not expired. Newest first. */
export async function listSessions(
  deps: { pool: Pool },
  input: { tenantId: string; userId: string; currentSessionId: string },
): Promise<SessionView[]> {
  const now = new Date();
  return withTenant(deps.pool, input.tenantId, async (client) => {
    const rows = await many<SessionRowDb>(
      client,
      `SELECT id, device_label, issued_at, expires_at
       FROM core_user_session
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
       ORDER BY issued_at DESC`,
      [input.userId, now],
    );
    return rows.map((row) => ({
      id: row.id,
      deviceLabel: row.device_label,
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      current: row.id === input.currentSessionId,
    }));
  });
}

/**
 * Revokes one of the user's own sessions. A session that is not theirs, or is already revoked, answers 404, so one
 * user cannot learn about another user's sessions. Revoking the current session signs this device out.
 */
export async function revokeSession(
  deps: { pool: Pool },
  input: { tenantId: string; userId: string; sessionId: string },
): Promise<void> {
  await withTenant(deps.pool, input.tenantId, async (client) => {
    const revoked = await repo.revokeSession(client, input.sessionId, input.userId);
    if (!revoked) {
      throw new AppError('SESSION_NOT_FOUND', 404, 'Session not found');
    }
    await repo.recordAuthEvent(client, input.userId, 'session_revoked');
  });
}
