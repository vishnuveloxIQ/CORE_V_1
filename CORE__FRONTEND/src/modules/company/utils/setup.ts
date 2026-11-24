import type { PolicyData, PolicyKey } from '@/modules/core-data'

type HolidayPolicy = PolicyData['holidays']
type ShiftPolicy = PolicyData['shifts']

/** The store actions a first save needs. Passed in so the helper works the same from any page. */
export interface SetupActions {
  savePolicyVersion: <K extends PolicyKey>(key: K, effectiveFrom: string, reason: string, data: PolicyData[K]) => Promise<void>
  saveHolidayRowsRemote: (baseYear: number, data: HolidayPolicy) => Promise<void>
  saveShiftRowsRemote: (data: ShiftPolicy) => Promise<void>
}

/**
 * Saves a policy's first version for a company that has none. Holidays and shift timings are also rows of their own
 * (/organisation/holidays, /organisation/shifts), and those rows are shown inside a version, so for these two the
 * rows are written first and the version after; a refused row (for example a company with no profile yet) stops
 * the save before any version exists. The other policies are one version each.
 */
export async function saveFirstVersion<K extends PolicyKey>(
  actions: SetupActions,
  key: K,
  data: PolicyData[K],
  effectiveFrom: string,
  reason: string,
): Promise<void> {
  if (key === 'holidays') await actions.saveHolidayRowsRemote((data as HolidayPolicy).year, data as HolidayPolicy)
  if (key === 'shifts') await actions.saveShiftRowsRemote(data as ShiftPolicy)
  await actions.savePolicyVersion(key, effectiveFrom, reason, data)
}

/** Holidays and shift timings are stored as company rows, which the server allows only once the company profile exists. */
export const NEEDS_COMPANY_PROFILE: ReadonlySet<PolicyKey> = new Set<PolicyKey>(['holidays', 'shifts'])
