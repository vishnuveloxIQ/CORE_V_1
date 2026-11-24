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
/** The exact time, in UTC, for a tooltip next to the local time. */
const utc = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

/**
 * CORE-23-02 and 23-03: the outbox and inbox, for the Core administrator. Each event shows a state that is only
 * what the server has recorded (queued, retrying, sent, received, processed or dead-letter), never a guess. Payload
 * values are not shown, only their field names. A dead-lettered event can be replayed; the screen reports success only
 * after the server confirms it.
 */
export default function EventMonitor() {
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
      <PageHead crumb="Event monitor" title="Event monitor"
        desc="Events Core sends to and receives from the other modules: what is queued, sent, failing and dead-lettered."
        actions={<Button tone="primary" icon="refresh" onClick={refresh} disabled={state === 'loading'}>Refresh</Button>} />
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
      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title="Event details" description={detail?.eventType} size="wide">
        {detail && <>
          <div className="detail-grid detail-grid-4">
            <KV k="State"><StatusBadge tone={TONE[integrationApi.eventState(detail)]}>{integrationApi.eventState(detail)}</StatusBadge></KV>
            <KV k="Event ID"><code>{detail.eventId}</code></KV>
            <KV k="Record"><strong>{detail.aggregateType}</strong> <code>{detail.aggregateId}</code></KV>
            <KV k="Sequence"><strong>#{detail.aggregateSeq ?? '—'}</strong></KV>
            <KV k="Created"><strong title={utc(detail.createdAt)}>{fmtDateTime(detail.createdAt)}</strong></KV>
            <KV k={detail.direction === 'outbound' ? 'Sent' : 'Processed'}><strong>{(detail.publishedAt ?? detail.processedAt) ? fmtDateTime((detail.publishedAt ?? detail.processedAt)!) : 'Not yet'}</strong></KV>
            <KV k="Correlation ID"><code>{detail.correlationId ?? '—'}</code></KV>
            <KV k="Attempts"><strong>{detail.attempts}</strong></KV>
            <KV k="Last error" full><strong>{detail.lastError ?? 'None'}</strong></KV>
            <KV k="Payload fields" full><span>{detail.payloadKeys.length ? detail.payloadKeys.join(', ') : 'None'}</span> <span className="helper">Values are not shown here.</span></KV>
          </div>
          <div className="form-actions"><Button onClick={() => setDetail(null)}>Close</Button></div>
        </>}
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
