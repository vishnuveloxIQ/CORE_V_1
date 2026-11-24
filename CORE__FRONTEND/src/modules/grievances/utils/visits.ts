import type { StatusTone } from '@/shared/ui/Status'
import type { GrievanceStatus } from '@/modules/core-data'

export const VISIT_TONE: Record<GrievanceStatus, StatusTone> = { Requested: 'pending', Confirmed: 'review', Rescheduled: 'pending', Visited: 'approved', 'Not visited': 'draft' }
/** Head Office visit is still to happen */
export const isUpcomingVisit = (s: GrievanceStatus) => s === 'Requested' || s === 'Confirmed' || s === 'Rescheduled'
/** Words in a grievance message (the raiser may write at most 10). */
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
