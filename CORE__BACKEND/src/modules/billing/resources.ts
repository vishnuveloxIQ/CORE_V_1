import { z } from 'zod';
import { field, type ResourceSpec } from '../../core/resource.js';

/** Billing is managed by VeloxIQ, so these are read through the API and never written by a tenant (migration 0078). */
const readOnly = z.object({}).strict();
const patchOnly = z.object({ rowVersion: z.number().int().min(1) }).strict();

export const subscriptionSpec: ResourceSpec = {
  table: 'core_subscription',
  prefix: 'SUBSCRIPTION',
  label: 'Subscription',
  fields: [
    field('accountId', 'text'),
    field('plan', 'text'),
    field('status', 'text'),
    field('billingCycle', 'text'),
    field('autoRenew', 'bool'),
    field('startDate', 'date'),
    field('renewalDate', 'date'),
    field('nextInvoiceDate', 'date'),
    field('baseAmount', 'num'),
    field('gstRate', 'num'),
    field('supportTier', 'text'),
    field('accountManager', 'text'),
    field('paymentMethod', 'text'),
    field('billingEmail', 'text'),
    field('limitUsers', 'int'),
    field('limitProjects', 'int'),
    field('limitSites', 'int'),
    field('limitStorageGb', 'int'),
    field('modules', 'json'),
  ],
  create: readOnly,
  patch: patchOnly,
  filters: {},
  orderBy: 'start_date desc, id',
};

export const invoiceSpec: ResourceSpec = {
  table: 'core_invoice',
  prefix: 'INVOICE',
  label: 'Invoice',
  fields: [
    field('invoiceNo', 'text'),
    field('invoiceDate', 'date'),
    field('period', 'text'),
    field('amount', 'num'),
    field('status', 'text'),
  ],
  create: readOnly,
  patch: patchOnly,
  filters: {},
  orderBy: 'invoice_date desc, id',
};

export const billingPlanSpec: ResourceSpec = {
  table: 'core_billing_plan',
  prefix: 'BILLING_PLAN',
  label: 'Billing plan',
  fields: [
    field('name', 'text'),
    field('price', 'num'),
    field('users', 'int'),
    field('projects', 'int'),
    field('sites', 'int'),
    field('storageGb', 'int'),
    field('support', 'text'),
  ],
  create: readOnly,
  patch: patchOnly,
  filters: {},
  orderBy: 'price, id',
};
