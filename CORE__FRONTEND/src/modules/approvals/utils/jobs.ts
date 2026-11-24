import type { ApprovalRequest } from '@/modules/core-data'

export type JobRoute = 'Site hires directly' | 'Head Office posts and sends candidate'
const JOB_ROUTES: JobRoute[] = ['Site hires directly', 'Head Office posts and sends candidate']

/**
 * Who fills a job opening: the payload's route, else the approver's decision recorded with an action
 * (GET /approval-requests/{id}/actions). Undefined when neither is known yet.
 */
export const jobRouteOf = (req: ApprovalRequest): JobRoute | undefined => {
  if (req.payload.kind === 'job' && req.payload.route) return req.payload.route
  const d = [...req.history].reverse().find((h) => JOB_ROUTES.includes(h.decision as JobRoute))?.decision
  return d as JobRoute | undefined
}

/** The location a job opening was published to: the server's publishedLocationId, else the older payload field. */
export const publishedTo = (req: ApprovalRequest) =>
  req.publishedLocationId ?? (req.payload.kind === 'job' ? req.payload.publishedToSite ?? null : null)

/** Approved, not yet published, and not left to the location to hire directly. */
export const canPublishJob = (req: ApprovalRequest) =>
  req.payload.kind === 'job' && req.status === 'Approved' && !publishedTo(req) && jobRouteOf(req) !== 'Site hires directly'
