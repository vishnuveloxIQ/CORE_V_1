import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { Tabs } from '@/shared/ui/Extras'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import type { ApprovalRequest, RequestType } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { MODULES, useCore } from '@/modules/core-data'
import { requestColumns } from '../components/columns'
import { matches, NO_FILTERS, type Filters } from '../utils/inbox'
import { RaiseRequestDialog } from '../components/RaiseRequestDialog'

const VIEWS = ['All','Approved', 'Pending', 'Rejected'] as const
type View = (typeof VIEWS)[number]

/** Request categories used by the filter chips. Together they cover every request type. */
const CATEGORIES: { label: string; types: RequestType[] }[] = [
  { label: 'Hiring', types: ['Job opening', 'Manpower requisition', 'Offer letter', 'Onboarded employee list', 'Recruitment'] },
  { label: 'Employee actions', types: ['Employee transfer', 'Promotion', 'Bonus and incentive'] },
  { label: 'Equipment and material', types: ['Equipment', 'Material'] },
  { label: 'Payments and loans', types: ['Advance payment', 'Loan and advance'] },
]
const categoryOf = (r: ApprovalRequest) => CATEGORIES.find((c) => c.types.includes(r.type))?.label ?? 'Other'

const isOpen = (s: ApprovalRequest['status']) => s === 'Pending' || s === 'In review' || s === 'Clarification requested'
const inView = (r: ApprovalRequest, v: View) => (v === 'All' ? true : v === 'Pending' ? isOpen(r.status) : r.status === v)



/** 3.7 + 3.9 — every cross-module request that must be approved in CORE. `?category=` preselects a chip. */
export default function ApprovalsList() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'approvals')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requests = useCore((s) => s.requests)
  const [view, setView] = useState<View>('Pending')
  const [raising, setRaising] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const cols = useMemo(() => requestColumns((r) => navigate(`/approvals/${r.id}`)), [navigate])
  const preset = CATEGORIES.filter((c) => params.getAll('category').includes(c.label)).map((c) => c.label)

  const open = requests.filter((r) => isOpen(r.status))
  const oldest = [...open].sort((a, b) => a.raisedAt.localeCompare(b.raisedAt))[0]
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to
  const rows = requests.filter((r) => inView(r, view) && (badRange || matches(r, filters)))
  const filtered = filters.module !== '' || filters.from !== '' || filters.to !== '' || !!filters.level

  return (
    <div ref={ref}>
      <PageHead crumb="Approvals" title="Approvals" desc="Requests from across the company that need your decision."
        actions={<>
          <Button icon="plus" onClick={() => setRaising(true)}>New request</Button>
          <Button icon="workflow" onClick={() => navigate('/approval-matrix')}>Approval matrix</Button>
          <Button tone="primary" icon="approvals" disabled={!oldest} onClick={() => oldest && navigate(`/approvals/${oldest.id}`)}>Review oldest</Button>
        </>} />
      <div className="grid stats">
        <StatTile label="Waiting for decision" value={open.length} icon="clock" tone="gold" onClick={() => setView('Pending')} actionLabel="Show pending requests" />
        <StatTile label="Emergency" value={open.filter((r) => r.emergency).length} icon="siren" tone="rose" />
        <StatTile label="Approved" value={requests.filter((r) => r.status === 'Approved').length} icon="checkc" tone="green" onClick={() => setView('Approved')} actionLabel="Show approved requests" />
        <StatTile label="Rejected" value={requests.filter((r) => r.status === 'Rejected').length} icon="xc" tone="purple" onClick={() => setView('Rejected')} actionLabel="Show rejected requests" />
      </div>
      <div style={{ marginBottom: 12 }} data-enter><Tabs label="Show" value={view} onChange={setView} items={VIEWS} /></div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <FormGroup label="Module">
          {(id) => (
            <Select id={id} name="module" value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })}>
              <option value="">All modules</option>
              {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Current level" helper="Requests still waiting at this level.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} name="level" value={filters.level ?? ''} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
              <option value="">Any level</option>
              {['1', '2', '3', '4'].map((l) => <option key={l} value={l}>Level {l}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Raised from" error={badRange ? 'Raised from must be on or before Raised to.' : undefined}>
          {(id) => <Input id={id} type="date" name="from" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />}
        </FormGroup>
        <FormGroup label="Raised to">
          {(id) => <Input id={id} type="date" name="to" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />}
        </FormGroup>
      </div>
      {filtered && (
        <div className="form-actions" style={{ marginTop: 0, marginBottom: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="helper" aria-live="polite">{rows.length} {rows.length === 1 ? 'request matches' : 'requests match'} these filters.</span>
          <Button onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
        </div>
      )}
      <TablePanel key={`${view}:${preset.join(',')}:${filters.module}:${filters.from}:${filters.to}:${filters.level ?? ''}`}
        title={`${view === 'All' ? 'All' : view} requests`}
        subtitle="Filter by category with the chips; pick more than one to combine. Open a request to decide."
        columns={cols} rows={rows} rowKey={(r) => r.id} statusOf={categoryOf} chipNoun="categories" initialPicked={preset}
        searchText={(r) => `${r.code} ${r.type} ${r.title} ${r.raisedBy} ${r.module} ${r.status}`}
        action={(r) => <Button size="sm" onClick={() => navigate(`/approvals/${r.id}`)}>{isOpen(r.status) ? 'Review' : 'View'}</Button>}
        searchPlaceholder="Search by ID, title or person…" exportName="core-approvals" />
      {raising && <RaiseRequestDialog onClose={() => setRaising(false)} />}
    </div>
  )
}
