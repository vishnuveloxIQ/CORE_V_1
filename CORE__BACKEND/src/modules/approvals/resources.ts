import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import { one } from '../../core/rows.js';
import {
  field,
  filterText,
  filterUuid,
  nextChildNumber,
  type ResourceSpec,
} from '../../core/resource.js';
import {
  chainCreateBody,
  chainPatchBody,
  matrixLevelCreateBody,
  matrixLevelPatchBody,
  matrixVersionCreateBody,
  matrixVersionPatchBody,
  pmsLimitCreateBody,
  pmsLimitPatchBody,
  raiseBody,
  requestStatusFilter,
} from './schema.js';
import { chainScopeIssue, matrixLevelIssue, matrixVersionIssue, pmsLimitIssue } from './rules.js';

/** Errors for the approval tables use the APPROVAL prefix (design point k). */
export const APPROVAL_PREFIX = 'APPROVAL';

export function matrixPublishedError(): AppError {
  return new AppError(
    'APPROVAL_MATRIX_PUBLISHED',
    409,
    'The matrix version is published and cannot be changed',
  );
}

/**
 * A level is written only while its version is unpublished (design point c). A missing version is a reference error,
 * because the version is named in the body.
 */
async function versionOpen(client: PoolClient, versionId: string): Promise<void> {
  const row = await one<{ published_at: Date | null }>(
    client,
    'SELECT published_at FROM core_matrix_version WHERE id = $1',
    [versionId],
  );
  if (!row) {
    throw new AppError('APPROVAL_REFERENCE_NOT_FOUND', 400, 'A referenced record does not exist');
  }
  if (row.published_at !== null) throw matrixPublishedError();
}

export const chainSpec: ResourceSpec = {
  table: 'core_approval_chain',
  prefix: APPROVAL_PREFIX,
  label: 'Approval chain',
  fields: [
    field('scopeType', 'text'),
    field('projectId', 'uuid'),
    field('requestType', 'text'),
    field('module', 'text'),
    field('name', 'text'),
    field('timeoutHours', 'int'),
    field('isActive', 'bool'),
  ],
  create: chainCreateBody,
  patch: chainPatchBody,
  filters: {
    requestType: { column: 'request_type', schema: filterText },
    scopeType: { column: 'scope_type', schema: filterText },
  },
  orderBy: 'request_type, scope_type, name',
  // A chain that a request refers to fails the delete with a foreign key, answered as APPROVAL_IN_USE. Deactivate it instead.
  check: chainScopeIssue,
};

export const matrixVersionSpec: ResourceSpec = {
  table: 'core_matrix_version',
  prefix: APPROVAL_PREFIX,
  label: 'Matrix version',
  fields: [
    field('chainId', 'uuid'),
    field('versionNo', 'int'),
    field('effectiveFrom', 'date'),
    field('publishedAt', 'ts'),
    field('reason', 'text'),
  ],
  create: matrixVersionCreateBody,
  patch: matrixVersionPatchBody,
  filters: { chainId: { column: 'chain_id', schema: filterUuid } },
  orderBy: 'chain_id, version_no',
  check: matrixVersionIssue,
  // A published version refuses every PATCH. Publish itself goes through updateRecord on an unpublished version.
  prepare: async ({ client, existing, row }) => {
    if (existing) {
      if (existing['publishedAt'] !== null && existing['publishedAt'] !== undefined) {
        throw matrixPublishedError();
      }
      return {};
    }
    if (row['versionNo'] !== undefined) return {};
    const versionNo = await nextChildNumber(
      client,
      APPROVAL_PREFIX,
      { table: 'core_approval_chain', id: String(row['chainId']) },
      { table: 'core_matrix_version', parentColumn: 'chain_id', numberColumn: 'version_no' },
    );
    return { versionNo };
  },
  beforeDelete: async (_client, row) => {
    if (row['publishedAt'] !== null && row['publishedAt'] !== undefined)
      throw matrixPublishedError();
  },
};

export const matrixLevelSpec: ResourceSpec = {
  table: 'core_matrix_level',
  prefix: APPROVAL_PREFIX,
  label: 'Matrix level',
  fields: [
    field('matrixVersionId', 'uuid'),
    field('levelNo', 'int'),
    field('amountFrom', 'num'),
    field('amountTo', 'num'),
    field('approverRoleId', 'uuid'),
    field('approverUserId', 'uuid'),
    field('escalateToUserId', 'uuid'),
    field('timeoutHours', 'int'),
    field('onTimeout', 'text'),
    field('cashLimitInr', 'num'),
  ],
  create: matrixLevelCreateBody,
  patch: matrixLevelPatchBody,
  filters: { matrixVersionId: { column: 'matrix_version_id', schema: filterUuid } },
  orderBy: 'matrix_version_id, level_no',
  check: matrixLevelIssue,
  prepare: async ({ client, row }) => {
    await versionOpen(client, String(row['matrixVersionId']));
    return {};
  },
  beforeDelete: async (client, row) => {
    await versionOpen(client, String(row['matrixVersionId']));
  },
};

/**
 * Approval requests. Only reads go through the generic routes: a request is raised by the service and changed only by
 * an action (design point g). The create and patch shapes are kept so the spec is complete.
 */
export const requestSpec: ResourceSpec = {
  table: 'core_approval_request',
  prefix: APPROVAL_PREFIX,
  label: 'Approval request',
  fields: [
    field('code', 'text'),
    field('requestType', 'text'),
    field('module', 'text'),
    field('title', 'text'),
    field('amount', 'num'),
    field('status', 'text'),
    field('emergency', 'bool'),
    field('neededBy', 'date'),
    field('locationId', 'uuid'),
    field('chainageMarkerId', 'uuid'),
    field('sourceRecordId', 'uuid'),
    field('raisedById', 'uuid'),
    field('raisedByName', 'text'),
    field('raisedAt', 'ts'),
    field('chainId', 'uuid'),
    field('matrixVersionId', 'uuid'),
    field('matrixVersion', 'int'),
    field('configVersionLabel', 'text'),
    field('configEffectiveFrom', 'date'),
    field('levelsSnapshot', 'json'),
    field('payloadJson', 'json'),
    field('currentLevel', 'int'),
    field('assignedActorId', 'uuid'),
    field('decidedAt', 'ts'),
    // Job openings only (0025): where and when the approved opening was published.
    field('publishedLocationId', 'uuid'),
    field('publishedAt', 'ts'),
  ],
  create: raiseBody,
  patch: raiseBody,
  filters: {
    status: { column: 'status', schema: requestStatusFilter },
    raisedById: { column: 'raised_by_id', schema: filterUuid },
  },
  orderBy: 'raised_at desc, code',
};

/** Cash limit rows (formerly PMS limit rows; owner decision 2026-11-22). The table keeps its name, core_pms_limit_row. */
export const cashLimitSpec: ResourceSpec = {
  table: 'core_pms_limit_row',
  prefix: APPROVAL_PREFIX,
  label: 'Cash limit row',
  fields: [
    field('tier', 'int'),
    field('priority', 'text'),
    field('amountInr', 'num'),
    field('days', 'int'),
    field('hours', 'int'),
    field('minutes', 'int'),
    field('isFinal', 'bool'),
  ],
  create: pmsLimitCreateBody,
  patch: pmsLimitPatchBody,
  filters: { priority: { column: 'priority', schema: filterText } },
  orderBy: 'tier, priority',
  check: pmsLimitIssue,
};
