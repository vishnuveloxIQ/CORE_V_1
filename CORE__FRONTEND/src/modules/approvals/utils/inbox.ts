import type { ApprovalRequest } from '@/modules/core-data'

/** Inbox filters (CORE-21-02): the module that raised the request and the day it was raised, inclusive. */
export interface Filters { module: string; from: string; to: string; /** current level, '1' to '4'; '' for any */ level?: string }
export const NO_FILTERS: Filters = { module: '', from: '', to: '', level: '' }
/** The calendar day a request was raised, in the browser's time zone (YYYY-MM-DD). */
export const raisedDay = (r: ApprovalRequest) => {
  const d = new Date(r.raisedAt)
  return Number.isNaN(d.getTime()) ? r.raisedAt.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const matches = (r: ApprovalRequest, f: Filters) =>
  (!f.module || r.module === f.module) && (!f.from || raisedDay(r) >= f.from) && (!f.to || raisedDay(r) <= f.to)
  && (!f.level || (r.status !== 'Approved' && r.status !== 'Rejected' && String(r.currentLevel) === f.level))
