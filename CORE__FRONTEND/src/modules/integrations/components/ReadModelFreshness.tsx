import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Note } from '@/shared/ui/Extras'
import { ago, fmtDateTime } from '@/shared/lib/format'
import { useCanManage } from '@/modules/auth'
import { integrationApi, type SyncStatus } from '@/modules/core-data'

/**
 * CORE-24-03: on the dashboard, when each module's records last reached Core. Shown to the Core administrator only
 * (the endpoint needs access.manage). It does not call anything stale: the freshness threshold is an open owner
 * decision (D16). It explains that dashboard figures from other modules come from Core's copies.
 */
export function ReadModelFreshness() {
  const allowed = useCanManage('access.manage')
  const [status, setStatus] = useState<SyncStatus[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!allowed) return
    let live = true
    integrationApi.syncStatus().then((s) => { if (live) setStatus(s) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [allowed])
  if (!allowed || (!status && !failed)) return null
  const latest = new Map<string, string>()
  for (const s of status ?? []) if (!latest.has(s.sourceModule) || s.lastSyncedAt > latest.get(s.sourceModule)!) latest.set(s.sourceModule, s.lastSyncedAt)
  return (
    <Note title="Data from other modules" icon={failed ? 'alert' : 'info'}>
      {failed
        ? ' The sync status could not be read, so figures from other modules may be out of date.'
        : latest.size === 0
          ? ' No records have reached Core from HRMS, P&M, PMS or Stores yet.'
          : <> Core's copies were last updated: {[...latest].map(([m, at], i) => (
              <span key={m}>{i ? '; ' : ' '}{integrationApi.MODULE_LABEL[m] ?? m} <span title={fmtDateTime(at)}>{ago(at)}</span></span>
            ))}. The threshold for calling them stale is not set yet.</>}
      {' '}<Link to="/audit?view=data" className="id-link">See shared records</Link>
    </Note>
  )
}
