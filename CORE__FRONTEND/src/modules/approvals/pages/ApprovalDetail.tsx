import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Who } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { KV, MiniTable, Muted, Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { ActionScope, PageHead } from '@/modules/shell'
import { StatusBadge } from '@/shared/ui/Status'
import type { ApprovalRequest, RequestPayload } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { a11y, byId } from '@/shared/lib/core'
import { AVAIL_TONE, REQUEST_TONE, scopeText } from '@/modules/core-data'
import { fmtDate, fmtDateTime, money } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { useAuth } from '@/modules/auth'
import { PublishJobDialog } from '../components/PublishJobDialog'
import { canPublishJob, isPublished, jobRouteOf } from '../utils/jobs'
import { displayPCM, displayRaiser } from '../utils/raiser'
import { chainFor, policyState, projectOf, stopLevel, useCore } from '@/modules/core-data'

/** Still waiting on someone: an approver, or the raiser while a clarification is open. */
const isOpen = (s: ApprovalRequest['status']) => s === 'Pending' || s === 'In review' || s === 'Clarification requested'

type Decision =
  | { kind: 'material'; route: 'Transfer' | 'Vendor purchase' | ''; fromStoreId: string; vendor: string }
  | { kind: 'recruitment'; route: 'Local' | 'Head Office' | ''; candidate: string }
  | { kind: 'job'; route: JobRoute | '' }
  | null

type JobRoute = 'Site hires directly' | 'Head Office posts and sends candidate'

export default function ApprovalDetail() {
  const ref = useRef<HTMLDivElement>(null)
  const { id = '' } = useParams()
  // petty cash requests (under /petty-cash) keep their own list and crumb
  const pcmView = useLocation().pathname.startsWith('/petty-cash')
  const crumb = pcmView ? 'Petty cash management' : 'Approvals'
  const backPath = pcmView ? '/approvals/petty-cash' : '/approvals'
  useEnter(ref, `approval-${id}`)
  const navigate = useNavigate()
  const req = useCore((s) => s.requests.find((r) => r.id === id))
  const loadActions = useCore((s) => s.loadRequestActions)
  useEffect(() => { void loadActions(id) }, [id, loadActions])
  const back = <Button icon="chevL" onClick={() => navigate(backPath)}>{pcmView ? 'Back to petty cash' : 'Back to approvals'}</Button>

  if (!req) {
    return (
      <div ref={ref}>
        <PageHead crumb={crumb} title="Request not found" desc={`No request with ID ${id}.`} actions={back} />
        <Card><EmptyState icon="approvals" title="Nothing to show">Check the ID or go back to the approvals list.</EmptyState></Card>
      </div>
    )
  }
  return (
    <div ref={ref}>
      <PageHead crumb={crumb} title={req.code || req.id} desc={pcmView ? undefined : `${req.type}: ${req.title}`}
        actions={<>{back}{!isOpen(req.status)
          && <Button tone="primary" icon="approvals" onClick={() => navigate('/approvals')}>Next request</Button>}</>} />
      <div className="grid dash-grid">
        <div className="stack">
          <Summary req={req} pcmView={pcmView} />
          <TypeChecks req={req} />
        </div>
        <div className="stack">
          <Chain req={req} />
          {isOpen(req.status) ? <div id="decision" style={{ scrollMarginTop: 90 }}><DecisionCard req={req} /></div> : <Outcome req={req} />}
        </div>
      </div>
    </div>
  )
}

function Summary({ req, pcmView }: { req: ApprovalRequest; pcmView: boolean }) {
  const projects = useCore((s) => s.projects)
  const users = useCore((s) => s.users)
  const project = projectOf(projects, req.chainageId)
  // who acts next: the level's approver, or the raiser while a clarification is open
  const next = isOpen(req.status) && req.assignedActorId ? displayRaiser(byId(users, req.assignedActorId)?.name ?? 'Assigned approver') : null
  const marker = project?.chainage?.markers?.find((m) => m.id === req.chainageId)
  return (
    <Card title="Request" subtitle={`Raised in ${displayPCM(req.module)}`}>
      <div className="detail-grid">
        <KV k="Status"><StatusBadge tone={REQUEST_TONE[req.status]}>{req.status}</StatusBadge></KV>
        <KV k="Type"><span className="cell-pill">{req.type}</span></KV>
        <KV k="Raised by"><Who name={displayRaiser(req.raisedBy)} sub={pcmView ? undefined : req.raisedById ? 'Module head' : 'Module user'} /></KV>
        <KV k="Raised on"><strong>{fmtDateTime(req.raisedAt)}</strong></KV>
        {!pcmView && <KV k="Chainage"><strong>{marker ? marker.label : '—'}</strong></KV>}
        <KV k="Project"><strong>{project?.name ?? 'Company-wide'}</strong>{!project && <Muted> (not tied to one project)</Muted>}</KV>
        <KV k="Emergency">{req.emergency ? <span className="warn-text">Yes</span> : <strong>No</strong>}</KV>
        <KV k={pcmView ? "Required by" : "Needed by"}><strong>{req.neededBy ? fmtDate(req.neededBy) : req.emergency ? 'As soon as possible (emergency)' : 'Not given'}</strong></KV>
        <KV k="Matrix version"><strong>v{req.matrixVersion}</strong> <Muted>(fixed when raised)</Muted></KV>
        <KV k="Current level"><strong>{req.status === 'Approved' || req.status === 'Rejected' ? 'Decided' : `L${req.currentLevel}`}</strong></KV>
        {next && <KV k="Waiting on"><strong>{next}</strong></KV>}
        {pcmView && <KV k="Description" full><strong>{req.type}: {req.title}</strong></KV>}
      </div>
      {req.emergency && <Note title="Emergency flag" icon="siren">The emergency flag raises priority only. It never bypasses approval.</Note>}
    </Card>
  )
}

function TypeChecks({ req }: { req: ApprovalRequest }) {
  const p = req.payload
  switch (p.kind) {
    case 'equipment': return <EquipmentCheck req={req} p={p} />
    case 'material': return <MaterialCheck p={p} />
    case 'payment': return <ThresholdCheck kind="payment" amount={p.amount} lines={[['Payee', p.payee], ['Purpose', p.purpose]]} />
    case 'recruitment': return <RecruitmentCheck p={p} />
    case 'job': return <JobCheck req={req} p={p} />
    case 'transfer': return <TransferCheck p={p} />
    case 'promotion':
      return <Card title="Promotion" subtitle="CORE approves, HRMS executes"><div className="detail-grid">
        <KV k="Employee"><Who name={p.employee} sub={p.empId} /></KV><KV k="Effective from"><strong>{fmtDate(p.effective)}</strong></KV>
        <KV k="From"><strong>{p.fromRole}</strong></KV><KV k="To"><strong>{p.toRole}</strong></KV>
        <KV k="Current CTC"><strong className="amount">{money(p.currentCtc)}</strong></KV>
        <KV k="New CTC"><strong className="amount">{money(p.newCtc)}</strong> <Muted>(+{Math.round(((p.newCtc - p.currentCtc) / p.currentCtc) * 100)}%)</Muted></KV>
        <KV k="Justification" full><span style={{ fontSize: 13.5 }}>{p.justification}</span></KV>
      </div></Card>
    case 'bonus':
      return <Card title={p.basis === 'Bonus' ? 'Bonus' : 'Incentive'} subtitle="CORE approves, HRMS pays through payroll"><div className="detail-grid">
        <KV k="Applies to"><strong>{p.scope}</strong></KV><KV k="Headcount"><strong>{p.headcount}</strong></KV>
        <KV k="Total amount"><strong className="amount">{money(p.amount)}</strong></KV><KV k="Per person (average)"><strong className="amount">{money(Math.round(p.amount / Math.max(1, p.headcount)))}</strong></KV>
        <KV k="Period"><strong>{p.period}</strong></KV><KV k="Criteria"><strong>{p.criteria}</strong></KV>
      </div></Card>
    case 'loan': return <ThresholdCheck kind="loan" amount={p.amount} lines={[['Employee', <Who key="w" name={p.employee} sub={p.empId} />], ['Tenure', `${p.tenureMonths} months`], ['Monthly recovery (approx.)', money(Math.ceil(p.amount / p.tenureMonths))], ['Purpose', p.purpose]]} />
    case 'offer':
      return <Card title="Offer letter" subtitle="Approve before HRMS issues it"><div className="detail-grid">
        <KV k="Candidate"><Who name={p.candidate} sub={p.position} /></KV><KV k="Annual CTC"><strong className="amount">{money(p.ctc)}</strong></KV>
        <KV k="Joining date"><strong>{fmtDate(p.joining)}</strong></KV>
      </div></Card>
    case 'onboarding':
      return <Card title="Onboarded employee list" subtitle={`${p.employees.length} employees. Data entry stays in HRMS.`}>
        <MiniTable head={['Name', 'Position', 'Joined']} rows={p.employees.map((e) => [<Who key={e.name} name={e.name} />, e.position, fmtDate(e.joining)])} />
      </Card>
    case 'mrf':
      return <Card title="Manpower requisition"><div className="detail-grid">
        <KV k="Position"><strong>{p.position}</strong></KV><KV k="Headcount"><strong>{p.count}</strong></KV>
        <KV k="Required by"><strong>{fmtDate(p.requiredBy)}</strong></KV><KV k="Reason"><strong>{p.reason}</strong></KV>
      </div></Card>
  }
}

function EquipmentCheck({ req, p }: { req: ApprovalRequest; p: Extract<RequestPayload, { kind: 'equipment' }> }) {
  const { planLines, units, projects } = useCore()
  const project = projectOf(projects, req.chainageId)
  const marker = project?.chainage?.markers?.find((m) => m.id === req.chainageId)
  const planned = planLines.filter((l) => l.equipmentType === p.equipmentType && l.projectId === project?.id)
    .reduce((s, l) => s + l.plannedQty, 0)
  const ofType = units.filter((u) => u.type === p.equipmentType)
  const here = ofType.filter((u) => u.chainageId === req.chainageId).length
  const after = here + p.qty
  return (
    <Card title="Check against equipment planning" subtitle={`${p.equipmentType} at ${marker?.label ?? req.chainageId}`}>
      <div className="gauge">
        <div><b>{planned}</b><span>Planned (project)</span></div>
        <div><b>{here}</b><span>Registered at this chainage</span></div>
        <div><b className={after > planned ? 'warn-text' : 'ok-text'}>{after}</b><span>After this request (+{p.qty})</span></div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
        {after > planned ? <span className="warn-text">Exceeds planning by {after - planned}. Approving overrides the plan; record why in your comment.</span> : <span className="ok-text">Within planning.</span>}
        {' '}Needed {fmtDate(p.from)} to {fmtDate(p.to)}. {p.justification}
      </p>
      <h3 className="section-t">Units of this type, current location and availability</h3>
      <MiniTable head={['Asset', 'Chainage', 'GPS (last fix)', 'Availability']} rows={ofType.map((u) => [
        <strong key="a">{u.assetCode}</strong>, projectOf(projects, u.chainageId)?.chainage?.markers?.find((m) => m.id === u.chainageId)?.label ?? u.chainageId,
        u.lat !== null && u.lastPing ? `${u.lat.toFixed(4)}, ${u.lng?.toFixed(4)} · ${fmtDateTime(u.lastPing)}` : <Muted key="g">No GPS fix</Muted>,
        <StatusBadge key="s" tone={AVAIL_TONE[u.availability]}>{u.availability}</StatusBadge>,
      ])} />
      <Note title="GPS device not decided" icon="alert">Location shown is from the P&M register. Live GPS arrives in Release 2.</Note>
    </Card>
  )
}

function MaterialCheck({ p }: { p: Extract<RequestPayload, { kind: 'material' }> }) {
  const { materials, stores, stock } = useCore()
  const mat = byId(materials, p.materialId)
  const rows = stores.map((st) => {
    const r = stock.find((x) => x.storeId === st.id && x.materialId === p.materialId)
    return { st, free: r ? r.qty - r.reserved : 0, qty: r?.qty ?? 0 }
  })
  const own = rows.find((r) => r.st.id === p.storeId)
  return (
    <Card title="Live stock check" subtitle={`${p.qty} × ${p.uom || mat?.uom || ''} of ${mat?.name ?? p.materialId}, needed by ${fmtDate(p.neededBy)}`}>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--ink-2)' }}>
        Requesting store <strong>{own?.st.name}</strong> has <strong className={own && own.free >= p.qty ? 'ok-text' : 'warn-text'}>{own?.free ?? 0}</strong> free. The request came to Head Office because the store is short.
      </p>
      <MiniTable head={['Store', 'On hand', 'Free (after reserved)', 'Can cover']} rows={rows.filter((r) => r.st.id !== p.storeId).map((r) => [
        <strong key="s">{r.st.name}</strong>, r.qty, r.free, r.free >= p.qty ? <span key="c" className="ok-text">Yes</span> : <span key="c" className="warn-text">No</span>,
      ])} />
      {p.decision && <Note title={`Decision: ${p.decision.route}`} icon="check">{p.decision.route === 'Transfer' ? `From ${byId(stores, p.decision.fromStoreId)?.name}` : `Vendor: ${p.decision.vendor}`}</Note>}
    </Card>
  )
}

/** Advance payments and (PRD v2) loans and advances share the payment threshold routing. */
function ThresholdCheck({ kind, amount, lines }: { kind: 'payment' | 'loan'; amount: number; lines: [string, ReactNode][] }) {
  const policies = useCore((s) => s.policies)
  // no payment-threshold version yet (the policies are still loading, or none is set): there is no threshold to compare with
  const threshold = policyState(policies, 'payment-threshold').current?.data.amount
  const ho = threshold !== undefined && amount >= threshold
  return (
    <Card title={kind === 'loan' ? 'Loan and advance' : 'Payment routing'} subtitle={kind === 'loan' ? 'Request details and how this loan or advance is approved and paid' : 'How this payment is approved and paid, based on the payment threshold'}>
      <div className="detail-grid">
        <KV k="Amount"><strong className="amount">{money(amount)}</strong></KV>
        <KV k="Payment threshold"><strong className="amount">{threshold === undefined ? 'Not set' : money(threshold)}</strong></KV>
        {lines.map(([k, v]) => <KV key={k} k={k}>{typeof v === 'string' ? <strong>{v}</strong> : v}</KV>)}
      </div>
      <h3 className="section-t">Approval and payment rules</h3>
      <MiniTable head={['Condition', 'Approval', 'Payment']} rows={[
        [ho ? 'Below the threshold' : <strong key="a">Below the threshold</strong>, 'Approved through the approval chain', 'Paid by the location through PMS'],
        [ho ? <strong key="b">At or above the threshold</strong> : 'At or above the threshold', 'Approved through the approval chain', 'Released by Head Office'],
      ]} />
      <Note title={ho ? 'This request is at or above the threshold' : 'This request is below the threshold'} icon={ho ? 'building' : 'rupee'}>
        {ho ? 'Head Office will release the payment after final approval.' : 'The location will pay through PCM after final approval.'}
        {kind === 'loan' ? ' HRMS sets up the recovery schedule after approval. Whether loans and advance payments are the same record is yet to be confirmed (PRD v2, Q6).' : ''}
      </Note>
    </Card>
  )
}

function TransferCheck({ p }: { p: Extract<RequestPayload, { kind: 'transfer' }> }) {
  const sites = useCore((s) => s.sites)
  return (
    <Card title="Employee transfer" subtitle="CORE approves, HRMS executes">
      <div className="detail-grid">
        <KV k="Employee"><Who name={p.employee} sub={`${p.empId} · ${p.designation}`} /></KV>
        <KV k="Effective from"><strong>{fmtDate(p.effective)}</strong></KV>
        <KV k="From location"><strong>{byId(sites, p.fromSiteId)?.name ?? p.fromSiteId}</strong></KV>
        <KV k="To location"><strong>{byId(sites, p.toSiteId)?.name ?? p.toSiteId}</strong></KV>
        <KV k="Reason" full><span style={{ fontSize: 13.5 }}>{p.reason}</span></KV>
      </div>
      <Note title="After approval" icon="info">HRMS moves the employee, their roster and attendance geo-fence to the new location from the effective date.</Note>
    </Card>
  )
}

function JobCheck({ req, p }: { req: ApprovalRequest; p: Extract<RequestPayload, { kind: 'job' }> }) {
  const [publishing, setPublishing] = useState(false)
  const route = jobRouteOf(req)
  const published = isPublished(req)
  return (
    <Card title="Job opening" subtitle="Posted on the HRMS recruitment page (PRD v2, 3.11)"
      action={canPublishJob(req) ? <Button size="sm" tone="primary" icon="upload" onClick={() => setPublishing(true)}>Publish</Button> : undefined}>
      <div className="detail-grid">
        <KV k="Position"><strong>{p.position}</strong></KV><KV k="Openings"><strong>{p.openings}</strong></KV>
        <KV k="CTC range"><strong className="amount">{money(p.ctcMin)} – {money(p.ctcMax)}</strong></KV><KV k="Experience"><strong>{p.experience}</strong></KV>
        <KV k="HRMS recruitment page"><strong>{p.postedOnHrms ? 'Requirement posted' : 'Not posted'}</strong></KV>
        <KV k="Who fills it"><strong>{route ?? 'Not decided'}</strong></KV>
        {published && (
          <KV k="Published">
            <strong>Published</strong>
            {req.publishedAt && <Muted> · {fmtDateTime(req.publishedAt)}</Muted>}
          </KV>
        )}
      </div>
      <PublishJobDialog req={publishing ? req : null} onClose={() => setPublishing(false)} />
    </Card>
  )
}

const RECRUIT_STEPS: [string, string][] = [
  ['Requirement posted on the HRMS recruitment page', 'By the module, through HRMS'],
  ['Job opening', 'CORE decides: location hires directly, or Head Office posts and sends a candidate'],
  ['Manpower requisition', 'Raised in HRMS, approved here'],
  ['Onboarded employee list', 'Raised in HRMS, approved here'],
  ['Offer letter', 'Uses an approved format; each letter approved here'],
]
function RecruitmentCheck({ p }: { p: Extract<RequestPayload, { kind: 'recruitment' }> }) {
  return (
    <Card title="Recruitment" subtitle="HRMS asks CORE whether to hire locally or send a candidate from Head Office">
      <div className="detail-grid">
        <KV k="Position"><strong>{p.position}</strong></KV>
        <KV k="Headcount"><strong>{p.count}</strong></KV>
        <KV k="Decision"><strong>{p.decision ? (p.decision === 'Local' ? 'Hire locally' : 'Send from Head Office') : 'Not decided'}</strong></KV>
        {p.candidate && <KV k="Head Office candidate"><strong>{p.candidate}</strong></KV>}
      </div>
      <h3 className="section-t">Recruitment flow (PRD v2)</h3>
      <div className="timeline">{RECRUIT_STEPS.map(([t, d], i) => <div className="step" key={t}><div className="step-n">{i + 1}</div><div><strong>{t}</strong><span>{d}</span></div></div>)}</div>
    </Card>
  )
}

function Chain({ req }: { req: ApprovalRequest }) {
  const { chains, users, projects } = useCore()
  const chain = chains.find((c) => c.id === req.chainId) ?? chainFor(chains, projects, req.type, req.chainageId)
  // the levels fixed when the request was raised (server snapshot); without one, the version it was raised under
  const fromSnapshot = !!req.levelsSnapshot?.length
  const levels = fromSnapshot
    ? req.levelsSnapshot!
    : (chain?.versions.find((v) => v.version === req.matrixVersion)?.levels ?? []).map((l, i) => ({ ...l, levelNo: i + 1 }))
  const nameOf = (uid: string) => displayRaiser(byId(users, uid)?.name ?? '')
  // Payments: a cash limit lets a small amount stop at a lower level.
  const isPayments = req.type === 'Payments'
  const amount = req.payload.kind === 'payment' ? req.payload.amount : undefined
  const stop = isPayments ? stopLevel(levels, amount) : levels.length
  return (
    <Card title="Approval chain" subtitle={`${chain ? `${scopeText(chain.scopeType, chain.scopeIds, projects)} · matrix v${req.matrixVersion}` : `Matrix v${req.matrixVersion} for ${req.type}`}${fromSnapshot ? ' · levels as fixed when raised' : ''}`}>
      {isPayments && amount !== undefined && (
        <Note title="Cash limit" icon="info" className="mt-0">
          For {money(amount)}, approval stops at Level {stop}. Levels below {stop + 1} are needed; the rest are not needed for this amount.
        </Note>
      )}
      <div className="timeline">
        {levels.map((l) => {
          const lvl = l.levelNo
          const act = [...req.history].reverse().find((h) => h.level === lvl && h.action !== 'Raised')
          const notNeeded = isPayments && lvl > stop && !act
          const state = act ? act.action : notNeeded ? 'Not needed for this amount' : !l.approverId ? 'Not configured' : lvl === req.currentLevel && req.status === 'Clarification requested' ? 'Waiting for the raiser to clarify' : lvl === req.currentLevel && isOpen(req.status) ? 'Waiting' : lvl < req.currentLevel ? 'Done' : 'Upcoming'
          return (
            <div className="step" key={lvl} style={notNeeded ? { opacity: 0.55 } : undefined}>
              <div className="step-n">L{lvl}</div>
              <div>
                <strong>{l.approverId ? nameOf(l.approverId) : 'Not set'}</strong>
                <span>{state}{act ? ` · ${act.by} · ${fmtDateTime(act.at)}` : l.approverId && !notNeeded ? ` · Reminder every ${l.timeoutHours} h` : ''}</span>
                {act?.decision && <span style={{ display: 'block' }}>Decision: {act.decision}</span>}
                {act?.comment && <span style={{ display: 'block' }}>“{act.comment}”</span>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function DecisionCard({ req }: { req: ApprovalRequest }) {
  const decide = useCore((s) => s.decide)
  const clarifyRemote = useCore((s) => s.clarifyRemote)
  const me = useAuth((s) => s.profile?.id)
  const loadRequests = useCore((s) => s.loadRequests)
  const { stores, stock, projects, users } = useCore()
  const project = projectOf(projects, req.chainageId)
  // POST /approval-requests/{id}/actions; a version conflict re-reads the requests
  const { run, error: saveError, saving } = useRemoteSave(loadRequests)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  // approve and reject are final, so each asks once more before it is sent
  const [confirming, setConfirming] = useState<{ action: 'Approved' | 'Rejected'; text: string; choice?: string } | null>(null)
  const [decision, setDecision] = useState<Decision>(
    req.payload.kind === 'material' ? { kind: 'material', route: '', fromStoreId: '', vendor: '' }
      : req.payload.kind === 'recruitment' ? { kind: 'recruitment', route: '', candidate: '' }
        : req.payload.kind === 'job' ? { kind: 'job', route: req.payload.route ?? '' } : null,
  )
  // Segregation of duties (to confirm, PRD 3.6): the raiser can never approve their own request.
  // The raiser is compared with the signed-in user's id (useAuth profile.id).
  const isRaiser = !!req.raisedById && req.raisedById === me
  const selfApproval = isRaiser
  // Only the current level's approver may decide (the server refuses anyone else with 403 APPROVAL_NOT_APPROVER).
  // A level that names a role as well may have other approvers, so it is left to the server.
  const level = req.levelsSnapshot?.find((l) => l.levelNo === req.currentLevel)
  const notApprover = !!level?.approverId && !level.approverRoleId && !!me && level.approverId !== me
  const approverName = level?.approverId ? displayRaiser(byId(users, level.approverId)?.name ?? 'the assigned approver') : ''
  // while a clarification is open the request waits on the raiser: approve, reject and return are refused (409)
  const clarifying = req.status === 'Clarification requested'
  const question = [...req.history].reverse().find((h) => h.action === 'Clarification requested')

  const payloadWithDecision = (): RequestPayload | string => {
    const p = req.payload
    if (decision?.kind === 'material' && p.kind === 'material') {
      if (!decision.route) return 'Choose a store transfer or a vendor purchase.'
      if (decision.route === 'Transfer' && !decision.fromStoreId) return 'Choose the store to transfer from.'
      if (decision.route === 'Vendor purchase' && decision.vendor.trim().length < 2) return 'Enter the vendor name.'
      return { ...p, decision: decision.route === 'Transfer' ? { route: 'Transfer', fromStoreId: decision.fromStoreId } : { route: 'Vendor purchase', vendor: decision.vendor.trim() } }
    }
    if (decision?.kind === 'recruitment' && p.kind === 'recruitment') {
      if (!decision.route) return 'Choose to hire locally or send a candidate from Head Office.'
      if (decision.route === 'Head Office' && decision.candidate.trim().length < 2) return 'Enter the Head Office candidate’s name.'
      return { ...p, decision: decision.route, candidate: decision.route === 'Head Office' ? decision.candidate.trim() : undefined }
    }
    if (decision?.kind === 'job' && p.kind === 'job') {
      if (!decision.route) return 'Choose whether the location hires directly or Head Office posts the opening.'
      return { ...p, route: decision.route, publishedToSite: decision.route === 'Head Office posts and sends candidate' ? null : undefined }
    }
    return p
  }

  /** The approver's choice (store or vendor, local or Head Office hire, who fills a job opening), sent as `decision` (max 100). */
  const decisionText = (result: RequestPayload) => {
    if (result.kind === 'material' && result.decision) return result.decision.route === 'Transfer' ? `Transfer from ${byId(stores, result.decision.fromStoreId)?.name ?? result.decision.fromStoreId}` : `Vendor purchase: ${result.decision.vendor}`
    if (result.kind === 'recruitment' && result.decision) return result.decision === 'Local' ? 'Hire locally' : `Send from Head Office: ${result.candidate ?? ''}`
    if (result.kind === 'job' && result.route) return result.route
    return ''
  }
  const send = async (action: 'Approved' | 'Rejected', text: string, choice?: string) => {
    setConfirming(null)
    const done = await run({ id: req.id, action, text, choice }, (key) => decide(req.id, action, text, key, choice).then(() => true))
    if (!done) return
    setComment('')
    notify(action === 'Approved' ? `${req.code} approved at L${req.currentLevel}` : `${req.code} rejected`)
  }
  const approve = () => {
    const result = payloadWithDecision()
    if (typeof result === 'string') return setError(result)
    setConfirming({ action: 'Approved', text: comment.trim(), choice: decisionText(result) || undefined })
  }
  /** 'clarify' (approver asks the raiser) or 'respond' (the raiser answers); both need a comment. */
  const ask = async (action: 'clarify' | 'respond') => {
    const text = comment.trim()
    if (!text) return setError(action === 'clarify' ? 'Enter your question for the raiser.' : 'Enter your response.')
    const done = await run({ id: req.id, action, text }, (key) => clarifyRemote(req.id, action, text, key).then(() => true))
    if (!done) return
    setComment('')
    notify(action === 'clarify' ? `Clarification requested on ${req.code}` : `Response sent on ${req.code}`)
  }
  const reject = () => {
    if (comment.trim().length < 5) return setError('Give a reason for rejecting (at least 5 characters).')
    setConfirming({ action: 'Rejected', text: comment.trim() })
  }

  const p = req.payload
  const transferOptions = p.kind === 'material' ? stores.filter((st) => st.id !== p.storeId).map((st) => {
    const r = stock.find((x) => x.storeId === st.id && x.materialId === p.materialId)
    return { st, free: r ? r.qty - r.reserved : 0 }
  }) : []

  return (
    <Card title={clarifying ? 'Clarification requested' : 'Your decision'} subtitle={`Acting at L${req.currentLevel}`}>
      <ActionScope project={project ? { name: project.name, code: project.code } : null} site={null} />
      {clarifying ? (
        <div className="stack" style={{ gap: 14 }}>
          <Note title={`Question from ${question?.by || 'the approver'}`} icon="chatq" className="mt-0">
            {question?.comment ? `“${question.comment}”` : 'The approver asked the raiser for more information.'}
            {' '}The request stays at L{req.currentLevel}. Approve, reject and return are unavailable until the raiser responds.
          </Note>
          {isRaiser ? (
            <FormGroup label="Your response" required helper="Sent to the approver; the request goes back to them at the same level." error={error || saveError || undefined}>
              {(id, d) => <Textarea {...a11y(id, d, error || saveError)} rows={3} placeholder="Answer the approver's question" value={comment} onChange={(e) => { setComment(e.target.value); setError('') }} />}
            </FormGroup>
          ) : (
            <Muted>Waiting for {req.raisedBy || 'the raiser'} to respond.</Muted>
          )}
        </div>
      ) : selfApproval ? (
        <Note title="You raised this request" icon="ban">Segregation of duties: it must be approved by someone else.</Note>
      ) : notApprover ? (
        <Note title={`Waiting on ${approverName}`} icon="clock">
          Only the approver for L{req.currentLevel} can approve, reject or ask for clarification at this level.
        </Note>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {decision?.kind === 'material' && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="section-t" style={{ marginTop: 0 }}>How will this be fulfilled? <span className="required">*</span></legend>
              <div className="radio-cards">
                {transferOptions.map(({ st, free }) => (
                  <label className="radio-card" key={st.id}>
                    <input type="radio" name="route" disabled={p.kind === 'material' && free < p.qty} checked={decision.route === 'Transfer' && decision.fromStoreId === st.id}
                      onChange={() => { setDecision({ ...decision, route: 'Transfer', fromStoreId: st.id }); setError('') }} />
                    <div><strong>Transfer from {st.name}</strong><span>{free} free</span></div>
                  </label>
                ))}
                <label className="radio-card">
                  <input type="radio" name="route" checked={decision.route === 'Vendor purchase'} onChange={() => { setDecision({ ...decision, route: 'Vendor purchase', fromStoreId: '' }); setError('') }} />
                  <div><strong>Vendor purchase</strong><span>No store can cover it, or buying is better</span></div>
                </label>
              </div>
              {decision.route === 'Vendor purchase' && (
                <div style={{ marginTop: 12 }}>
                  <FormGroup label="Vendor" required>{(id, d) => <Input {...a11y(id, d)} placeholder="Enter vendor name" value={decision.vendor} onChange={(e) => setDecision({ ...decision, vendor: e.target.value })} />}</FormGroup>
                </div>
              )}
            </fieldset>
          )}
          {decision?.kind === 'recruitment' && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="section-t" style={{ marginTop: 0 }}>Hire locally or from Head Office? <span className="required">*</span></legend>
              <div className="radio-cards">
                <label className="radio-card"><input type="radio" name="hire" checked={decision.route === 'Local'} onChange={() => { setDecision({ ...decision, route: 'Local' }); setError('') }} /><div><strong>Hire locally</strong><span>The location hires</span></div></label>
                <label className="radio-card"><input type="radio" name="hire" checked={decision.route === 'Head Office'} onChange={() => { setDecision({ ...decision, route: 'Head Office' }); setError('') }} /><div><strong>Send from Head Office</strong><span>CORE sends a candidate</span></div></label>
              </div>
              {decision.route === 'Head Office' && (
                <div style={{ marginTop: 12 }}>
                  <FormGroup label="Head Office candidate" required>{(id, d) => <Input {...a11y(id, d)} placeholder="Enter candidate name" value={decision.candidate} onChange={(e) => setDecision({ ...decision, candidate: e.target.value })} />}</FormGroup>
                </div>
              )}
            </fieldset>
          )}
          {decision?.kind === 'job' && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="section-t" style={{ marginTop: 0 }}>Who fills this opening? <span className="required">*</span></legend>
              <div className="radio-cards">
                <label className="radio-card"><input type="radio" name="job-route" checked={decision.route === 'Site hires directly'} onChange={() => { setDecision({ kind: 'job', route: 'Site hires directly' }); setError('') }} /><div><strong>Direct site hiring</strong><span>The location recruits from the HRMS posting</span></div></label>
                <label className="radio-card"><input type="radio" name="job-route" checked={decision.route === 'Head Office posts and sends candidate'} onChange={() => { setDecision({ kind: 'job', route: 'Head Office posts and sends candidate' }); setError('') }} /><div><strong>Head Office hiring</strong><span>CORE publishes the opening to the location after approval</span></div></label>
              </div>
            </fieldset>
          )}
          <FormGroup label="Comment" helper="Required when rejecting or asking for clarification. Kept with the decision on the server." error={error || saveError || undefined}>
            {(id, d) => <Textarea {...a11y(id, d, error || saveError)} rows={3} placeholder="Enter reason, conditions or notes" value={comment} onChange={(e) => { setComment(e.target.value); setError('') }} />}
          </FormGroup>
        </div>
      )}
      {/* only the buttons the signed-in user can use are shown: the raiser's reply while a clarification is open, or the decision for the level's approver */}
      {clarifying && isRaiser ? (
        <div className="form-actions">
          <Button tone="primary" icon="send" disabled={saving} onClick={() => void ask('respond')}>{saving ? 'Sending…' : 'Send response'}</Button>
        </div>
      ) : !clarifying && !selfApproval && !notApprover ? (
        <div className="form-actions">
          <Button tone="danger" icon="xc" disabled={saving} onClick={reject}>Reject</Button>
          <Button tone="secondary" icon="chatq" disabled={saving} onClick={() => void ask('clarify')}>Clarify</Button>
          <Button tone="success" icon="check" disabled={saving} onClick={approve}>{saving ? 'Saving…' : 'Approve'}</Button>
        </div>
      ) : null}
      <Modal open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming?.action === 'Approved' ? `Approve ${req.code}?` : `Reject ${req.code}?`}
        description={confirming?.action === 'Approved'
          ? (req.levelsSnapshot && req.currentLevel < req.levelsSnapshot.length ? `It moves on to L${req.currentLevel + 1}.` : 'This is the last level, so the request is approved.')
          : 'The request is closed as rejected. This cannot be undone.'}>
        {confirming && <>
          <div className="detail-grid">
            <KV k="Request"><strong>{req.type}: {req.title}</strong></KV>
            <KV k="Level"><strong>L{req.currentLevel}</strong></KV>
            {confirming.choice && <KV k="Decision"><strong>{confirming.choice}</strong></KV>}
            <KV k="Comment" full><strong>{confirming.text || '—'}</strong></KV>
          </div>
          <div className="form-actions">
            <Button onClick={() => setConfirming(null)} disabled={saving}>Go back</Button>
            <Button tone={confirming.action === 'Approved' ? 'success' : 'danger'} icon={confirming.action === 'Approved' ? 'check' : 'xc'} disabled={saving}
              onClick={() => void send(confirming.action, confirming.text, confirming.choice)}>
              {confirming.action === 'Approved' ? 'Confirm approval' : 'Confirm rejection'}
            </Button>
          </div>
        </>}
      </Modal>
    </Card>
  )
}

function Outcome({ req }: { req: ApprovalRequest }) {
  const last = req.history[req.history.length - 1]
  return (
    <Card title="Outcome" subtitle="This request is decided">
      <div className="detail-grid">
        <KV k="Result"><StatusBadge tone={REQUEST_TONE[req.status]}>{req.status}</StatusBadge></KV>
        <KV k="By"><strong>{last.by}</strong></KV>
        <KV k="On"><strong>{fmtDateTime(last.at)}</strong></KV>
        {last.decision && <KV k="Decision"><strong>{last.decision}</strong></KV>}
        <KV k="Comment"><strong>{last.comment || '—'}</strong></KV>
      </div>
    </Card>
  )
}
