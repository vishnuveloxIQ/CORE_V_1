import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { enqueueOutbound } from '../../core/events.js';
import { AppError } from '../../core/errors.js';
import { insertRow, many, one, snapshotOf } from '../../core/rows.js';
import { lockWithinSchema } from '../../db/tenant.js';
import {
  type Actor,
  auditWrite,
  createRecord,
  findRecord,
  invalid,
  isSet,
  notFound,
  type Row,
  updateRecord,
  versionConflict,
} from '../../core/resource.js';
import { isSuspended } from '../access/repo.js';
import { allocateNumber } from '../organisation/numbering.js';
import {
  approvedAmountIssue,
  isApproverOf,
  type LevelSnapshot,
  matchingLevels,
  nextLevel,
} from './rules.js';
import { matrixVersionSpec, requestSpec } from './resources.js';
import type { actionBody, raiseBody } from './schema.js';

type RaiseInput = z.infer<typeof raiseBody>;
type ActionInput = z.infer<typeof actionBody>;

/** A chain for the request: the project chain when one exists for the project, otherwise the company chain. */
async function chainFor(
  client: PoolClient,
  requestType: string,
  projectId: string | null | undefined,
): Promise<string> {
  if (projectId) {
    const project = await one<{ id: string }>(
      client,
      `SELECT id FROM core_approval_chain
        WHERE request_type = $1 AND project_id = $2 AND is_active`,
      [requestType, projectId],
    );
    if (project) return project.id;
  }
  const company = await one<{ id: string }>(
    client,
    `SELECT id FROM core_approval_chain
      WHERE request_type = $1 AND scope_type = 'company' AND is_active`,
    [requestType],
  );
  if (!company) {
    throw new AppError('APPROVAL_CHAIN_MISSING', 409, 'No approval chain covers this request');
  }
  return company.id;
}

/** The latest published version whose effective date is on or before today (design point d). */
async function publishedVersionFor(
  client: PoolClient,
  chainId: string,
): Promise<{ id: string; versionNo: number; effectiveFrom: string }> {
  const version = await one<{ id: string; versionNo: number; effectiveFrom: string }>(
    client,
    `SELECT id, version_no AS "versionNo", to_char(effective_from, 'YYYY-MM-DD') AS "effectiveFrom"
       FROM core_matrix_version
      WHERE chain_id = $1 AND published_at IS NOT NULL AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC, version_no DESC
      LIMIT 1`,
    [chainId],
  );
  if (!version) {
    throw new AppError(
      'APPROVAL_CHAIN_MISSING',
      409,
      'No published matrix version covers this request',
    );
  }
  return version;
}

async function levelsOf(client: PoolClient, versionId: string): Promise<LevelSnapshot[]> {
  return many<LevelSnapshot>(
    client,
    `SELECT level_no AS "levelNo",
            CAST(amount_from AS double precision) AS "amountFrom",
            CAST(amount_to AS double precision) AS "amountTo",
            approver_role_id AS "approverRoleId",
            approver_user_id AS "approverUserId",
            escalate_to_user_id AS "escalateToUserId",
            timeout_hours AS "timeoutHours",
            on_timeout AS "onTimeout",
            CAST(cash_limit_inr AS double precision) AS "cashLimitInr"
       FROM core_matrix_level
      WHERE matrix_version_id = $1
      ORDER BY level_no`,
    [versionId],
  );
}

/**
 * Raises a request (design point d). Picks the chain and the published version, takes the levels that match the
 * amount as a snapshot, numbers the request from the APR series, and starts it at the lowest matching level.
 */
export async function raiseRequest(
  client: PoolClient,
  actor: Actor,
  input: RaiseInput,
): Promise<{ request: Row; created: boolean }> {
  if (actor.actorId === null) throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');

  // One request per source record (CORE-21-07). The lock makes a concurrent raise for the same record wait for the
  // first one, which then finds it; the unique index (migration 0032) is the backstop.
  if (input.sourceRecordId) {
    await lockWithinSchema(client, `approval-source:${input.module}:${input.sourceRecordId}`);
    const existing = await one<{ id: string }>(
      client,
      'SELECT id FROM core_approval_request WHERE module = $1 AND source_record_id = $2',
      [input.module, input.sourceRecordId],
    );
    if (existing) {
      const request = await findRecord(client, requestSpec, existing.id);
      if (request) return { request, created: false };
    }
  }

  const chainId = await chainFor(client, input.requestType, input.projectId);
  const version = await publishedVersionFor(client, chainId);
  const levels = await levelsOf(client, version.id);
  const matched = matchingLevels(levels, input.amount);
  const first = matched[0];
  if (!first) {
    throw new AppError('APPROVAL_NO_MATCHING_LEVEL', 409, 'No approval level covers this amount');
  }

  const code = await allocateNumber(client, 'APR', new Date().getUTCFullYear(), actor);
  // the raiser's name is kept on the request, so a list can show who raised it without reading the user
  const raiser = await one<{ name: string | null }>(client, 'SELECT name FROM core_user WHERE id = $1', [actor.actorId]);
  const request = await createRecord(client, requestSpec, actor, {
    code,
    requestType: input.requestType,
    module: input.module,
    title: input.title,
    amount: input.amount,
    status: 'pending',
    emergency: input.emergency ?? false,
    neededBy: input.neededBy ?? null,
    chainageMarkerId: input.chainageMarkerId ?? null,
    raisedById: actor.actorId,
    raisedByName: raiser?.name ?? null,
    chainId,
    matrixVersionId: version.id,
    matrixVersion: version.versionNo,
    configVersionLabel: `v${version.versionNo}`,
    configEffectiveFrom: version.effectiveFrom,
    raisedAt: new Date(),
    levelsSnapshot: matched,
    payloadJson: input.payload ?? {},
    currentLevel: first.levelNo,
    assignedActorId: first.approverUserId ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
  });
  await emitRequestEvent(client, actor, 'approval_request.raised', request);
  return { request, created: true };
}

/**
 * CORE-23-05: every raise and decision writes an outbound event in the same transaction (transactional outbox), so an
 * event exists exactly when the change committed. The payload carries identifiers and states only: no comments,
 * decision text or request payload, which stay in Core.
 */
async function emitRequestEvent(
  client: PoolClient,
  actor: Actor,
  eventType: string,
  request: Row,
  action?: { action: string; levelNo: number },
): Promise<void> {
  await enqueueOutbound(client, {
    eventId: randomUUID(),
    eventType,
    eventVersion: '1',
    aggregateType: 'approval_request',
    aggregateId: String(request['id']),
    occurredAt: new Date().toISOString(),
    correlationId: actor.correlationId,
    actorId: actor.actorId,
    payload: {
      requestId: request['id'],
      code: request['code'],
      requestType: request['requestType'],
      module: request['module'],
      status: request['status'],
      currentLevel: request['currentLevel'],
      ...(action ? { action: action.action, actedAtLevel: action.levelNo } : {}),
    },
    schemaVersion: '1',
    sourceModule: 'core',
  });
}

/** The role ids the user holds: active role grants only. */
async function heldRoleIds(client: PoolClient, userId: string): Promise<string[]> {
  const rows = await many<{ role_id: string }>(
    client,
    `SELECT role_id FROM core_user_access
      WHERE user_id = $1 AND access_type = 'role' AND restored_at IS NULL AND role_id IS NOT NULL`,
    [userId],
  );
  return rows.map((row) => row.role_id);
}

/** Actions taken by the person who raised the request. Every other action is an approver's. */
const RAISER_ACTIONS: ReadonlySet<string> = new Set(['cancel', 'respond']);
const CLARIFICATION = 'clarification_requested';

/** The status a request must have for each action. */
function checkStatusFor(action: ActionInput['action'], status: unknown): void {
  if (action === 'respond') {
    if (status !== CLARIFICATION) {
      throw new AppError(
        'APPROVAL_NOT_AWAITING_CLARIFICATION',
        409,
        'The request is not waiting for a clarification',
      );
    }
    return;
  }
  const allowed =
    action === 'cancel' ? status === 'pending' || status === CLARIFICATION : status === 'pending';
  if (!allowed) {
    throw new AppError('APPROVAL_NOT_PENDING', 409, 'The request is no longer pending');
  }
}

/** A clarification question and its answer need a comment; a decision belongs to an approver's action. */
function checkActionFields(input: ActionInput): void {
  if ((input.action === 'clarify' || input.action === 'respond') && !input.comment) {
    throw invalid({ path: 'comment', message: `a comment is required to ${input.action}` });
  }
  if (RAISER_ACTIONS.has(input.action) && isSet(input.decision)) {
    throw invalid({ path: 'decision', message: 'a decision is recorded by an approver only' });
  }
}

/**
 * Acts on a request (design point e). Approve moves to the next matching level or completes the request.
 * Reject and return end it with that status. Clarify (an approver) asks the raiser a question: the request waits at the
 * same level as clarification_requested and is assigned to the raiser. Respond (the raiser) answers it and returns the
 * request to pending at that level, assigned to the level's approver again. Cancel is for the raiser alone, while the
 * request is pending or waiting for a clarification. Each action is appended and audited.
 */
export async function actOnRequest(
  client: PoolClient,
  actor: Actor,
  requestId: string,
  input: ActionInput,
): Promise<Row> {
  const userId = actor.actorId;
  if (userId === null) throw new AppError('AUTH_REQUIRED', 401, 'Authentication required');

  const existing = await findRecord(client, requestSpec, requestId, true);
  if (!existing) throw notFound(requestSpec);
  if (existing['rowVersion'] !== input.rowVersion) throw versionConflict();
  checkStatusFor(input.action, existing['status']);
  checkActionFields(input);

  const snapshot = existing['levelsSnapshot'] as LevelSnapshot[];
  const currentLevel = Number(existing['currentLevel']);
  const level = snapshot.find((entry) => entry.levelNo === currentLevel);
  if (!level) {
    throw new AppError('APPROVAL_REFERENCE_NOT_FOUND', 400, 'The request has no level to act on');
  }

  if (RAISER_ACTIONS.has(input.action)) {
    if (existing['raisedById'] !== userId) {
      throw new AppError(
        'APPROVAL_NOT_APPROVER',
        403,
        `Only the person who raised the request can ${input.action === 'cancel' ? 'cancel it' : 'respond'}`,
      );
    }
  } else {
    if (await isSuspended(client, userId)) {
      throw new AppError('APPROVAL_NOT_APPROVER', 403, 'You are not an approver for this level');
    }
    const roles = await heldRoleIds(client, userId);
    if (!isApproverOf(level, userId, roles)) {
      throw new AppError('APPROVAL_NOT_APPROVER', 403, 'You are not an approver for this level');
    }
  }

  if (input.action === 'approve' && input.amountApproved !== undefined) {
    const issue = approvedAmountIssue(input.amountApproved, Number(existing['amount']));
    if (issue) throw invalid(issue);
  }

  const decidedAt = new Date();
  let changes: Row;
  if (input.action === 'approve') {
    const next = nextLevel(snapshot, currentLevel);
    changes = next
      ? { currentLevel: next.levelNo, assignedActorId: next.approverUserId ?? null }
      : { status: 'approved', decidedAt, assignedActorId: null };
  } else if (input.action === 'clarify') {
    // The level stays; the raiser holds the request until they respond.
    changes = { status: CLARIFICATION, assignedActorId: existing['raisedById'] ?? null };
  } else if (input.action === 'respond') {
    changes = { status: 'pending', assignedActorId: level.approverUserId ?? null };
  } else {
    const status =
      input.action === 'reject' ? 'rejected' : input.action === 'return' ? 'returned' : 'cancelled';
    changes = { status, decidedAt, assignedActorId: null };
  }

  const actionId = await insertRow(
    client,
    'core_approval_action',
    [
      { name: 'approval_request_id' },
      { name: 'level_no' },
      { name: 'actor_id' },
      { name: 'action' },
      { name: 'comment' },
      { name: 'acted_at' },
      { name: 'record_version' },
      { name: 'amount_approved' },
      { name: 'decision' },
    ],
    [
      requestId,
      currentLevel,
      userId,
      input.action,
      input.comment ?? null,
      decidedAt,
      existing['rowVersion'],
      input.action === 'approve' ? (input.amountApproved ?? null) : null,
      input.decision ?? null,
    ],
    userId,
  );
  await auditWrite(
    client,
    actor,
    'core_approval_action',
    actionId,
    'INSERT',
    null,
    await snapshotOf(client, 'core_approval_action', actionId),
  );

  const updated = await updateRecord(client, requestSpec, actor, requestId, input.rowVersion, changes);
  await emitRequestEvent(client, actor, 'approval_request.decided', updated, { action: input.action, levelNo: currentLevel });
  return updated;
}

/** The actions taken on one request, oldest first. The request must exist. */
export async function listActions(client: PoolClient, requestId: string): Promise<Row[]> {
  const request = await findRecord(client, requestSpec, requestId, false);
  if (!request) throw notFound(requestSpec);
  return many<Row>(
    client,
    `SELECT id, level_no AS "levelNo", actor_id AS "actorId", action, comment,
            acted_at AS "actedAt", record_version AS "recordVersion",
            CAST(amount_approved AS double precision) AS "amountApproved", decision
       FROM core_approval_action
      WHERE approval_request_id = $1
      ORDER BY acted_at, id`,
    [requestId],
  );
}

/** Publishes an unpublished matrix version under the row-version guard. A published version is immutable after that. */
export async function publishMatrixVersion(
  client: PoolClient,
  actor: Actor,
  versionId: string,
  rowVersion: number,
): Promise<Row> {
  return updateRecord(client, matrixVersionSpec, actor, versionId, rowVersion, {
    publishedAt: new Date(),
  });
}

/** The request type the frontend raises job openings with (payload kind job). */
export const JOB_OPENING_TYPE = 'Job opening';

function isJobOpening(request: Row): boolean {
  const type = String(request['requestType'] ?? '').toLowerCase();
  const payload = request['payloadJson'] as { kind?: unknown } | null | undefined;
  return type === JOB_OPENING_TYPE.toLowerCase() || payload?.kind === 'job';
}

/**
 * Publishes an approved job opening to its project: sets publishedAt under the row-version guard. Publishing again
 * renews publishedAt.
 */
export async function publishJobOpening(
  client: PoolClient,
  actor: Actor,
  requestId: string,
  input: { rowVersion: number },
): Promise<Row> {
  const existing = await findRecord(client, requestSpec, requestId, true);
  if (!existing) throw notFound(requestSpec);
  if (existing['rowVersion'] !== input.rowVersion) throw versionConflict();
  if (!isJobOpening(existing)) {
    throw new AppError('APPROVAL_NOT_JOB_OPENING', 409, 'Only a job opening can be published');
  }
  if (existing['status'] !== 'approved') {
    throw new AppError(
      'APPROVAL_NOT_APPROVED',
      409,
      'A job opening can be published only after it is approved',
    );
  }
  return updateRecord(client, requestSpec, actor, requestId, input.rowVersion, {
    publishedAt: new Date(),
  });
}
