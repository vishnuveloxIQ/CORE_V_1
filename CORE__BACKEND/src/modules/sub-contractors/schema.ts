import { z } from 'zod';
import { filterUuid, optionalDate, optionalText, optionalUuid, text, uuid, versionField } from '../../core/resource.js';

/**
 * Sub-contractor registration: the details of a sub-contract that prepare its work order (migration 0068). Only the
 * firm, owner, title and work order date are required on the form; the rest may be left empty.
 */
// Registration status: active or inactive (migration 0069).
export const SUB_CONTRACTOR_STATUS_VALUES = ['active', 'inactive'] as const;

const subContractorFields = {
  status: z.enum(SUB_CONTRACTOR_STATUS_VALUES).optional(),
  siteName: optionalText(200),
  projectName: optionalText(300),
  firmName: text(200),
  ownerName: text(200),
  address: optionalText(500),
  mailId: z.email().max(200).nullable().optional(),
  phone: optionalText(20),
  gstNumber: optionalText(15),
  panNumber: optionalText(10),
  workOrderDate: optionalDate,
  workContractTitle: text(200),
  workContractPeriod: optionalText(200),
  scopeAnnexure: optionalText(500),
  consumablesTerms: optionalText(500),
  shedTentMaterial: optionalText(500),
  safetyItems: optionalText(500),
  otherConditions: optionalText(1000),
  // the agreement / work order document (core_file id, PDF or Word)
  agreementFileId: optionalUuid,
};

// POST body. The project is fixed at create.
export const subContractorCreateBody = z.object({ projectId: uuid, ...subContractorFields }).strict();

// PATCH body: any subset of the fields, plus the row version the client read. The project cannot change.
export const subContractorPatchBody = z.object(subContractorFields).partial().extend({ rowVersion: versionField }).strict();

export const subContractorProjectFilter = filterUuid;
