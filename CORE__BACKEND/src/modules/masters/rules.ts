import { isAllowedSettingKey } from '../organisation/rules.js';

/**
 * Pure rules for the master data tables (Phase 5c design defaults, PROGRESS.md). No database access.
 * Each function returns a message when the rule is broken, or null when the value is fine.
 */

/** HSN codes are 4, 6 or 8 digits (point d). */
export const HSN_PATTERN = /^([0-9]{4}|[0-9]{6}|[0-9]{8})$/;

/**
 * Equipment type codes start with a letter and use letters, digits and underscores (point e). The tolerance key is
 * built from the code, so the code must fit the approved fuel.tolerance family in 5a.
 */
export const EQUIPMENT_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** The tolerance setting key an equipment type reads. Set once, on create, from the code (point e). */
export function toleranceSettingKey(code: string): string {
  return `fuel.tolerance.${code.toLowerCase()}`;
}

/** True when the key the equipment type reads is one of the approved settings keys (5a, point c). */
export function toleranceKeyAllowed(code: string): boolean {
  return isAllowedSettingKey(toleranceSettingKey(code));
}

/** A plan line ends on or after it starts. Dates are YYYY-MM-DD, so string order is date order (point h). */
export function planDatesIssue(fromDate: string | null, toDate: string | null): string | null {
  if (fromDate !== null && toDate !== null && toDate < fromDate) {
    return 'to_date must be on or after from_date';
  }
  return null;
}

/** Every plan line stage (0030). Which of them a line may use depends on its resource kind. */
export const PLAN_LINE_STAGES = [
  'planned',
  'confirmed',
  'fulfilled',
  'requested',
  'ordered',
  'received',
] as const;

/** The stages each resource kind allows. Equipment lines have no stage beyond planned. */
export const STAGES_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  people: ['planned', 'confirmed', 'fulfilled'],
  material: ['planned', 'requested', 'ordered', 'received'],
  equipment: ['planned'],
};

/** A stage must be one its resource kind allows (null is always fine). */
export function planLineStageIssue(resourceKind: string, stage: string | null): string | null {
  if (stage === null) return null;
  const allowed = STAGES_BY_KIND[resourceKind] ?? [];
  return allowed.includes(stage)
    ? null
    : `a ${resourceKind} line allows stage ${allowed.join(', ') || 'none'}`;
}

/** The references a plan line needs, by resource kind (point h). */
export interface PlanLineRefs {
  equipmentTypeId: string | null;
  positionId: string | null;
  materialId: string | null;
  uomId: string | null;
}

/** Equipment needs an equipment type, people need a position, and material needs a material and a unit. */
export function planLineKindIssue(resourceKind: string, refs: PlanLineRefs): string | null {
  switch (resourceKind) {
    case 'equipment':
      return refs.equipmentTypeId === null ? 'an equipment line needs equipment_type_id' : null;
    case 'people':
      return refs.positionId === null ? 'a people line needs position_id' : null;
    case 'material':
      return refs.materialId === null || refs.uomId === null
        ? 'a material line needs material_id and uom_id'
        : null;
    default:
      return 'resource_kind must be equipment, people or material';
  }
}
