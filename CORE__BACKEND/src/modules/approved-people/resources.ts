import { field, invalid, type PrepareContext, type ResourceSpec, type Row } from '../../core/resource.js';
import {
  APPROVED_STATUS_VALUES, REASON_WORD_LIMIT, approvedPersonCreateBody, approvedPersonFilters, approvedPersonPatchBody,
} from './schema.js';

const words = (value: string) => (value.trim() === '' ? 0 : value.trim().split(/\s+/).length);

/**
 * People approved for a project (migration 0078). Errors use the APPROVED_PERSON prefix. A person starts Approved
 * and only moves forward: Approved to With HRMS, then With HRMS to Onboarded.
 */
async function prepareApprovedPerson({ existing, row }: PrepareContext): Promise<Row> {
  if (!existing) {
    if (row.status && row.status !== 'Approved') {
      throw invalid({ path: 'status', message: 'A person is added as Approved.' });
    }
    return { status: 'Approved' };
  }
  const next = row.status ? String(row.status) : null;
  if (next && next !== existing.status) {
    const from = APPROVED_STATUS_VALUES.indexOf(existing.status as (typeof APPROVED_STATUS_VALUES)[number]);
    const to = APPROVED_STATUS_VALUES.indexOf(next as (typeof APPROVED_STATUS_VALUES)[number]);
    if (to !== from + 1) {
      throw invalid({ path: 'status', message: `A person cannot go from ${String(existing.status)} to ${next}.` });
    }
  }
  if (row.reason && words(String(row.reason)) > REASON_WORD_LIMIT) {
    throw invalid({ path: 'reason', message: `The reason can be at most ${REASON_WORD_LIMIT} words.` });
  }
  return {};
}

export const approvedPersonSpec: ResourceSpec = {
  table: 'core_approved_person',
  prefix: 'APPROVED_PERSON',
  label: 'Approved person',
  fields: [
    field('projectId', 'uuid'),
    field('department', 'text'),
    field('name', 'text'),
    field('designation', 'text'),
    field('joiningDate', 'date'),
    field('status', 'text'),
    field('reason', 'text'),
    field('reasonRequestedAt', 'ts'),
  ],
  create: approvedPersonCreateBody,
  patch: approvedPersonPatchBody,
  filters: {
    projectId: { column: 'project_id', schema: approvedPersonFilters.projectId },
    status: { column: 'status', schema: approvedPersonFilters.status },
  },
  orderBy: 'name, id',
  prepare: prepareApprovedPerson,
};
