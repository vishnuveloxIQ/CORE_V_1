import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHead } from '@/modules/shell'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { KV, Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatusBadge } from '@/shared/ui/Status'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { useEnter } from '@/shared/hooks/useMotion'
import { errorText, idempotencyKey } from '@/shared/lib/api'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { Can, MANAGE } from '@/modules/auth'
import {
  subContractorApi, useCore, workforceApi, type AdvertRecord, type InterestRecord, type InterestStatus, type MailRecord,
  type RequirementRecord, type SubContractorRecord,
} from '@/modules/core-data'

const INTEREST_STATES: InterestStatus[] = ['CONTACTED', 'IN_DISCUSSION', 'AGREED', 'DECLINED']
const LABEL: Record<InterestStatus, string> = workforceApi.INTEREST_LABEL
const NEEDS_REASON: InterestStatus[] = ['DECLINED']

/** One advert: its worker lines, the messages queued to registered sub-contractors, and the responses recorded. */
export default function WorkforceAdvertDetail() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'workforce-advert-detail')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const projects = useCore((s) => s.projects)
  const [advert, setAdvert] = useState<AdvertRecord | null>(null)
  const [lines, setLines] = useState<RequirementRecord[]>([])
  const [interests, setInterests] = useState<InterestRecord[]>([])
  const [mail, setMail] = useState<MailRecord[]>([])
  const [subs, setSubs] = useState<SubContractorRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)
  const [modal, setModal] = useState<'line' | 'close' | null>(null)
  const [changing, setChanging] = useState<InterestRecord | null>(null)
  const [viewing, setViewing] = useState<InterestRecord | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([workforceApi.listAdverts(), workforceApi.listRequirements(id), workforceApi.listMail(id), workforceApi.listInterests(id), subContractorApi.listSubContractors()])
      .then(([adverts, reqs, mails, ints, sc]) => {
        if (!live) return
        const found = adverts.find((a) => a.id === id) ?? null
        setAdvert(found)
        setLines(reqs)
        setInterests(ints)
        setMail(mails)
        setSubs(sc)
        setState(found ? 'ready' : 'missing')
      })
      .catch((err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } })
    return () => { live = false }
  }, [id, tick])

  const reload = () => { setState('loading'); setTick((t) => t + 1) }
  const firmOf = (subId: string) => subs.find((s) => s.id === subId)?.firmName ?? 'Unknown sub-contractor'
  // the contractor's name: its registered firm, or the firm given when the response was recorded
  const nameOf = (i: InterestRecord) => (i.subContractorId ? firmOf(i.subContractorId) : i.firmName ?? '—')
  const projectName = advert ? projects.find((p) => p.id === advert.projectId)?.name ?? '—' : '—'

  const heading = <PageHead crumb="Workforce adverts" title="Workforce advert" desc="Workers needed for a project location." actions={<Button icon="chevL" onClick={() => navigate('/workforce-adverts')}>Back to adverts</Button>} />
  if (state === 'missing') return <div ref={ref}>{heading}<Note title="This advert was not found" icon="alert">Go back to the list of workforce adverts.</Note></div>
  if (state === 'error') return <div ref={ref}>{heading}<Note title="The advert could not be loaded" icon="alert">{loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button></Note></div>
  if (!advert) return <div ref={ref}>{heading}<Note title="Loading the advert" icon="clock">Please wait.</Note></div>

  const draft = advert.status === 'DRAFT'
  const published = advert.status === 'PUBLISHED'

  return (
    <div ref={ref}>
      <PageHead
        crumb="Workforce adverts"
        title={`${advert.code} · ${advert.title}`}
        desc={advert.description ?? 'Workers needed for this project location.'}
        actions={<Button icon="chevL" onClick={() => navigate('/workforce-adverts')}>Back to adverts</Button>}
      />
      <Card title="Advert" action={
        <Can privilege={MANAGE.projects}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {draft && <Button tone="primary" icon="send" disabled={lines.length === 0} onClick={() => void publish()}>Publish</Button>}
            {draft && <Button tone="danger" icon="trash" onClick={() => void removeDraft()}>Delete draft</Button>}
            {published && <Button tone="danger" onClick={() => setModal('close')}>Close advert</Button>}
          </span>
        </Can>
      }>
        <div className="detail-grid detail-grid-3">
          <KV k="Status"><StatusBadge tone={draft ? 'draft' : published ? 'approved' : 'rejected'}>{draft ? 'Draft' : published ? 'Published' : 'Closed'}</StatusBadge></KV>
          <KV k="Project"><strong>{projectName}</strong></KV>
          <KV k="State"><strong>{advert.state ?? '—'}</strong></KV>
          <KV k="Required from"><strong>{fmtDate(advert.requiredFrom)}</strong></KV>
          <KV k="Required to"><strong>{advert.requiredTo ? fmtDate(advert.requiredTo) : '—'}</strong></KV>
          {advert.publishedAt && <KV k="Published"><strong>{fmtDate(advert.publishedAt)}</strong></KV>}
          {advert.closedAt && <KV k="Closed"><strong>{fmtDate(advert.closedAt)}: {advert.closedReason}</strong></KV>}
        </div>
        {draft && lines.length === 0 && <Note title="Add at least one worker line" icon="alert">A draft needs at least one worker line before it can be published.</Note>}
      </Card>

      <TablePanel
        title="Worker lines"
        subtitle={draft ? 'What the advert asks for. Lines can change while the advert is a draft.' : 'The lines as they were published.'}
        rows={lines}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Worker type', kind: 'c-sub', cell: (r) => <strong>{r.workerType}</strong>, csv: (r) => r.workerType },
          { header: 'Trade', kind: 'c-more', cell: (r) => r.trade, csv: (r) => r.trade },
          { header: 'Notes', kind: 'c-more', cell: (r) => r.notes ?? '—', csv: (r) => r.notes ?? '' },
        ]}
        searchText={(r) => `${r.workerType} ${r.trade}`}
        searchPlaceholder="Search by worker type or trade…"
        exportName="core-advert-lines"
        action={(r) => draft ? <Can privilege={MANAGE.projects}><Button size="sm" tone="danger" icon="trash" onClick={() => void removeLine(r.id)}>Remove</Button></Can> : null}
      />
      {draft && (
        <Can privilege={MANAGE.projects}>
          <div style={{ margin: '12px 0 20px' }}><Button icon="plus" onClick={() => setModal('line')}>Add worker line</Button></div>
        </Can>
      )}

      <TablePanel
        title="Responses from sub-contractors"
        subtitle="Record a response when a registered sub-contractor replies. Each one keeps its status and discussion steps."
        rows={interests}
        rowKey={(i) => i.id}
        columns={[
          { header: 'State', kind: 'c-more', cell: () => advert.state ?? '—', csv: () => advert.state ?? '' },
          { header: 'Project name', kind: 'c-more', cell: () => projectName, csv: () => projectName },
          { header: 'Interested contractor', kind: 'c-sub', cell: (i) => <strong>{nameOf(i)}</strong>, csv: (i) => nameOf(i) },
          { header: 'Status', kind: 'c-status', cell: (i) => <StatusBadge tone={i.status === 'AGREED' ? 'approved' : i.status === 'DECLINED' ? 'rejected' : 'pending'}>{LABEL[i.status]}</StatusBadge>, csv: (i) => LABEL[i.status] },
        ]}
        searchText={(i) => `${advert.state ?? ''} ${projectName} ${nameOf(i)} ${LABEL[i.status]}`}
        searchPlaceholder="Search by sub-contractor or status…"
        exportName="core-advert-responses"
        action={(i) => (
          <Can privilege={MANAGE.projects}>
            <span className="row-actions">
              <Button size="sm" onClick={() => setViewing(i)}>Details</Button>
              <Button size="sm" icon="pencil" onClick={() => setChanging(i)}>Change status</Button>
            </span>
          </Can>
        )}
      />

      <Card title="Message to registered sub-contractor" subtitle="Queued when the advert was published. Sending is not connected yet.">
        {mail.length === 0 ? (
          <Note title="No messages queued" icon="alert">Messages are queued when the advert is published, to each active sub-contractor with a mail ID.</Note>
        ) : (
          <>
            <div className="detail-grid detail-grid-3">
              <KV k="State"><strong>{advert.state ?? '—'}</strong></KV>
              <KV k="Project name"><strong>{projectName}</strong></KV>
              <KV k="Work"><strong>{advert.title}</strong></KV>
              <KV k="Start date"><strong>{fmtDate(advert.requiredFrom)}</strong></KV>
              <KV k="Status"><StatusBadge tone="pending">Queued</StatusBadge></KV>
              <KV k="Sent to"><strong>{mail.length} sub-contractors</strong></KV>
            </div>
          </>
        )}
      </Card>

      {modal === 'line' && <LineForm advertId={advert.id} onClose={() => setModal(null)} onAdded={(r) => { setLines((l) => [...l, r]); setModal(null) }} />}
      {modal === 'close' && <CloseForm advert={advert} onClose={() => setModal(null)} onClosed={(a) => { setAdvert(a); setModal(null) }} />}
      {changing && <StatusForm interest={changing} firm={nameOf(changing)} onClose={() => setChanging(null)} onSaved={(saved) => { setInterests((list) => list.map((x) => (x.id === saved.id ? saved : x))); setChanging(null) }} />}
      {viewing && <ContractorDetails details={viewing.subContractorId ? contactOf(viewing, subs) : { firmName: viewing.firmName ?? '—', contactName: viewing.contactName, mailId: viewing.mailId, phone: viewing.phone }} onClose={() => setViewing(null)} />}
    </div>
  )

  async function publish() {
    if (!advert) return
    try {
      const saved = await workforceApi.updateAdvert(advert.id, advert.rowVersion, { status: 'PUBLISHED' }, idempotencyKey())
      notify('Advert published')
      setAdvert(saved)
      reload()
    } catch (err) { notify(`Not published: ${errorText(err)}`, 6000) }
  }

  async function removeDraft() {
    if (!advert) return
    try {
      await workforceApi.deleteAdvert(advert.id)
      notify('Draft deleted')
      navigate('/workforce-adverts')
    } catch (err) { notify(`Not deleted: ${errorText(err)}`, 6000) }
  }

  async function removeLine(lineId: string) {
    try {
      await workforceApi.deleteRequirement(lineId)
      setLines((l) => l.filter((x) => x.id !== lineId))
    } catch (err) { notify(`Not removed: ${errorText(err)}`, 6000) }
  }

}

function LineForm({ advertId, onClose, onAdded }: { advertId: string; onClose: () => void; onAdded: (r: RequirementRecord) => void }) {
  const [workerType, setWorkerType] = useState('')
  const [trade, setTrade] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (!workerType.trim() || !trade.trim()) return setError('Give the worker type and the trade.')
    try {
      const saved = await workforceApi.createRequirement({ advertId, workerType: workerType.trim(), trade: trade.trim(), notes: notes.trim() || null }, idempotencyKey())
      onAdded({ ...saved, rowVersion: saved.rowVersion })
    } catch (err) { setError(errorText(err)) }
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Add worker line">
      <form noValidate onSubmit={submit}>
        {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
        <div className="form-grid">
          <FormGroup label="Worker type" required>{(id) => <Input id={id} value={workerType} onChange={(e) => setWorkerType(e.target.value)} placeholder="e.g. Mason" />}</FormGroup>
          <FormGroup label="Trade" required>{(id) => <Input id={id} value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Masonry" />}</FormGroup>
          <FormGroup label="Notes" full>{(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</FormGroup>
        </div>
        <div className="form-actions"><Button onClick={onClose}>Cancel</Button><Button tone="primary" type="submit">Add line</Button></div>
      </form>
    </Modal>
  )
}

function CloseForm({ advert, onClose, onClosed }: { advert: AdvertRecord; onClose: () => void; onClosed: (a: AdvertRecord) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!reason.trim()) return setError('Give a reason for closing the advert.')
    try {
      const saved = await workforceApi.updateAdvert(advert.id, advert.rowVersion, { status: 'CLOSED', closedReason: reason.trim() }, idempotencyKey())
      notify('Advert closed')
      onClosed(saved)
    } catch (err) { setError(errorText(err)) }
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Close advert" description="Closing keeps the responses for history. No new responses can be recorded.">
      <form noValidate onSubmit={submit}>
        {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
        <FormGroup label="Reason" required>{(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormGroup>
        <div className="form-actions"><Button onClick={onClose}>Cancel</Button><Button tone="danger" type="submit">Close advert</Button></div>
      </form>
    </Modal>
  )
}

function StatusForm({ interest, firm, onClose, onSaved }: { interest: InterestRecord; firm: string; onClose: () => void; onSaved: (i: InterestRecord) => void }) {
  const [status, setStatus] = useState<InterestStatus>(interest.status)
  const [reason, setReason] = useState(interest.reason ?? '')
  const [error, setError] = useState('')
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (NEEDS_REASON.includes(status) && !reason.trim()) return setError('Give a reason for declining or not pursuing.')
    try {
      const saved = await workforceApi.updateInterest(interest.id, interest.rowVersion, { status, reason: NEEDS_REASON.includes(status) ? reason.trim() : null }, idempotencyKey())
      notify('Status changed')
      onSaved(saved)
    } catch (err) { setError(errorText(err)) }
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Status for ${firm}`} description="The contractor sees the status when it is sent to the platform.">
      <form noValidate onSubmit={submit}>
        {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
        <div className="form-grid">
          <FormGroup label="Status" required>
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as InterestStatus)}>
                {INTEREST_STATES.map((st) => <option key={st} value={st}>{LABEL[st]}</option>)}
              </Select>
            )}
          </FormGroup>
          {NEEDS_REASON.includes(status) && (
            <FormGroup label="Reason" required full>{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormGroup>
          )}
        </div>
        <div className="form-actions"><Button onClick={onClose}>Cancel</Button><Button tone="primary" type="submit">Save status</Button></div>
      </form>
    </Modal>
  )
}

export interface ContactDetails { firmName: string; contactName: string | null; mailId: string | null; phone: string | null }

/** The contact details of a registered sub-contractor, in the shape the details dialog shows. */
function contactOf(_i: InterestRecord, subs: SubContractorRecord[]): ContactDetails {
  const sub = subs.find((x) => x.id === _i.subContractorId)
  return { firmName: sub?.firmName ?? 'Unknown sub-contractor', contactName: sub?.ownerName ?? null, mailId: sub?.mailId ?? null, phone: sub?.phone ?? null }
}

function ContractorDetails({ details, onClose }: { details: ContactDetails; onClose: () => void }) {
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={details.firmName} description="Contact details of the interested contractor.">
      <div className="detail-grid detail-grid-2">
        <KV k="Firm name"><strong>{details.firmName}</strong></KV>
        <KV k="Contact person"><strong>{details.contactName ?? '—'}</strong></KV>
        <KV k="Mail ID"><strong>{details.mailId ?? '—'}</strong></KV>
        <KV k="Phone number"><strong>{details.phone ?? '—'}</strong></KV>
      </div>
      <div className="form-actions"><Button onClick={onClose}>Close</Button></div>
    </Modal>
  )
}
