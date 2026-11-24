/** Demo subscription for the tenant. Replace with the billing service once it exists. */
export interface Invoice { no: string; date: string; period: string; amount: number; status: 'Paid' | 'Due' }

export const SUBSCRIPTION = {
  plan: 'Enterprise',
  status: 'Active' as 'Active' | 'Trial' | 'Expired',
  billingCycle: 'Annual',
  autoRenew: true,
  startDate: '2025-12-01',
  renewalDate: '2026-12-01',
  nextInvoiceDate: '2026-11-24',
  baseAmount: 1_250_000,
  gstRate: 18,
  accountId: 'SUB-VIQ-0042',
  supportTier: 'Priority, 24x7 phone and email',
  accountManager: 'Meera Nair',
  paymentMethod: 'Bank transfer (NEFT), HDFC Bank ending 4821',
  billingEmail: 'accounts@veloxiq.co.in',
  limits: { users: 250, projects: 40, sites: 120, storageGb: 500 },
  modules: ['CORE', 'HRMS', 'Stores', 'P&M', 'PMS'],
}

export const INVOICES: Invoice[] = [
  { no: 'INV-2025-118', date: '2025-12-01', period: '1 Dec 2025 – 30 Nov 2026', amount: 1_475_000, status: 'Paid' },
  { no: 'INV-2025-061', date: '2025-06-10', period: 'Add-on: Equipment module', amount: 236_000, status: 'Paid' },
  { no: 'INV-2024-094', date: '2024-12-01', period: '1 Dec 2024 – 30 Nov 2025', amount: 1_298_000, status: 'Paid' },
]

/** MOCK plan catalogue for the upgrade comparison. TODO(backend): GET /billing/plans */
export const PLANS = [
  { name: 'Standard', price: 450_000, users: 50, projects: 10, sites: 30, storageGb: 100, support: 'Email' },
  { name: 'Professional', price: 850_000, users: 120, projects: 25, sites: 70, storageGb: 250, support: 'Priority email' },
  { name: 'Enterprise', price: 1_250_000, users: 250, projects: 40, sites: 120, storageGb: 500, support: '24×7 phone and email' },
  { name: 'Enterprise Plus', price: 1_900_000, users: 600, projects: 100, sites: 300, storageGb: 1000, support: 'Dedicated manager' },
] as const
