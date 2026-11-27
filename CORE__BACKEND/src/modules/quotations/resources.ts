import { field, invalid, type PrepareContext, type ResourceSpec, type Row } from '../../core/resource.js';
import { quotationCreateBody, quotationPatchBody, quotationStatusFilter } from './schema.js';

export const QUOTATION_TABLE = 'core_quotation';

/**
 * Quotations waiting for the administrator (migration 0075). Errors use the QUOTATION prefix. A quotation starts
 * PENDING and is decided once: PENDING to APPROVED (with an optional note), or PENDING to REJECTED with a reason. It
 * cannot be deleted.
 */
async function prepareQuotation({ existing, row }: PrepareContext): Promise<Row> {
  if (!existing) return { status: 'PENDING', reason: null, decidedAt: null };
  if (existing.status !== 'PENDING') {
    throw invalid({ path: 'status', message: `This quotation was already ${String(existing.status).toLowerCase()}.` });
  }
  if (String(row.status) === 'REJECTED') {
    const reason = row.reason ? String(row.reason) : '';
    if (!reason) throw invalid({ path: 'reason', message: 'Give a reason for rejecting the quotation.' });
    return { reason, decidedAt: new Date().toISOString() };
  }
  // an approval may carry a note (for example why a 100% advance payment is accepted)
  return { reason: row.reason ? String(row.reason) : null, decidedAt: new Date().toISOString() };
}

export const quotationSpec: ResourceSpec = {
  table: QUOTATION_TABLE,
  prefix: 'QUOTATION',
  label: 'Quotation',
  fields: [
    field('ref', 'text'),
    field('vendorName', 'text'),
    field('buyerName', 'text'),
    field('projectName', 'text'),
    field('destination', 'text'),
    field('quotationDate', 'date'),
    field('validUntil', 'date'),
    field('paymentTerms', 'text'),
    field('amount', 'num'),
    field('document', 'json'),
    field('status', 'text'),
    field('reason', 'text'),
    field('decidedAt', 'ts'),
  ],
  create: quotationCreateBody,
  patch: quotationPatchBody,
  filters: { status: { column: 'status', schema: quotationStatusFilter } },
  orderBy: 'quotation_date desc, ref',
  prepare: prepareQuotation,
};
