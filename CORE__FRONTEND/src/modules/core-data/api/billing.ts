import { api } from '@/shared/lib/api'

/** Billing (API 1.23.0), read-only for a tenant: /subscriptions, /invoices and /billing-plans. */
export interface SubscriptionRecord {
  id: string
  accountId: string
  plan: string
  status: 'Active' | 'Trial' | 'Expired'
  billingCycle: string
  autoRenew: boolean
  startDate: string
  renewalDate: string
  nextInvoiceDate: string | null
  baseAmount: number
  gstRate: number
  supportTier: string | null
  accountManager: string | null
  paymentMethod: string | null
  billingEmail: string | null
  limitUsers: number | null
  limitProjects: number | null
  limitSites: number | null
  limitStorageGb: number | null
  modules: string[]
}

export interface InvoiceRecord { id: string; invoiceNo: string; invoiceDate: string; period: string; amount: number; status: 'Paid' | 'Due' }

export interface BillingPlanRecord { id: string; name: string; price: number; users: number; projects: number; sites: number; storageGb: number; support: string }

export const listSubscriptions = () => api<SubscriptionRecord[]>('GET', '/subscriptions')
export const listInvoices = () => api<InvoiceRecord[]>('GET', '/invoices')
export const listBillingPlans = () => api<BillingPlanRecord[]>('GET', '/billing-plans')
