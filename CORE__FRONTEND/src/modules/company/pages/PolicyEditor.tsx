import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/modules/shell'
import { StatusBadge } from '@/shared/ui/Status'
import { Toggle } from '@/shared/ui/Toggle'
import type { PolicyData, PolicyKey } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate, todayISO } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { errorText } from '@/shared/lib/api'
import { policyState, useCore } from '@/modules/core-data'
import { useAuth } from '@/modules/auth'
import { HolidaysEditor, LeaveEditor, OvertimeEditor, PaymentThresholdEditor, RulesEditor, ShiftsEditor } from '../components/editors'
import { isPolicyKey, POLICY_META, summarize } from '../utils/meta'
import { PolicyView } from '../components/PolicyView'
import { PolicySetup } from '../components/PolicySetup'

/** One policy: what is in force first; New version opens the editor. History on the right. */
export default function PolicyEditor() {
  const ref = useRef<HTMLDivElement>(null)
  const { key = '' } = useParams()
  useEnter(ref, `policy-${key}`)
  const navigate = useNavigate()
  const policies = useCore((s) => s.policies)
  const add = useCore((s) => s.savePolicyVersion)
  const saveHolidayRows = useCore((s) => s.saveHolidayRowsRemote)
  const saveShiftRows = useCore((s) => s.saveShiftRowsRemote)
  const isAdmin = useAuth((s) => s.isAdmin)
  const [params] = useSearchParams()
  const [editing, setEditing] = useState(params.get('edit') === '1')
  const back = <Button icon="chevL" onClick={() => navigate('/policies')}>All policies</Button>

  if (!isPolicyKey(key)) {
    return (
      <div ref={ref}>
        <PageHead crumb="Policies" title="Policy not found" desc="That policy does not exist." actions={back} />
        <Card><EmptyState icon="scroll" title="Nothing to show">Go back to the policies list.</EmptyState></Card>
      </div>
    )
  }

  const { versions, current, latest } = policyState(policies, key)
  // the company has no version of this policy yet (a new company): set it up from the standard template
  if (!latest) {
    return (
      <div ref={ref}>
        <PageHead crumb="Policies" title={POLICY_META[key].title} desc={POLICY_META[key].desc} actions={back} />
        <PolicySetup policyKey={key} />
      </div>
    )
  }
  const meta = POLICY_META[key]
  const save = <K extends PolicyKey>(k: K) => async (data: PolicyData[K], effectiveFrom: string, reason: string) => {
    try {
      // holidays and shift timings are rows of their own (/organisation/holidays, /organisation/shifts)
      // TODO(backend): effectiveFrom and reason of these two policies are not stored; rows take effect when saved
      if (k === 'holidays') await saveHolidayRows((latest.data as PolicyData['holidays']).year, data as PolicyData['holidays'])
      else if (k === 'shifts') {
        // rows carry the timings only; shifts per day, notes and the week-off pattern are kept in the shifts policy version
        await saveShiftRows(data as PolicyData['shifts'])
        await add(k, effectiveFrom, reason, data)
      } else await add(k, effectiveFrom, reason, data)
    } catch (err) {
      notify(`${meta.title}: not saved. ${errorText(err)}`)
      return
    }
    if (k === 'holidays' || k === 'shifts') notify(`${meta.title}: saved`)
    else notify(`${meta.title}: v${latest.version + 1} saved, effective ${fmtDate(effectiveFrom)}`)
    setEditing(false)
  }
  // remount the form after each save so it starts from the newest version
  const formKey = `${key}-${latest.version}`
  // overtime on/off: admin only. A new version takes effect today, built on the newest version so nothing else changes.
  const otOn = key === 'overtime' && (current.data as PolicyData['overtime']).enabled !== false
  const otScheduled = latest.version !== current.version
  const toggleOt = async () => {
    const today = todayISO()
    try {
      await add('overtime', today, otOn ? 'Overtime turned off by admin' : 'Overtime turned on by admin', { ...(latest.data as PolicyData['overtime']), enabled: !otOn })
    } catch (err) {
      notify(`${meta.title}: not saved. ${errorText(err)}`)
      return
    }
    notify(`${meta.title}: v${latest.version + 1} saved, ${otOn ? 'off' : 'on'} from ${fmtDate(today)}`)
  }

  return (
    <div ref={ref}>
      <PageHead crumb={meta.title} title={meta.title} desc={meta.desc}
        actions={<>{back}{!editing && <Button tone="primary" icon="plus" onClick={() => setEditing(true)}>New version</Button>}</>} />
      <div className="form-layout">
        {!editing ? (
          <Card title={`In force: v${current.version}`} subtitle={`Since ${fmtDate(current.effectiveFrom)} · ${current.createdBy} · “${current.reason}”`}
            action={<Button size="sm" icon="pencil" onClick={() => setEditing(true)}>Edit as new version</Button>}>
            {key === 'overtime' && isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 13 }}>Overtime policy{otScheduled ? '. The switch is available once the scheduled version takes effect.' : '. Turning it off stops overtime calculation for all locations.'}</span>
                <Toggle label="Overtime policy enabled" checked={otOn} disabled={otScheduled} onChange={toggleOt} stateText={otOn ? 'On' : 'Off'} />
              </div>
            )}
            <PolicyView policy={key} data={current.data} versionId={current.id} />
            {latest.version !== current.version && <p style={{ margin: '14px 0 0', fontSize: 13 }}><StatusBadge tone="review">Scheduled</StatusBadge> v{latest.version} applies from {fmtDate(latest.effectiveFrom)}: {summarize(key, latest.data)}.</p>}
          </Card>
        ) : (
        <Card title="New version" subtitle={`Starts from v${latest.version}. Saving never overwrites an earlier version.`} action={<Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>}>
          {key === 'shifts' && <ShiftsEditor key={formKey} base={(latest.data as PolicyData['shifts'])} onSave={save('shifts')} />}
          {key === 'holidays' && <HolidaysEditor key={formKey} base={(latest.data as PolicyData['holidays'])} onSave={save('holidays')} />}
          {key === 'overtime' && <OvertimeEditor key={formKey} base={(latest.data as PolicyData['overtime'])} onSave={save('overtime')} />}
          {key === 'leave' && <LeaveEditor key={formKey} base={(latest.data as PolicyData['leave'])} onSave={save('leave')} />}
          {key === 'payment-threshold' && <PaymentThresholdEditor key={formKey} base={(latest.data as PolicyData['payment-threshold'])} onSave={save('payment-threshold')} />}
          {key === 'rules' && <RulesEditor key={formKey} base={(latest.data as PolicyData['rules'])} onSave={save('rules')} />}
        </Card>
        )}
        <Card title="Versions" subtitle={`In force today: v${current.version}`}>
          <div className="timeline">
            {[...versions].reverse().map((v) => {
              const state = v.id === current.id ? 'In force' : v.effectiveFrom > current.effectiveFrom ? 'Scheduled' : 'Superseded'
              return (
                <div className="step" key={v.id}>
                  <div className="step-n">v{v.version}</div>
                  <div>
                    <strong>{summarize(key, v.data)}</strong>
                    <span style={{ display: 'block' }}>From {fmtDate(v.effectiveFrom)} · {v.createdBy}</span>
                    <span style={{ display: 'block' }}>“{v.reason}”</span>
                    <StatusBadge tone={state === 'In force' ? 'approved' : state === 'Scheduled' ? 'review' : 'draft'} className="mt-1">{state}</StatusBadge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
