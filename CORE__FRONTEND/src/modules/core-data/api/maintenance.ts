import { api } from '@/shared/lib/api'

/**
 * Equipment maintenance schedules (API 1.4.0, /maintenance-schedules). Reads need a signed-in user; writes need
 * masters.manage. A schedule is a service task on one unit, due every intervalMonths or every intervalHours of
 * running time, whichever comes first.
 */
export interface MaintenanceSchedule {
  id: string
  equipmentUnitId: string
  task: string
  intervalMonths: number | null
  intervalHours: number | null
  lastServiceDate: string | null
  lastServiceHours: number | null
  notes: string | null
  rowVersion: number
}

export type ScheduleDraft = Omit<MaintenanceSchedule, 'id' | 'equipmentUnitId' | 'rowVersion'>

const path = (id: string) => `/maintenance-schedules/${encodeURIComponent(id)}`

export const listSchedules = () => api<MaintenanceSchedule[]>('GET', '/maintenance-schedules')
export const createSchedule = (equipmentUnitId: string, d: ScheduleDraft) => api<MaintenanceSchedule>('POST', '/maintenance-schedules', { body: { equipmentUnitId, ...d } })
export const updateSchedule = (id: string, rowVersion: number, d: ScheduleDraft) => api<MaintenanceSchedule>('PATCH', path(id), { body: { ...d, rowVersion } })
export const deleteSchedule = (id: string) => api<{ deleted: true }>('DELETE', path(id))

export type DueState = 'overdue' | 'due-soon' | 'ok' | 'unknown'

export interface Due {
  state: DueState
  /** the next service date, when the schedule counts months and a last service date is recorded */
  date?: string
  /** the meter hours at which the next service is due, when the schedule counts hours */
  hours?: number
}

/** Adds whole months to a YYYY-MM-DD date; the day is kept, or the month's last day when it is shorter. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

const DUE_SOON_DAYS = 14
/** Within this share of the hour interval counts as due soon (10% of 500 hours is 50 hours). */
const DUE_SOON_SHARE = 0.1

/**
 * When a schedule is next due, and whether it is overdue: by date (last service + months) and by running hours
 * (last service hours + interval), whichever comes first. `currentHours` is the unit's meter reading when known.
 * Without a last service there is nothing to count from, so the state is unknown.
 */
export function nextDue(s: Pick<MaintenanceSchedule, 'intervalMonths' | 'intervalHours' | 'lastServiceDate' | 'lastServiceHours'>, today: string, currentHours?: number): Due {
  const due: Due = { state: 'unknown' }
  const states: DueState[] = []
  if (s.intervalMonths && s.lastServiceDate) {
    due.date = addMonths(s.lastServiceDate, s.intervalMonths)
    const days = (Date.parse(due.date) - Date.parse(today)) / 86_400_000
    states.push(days < 0 ? 'overdue' : days <= DUE_SOON_DAYS ? 'due-soon' : 'ok')
  }
  if (s.intervalHours && s.lastServiceHours !== null) {
    due.hours = s.lastServiceHours + s.intervalHours
    if (currentHours !== undefined) {
      const left = due.hours - currentHours
      states.push(left < 0 ? 'overdue' : left <= s.intervalHours * DUE_SOON_SHARE ? 'due-soon' : 'ok')
    }
  }
  if (states.includes('overdue')) due.state = 'overdue'
  else if (states.includes('due-soon')) due.state = 'due-soon'
  else if (states.includes('ok')) due.state = 'ok'
  return due
}

/** The unit's meter reading as hours, when it is a plain number (the register keeps it as text). */
export const meterHours = (reading: string | undefined): number | undefined => {
  const n = Number(String(reading ?? '').replace(/,/g, '').trim())
  return reading && Number.isFinite(n) && n >= 0 ? n : undefined
}
