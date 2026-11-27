import type { ApprovalRequest } from '@/modules/core-data'

export type JobRoute = 'Site hires directly' | 'Head Office posts and sends candidate'
const JOB_ROUTES: JobRoute[] = ['Site hires directly', 'Head Office posts and sends candidate']

/** How each route is named on screen. The stored value does not change. */
export const JOB_ROUTE_LABEL: Record<JobRoute, string> = {
  'Site hires directly': 'Direct site hiring',
  'Head Office posts and sends candidate': 'Head Office hiring',
}

/**
 * Who fills a job opening: the payload's route, else the approver's decision recorded with an action
 * (GET /approval-requests/{id}/actions). Undefined when neither is known yet.
 */
export const jobRouteOf = (req: ApprovalRequest): JobRoute | undefined => {
  if (req.payload.kind === 'job' && req.payload.route) return req.payload.route
  const d = [...req.history].reverse().find((h) => JOB_ROUTES.includes(h.decision as JobRoute))?.decision
  return d as JobRoute | undefined
}

/** A job opening is published once it has a publish time (publishedAt), or the older payload marker. */
export const isPublished = (req: ApprovalRequest) =>
  Boolean(req.publishedAt) || (req.payload.kind === 'job' && Boolean(req.payload.publishedToSite))

/** Approved, not yet published, and not left to the location to hire directly. */
export const canPublishJob = (req: ApprovalRequest) =>
  req.payload.kind === 'job' && req.status === 'Approved' && !isPublished(req) && jobRouteOf(req) !== 'Site hires directly'
