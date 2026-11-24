import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import { many, one, snapshotOf } from '../../core/rows.js';
import { type Actor, auditWrite, notFound, updateRecord } from '../../core/resource.js';
import { policyRuleSpec, policyVersionSpec, ruleVersionPublished } from './resources.js';

/** Publishes a version: sets published_at under the row-version guard. Publishing twice is refused by the spec. */
export async function publishVersion(
  client: PoolClient,
  actor: Actor,
  versionId: string,
  rowVersion: number,
): Promise<Record<string, unknown>> {
  return updateRecord(client, policyVersionSpec, actor, versionId, rowVersion, {
    publishedAt: new Date(),
  });
}

export interface Acknowledgement {
  readonly ruleId: string;
  readonly userId: string;
  readonly ackedAt: string;
}

/**
 * Records that the signed-in user has read a rule. The rule's version must be published. Repeating the call is
 * harmless: the second call returns the first acknowledgement and writes no new row (design point e).
 */
export async function acknowledgeRule(
  client: PoolClient,
  actor: Actor,
  ruleId: string,
): Promise<{ created: boolean; ack: Acknowledgement }> {
  if (actor.actorId === null) {
    throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
  }
  const userId = actor.actorId;
  const published = await ruleVersionPublished(client, ruleId);
  if (published === null) throw notFound(policyRuleSpec);
  if (!published) {
    throw new AppError(
      'POLICY_VERSION_NOT_PUBLISHED',
      409,
      'The rule belongs to a version that is not published',
    );
  }

  const inserted = await one<{ id: string }>(
    client,
    `INSERT INTO core_policy_rule_ack (rule_id, user_id, acked_at, created_by, updated_by)
     VALUES ($1, $2, now(), $2, $2)
     ON CONFLICT (rule_id, user_id) DO NOTHING
     RETURNING id`,
    [ruleId, userId],
  );
  if (inserted) {
    await auditWrite(
      client,
      actor,
      'core_policy_rule_ack',
      inserted.id,
      'INSERT',
      null,
      await snapshotOf(client, 'core_policy_rule_ack', inserted.id),
    );
  }
  const ack = await one<{ ruleId: string; userId: string; ackedAt: string }>(
    client,
    `SELECT rule_id AS "ruleId", user_id AS "userId",
            to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "ackedAt"
       FROM core_policy_rule_ack WHERE rule_id = $1 AND user_id = $2`,
    [ruleId, userId],
  );
  if (!ack) throw notFound(policyRuleSpec);
  return { created: inserted !== null, ack };
}

/**
 * The signed-in user's own acknowledgements, so a client can show which rules are already read. Newest first.
 * Other users' acknowledgements are not returned.
 */
export async function listMyAcknowledgements(
  client: PoolClient,
  actor: Actor,
): Promise<{ ruleId: string; ackedAt: string }[]> {
  if (actor.actorId === null) {
    throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');
  }
  return many<{ ruleId: string; ackedAt: string }>(
    client,
    `SELECT rule_id AS "ruleId",
            to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "ackedAt"
       FROM core_policy_rule_ack
      WHERE user_id = $1
      ORDER BY acked_at DESC`,
    [actor.actorId],
  );
}
