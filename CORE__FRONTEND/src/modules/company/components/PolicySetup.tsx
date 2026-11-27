import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FirstVersion, Note } from '@/shared/ui/Extras'
import type { PolicyData, PolicyKey } from '@/modules/core-data'
import { useCore } from '@/modules/core-data'
import { errorText } from '@/shared/lib/api'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { HolidaysEditor, LeaveEditor, OvertimeEditor, PaymentThresholdEditor, RulesEditor, ShiftsEditor } from './editors'
import { POLICY_META } from '../utils/meta'
import { NEEDS_COMPANY_PROFILE, saveFirstVersion } from '../utils/setup'
import { policyTemplate } from '../utils/templates'

/**
 * A policy the company has not set up yet: its editor opens on the standard template. The person changes what they
 * need, or keeps it as it is, and saves it as version 1. The page then shows the policy in force.
 */
export function PolicySetup({ policyKey }: { policyKey: PolicyKey }) {
  const navigate = useNavigate()
  const savePolicyVersion = useCore((s) => s.savePolicyVersion)
  const saveHolidayRowsRemote = useCore((s) => s.saveHolidayRowsRemote)
  const saveShiftRowsRemote = useCore((s) => s.saveShiftRowsRemote)
  const company = useCore((s) => s.company)
  const meta = POLICY_META[policyKey]
  const needsProfile = NEEDS_COMPANY_PROFILE.has(policyKey) && !company.legalName

  const save = <K extends PolicyKey>(k: K) => async (data: PolicyData[K], effectiveFrom: string, reason: string) => {
    try {
      await saveFirstVersion({ savePolicyVersion, saveHolidayRowsRemote, saveShiftRowsRemote }, k, data, effectiveFrom, reason)
    } catch (err) {
      notify(`${meta.title}: not saved. ${errorText(err)}`, 8000)
      return
    }
    notify(`${meta.title}: set up as v1, effective ${fmtDate(effectiveFrom)}`)
  }

  const base = <K extends PolicyKey>(k: K) => policyTemplate(k)
  return (
    <Card title="Set up this policy" subtitle="It starts from the standard template. Change what your company needs, or keep it as it is, then save it as version 1.">
      <Note title="Not set up yet" icon="info" className="mt-0">
        This company has not set up {meta.title.toLowerCase()} yet. The template below is a common starting point, not
        legal advice: check it against your own practice and the labour laws of your states before you save.
      </Note>
      {needsProfile && (
        <Note title="Company profile first" icon="info">
          {meta.title} are stored as company records, which need the company profile.{' '}
          <Button size="sm" onClick={() => navigate('/company')}>Set up the company profile</Button>
        </Note>
      )}
      <FirstVersion>
        {policyKey === 'shifts' && <ShiftsEditor base={base('shifts')} onSave={save('shifts')} />}
        {policyKey === 'holidays' && <HolidaysEditor base={base('holidays')} onSave={save('holidays')} />}
        {policyKey === 'overtime' && <OvertimeEditor base={base('overtime')} onSave={save('overtime')} />}
        {policyKey === 'leave' && <LeaveEditor base={base('leave')} onSave={save('leave')} />}
        {policyKey === 'payment-threshold' && <PaymentThresholdEditor base={base('payment-threshold')} onSave={save('payment-threshold')} />}
        {policyKey === 'rules' && <RulesEditor base={base('rules')} onSave={save('rules')} />}
      </FirstVersion>
    </Card>
  )
}
