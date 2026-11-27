import { z } from 'zod';
import { filterUuid, text, uuid, versionField } from '../../core/resource.js';

/** The status vocabulary of a BOQ item. Migration 0035 holds the same list in a CHECK. */
export const BOQ_STATUS_VALUES = ['draft', 'approved'] as const;

// The largest values the columns hold: numeric(14,3) for quantity and numeric(14,2) for rate.
const MAX_QUANTITY = 99_999_999_999.999;
const MAX_RATE = 999_999_999_999.99;

const boqFields = {
  itemCode: text(40),
  description: text(500),
  uomId: uuid,
  quantity: z.number().min(0).max(MAX_QUANTITY),
  rate: z.number().min(0).max(MAX_RATE),
  status: z.enum(BOQ_STATUS_VALUES).optional(),
};

// POST body. The project is fixed at create; the amount is never sent (it is quantity x rate, stored).
export const boqCreateBody = z.object({ projectId: uuid, ...boqFields }).strict();

// PATCH body: any subset of the item's fields, plus the row version the client read. The project cannot change.
export const boqPatchBody = z.object(boqFields).partial().extend({ rowVersion: versionField }).strict();

export const boqProjectFilter = filterUuid;
export const boqStatusFilter = z.enum(BOQ_STATUS_VALUES);
