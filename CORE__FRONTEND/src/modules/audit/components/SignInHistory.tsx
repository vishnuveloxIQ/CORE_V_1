import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/Status'
import { errorText } from '@/shared/lib/api'
import { fmtDateTime } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import {
  AUDIT_MODULES, AUTH_EVENT_WARNINGS, AUTH_EVENTS, auditModuleLabel, authEventLabel, listAuthEvents,
  type AuthEvent, type AuthEventFilter, type AuthEventType,
} from '@/modules/core-data'

/** Rows per page, sent as the limit; Previous and Next move the offset by one page. */
const PAGE = 50

type Applied = Omit<AuthEventFilter, 'limit' | 'offset'>
type Draft = { from: string; to: string; module: string; eventType: string; actor: string }
const NO_FILTER: Draft = { from: '', to: '', module: '', eventType: '', actor: '' }

/**
 * CORE-19-02: the sign-in and access history (GET /audit-log/auth-events), shown as a tab of the audit trail.
 * Read-only, for holders of access.manage: sign-ins, failures, lockouts, sessions ended, passkeys, identity checks and
 * refused access, newest first.
 */
export function SignInHistory() {
  const [draft, setDraft] = useState<Draft>(NO_FILTER)
  const [applied, setApplied] = useState<Applied>({})
  const [offset, setOffset] = useState(0)
  const [events, setEvents] = useState<AuthEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let live = true
    listAuthEvents({ ...applied, limit: PAGE, offset })
      .then((r) => {
        if (!live) return
        setEvents(r.events)
        setTotal(r.total)
        setLoadError('')
      })
      .catch((err) => { if (live) setLoadError(errorText(err)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [applied, offset])

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) return notify('From must be on or before To.')
    setLoading(true)
    setApplied({
      from: draft.from || undefined,
      to: draft.to || undefined,
      module: draft.module || undefined,
      eventType: (draft.eventType || undefined) as AuthEventType | undefined,
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

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)
  const who = (e: AuthEvent) => e.user ?? (e.loginId ? e.loginId : 'Unknown login')

  return (
    <div>
      <div className="filter-bar">
        <FormGroup label="From">{(id) => <Input id={id} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />}</FormGroup>
        <FormGroup label="To">{(id) => <Input id={id} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />}</FormGroup>
        <FormGroup label="Module">
          {(id) => (
            <Select id={id} name="module" value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })}>
              <option value="">All modules</option>
              {AUDIT_MODULES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Event">
          {(id) => (
            <Select id={id} name="eventType" value={draft.eventType} onChange={(e) => setDraft({ ...draft, eventType: e.target.value })}>
              <option value="">All events</option>
              {AUTH_EVENTS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Person">
          {(id) => <Input id={id} name="actor" placeholder="Name or login" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />}
        </FormGroup>
        <div className="filter-actions">
        <Button onClick={clear}>Clear filters</Button>
        <Button tone="primary" onClick={apply}>Apply filters</Button>
      </div>
      </div>
      {loadError && <div className="login-error" role="alert" style={{ marginBottom: 16 }}><span>The sign-in history could not be read: {loadError}</span></div>}
      <TablePanel title="Sign-in and access events" subtitle="Filters above are applied on the server. Search below only narrows the rows on this page. Most recent events first."
        rows={events} rowKey={(e) => e.id}
        columns={[
          { header: 'Date/Time', kind: 'c-id', cell: (e) => <strong>{e.at ? fmtDateTime(e.at) : '—'}</strong>, csv: (e) => e.at ?? '' },
          { header: 'Module', kind: 'c-more', cell: (e) => <span className="cell-pill">{auditModuleLabel(e.module ?? 'core')}</span>, csv: (e) => auditModuleLabel(e.module ?? 'core') },
          { header: 'Person', kind: 'c-sub', cell: (e) => <span>{who(e)}{e.user && e.loginId && e.user !== e.loginId ? <span className="helper" style={{ display: 'block' }}>{e.loginId}</span> : null}</span>, csv: (e) => who(e) },
          {
            header: 'Event', kind: 'c-status',
            cell: (e) => <StatusBadge tone={AUTH_EVENT_WARNINGS.has(e.event) ? 'rejected' : 'approved'}>{authEventLabel(e.event)}</StatusBadge>,
            csv: (e) => authEventLabel(e.event),
          },
          { header: 'Detail', kind: 'c-more', cell: (e) => <span style={{ whiteSpace: 'normal' }}>{e.detail ?? '—'}</span>, csv: (e) => e.detail ?? '' },
        ]}
        searchText={(e) => `${auditModuleLabel(e.module ?? 'core')} ${who(e)} ${e.loginId ?? ''} ${authEventLabel(e.event)} ${e.detail ?? ''}`}
        searchPlaceholder="Search this page by person, event or detail…" exportName="core-sign-in-history" />
      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="helper">{loading ? 'Loading…' : total ? `Showing ${from}–${to} of ${total}` : 'No events match these filters.'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button disabled={loading || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - PAGE)) }}>Previous</Button>
          <Button disabled={loading || offset + PAGE >= total} onClick={() => { setLoading(true); setOffset(offset + PAGE) }}>Next</Button>
        </span>
      </div>
    </div>
  )
}
