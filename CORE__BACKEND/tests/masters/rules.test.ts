import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_CODE_PATTERN,
  HSN_PATTERN,
  planDatesIssue,
  planLineKindIssue,
  toleranceKeyAllowed,
  toleranceSettingKey,
} from '../../src/modules/masters/rules.js';
import {
  allocationCreateBody,
  equipmentTypeCreateBody,
  vendorCreateBody,
} from '../../src/modules/masters/schema.js';

// Pure rules for Phase 5c. No database: these run without TEST_DATABASE_URL.

const NO_REFS = { equipmentTypeId: null, positionId: null, materialId: null, uomId: null };

describe('HSN codes (design point d)', () => {
  it.each(['1234', '123456', '12345678'])('accepts %s', (hsn) => {
    expect(HSN_PATTERN.test(hsn)).toBe(true);
  });

  it.each(['123', '12345', '1234567', '12A4', ' 1234', ''])('rejects %j', (hsn) => {
    expect(HSN_PATTERN.test(hsn)).toBe(false);
  });
});

describe('vendor tax IDs (design point b)', () => {
  it('accepts a well-formed GSTIN and PAN', () => {
    expect(
      vendorCreateBody.safeParse({ code: 'V1', name: 'V', gstin: '29ABCDE1234F1Z5' }).success,
    ).toBe(true);
    expect(vendorCreateBody.safeParse({ code: 'V1', name: 'V', pan: 'ABCDE1234F' }).success).toBe(
      true,
    );
  });

  it.each(['29ABCDE1234F1Z', '29ABCDE1234F1X5', '2ABCDE1234F1Z5'])(
    'rejects a bad GSTIN %j',
    (gstin) => {
      expect(vendorCreateBody.safeParse({ code: 'V1', name: 'V', gstin }).success).toBe(false);
    },
  );

  it('rejects a lower-case PAN', () => {
    expect(vendorCreateBody.safeParse({ code: 'V1', name: 'V', pan: 'abcde1234f' }).success).toBe(
      false,
    );
  });
});

describe('equipment type codes and tolerance keys (design point e)', () => {
  it.each(['EXC', 'exc_01', 'A1'])('accepts the code %s', (code) => {
    expect(EQUIPMENT_CODE_PATTERN.test(code)).toBe(true);
  });

  it.each(['1EXC', 'EXC-01', '_EXC', 'A'.repeat(41)])('rejects the code %j', (code) => {
    expect(EQUIPMENT_CODE_PATTERN.test(code)).toBe(false);
  });

  it('builds the tolerance key from the lower-cased code', () => {
    expect(toleranceSettingKey('EXC_01')).toBe('fuel.tolerance.exc_01');
  });

  it('accepts the key the 5a settings family allows', () => {
    expect(toleranceKeyAllowed('EXC_01')).toBe(true);
    expect(toleranceKeyAllowed('A1')).toBe(true);
  });

  it('rejects an equipment code that does not start with a letter', () => {
    expect(equipmentTypeCreateBody.safeParse({ code: '1EXC', name: 'Excavator' }).success).toBe(
      false,
    );
  });
});

describe('plan line dates (design point h)', () => {
  it('accepts an end on or after the start', () => {
    expect(planDatesIssue('2026-04-01', '2026-04-01')).toBeNull();
    expect(planDatesIssue('2026-04-01', '2026-06-30')).toBeNull();
  });

  it('refuses an end before the start', () => {
    expect(planDatesIssue('2026-04-01', '2026-03-31')).toBe(
      'to_date must be on or after from_date',
    );
  });

  it('allows a missing start or end', () => {
    expect(planDatesIssue(null, '2026-03-31')).toBeNull();
    expect(planDatesIssue('2026-04-01', null)).toBeNull();
  });
});

describe('plan line references by resource kind (design point h)', () => {
  it('needs an equipment type for an equipment line', () => {
    expect(planLineKindIssue('equipment', NO_REFS)).toBe(
      'an equipment line needs equipment_type_id',
    );
    expect(
      planLineKindIssue('equipment', { ...NO_REFS, equipmentTypeId: randomUUID() }),
    ).toBeNull();
  });

  it('needs a position for a people line', () => {
    expect(planLineKindIssue('people', NO_REFS)).toBe('a people line needs position_id');
    expect(planLineKindIssue('people', { ...NO_REFS, positionId: randomUUID() })).toBeNull();
  });

  it('needs a material and a unit for a material line', () => {
    expect(planLineKindIssue('material', { ...NO_REFS, materialId: randomUUID() })).toBe(
      'a material line needs material_id and uom_id',
    );
    expect(
      planLineKindIssue('material', { ...NO_REFS, materialId: randomUUID(), uomId: randomUUID() }),
    ).toBeNull();
  });

  it('refuses an unknown resource kind', () => {
    expect(planLineKindIssue('vehicle', NO_REFS)).toBe(
      'resource_kind must be equipment, people or material',
    );
  });
});

describe('quantities and unit references', () => {
  const base = { projectId: randomUUID(), materialId: randomUUID(), uomId: randomUUID() };

  it('accepts a positive quantity', () => {
    expect(allocationCreateBody.safeParse({ ...base, quantity: 0.001 }).success).toBe(true);
  });

  it('refuses zero and negative quantities', () => {
    expect(allocationCreateBody.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(allocationCreateBody.safeParse({ ...base, quantity: -5 }).success).toBe(false);
  });

  it('refuses a quantity beyond the numeric(14,3) range', () => {
    expect(allocationCreateBody.safeParse({ ...base, quantity: 1e12 }).success).toBe(false);
  });
});
