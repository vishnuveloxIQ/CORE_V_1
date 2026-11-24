import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Who } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { KV, Muted, Note } from '@/shared/ui/Extras'
import { FormGroup, Textarea } from '@/shared/ui/Field'
import { a11y } from '@/shared/lib/core'
import { PageHead } from '@/modules/shell'
import { StatusBadge } from '@/shared/ui/Status'
import type { Grievance, GrievanceStatus } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { isUpcomingVisit, VISIT_TONE, wordCount } from '../utils/visits'
import { fmtDate, fmtDateTime, relDay, todayISO } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { useCore } from '@/modules/core-data'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'

type Act = 'visited'
const ACTS: Record<Act, { label: string; to: GrievanceStatus; help: string }> = {
  visited: { label: 'Mark visited', to: 'Visited', help: 'The person visited Head Office. This closes the grievance.' },
}
/** What CORE can do next from each status. */
const NEXT: Record<GrievanceStatus, Act[]> = {
  Requested: ['visited'],
  Confirmed: ['visited'],
  Rescheduled: ['visited'],
  Visited: [],
  'Not visited': [],
}

export default function GrievanceDetail() {
  const ref = useRef<HTMLDivElement>(null)
  const { id = '' } = useParams()
  useEnter(ref, `grievance-${id}`)
  const navigate = useNavigate()
  const g = useCore((s) => s.grievances.find((x) => x.id === id))
  const back = <Button icon="chevL" onClick={() => navigate('/grievances')}>Back to Grievances</Button>
  if (!g) {
    return (
      <div ref={ref}>
        <PageHead crumb="Grievances" title="Grievance not found" desc={`No grievance was found with ID ${id}.`} actions={back} />
        <Card><EmptyState icon="grievance" title="Nothing to show">Verify the ID or return to the list of grievances.</EmptyState></Card>
      </div>
    )
  }
  const quick = g.status === 'Requested' ? 'Mark visited' : isUpcomingVisit(g.status) ? 'Update visit' : null
  return (
    <div ref={ref}>
      <PageHead crumb={g.code} title={g.code} desc={`Raised by ${g.raisedBy}. ${g.message}`}
        actions={<>{back}{quick && <Button tone="primary" icon="calendar" onClick={() => { const el = document.getElementById('visit-action'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.querySelector('textarea')?.focus({ preventScroll: true }) }}>{quick}</Button>}</>} />
      <div className="stack">
        <div className="grid dash-grid">
          <Card title="Grievance" subtitle="Details submitted by the person">
            <div className="detail-grid">
              <KV k="Grievance ID"><strong>{g.code}</strong></KV>
              <KV k="Status"><StatusBadge tone={VISIT_TONE[g.status]}>{g.status}</StatusBadge></KV>
              <KV k="Raised by" full><Who name={g.raisedBy} /></KV>
              <KV k="Employee code"><strong>{g.employeeCode ?? '—'}</strong></KV>
              <KV k="Message" full><span className="msg-big">“{g.message}”</span><Muted> {wordCount(g.message)} of 10 words</Muted></KV>
              <KV k="Head Office visit date"><strong>{fmtDate(g.visitDate)}</strong>{isUpcomingVisit(g.status) && <Muted> · {relDay(g.visitDate)}</Muted>}</KV>
              <KV k="Raised"><strong>{fmtDateTime(g.raisedAt)}</strong></KV>
              {g.note && <KV k="Visit note" full><span style={{ fontSize: 13.5 }}>{g.note}</span></KV>}
            </div>
          </Card>
          <VisitAction key={`${g.status}-${g.visitDate}`} g={g} />
        </div>
        <Card title="History" subtitle="Every change, oldest first">
          <div className="timeline">
            {g.history.map((h, i) => (
              <div className="step" key={i}>
                <div className="step-n">{i + 1}</div>
                <div><strong>{h.status}</strong><span>{fmtDateTime(h.at)}</span>{h.note && <span style={{ display: 'block' }}>“{h.note}”</span>}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function VisitAction({ g }: { g: Grievance }) {
  const updateVisit = useCore((s) => s.updateVisit)
  const loadGrievances = useCore((s) => s.loadGrievances)
  // PATCH /grievances/{id}; a version conflict re-reads the grievances
  const { run, error: saveError, saving } = useRemoteSave(loadGrievances)
  const today = todayISO()
  const options = NEXT[g.status]
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const early = g.visitDate > today

  if (!options.length) {
    return (
      <Card title="Head Office visit" subtitle="Closed">
        <Note title={g.status === 'Visited' ? 'Visit completed' : 'Visit not attended'} icon={g.status === 'Visited' ? 'checkc' : 'info'} className="mt-0">
          {g.status === 'Visited' ? `The person visited Head Office on ${fmtDate(g.visitDate)}.` : 'This grievance is closed. The person may raise a new one with another visit date.'}
        </Note>
      </Card>
    )
  }

  const apply = async () => {
    if (early) return setError(`The visit is scheduled for ${fmtDate(g.visitDate)}. It can be marked only after that date.`)
    if (note.length > 2000) return setError('Keep the note under 2000 characters.')
    const done = await run({ id: g.id, to: ACTS.visited.to, note }, (key) => updateVisit(g.id, ACTS.visited.to, undefined, key, note).then(() => true))
    if (done) notify(`${g.code} marked as ${ACTS.visited.to.toLowerCase()}.`)
  }

  return (
    <Card title="Head Office visit" subtitle={`Scheduled for ${fmtDate(g.visitDate)}. Select the next step.`}>
      <div id="visit-action">
        <FormGroup label="Visit note" helper="Optional. Saved with the grievance (up to 2000 characters)." error={error || saveError || undefined}>
          {(id, d) => <Textarea {...a11y(id, d, error || saveError)} rows={3} maxLength={2000} placeholder="What was discussed or agreed" value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button tone="success" icon="check" disabled={saving} onClick={() => void apply()}>{saving ? 'Saving…' : ACTS.visited.label}</Button>
      </div>
    </Card>
  )
}
