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
  AUDIT_AREAS, AUDIT_MODULES, auditModuleLabel, changeSummary, changedRows, listAudit, scopeText, snapshotRows, useCore,
  type AuditAction, type AuditFilter, type AuditEntry,
} from '@/modules/core-data'
import { SignInHistory } from '../components/SignInHistory'
import { EventMonitor, ReadModels } from '@/modules/integrations'

/** Rows per page, sent as the limit; Previous and Next move the offset by one page. */
const PAGE = 50
/** Largest page the API returns, used when exporting every matching row. */
const EXPORT_PAGE = 200

type Applied = Omit<AuditFilter, 'limit' | 'offset'>
type Draft = { from: string; to: string; module: string; area: string; action: string; actor: string }
const NO_FILTER: Draft = { from: '', to: '', module: '', area: '', action: '', actor: '' }

/** The detail rows of one entry: the changed fields for an update, the recorded values for a create or delete. */
const detailRows = (a: AuditEntry): { field: string; value: string }[] =>
  a.action === 'Updated'
    ? changedRows(a.before, a.after).map((c) => ({ field: c.field, value: `${c.from} → ${c.to}` }))
    : snapshotRows(a.action === 'Deleted' ? a.before : a.after).map((r) => ({ field: r.field, value: r.value }))

/** A snapshot as readable text, for the export. */
const readable = (json: string) => snapshotRows(json).map((r) => `${r.field}: ${r.value}`).join('; ')

const parseSnapshot = (json: string): Record<string, unknown> | null => {
  try { const o: unknown = JSON.parse(json); return o && typeof o === 'object' ? (o as Record<string, unknown>) : null } catch { return null }
}
const VIEWS = ['Activity', 'Sign-ins', 'Data exchange log', 'Shared records'] as const
type View = (typeof VIEWS)[number]
/** The address parameter that opens each tab (the old sign-in, events and read-model links use these). */
const VIEW_PARAM: Record<View, string> = { Activity: '', 'Sign-ins': 'sign-in', 'Data exchange log': 'messages', 'Shared records': 'data' }
const DESC: Record<View, string> = {
  Activity: 'What people did in CORE and in the other modules (HRMS, P&M, PCM, Stores): who did what, and when. Entries cannot be edited or deleted.',
  'Sign-ins': 'Sign-ins, failed attempts, lockouts, ended sessions, passkeys and refused access in CORE and in the other modules.',
  'Data exchange log': 'Messages CORE sends to and receives from HRMS, P&M, PCM and Stores: what is waiting, sent, received or failed.',
  'Shared records': 'The latest copy CORE holds of records owned by HRMS, P&M, PCM and Stores.',
}

/**
 * The activity log: everything that happened in and around CORE, on one screen with four tabs. Changes (who changed what),
 * Sign-ins, Data exchange log (the event monitor) and Shared records (the read models). Read-only; the server writes every
 * entry. `?view=sign-in`, `?view=messages` and `?view=data` open the matching tab, so the older addresses still land there.
 */
export default function AuditTrail() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'audit')
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.find((v) => VIEW_PARAM[v] && VIEW_PARAM[v] === params.get('view')) ?? 'Activity'
  // the export lives with the change list's filters; the list hands it up so the header button can run it
  const exportChanges = useRef<(() => Promise<void>) | null>(null)
  return (
    <div ref={ref}>
      <PageHead crumb="Activity log" title="Activity log" desc={DESC[view]}
        actions={view === 'Activity' ? <Button tone="primary" icon="download" onClick={() => void exportChanges.current?.()}>Download all entries</Button> : undefined} />
      <div style={{ marginBottom: 16 }} data-enter>
        <Tabs label="Activity log view" value={view} items={VIEWS}
          onChange={(v) => setParams(VIEW_PARAM[v] ? { view: VIEW_PARAM[v] } : {}, { replace: true })} />
      </div>
      {view === 'Activity' && <ChangeHistory exportRef={exportChanges} />}
      {view === 'Sign-ins' && <SignInHistory />}
      {view === 'Data exchange log' && <EventMonitor embedded />}
      {view === 'Shared records' && <ReadModels embedded />}
    </div>
  )
}

/** Changes to records: filters, the server-paged list, entry details and the export (run from the page header). */
function ChangeHistory({ exportRef }: { exportRef: { current: (() => Promise<void>) | null } }) {
  const { projects, sites, stores, materials, units, users, requests, grievances, tickets, departments, roles, chains, equipmentTypes, planLines, peoplePlan } = useCore()
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

  // Records are stored by id. Show what a person would call the record: its code and name, or a short description.
  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    const named: { id: string; code?: string; name?: string }[][] = [projects, sites, stores, materials, departments, roles, equipmentTypes]
    for (const list of named) for (const x of list) { const t = [x.code, x.name].filter(Boolean).join(' · '); if (t) m.set(x.id, t) }
    for (const u of users) m.set(u.id, u.name || u.id)
    for (const u of units) m.set(u.id, [u.assetCode, u.name].filter(Boolean).join(' · '))
    for (const x of [...grievances, ...tickets]) if (x.code) m.set(x.id, x.code)
    for (const x of requests) if (x.code) m.set(x.id, x.code)
    for (const c of chains) m.set(c.id, `${c.requestType} · ${scopeText(c.scopeType, c.scopeIds, projects)}`)
    const projectName = (id: string) => projects.find((p) => p.id === id)?.name
    for (const l of planLines) m.set(l.id, `${l.equipmentType} × ${l.plannedQty}${projectName(l.projectId) ? ` · ${projectName(l.projectId)}` : ''}`)
    for (const l of peoplePlan) m.set(l.id, `${l.role} × ${l.headcount}${projectName(l.projectId) ? ` · ${projectName(l.projectId)}` : ''}`)
    return m
  }, [projects, sites, stores, materials, units, users, requests, grievances, tickets, departments, roles, chains, equipmentTypes, planLines, peoplePlan])
  /** A record that is gone from the lists (for example a deleted one) is described from the values the change stored. */
  const describe = (a: AuditEntry): string => {
    const o = parseSnapshot(a.after) ?? parseSnapshot(a.before)
    if (!o) return ''
    const str = (k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : '')
    if (a.entity === 'Plan line') {
      const what = str('role') || equipmentTypes.find((t) => t.id === o.equipment_type_id)?.name || materials.find((x) => x.id === o.material_id)?.name || 'Plan line'
      const project = projects.find((p) => p.id === o.project_id)?.name
      return `${what}${o.quantity != null ? ` × ${Number(o.quantity)}` : ''}${project ? ` · ${project}` : ''}`
    }
    const code = str('asset_code') || str('code')
    const name = str('name') || str('full_name') || str('title') || str('subject') || str('task') || str('label')
    return [code, name].filter(Boolean).join(' · ') || str('email') || str('login_id')
  }
  const recordOf = (a: AuditEntry) => (a.module ?? 'core') !== 'core' ? (a.entityId && a.entityId !== '-' ? a.entityId : a.entity) : labelOf.get(a.entityId) ?? (describe(a) || `${a.entity} (ref ${a.entityId.slice(0, 8)})`)

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) return notify('From must be on or before To.')
    setLoading(true)
    setApplied({
      from: draft.from || undefined,
      to: draft.to || undefined,
      module: draft.module || undefined,
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
      downloadText(`core-audit-trail-${todayISO()}.csv`, toCsv(['Date/Time', 'Name/Purpose', 'What', 'Area', 'Record', 'Before', 'After'], all.map((a) => [a.at, a.user, a.action, a.entity, recordOf(a), readable(a.before), readable(a.after)])))
      notify(`Activity log exported: ${all.length} entries`)
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
      <div className="filter-bar">
        <FormGroup label="From">{(id) => <Input id={id} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />}</FormGroup>
        <FormGroup label="To">{(id) => <Input id={id} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />}</FormGroup>
        <FormGroup label="Module">
          {(id) => (
            <Select id={id} value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })}>
              <option value="">All modules</option>
              {AUDIT_MODULES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          )}
        </FormGroup>
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
              <option value="">All actions</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Person">
          {(id) => <Input id={id} placeholder="Name or login" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />}
        </FormGroup>
        <div className="filter-actions">
        <Button onClick={clear}>Clear filters</Button>
        <Button tone="primary" onClick={apply}>Apply filters</Button>
      </div>
      </div>
      {loadError && <div className="login-error" role="alert" style={{ marginBottom: 16 }}><span>The audit trail could not be read: {loadError}</span></div>}
      <TablePanel title="All activity" subtitle="Filters above are applied on the server. Search below only narrows the rows on this page. Most recent changes first." rows={entries} rowKey={(a) => a.id} className="fit-table audit-table"
        columns={[
          { header: 'Date/Time', kind: 'c-sub', cell: (a) => { const [day, time] = fmtDateTime(a.at).split(' · '); return <span style={{ whiteSpace: 'nowrap' }}><strong>{day}</strong><span className="sub">{time ?? ''}</span></span> }, csv: (a) => a.at },
          { header: 'Module', kind: 'c-status', cell: (a) => <span className="cell-pill">{auditModuleLabel(a.module ?? 'core')}</span>, csv: (a) => auditModuleLabel(a.module ?? 'core') },
          { header: 'Changed by', kind: 'c-sub', cell: (a) => <Who name={a.user} sub={a.action} />, csv: (a) => `${a.user}: ${a.action}` },
          { header: 'Record', kind: 'c-sub', cell: (a) => <strong style={{ whiteSpace: 'normal' }}>{recordOf(a)}</strong>, csv: (a) => `${a.entity} ${recordOf(a)}` },
          { header: 'What happened', kind: 'c-more', cell: (a) => <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{changeSummary(a)}</span>, csv: (a) => changeSummary(a) },
          { header: 'Area', kind: 'c-status', cell: (a) => <span className="cell-pill">{a.entity}</span>, csv: (a) => a.entity },
        ]}
        action={(a) => <Button size="sm" onClick={() => setDetail(a)}>Details</Button>}
        searchText={(a) => `${a.user} ${a.action} ${a.entity} ${recordOf(a)} ${changeSummary(a)}`}
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
            <KV k="Record"><strong>{recordOf(detail)}</strong></KV>
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
