import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { KV, Note } from '@/shared/ui/Extras'
import { FormGroup, Select } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { errorText } from '@/shared/lib/api'
import { fmtDateTime } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { integrationApi, type EventDirection, type EventState, type EventStatusApi, type IntegrationEvent } from '@/modules/core-data'

const PAGE = 50
const TONE: Record<EventState, 'pending' | 'approved' | 'rejected' | 'review' | 'draft'> = {
  Queued: 'draft', Retrying: 'pending', Sent: 'approved', Received: 'review', Processed: 'approved', 'Dead-letter': 'rejected',
}
const STATUS_OPTIONS: Array<[EventStatusApi, string]> = [
  ['pending', 'Queued or retrying'], ['published', 'Sent'], ['received', 'Received'], ['processed', 'Processed'], ['dead_lettered', 'Dead-letter'],
]

const MODULES: Record<string, string> = { core: 'CORE', hrms: 'HRMS', pm: 'P&M', pms: 'PMS', stores: 'Stores' }
const moduleName = (m: string | null) => (m ? MODULES[m] ?? m.toUpperCase() : 'Unknown module')
/** "employeeCode" or "stock_receipt" as plain words: "Employee code", "Stock receipt". */
const words = (key: string) => {
  const t = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
/** "employee.updated" as "Employee updated". */
const eventTitle = (e: IntegrationEvent) => {
  const [what, did] = e.eventType.split('.')
  return `${words(what ?? e.eventType)}${did ? ` ${words(did).toLowerCase()}` : ''}`
}
/** One sentence that says what the event is and what happened to it. */
const eventSentence = (e: IntegrationEvent, state: EventState) => {
  const title = eventTitle(e)
  if (e.direction === 'inbound') {
    const from = moduleName(e.sourceModule)
    if (state === 'Processed') return e.lastError?.startsWith('Stale') ? `${from} sent "${title}". CORE already held a newer version of this record, so nothing was changed.` : `${from} sent "${title}". CORE applied it to its copy of the record.`
    if (state === 'Dead-letter') return `${from} sent "${title}", but CORE could not apply it and stopped trying. You can replay it once the cause is fixed.`
    return `${from} sent "${title}". CORE has received it and will apply it to its copy of the record.`
  }
  if (state === 'Sent') return `CORE sent "${title}" to the other modules and it was delivered.`
  if (state === 'Dead-letter') return `CORE could not deliver "${title}" and stopped trying. You can replay it once the cause is fixed.`
  if (state === 'Retrying') return `CORE tried to send "${title}", it did not go through, and it will try again.`
  return `"${title}" is waiting to be sent to the other modules. Nothing has been sent yet.`
}
/** A short plain reading of the error text the server stored. */
const errorMeaning = (err: string) => err.startsWith('Stale') ? 'Ignored as out of date: CORE already holds this or a newer version of the record.' : err
/** The exact time, in UTC, for a tooltip next to the local time. */
const utc = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

/**
 * CORE-23-02 and 23-03: the outbox and inbox, for the Core administrator. Each event shows a state that is only
 * what the server has recorded (queued, retrying, sent, received, processed or dead-letter), never a guess. Payload
 * values are not shown, only their field names. A dead-lettered event can be replayed; the screen reports success only
 * after the server confirms it.
 */
export default function EventMonitor({ embedded = false }: { embedded?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'event-monitor')
  const [direction, setDirection] = useState<EventDirection | ''>('')
  const [status, setStatus] = useState<EventStatusApi | ''>('')
  const [offset, setOffset] = useState(0)
  const [events, setEvents] = useState<IntegrationEvent[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof integrationApi.eventSummary>> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [loadedAt, setLoadedAt] = useState('')
  const [tick, setTick] = useState(0)
  const [detail, setDetail] = useState<IntegrationEvent | null>(null)
  const [replaying, setReplaying] = useState<IntegrationEvent | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([
      integrationApi.listEvents({ direction: direction || undefined, status: status || undefined, limit: PAGE, offset }),
      integrationApi.eventSummary(),
    ]).then(
      ([list, sum]) => {
        if (!live) return
        setEvents(list.events)
        setTotal(list.total)
        setSummary(sum)
        setLoadedAt(new Date().toISOString())
        setState('ready')
      },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [direction, status, offset, tick])

  const refresh = () => { setState('loading'); setTick((t) => t + 1) }
  const count = (st: EventStatusApi, dir?: EventDirection) =>
    summary?.counts.filter((c) => c.status === st && (!dir || c.direction === dir)).reduce((n, c) => n + c.count, 0) ?? 0

  const replay = async () => {
    if (!replaying) return
    setBusy(true)
    try {
      const updated = await integrationApi.replayEvent(replaying.id)
      setEvents((list) => list.map((e) => (e.id === updated.id ? updated : e)))
      notify(`${replaying.eventType} queued again. It is sent when its turn comes.`)
      setReplaying(null)
      refresh()
    } catch (err) {
      notify(`Not replayed: ${errorText(err)}`, 6000)
    } finally {
      setBusy(false)
    }
  }

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div ref={ref}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 16px' }}>
            <p className="helper" style={{ margin: 0 }}>Messages CORE sends to and receives from the other modules (HRMS, P&M, PMS and Stores): waiting, sent, received and failed.</p>
            <Button tone="primary" icon="refresh" onClick={refresh} disabled={state === 'loading'}>Refresh</Button>
          </div>
        : <PageHead crumb="Data exchange log" title="Data exchange log"
            desc="Messages CORE sends to and receives from the other modules: what is waiting, sent, received and failed."
            actions={<Button tone="primary" icon="refresh" onClick={refresh} disabled={state === 'loading'}>Refresh</Button>} />}
      <div className="grid stats">
        <StatTile label="Waiting to send" value={count('pending', 'outbound')} icon="clock" tone="gold" />
        <StatTile label="Sent" value={count('published')} icon="checkc" tone="green" />
        <StatTile label="Received" value={count('received') + count('processed')} icon="download" tone="blue" />
        <StatTile label="Dead-letter" value={summary?.deadLettered ?? 0} icon="alert" tone="rose" />
      </div>
      <Note title="Event transport not chosen yet" icon="info">
        Outbound events are stored safely and wait until the transport to the other modules is decided and configured. Until then they stay queued; nothing is lost.
        {summary?.oldestPendingAt && <> The oldest has waited since <span title={utc(summary.oldestPendingAt)}>{fmtDateTime(summary.oldestPendingAt)}</span>.</>}
      </Note>
      {state === 'error' && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <span>The events could not be loaded: {loadError}. {loadedAt && 'The figures shown may be out of date.'}</span>
        </div>
      )}
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <FormGroup label="Direction">
          {(id) => (
            <Select id={id} name="direction" value={direction} onChange={(e) => { setOffset(0); setState('loading'); setDirection(e.target.value as EventDirection | '') }}>
              <option value="">Both</option>
              <option value="outbound">Sent by Core</option>
              <option value="inbound">Received by Core</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup label="State">
          {(id) => (
            <Select id={id} name="status" value={status} onChange={(e) => { setOffset(0); setState('loading'); setStatus(e.target.value as EventStatusApi | '') }}>
              <option value="">All states</option>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <TablePanel
        title="Events"
        subtitle={loadedAt ? `Newest first. Filters are applied on the server. Read at ${fmtDateTime(loadedAt)}.` : 'Newest first.'}
        rows={events}
        rowKey={(e) => e.id}
        columns={[
          { header: 'Created', kind: 'c-id', cell: (e) => <span title={utc(e.createdAt)}>{fmtDateTime(e.createdAt)}</span>, csv: (e) => e.createdAt },
          { header: 'Event', kind: 'c-sub', cell: (e) => <span><strong>{e.eventType}</strong><span className="sub">{e.direction === 'outbound' ? 'Sent by Core' : `From ${integrationApi.MODULE_LABEL[e.sourceModule ?? ''] ?? e.sourceModule}`}</span></span>, csv: (e) => e.eventType },
          { header: 'Record', kind: 'c-more', cell: (e) => <span style={{ whiteSpace: 'normal' }}>{e.aggregateType} · #{e.aggregateSeq ?? '—'}</span>, csv: (e) => `${e.aggregateType} ${e.aggregateId} #${e.aggregateSeq ?? ''}` },
          {
            header: 'Attempts', kind: 'c-more',
            cell: (e) => (
              <span style={{ whiteSpace: 'normal' }}>
                {e.attempts}
                {e.nextAttemptAt && e.status === 'pending' && e.attempts > 0 && <span className="sub">Next try {fmtDateTime(e.nextAttemptAt)}</span>}
                {e.lastError && <span className="sub warn-text">{e.lastError}</span>}
              </span>
            ),
            csv: (e) => `${e.attempts} ${e.lastError ?? ''}`.trim(),
          },
          { header: 'State', kind: 'c-status', cell: (e) => { const s = integrationApi.eventState(e); return <StatusBadge tone={TONE[s]}>{s}{e.replayStatus === 'requested' ? ' (replay)' : ''}</StatusBadge> }, csv: (e) => integrationApi.eventState(e) },
        ]}
        action={(e) => (
          <span className="row-actions">
            <Button size="sm" onClick={() => setDetail(e)}>Details</Button>
            {e.status === 'dead_lettered' && <Button size="sm" icon="refresh" onClick={() => setReplaying(e)}>Replay</Button>}
          </span>
        )}
        searchText={(e) => `${e.eventType} ${e.aggregateType} ${e.aggregateId} ${e.lastError ?? ''}`}
        searchPlaceholder="Search this page by event, record or error…"
        exportName="core-integration-events"
      />
      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="helper">{state === 'loading' ? 'Loading…' : total ? `Showing ${from}–${to} of ${total}` : 'No events match these filters.'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button disabled={state === 'loading' || offset === 0} onClick={() => { setState('loading'); setOffset(Math.max(0, offset - PAGE)) }}>Previous</Button>
          <Button disabled={state === 'loading' || offset + PAGE >= total} onClick={() => { setState('loading'); setOffset(offset + PAGE) }}>Next</Button>
        </span>
      </div>
      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title="Event details" description={detail ? eventTitle(detail) : undefined} size="wide">
        {detail && (() => {
          const state = integrationApi.eventState(detail)
          const done = detail.publishedAt ?? detail.processedAt
          return <>
            <p style={{ marginTop: 0 }}>{eventSentence(detail, state)}</p>
            <div className="detail-grid detail-grid-4">
              <KV k="State"><StatusBadge tone={TONE[state]}>{state}</StatusBadge></KV>
              <KV k="Direction"><strong>{detail.direction === 'outbound' ? 'Sent by CORE' : 'Received by CORE'}</strong></KV>
              <KV k={detail.direction === 'outbound' ? 'Sent to' : 'Received from'}><strong>{detail.direction === 'outbound' ? 'Other modules' : moduleName(detail.sourceModule)}</strong></KV>
              <KV k="Record type"><strong>{words(detail.aggregateType)}</strong></KV>
              <KV k="Happened at"><strong title={detail.occurredAt ? utc(detail.occurredAt) : undefined}>{detail.occurredAt ? fmtDateTime(detail.occurredAt) : '—'}</strong></KV>
              <KV k={detail.direction === 'outbound' ? 'Sent at' : 'Processed at'}><strong>{done ? fmtDateTime(done) : 'Not yet'}</strong></KV>
              <KV k="Attempts"><strong>{detail.attempts}</strong></KV>
              <KV k="Version of the record"><strong>{detail.aggregateSeq != null ? `Change no. ${detail.aggregateSeq}` : '—'}</strong></KV>
              {detail.nextAttemptAt && state !== 'Dead-letter' && detail.status === 'pending' && <KV k="Next attempt"><strong>{fmtDateTime(detail.nextAttemptAt)}</strong></KV>}
              {detail.deadLetteredAt && <KV k="Gave up at"><strong>{fmtDateTime(detail.deadLetteredAt)}</strong></KV>}
              {detail.replayStatus && <KV k="Replay"><strong>{detail.replayStatus === 'requested' ? 'Requested, waiting' : 'Replayed'}</strong></KV>}
              <KV k="Problem" full><strong>{detail.lastError ? errorMeaning(detail.lastError) : 'None'}</strong></KV>
              <KV k="Data carried" full><span>{detail.payloadKeys.length ? detail.payloadKeys.map(words).join(', ') : 'None'}</span> <span className="helper">The values are kept private and are not shown here.</span></KV>
            </div>
            <div className="form-actions"><Button onClick={() => setDetail(null)}>Close</Button></div>
          </>
        })()}
      </Modal>
      <Modal open={!!replaying} onOpenChange={(o) => !o && !busy && setReplaying(null)} title="Replay this event?">
        {replaying && <>
          <p style={{ marginTop: 0 }}>
            <strong>{replaying.eventType}</strong> goes back into the queue with its attempts reset. It is sent in its record's order, so later events of the same record follow it. The replay is recorded in the audit trail.
          </p>
          <div className="form-actions">
            <Button onClick={() => setReplaying(null)} disabled={busy}>Cancel</Button>
            <Button tone="primary" icon="refresh" disabled={busy} onClick={() => void replay()}>{busy ? 'Replaying…' : 'Replay event'}</Button>
          </div>
        </>}
      </Modal>
    </div>
  )
}
