import { z } from 'zod';
import {
  field,
  filterUuid,
  nonNegative,
  optionalNonNegative,
  optionalText,
  optionalUuid,
  text,
  uuid,
  versionField,
  type ResourceSpec,
} from '../../core/resource.js';

/**
 * Equipment and material rates per project (migrations 0063). A row is one line of an uploaded rate sheet. The rate
 * basis is rental (renting the equipment) or hire (hiring it with an operator). Amounts are optional.
 */

export const RATE_BASIS_VALUES = ['rental', 'hire'] as const;

const equipmentRateFields = z.object({
  projectId: uuid,
  policyVersionId: optionalUuid,
  equipmentType: text(120),
  rateBasis: z.enum(RATE_BASIS_VALUES),
  unit: text(20),
  rate: nonNegative,
  amount: optionalNonNegative,
  remarks: optionalText(500),
});

export const equipmentRateCreateBody = equipmentRateFields;
export const equipmentRatePatchBody = equipmentRateFields
  .partial()
  .extend({ rowVersion: versionField });

const materialRateFields = z.object({
  projectId: uuid,
  policyVersionId: optionalUuid,
  materialName: text(200),
  materialCode: optionalText(60),
  uom: text(20),
  rate: nonNegative,
  amount: optionalNonNegative,
  remarks: optionalText(500),
});

export const materialRateCreateBody = materialRateFields;
export const materialRatePatchBody = materialRateFields
  .partial()
  .extend({ rowVersion: versionField });

export const equipmentRateSpec: ResourceSpec = {
  table: 'core_equipment_rate',
  prefix: 'RATE_EQUIPMENT',
  label: 'Equipment rate',
  fields: [
    field('projectId', 'uuid'),
    field('policyVersionId', 'uuid'),
    field('equipmentType', 'text'),
    field('rateBasis', 'text'),
    field('unit', 'text'),
    field('rate', 'num'),
    field('amount', 'num'),
    field('remarks', 'text'),
  ],
  create: equipmentRateCreateBody,
  patch: equipmentRatePatchBody,
  filters: {
    projectId: { column: 'project_id', schema: filterUuid },
    policyVersionId: { column: 'policy_version_id', schema: filterUuid },
  },
  orderBy: 'equipment_type, rate_basis',
};

export const materialRateSpec: ResourceSpec = {
  table: 'core_material_rate',
  prefix: 'RATE_MATERIAL',
  label: 'Material rate',
  fields: [
    field('projectId', 'uuid'),
    field('policyVersionId', 'uuid'),
    field('materialName', 'text'),
    field('materialCode', 'text'),
    field('uom', 'text'),
    field('rate', 'num'),
    field('amount', 'num'),
    field('remarks', 'text'),
  ],
  create: materialRateCreateBody,
  patch: materialRatePatchBody,
  filters: {
    projectId: { column: 'project_id', schema: filterUuid },
    policyVersionId: { column: 'policy_version_id', schema: filterUuid },
  },
  orderBy: 'material_name',
};
