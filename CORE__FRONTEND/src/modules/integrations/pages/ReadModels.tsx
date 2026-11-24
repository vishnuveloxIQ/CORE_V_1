import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { MiniTable, Note } from '@/shared/ui/Extras'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { Card } from '@/shared/ui/Card'
import { StatusBadge } from '@/shared/ui/Status'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { errorText } from '@/shared/lib/api'
import { ago, fmtDateTime } from '@/shared/lib/format'
import { integrationApi, type RefRecord, type SyncStatus } from '@/modules/core-data'

const PAGE = 50
const utc = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
/** A short readable summary of a record: its first few fields, values shortened. */
const preview = (data: Record<string, unknown>) =>
  Object.entries(data).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : String(v).slice(0, 40)}`).join(' · ') || '—'

/**
 * CORE-24-01 and 24-02: Core's copies of other modules' records (read models), with the sequence and time each was
 * last synced. Search and paging run on the server; the filters live in the address, so going to another page and
 * back keeps them. Whether a copy is stale is not judged here: the freshness threshold is an open owner decision (D16),
 * so the screen shows the last sync time and leaves the judgement to the reader.
 */
export default function ReadModels({ embedded = false }: { embedded?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'read-models')
  const [params, setParams] = useSearchParams()
  const sourceModule = params.get('module') ?? ''
  const q = params.get('q') ?? ''
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const [search, setSearch] = useState(q)
  const [records, setRecords] = useState<RefRecord[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<SyncStatus[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([
      integrationApi.listRefRecords({ sourceModule: sourceModule || undefined, q: q || undefined, limit: PAGE, offset }),
      integrationApi.syncStatus(),
    ]).then(
      ([list, sync]) => { if (live) { setRecords(list.records); setTotal(list.total); setStatus(sync); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [sourceModule, q, offset])

  const setFilter = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    if (!('offset' in next)) p.delete('offset')
    setState('loading')
    setParams(p, { replace: true })
  }
  // an offset past the end (an old link, or rows removed meanwhile) offers the way back to the first page
  const pastEnd = state === 'ready' && total > 0 && offset >= total

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div ref={ref}>
      {embedded
        ? <p className="helper" style={{ margin: '0 0 16px' }}>The latest copy CORE holds of records owned by HRMS, P&M, PMS and Stores, kept up to date from their messages.</p>
        : <PageHead crumb="Shared records" title="Shared records" desc="The latest copy CORE holds of records owned by HRMS, P&M, PMS and Stores, kept up to date from their messages." />}
      <Card title="Sync by module" subtitle="How many records Core holds and when each kind last changed. Local time; hover for UTC.">
        <MiniTable label="Sync by module" head={['Module', 'Record type', 'Records', 'Last sequence', 'Last synced']} empty="No records have been received from the other modules yet."
          rows={status.map((s) => [
            integrationApi.MODULE_LABEL[s.sourceModule] ?? s.sourceModule, s.entityType, s.records, `#${s.lastSeq}`,
            <span key="t" title={utc(s.lastSyncedAt)}>{fmtDateTime(s.lastSyncedAt)} <span className="helper">({ago(s.lastSyncedAt)})</span></span>,
          ])} />
        <Note title="When is a copy stale?" icon="info">
          Not decided yet: the freshness threshold is an open owner decision. The last sync time is shown so you can judge it; Core does not mark copies as stale.
        </Note>
      </Card>
      {state === 'error' && <div className="login-error" role="alert" style={{ margin: '16px 0' }}><span>The shared records could not be loaded: {loadError}</span></div>}
      <div className="form-grid" style={{ margin: '16px 0 12px' }}>
        <FormGroup label="Module">
          {(id) => (
            <Select id={id} name="module" value={sourceModule} onChange={(e) => setFilter({ module: e.target.value })}>
              <option value="">All modules</option>
              {['hrms', 'pm', 'pms', 'stores'].map((m) => <option key={m} value={m}>{integrationApi.MODULE_LABEL[m]}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Search records" helper="Searches every field of the copies, on the server.">
          {(id) => (
            <form onSubmit={(e) => { e.preventDefault(); setFilter({ q: search.trim() }) }} style={{ display: 'flex', gap: 8 }}>
              <Input id={id} name="q" value={search} placeholder="e.g. a name or code" onChange={(e) => setSearch(e.target.value)} />
              <Button type="submit">Search</Button>
            </form>
          )}
        </FormGroup>
      </div>
      <TablePanel
        title="Records"
        subtitle="Most recently synced first."
        rows={records}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Record', kind: 'c-sub', cell: (r) => <span><strong>{r.entityType}</strong><span className="sub">{integrationApi.MODULE_LABEL[r.sourceModule]} · <code>{r.sourceId}</code></span></span>, csv: (r) => `${r.sourceModule} ${r.entityType} ${r.sourceId}` },
          { header: 'Fields', kind: 'c-more', cell: (r) => <span style={{ whiteSpace: 'normal' }}>{preview(r.data)}</span>, csv: (r) => JSON.stringify(r.data) },
          { header: 'Sequence', kind: 'c-amt', cell: (r) => `#${r.sourceSeq}`, csv: (r) => String(r.sourceSeq) },
          { header: 'Last synced', kind: 'c-more', cell: (r) => <span title={utc(r.syncedAt)}>{fmtDateTime(r.syncedAt)}</span>, csv: (r) => r.syncedAt },
          { header: 'State', kind: 'c-status', cell: (r) => <StatusBadge tone={r.deleted ? 'draft' : 'approved'}>{r.deleted ? 'Deleted at source' : 'Current'}</StatusBadge>, csv: (r) => (r.deleted ? 'Deleted' : 'Current') },
        ]}
        searchText={(r) => `${r.entityType} ${r.sourceId} ${preview(r.data)}`}
        searchPlaceholder="Narrow this page…"
        exportName="core-read-models"
      />
      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="helper" aria-live="polite">
          {pastEnd ? <>This page is past the last record. <Button size="sm" onClick={() => setFilter({ offset: '' })}>First page</Button></>
            : state === 'loading' ? 'Loading…' : total ? `Showing ${from}–${to} of ${total}` : q ? `No records match “${q}”.` : 'No records yet.'}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button disabled={state === 'loading' || offset === 0} onClick={() => setFilter({ offset: String(Math.max(0, offset - PAGE)) })}>Previous</Button>
          <Button disabled={state === 'loading' || offset + PAGE >= total} onClick={() => setFilter({ offset: String(offset + PAGE) })}>Next</Button>
        </span>
      </div>
    </div>
  )
}
