import { field, type ResourceSpec } from '../../core/resource.js';
import { subContractorCreateBody, subContractorPatchBody, subContractorProjectFilter } from './schema.js';

export const SUB_CONTRACTOR_TABLE = 'core_sub_contractor';

/**
 * Sub-contractor registrations (migration 0068). Errors use the SUB_CONTRACTOR prefix; an unknown project is
 * 400 SUB_CONTRACTOR_REFERENCE_NOT_FOUND, and an unknown agreement file is refused the same way.
 */
export const subContractorSpec: ResourceSpec = {
  table: SUB_CONTRACTOR_TABLE,
  prefix: 'SUB_CONTRACTOR',
  label: 'Sub-contractor',
  fields: [
    field('projectId', 'uuid'),
    field('siteName', 'text'),
    field('projectName', 'text'),
    field('firmName', 'text'),
    field('ownerName', 'text'),
    field('address', 'text'),
    field('mailId', 'text'),
    field('phone', 'text'),
    field('gstNumber', 'text'),
    field('panNumber', 'text'),
    field('workOrderDate', 'date'),
    field('workContractTitle', 'text'),
    field('workContractPeriod', 'text'),
    field('scopeAnnexure', 'text'),
    field('consumablesTerms', 'text'),
    field('shedTentMaterial', 'text'),
    field('safetyItems', 'text'),
    field('otherConditions', 'text'),
    field('agreementFileId', 'uuid'),
    field('status', 'text'),
  ],
  create: subContractorCreateBody,
  patch: subContractorPatchBody,
  filters: {
    projectId: { column: 'project_id', schema: subContractorProjectFilter },
  },
  orderBy: 'firm_name, id',
};
