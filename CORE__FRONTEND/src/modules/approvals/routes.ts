import type { AppRoute } from '@/shared/types/route'
import { page } from '@/shared/lib/route'

// 3.7 + 3.9 approvals and request handling
export const approvalRoutes: AppRoute[] = [
  { path: '/approvals', Component: page(() => import('./pages/ApprovalsList')) },
  { path: '/approvals/:id', sample: '/approvals/REQ-2039', Component: page(() => import('./pages/ApprovalDetail')) },
]

// PRD v2 3.11 — job openings (the offer letter format lives in the company profile)
export const jobOpeningRoutes: AppRoute[] = [
  { path: '/job-openings', Component: page(() => import('./pages/JobOpenings')) },
]

// 3.7 matrix
export const matrixRoutes: AppRoute[] = [
  { path: '/approval-matrix', Component: page(() => import('./pages/ApprovalMatrix')) },
  { path: '/approval-matrix/new', Component: page(() => import('./pages/ChainNew')) },
  { path: '/approval-matrix/:id', sample: '/approval-matrix/AC-7', Component: page(() => import('./pages/ChainEditor')) },
]
