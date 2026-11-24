import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import { many, one } from '../../core/rows.js';
import {
  deleteRecord,
  field,
  filterText,
  filterUuid,
  nextChildNumber,
  type ResourceSpec,
} from '../../core/resource.js';
import {
  customFieldIssue,
  customVersionIssue,
  documentTemplateIssue,
  isPublished,
  leavePolicyIssue,
  leavePolicyRuleIssue,
  leaveTypeIssue,
  otPolicyIssue,
  otPolicyRuleIssue,
  policyVersionIssue,
} from './rules.js';
import {
  customFieldCreateBody,
  customFieldPatchBody,
  customPolicyCreateBody,
  customPolicyPatchBody,
  customVersionCreateBody,
  customVersionPatchBody,
  documentTemplateCreateBody,
  documentTemplatePatchBody,
  leavePolicyCreateBody,
  leavePolicyPatchBody,
  leavePolicyRuleCreateBody,
  leavePolicyRulePatchBody,
  leaveTypeCreateBody,
  leaveTypePatchBody,
  otPolicyCreateBody,
  otPolicyPatchBody,
  otPolicyRuleCreateBody,
  otPolicyRulePatchBody,
  policyCreateBody,
  policyKindFilter,
  policyPatchBody,
  policyRuleCreateBody,
  policyRulePatchBody,
  policyVersionCreateBody,
  policyVersionPatchBody,
} from './schema.js';

/** Errors for the policy tables use the POLICY prefix (design point j). */
export const POLICY_PREFIX = 'POLICY';

export function publishedError(): AppError {
  return new AppError(
    'POLICY_VERSION_PUBLISHED',
    409,
    'The version is published and cannot be changed',
  );
}

/**
 * A policy rule is written only while its version is unpublished (design point c). A missing version is a
 * reference error, not a not-found, because the version is named in the body.
 */
async function ruleWindowOpen(client: PoolClient, versionId: string): Promise<void> {
  const row = await one<{ published_at: Date | null }>(
    client,
    'SELECT published_at FROM core_policy_version WHERE id = $1',
    [versionId],
  );
  if (!row) {
    throw new AppError('POLICY_REFERENCE_NOT_FOUND', 400, 'A referenced record does not exist');
  }
  if (isPublished(row.published_at)) throw publishedError();
}

export const policySpec: ResourceSpec = {
  table: 'core_policy',
  prefix: POLICY_PREFIX,
  label: 'Policy',
  fields: [
    field('kind', 'text'),
    field('code', 'text'),
    field('name', 'text'),
    field('description', 'text'),
  ],
  create: policyCreateBody,
  patch: policyPatchBody,
  filters: { kind: { column: 'kind', schema: policyKindFilter } },
  orderBy: 'code',
};

export const policyVersionSpec: ResourceSpec = {
  table: 'core_policy_version',
  prefix: POLICY_PREFIX,
  label: 'Policy version',
  fields: [
    field('policyId', 'uuid'),
    field('versionNo', 'int'),
    field('body', 'json'),
    field('effectiveFrom', 'date'),
    field('publishedAt', 'ts'),
    field('reason', 'text'),
  ],
  create: policyVersionCreateBody,
  patch: policyVersionPatchBody,
  filters: { policyId: { column: 'policy_id', schema: filterUuid } },
  orderBy: 'policy_id, version_no',
  check: policyVersionIssue,
  // Publish goes through updateRecord with publishedAt set; every other write to a published version is refused.
  prepare: async ({ client, existing, row }) => {
    if (existing) {
      if (isPublished(existing['publishedAt'])) throw publishedError();
      return {};
    }
    if (row['versionNo'] !== undefined) return {};
    const versionNo = await nextChildNumber(
      client,
      POLICY_PREFIX,
      { table: 'core_policy', id: String(row['policyId']) },
      { table: 'core_policy_version', parentColumn: 'policy_id', numberColumn: 'version_no' },
    );
    return { versionNo };
  },
  // A version can be deleted only while unpublished. Its policy cannot be deleted while any version exists (FK).
  beforeDelete: async (_client, row) => {
    if (isPublished(row['publishedAt'])) throw publishedError();
  },
};

export const policyRuleSpec: ResourceSpec = {
  table: 'core_policy_rule',
  prefix: POLICY_PREFIX,
  label: 'Policy rule',
  fields: [
    field('policyVersionId', 'uuid'),
    field('title', 'text'),
    field('category', 'text'),
    field('body', 'text'),
    field('ackRequired', 'bool'),
  ],
  create: policyRuleCreateBody,
  patch: policyRulePatchBody,
  filters: { policyVersionId: { column: 'policy_version_id', schema: filterUuid } },
  orderBy: 'category, title',
  prepare: async ({ client, row }) => {
    await ruleWindowOpen(client, String(row['policyVersionId']));
    return {};
  },
  beforeDelete: async (client, row) => {
    await ruleWindowOpen(client, String(row['policyVersionId']));
  },
};

export const otPolicySpec: ResourceSpec = {
  table: 'core_ot_policy',
  prefix: POLICY_PREFIX,
  label: 'OT policy',
  fields: [
    field('code', 'text'),
    field('name', 'text'),
    field('isActive', 'bool'),
    field('settlementMode', 'text'),
    field('rateWorkingDay', 'num'),
    field('rateWeekOff', 'num'),
    field('rateHoliday', 'num'),
    field('compOffMultiplier', 'num'),
    field('compOffExpiryDays', 'int'),
    field('maxHoursPerDay', 'num'),
    field('maxHoursPerMonth', 'num'),
    field('claimWithinDays', 'int'),
    field('minMinutes', 'int'),
    field('requiresApproval', 'bool'),
  ],
  create: otPolicyCreateBody,
  patch: otPolicyPatchBody,
  filters: {},
  orderBy: 'code',
  check: otPolicyIssue,
};

export const otPolicyRuleSpec: ResourceSpec = {
  table: 'core_ot_policy_rule',
  prefix: POLICY_PREFIX,
  label: 'OT policy rule',
  fields: [
    field('policyId', 'uuid'),
    field('ruleCode', 'text'),
    field('ruleJson', 'json'),
    field('effectiveFrom', 'date'),
    field('effectiveTo', 'date'),
  ],
  create: otPolicyRuleCreateBody,
  patch: otPolicyRulePatchBody,
  filters: { policyId: { column: 'policy_id', schema: filterUuid } },
  orderBy: 'rule_code, effective_from',
  check: otPolicyRuleIssue,
};

export const leaveTypeSpec: ResourceSpec = {
  table: 'core_leave_type',
  prefix: POLICY_PREFIX,
  label: 'Leave type',
  fields: [
    field('code', 'text'),
    field('name', 'text'),
    field('isPaid', 'bool'),
    field('status', 'text'),
    field('annualDays', 'num'),
    field('accrual', 'text'),
    field('carryForward', 'bool'),
    field('maxCarryDays', 'num'),
    field('expiryMonths', 'int'),
    field('encashable', 'bool'),
  ],
  create: leaveTypeCreateBody,
  patch: leaveTypePatchBody,
  filters: {},
  orderBy: 'code',
  check: leaveTypeIssue,
};

export const leavePolicySpec: ResourceSpec = {
  table: 'core_leave_policy',
  prefix: POLICY_PREFIX,
  label: 'Leave policy',
  fields: [
    field('code', 'text'),
    field('name', 'text'),
    field('effectiveFrom', 'date'),
    field('effectiveTo', 'date'),
    field('status', 'text'),
    field('yearStart', 'date'),
    field('yearEnd', 'date'),
  ],
  create: leavePolicyCreateBody,
  patch: leavePolicyPatchBody,
  filters: {},
  orderBy: 'code',
  check: leavePolicyIssue,
};

export const leavePolicyRuleSpec: ResourceSpec = {
  table: 'core_leave_policy_rule',
  prefix: POLICY_PREFIX,
  label: 'Leave policy rule',
  fields: [
    field('leavePolicyId', 'uuid'),
    field('leaveTypeId', 'uuid'),
    field('ruleJson', 'json'),
    field('effectiveFrom', 'date'),
    field('effectiveTo', 'date'),
  ],
  create: leavePolicyRuleCreateBody,
  patch: leavePolicyRulePatchBody,
  filters: {
    leavePolicyId: { column: 'leave_policy_id', schema: filterUuid },
    leaveTypeId: { column: 'leave_type_id', schema: filterUuid },
  },
  orderBy: 'leave_policy_id, leave_type_id, effective_from',
  check: leavePolicyRuleIssue,
};

export const customPolicySpec: ResourceSpec = {
  table: 'core_custom_policy',
  prefix: POLICY_PREFIX,
  label: 'Custom policy',
  fields: [field('name', 'text'), field('description', 'text')],
  create: customPolicyCreateBody,
  patch: customPolicyPatchBody,
  filters: {},
  orderBy: 'name',
  // Owner decision (2026-11-22): a custom policy can be deleted from the screens. Its versions and fields go with it,
  // in the same transaction, each with its own audit row, so the audit trail keeps what was removed.
  beforeDelete: async (client, row, actor) => {
    const policyId = String(row['id']);
    const children = async (table: string) =>
      many<{ id: string }>(client, `SELECT id FROM ${table} WHERE custom_policy_id = $1`, [policyId]);
    for (const { id } of await children('core_custom_policy_version')) await deleteRecord(client, customVersionSpec, actor, id);
    for (const { id } of await children('core_custom_policy_field')) await deleteRecord(client, customFieldSpec, actor, id);
  },
};

export const customFieldSpec: ResourceSpec = {
  table: 'core_custom_policy_field',
  prefix: POLICY_PREFIX,
  label: 'Custom policy field',
  fields: [
    field('customPolicyId', 'uuid'),
    field('label', 'text'),
    field('fieldType', 'text'),
    field('isRequired', 'bool'),
    field('optionsJson', 'json'),
    field('sortOrder', 'int'),
  ],
  create: customFieldCreateBody,
  patch: customFieldPatchBody,
  filters: { customPolicyId: { column: 'custom_policy_id', schema: filterUuid } },
  orderBy: 'sort_order, label',
  check: customFieldIssue,
};

export const customVersionSpec: ResourceSpec = {
  table: 'core_custom_policy_version',
  prefix: POLICY_PREFIX,
  label: 'Custom policy version',
  fields: [
    field('customPolicyId', 'uuid'),
    field('versionNo', 'int'),
    field('effectiveFrom', 'date'),
    field('reason', 'text'),
    field('valuesJson', 'json'),
  ],
  create: customVersionCreateBody,
  patch: customVersionPatchBody,
  filters: { customPolicyId: { column: 'custom_policy_id', schema: filterUuid } },
  orderBy: 'custom_policy_id, version_no',
  check: customVersionIssue,
  prepare: async ({ client, existing, row }) => {
    if (existing || row['versionNo'] !== undefined) return {};
    const versionNo = await nextChildNumber(
      client,
      POLICY_PREFIX,
      { table: 'core_custom_policy', id: String(row['customPolicyId']) },
      {
        table: 'core_custom_policy_version',
        parentColumn: 'custom_policy_id',
        numberColumn: 'version_no',
      },
    );
    return { versionNo };
  },
};

export const documentTemplateSpec: ResourceSpec = {
  table: 'core_document_template',
  prefix: POLICY_PREFIX,
  label: 'Document template',
  fields: [
    field('code', 'text'),
    field('name', 'text'),
    field('templateVersion', 'text'),
    field('status', 'text'),
    field('fileId', 'uuid'),
    field('fileName', 'text'),
    field('mimeType', 'text'),
    field('sizeBytes', 'num'),
    field('revision', 'int'),
  ],
  create: documentTemplateCreateBody,
  patch: documentTemplatePatchBody,
  filters: { status: { column: 'status', schema: filterText } },
  orderBy: 'code',
  check: documentTemplateIssue,
};

/**
 * The published version of a rule, or null when the rule does not exist. Acknowledgement needs the version to be
 * published (design point c).
 */
export async function ruleVersionPublished(
  client: PoolClient,
  ruleId: string,
): Promise<boolean | null> {
  const row = await one<{ published_at: Date | null }>(
    client,
    `SELECT v.published_at FROM core_policy_rule r
       JOIN core_policy_version v ON v.id = r.policy_version_id
      WHERE r.id = $1`,
    [ruleId],
  );
  return row ? isPublished(row.published_at) : null;
}
