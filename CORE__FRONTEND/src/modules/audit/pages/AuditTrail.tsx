import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Who } from '@/shared/ui/Avatar'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { KV, Tabs } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { downloadText, toCsv } from '@/shared/lib/csv'
import { errorText } from '@/shared/lib/api'
import { fmtDateTime, todayISO } from '@/shared/lib/format'
import { requireStepUp } from '@/shared/lib/stepUp'
import { notify } from '@/shared/lib/toast'
import {
  AUDIT_AREAS, changeSummary, changedRows, listAudit, scopeText, snapshotRows, useCore,
  type AuditAction, type AuditFilter, type AuditEntry,
} from '@/modules/core-data'
import { SignInHistory } from '../components/SignInHistory'

/** Rows per page, sent as the limit; Previous and Next move the offset by one page. */
const PAGE = 50
/** Largest page the API returns, used when exporting every matching row. */
const EXPORT_PAGE = 200

type Applied = Omit<AuditFilter, 'limit' | 'offset'>
type Draft = { from: string; to: string; area: string; action: string; actor: string }
const NO_FILTER: Draft = { from: '', to: '', area: '', action: '', actor: '' }

/** The detail rows of one entry: the changed fields for an update, the recorded values for a create or delete. */
const detailRows = (a: AuditEntry): { field: string; value: string }[] =>
  a.action === 'Updated'
    ? changedRows(a.before, a.after).map((c) => ({ field: c.field, value: `${c.from} → ${c.to}` }))
    : snapshotRows(a.action === 'Deleted' ? a.before : a.after).map((r) => ({ field: r.field, value: r.value }))

/** A snapshot as readable text, for the export. */
const readable = (json: string) => snapshotRows(json).map((r) => `${r.field}: ${r.value}`).join('; ')

const VIEWS = ['Changes', 'Sign-in history'] as const
type View = (typeof VIEWS)[number]

/**
 * PRD §4 audit trail: who changed what and when, and (second tab) the sign-in and access history. Read-only; the
 * server writes every entry. `?view=sign-in` opens the sign-in tab, so the old /audit/access link still lands there.
 */
export default function AuditTrail() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'audit')
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'sign-in' ? 'Sign-in history' : 'Changes'
  // the export lives with the change list's filters; the list hands it up so the header button can run it
  const exportChanges = useRef<(() => Promise<void>) | null>(null)
  return (
    <div ref={ref}>
      <PageHead crumb="Audit trail" title="Audit trail"
        desc={view === 'Changes'
          ? 'A read-only record of who changed what in CORE, and when. Entries cannot be edited or deleted.'
          : 'A read-only record of sign-ins, failed attempts, lockouts, ended sessions, passkeys and refused access in CORE.'}
        actions={view === 'Changes' ? <Button tone="primary" icon="download" onClick={() => void exportChanges.current?.()}>Export all entries</Button> : undefined} />
      <div style={{ marginBottom: 16 }} data-enter>
        <Tabs label="Audit trail view" value={view} items={VIEWS}
          onChange={(v) => setParams(v === 'Sign-in history' ? { view: 'sign-in' } : {}, { replace: true })} />
      </div>
      {view === 'Changes' ? <ChangeHistory exportRef={exportChanges} /> : <SignInHistory />}
    </div>
  )
}

/** Changes to records: filters, the server-paged list, entry details and the export (run from the page header). */
function ChangeHistory({ exportRef }: { exportRef: { current: (() => Promise<void>) | null } }) {
  const { projects, sites, stores, materials, units, users, requests, grievances, tickets, departments, roles, chains } = useCore()
  const [draft, setDraft] = useState<Draft>(NO_FILTER)
  const [applied, setApplied] = useState<Applied>({})
  const [offset, setOffset] = useState(0)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [detail, setDetail] = useState<AuditEntry | null>(null)

  // one page of the server's trail for the applied filters
  useEffect(() => {
    let live = true
    listAudit({ ...applied, limit: PAGE, offset })
      .then((r) => {
        if (!live) return
        setEntries(r.entries)
        setTotal(r.total)
        setLoadError('')
      })
      .catch((err) => { if (live) setLoadError(errorText(err)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [applied, offset])

  // Records are stored by id; show the readable code people see on each screen instead.
  const codeOf = useMemo(() => {
    const m = new Map<string, string>()
    const lists: { id: string; code?: string }[][] = [
      projects, sites, stores, materials, users, requests, grievances, tickets, departments, roles,
      units.map((u) => ({ id: u.id, code: u.assetCode })),
    ]
    for (const list of lists) for (const x of list) if (x.code) m.set(x.id, x.code)
    // Approval chains have no code: label them by request type and scope, as the matrix shows them.
    for (const c of chains) m.set(c.id, `${c.requestType} · ${scopeText(c.scopeType, c.scopeIds, projects)}`)
    return m
  }, [projects, sites, stores, materials, units, users, requests, grievances, tickets, departments, roles, chains])
  const recordOf = (id: string) => codeOf.get(id) ?? id

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) return notify('From must be on or before To.')
    setLoading(true)
    setApplied({
      from: draft.from || undefined,
      to: draft.to || undefined,
      entityType: draft.area || undefined,
      action: (draft.action || undefined) as AuditAction | undefined,
      actor: draft.actor.trim() || undefined,
    })
    setOffset(0)
  }
  const clear = () => {
    setLoading(true)
    setDraft(NO_FILTER)
    setApplied({})
    setOffset(0)
  }

  const exportAll = async () => {
    // PRD §4: data export needs step-up authentication
    if (!(await requireStepUp('Export the full audit trail'))) return
    try {
      const all: AuditEntry[] = []
      for (let off = 0; ; off += EXPORT_PAGE) {
        const r = await listAudit({ ...applied, limit: EXPORT_PAGE, offset: off })
        all.push(...r.entries)
        if (all.length >= r.total || r.entries.length === 0) break
      }
      downloadText(`core-audit-trail-${todayISO()}.csv`, toCsv(['Date/Time', 'Name/Purpose', 'What', 'Area', 'Record', 'Before', 'After'], all.map((a) => [a.at, a.user, a.action, a.entity, recordOf(a.entityId), readable(a.before), readable(a.after)])))
      notify(`Audit trail exported: ${all.length} entries`)
    } catch (err) {
      notify(errorText(err))
    }
  }

  useEffect(() => {
    exportRef.current = exportAll
    return () => { exportRef.current = null }
  })

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <FormGroup label="From">{(id) => <Input id={id} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />}</FormGroup>
        <FormGroup label="To">{(id) => <Input id={id} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />}</FormGroup>
        <FormGroup label="Area">
          {(id) => (
            <Select id={id} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
              <option value="">All areas</option>
              {AUDIT_AREAS.map(([table, label]) => <option key={table} value={table}>{label}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="What">
          {(id) => (
            <Select id={id} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
              <option value="">All changes</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Person" helper="Name or login, part of either">
          {(id) => <Input id={id} placeholder="e.g. Dev User" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />}
        </FormGroup>
      </div>
      <div className="form-actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <Button onClick={clear}>Clear filters</Button>
        <Button tone="primary" onClick={apply}>Apply filters</Button>
      </div>
      {loadError && <div className="login-error" role="alert" style={{ marginBottom: 16 }}><span>The audit trail could not be read: {loadError}</span></div>}
      <TablePanel title="All changes" subtitle="Filters above are applied on the server. Search below only narrows the rows on this page. Most recent changes first." rows={entries} rowKey={(a) => a.id}
        columns={[
          { header: 'Date/Time', kind: 'c-id', cell: (a) => <strong>{fmtDateTime(a.at)}</strong>, csv: (a) => a.at },
          { header: 'Name/Purpose', kind: 'c-sub', cell: (a) => <Who name={a.user} sub={a.action} />, csv: (a) => `${a.user}: ${a.action}` },
          { header: 'Record', kind: 'c-amt', cell: (a) => recordOf(a.entityId), csv: (a) => `${a.entity} ${recordOf(a.entityId)}` },
          { header: 'Changes', kind: 'c-more', cell: (a) => <span style={{ whiteSpace: 'normal' }}>{changeSummary(a)}</span>, csv: (a) => changeSummary(a) },
          { header: 'Area', kind: 'c-status', cell: (a) => <span className="cell-pill">{a.entity}</span>, csv: (a) => a.entity },
        ]}
        action={(a) => <Button size="sm" onClick={() => setDetail(a)}>Details</Button>}
        searchText={(a) => `${a.user} ${a.action} ${a.entity} ${recordOf(a.entityId)} ${changeSummary(a)}`}
        searchPlaceholder="Search this page by person, record or change…" exportName="core-audit-trail" footNote="Export needs step-up verification" />
      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="helper">{loading ? 'Loading…' : total ? `Showing ${from}–${to} of ${total}` : 'No entries match these filters.'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button disabled={loading || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - PAGE)) }}>Previous</Button>
          <Button disabled={loading || offset + PAGE >= total} onClick={() => { setLoading(true); setOffset(offset + PAGE) }}>Next</Button>
        </span>
      </div>
      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title="Audit entry" description={detail ? `${detail.action} · ${detail.entity}` : undefined} size="wide">
        {detail && <>
          <div className="detail-grid detail-grid-4">
            <KV k="Date/Time"><strong>{fmtDateTime(detail.at)}</strong></KV>
            <KV k="Person"><strong>{detail.user}</strong></KV>
            <KV k="What"><strong>{detail.action}</strong></KV>
            <KV k="Area"><strong>{detail.entity}</strong></KV>
            <KV k="Record"><strong>{recordOf(detail.entityId)}</strong></KV>
          </div>
          <h3 style={{ margin: '18px 0 8px' }}>{detail.action === 'Updated' ? 'Changed fields' : detail.action === 'Deleted' ? 'Values removed' : 'Values recorded'}</h3>
          {detailRows(detail).length
            ? <div className="detail-grid detail-grid-4">{detailRows(detail).map((r) => <KV key={r.field} k={r.field}><strong>{r.value}</strong></KV>)}</div>
            : <p className="helper">No field changes were recorded.</p>}
          <div className="form-actions"><Button onClick={() => setDetail(null)}>Close</Button></div>
        </>}
      </Modal>
    </div>
  )
}
