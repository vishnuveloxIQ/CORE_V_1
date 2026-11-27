import { z } from 'zod';
import { isoDate, optionalDate, optionalText, text, versionField } from '../../core/resource.js';

/** Status of a quotation. Migration 0075 holds the same list in a CHECK. */
export const QUOTATION_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

const MAX_AMOUNT = 999_999_999_999.99;

// POST body: a quotation sent for approval. It always starts PENDING; the document is the quotation as submitted.
export const quotationCreateBody = z
  .object({
    ref: text(100),
    vendorName: text(200),
    buyerName: text(200),
    projectName: optionalText(300),
    destination: optionalText(200),
    quotationDate: isoDate,
    validUntil: optionalDate,
    paymentTerms: optionalText(200),
    amount: z.number().min(0).max(MAX_AMOUNT),
    document: z.record(z.string(), z.unknown()),
  })
  .strict();

// PATCH body: the decision. Only the status and the reason move; the quotation itself cannot be edited.
export const quotationPatchBody = z
  .object({ status: z.enum(['APPROVED', 'REJECTED']), reason: optionalText(1000) })
  .extend({ rowVersion: versionField })
  .strict();

export const quotationStatusFilter = z.enum(QUOTATION_STATUS_VALUES);
