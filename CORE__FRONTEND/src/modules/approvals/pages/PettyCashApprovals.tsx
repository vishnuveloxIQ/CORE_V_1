import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import type { ApprovalRequest } from '@/modules/core-data'
import { projectOf, useCore } from '@/modules/core-data'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate } from '@/shared/lib/format'
import { displayRaiser } from '../utils/raiser'

/** Petty cash management (module PMS, shown as PCM): its requests awaiting a decision, and a report of all of them. */
type Tab = 'Pending approvals' | 'Reports'

const isOpen = (s: ApprovalRequest['status']) => s === 'Pending' || s === 'In review' || s === 'Clarification requested'
// a zero amount from the API means none was set, so the payment amount in the payload is used instead
const amountOf = (r: ApprovalRequest) => (r.amount ? r.amount : r.payload.kind === 'payment' ? r.payload.amount : null)
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const amountText = (r: ApprovalRequest) => {
  const a = amountOf(r)
  return a === null ? '—' : rupees.format(a)
}
const TONE: Record<ApprovalRequest['status'], 'pending' | 'approved' | 'rejected' | 'draft'> = {
  Pending: 'pending', 'In review': 'pending', 'Clarification requested': 'pending', Approved: 'approved', Rejected: 'rejected',
}

export default function PettyCashApprovals() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'petty-cash-approvals')
  const navigate = useNavigate()
  const requests = useCore((s) => s.requests)
  const projects = useCore((s) => s.projects)
  // the project filter narrows the requests and the figures on this page
  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const day = (r: ApprovalRequest) => r.raisedAt.slice(0, 10)
  const inRange = (r: ApprovalRequest) => (!from || day(r) >= from) && (!to || day(r) <= to)
  // the sidebar entries open the two views by path: /approvals/petty-cash/reports, or /pending (the default)
  const { pathname } = useLocation()
  const tab: Tab = pathname.endsWith('/reports') ? 'Reports' : 'Pending approvals'

  const pcm = requests.filter((r) => r.module === 'PMS' && (!projectId || projectOf(projects, r.chainageId)?.id === projectId))
  const open = pcm.filter((r) => isOpen(r.status))
  const approved = pcm.filter((r) => r.status === 'Approved')
  const rejected = pcm.filter((r) => r.status === 'Rejected')
  const sum = (list: ApprovalRequest[]) => list.reduce((n, r) => n + (amountOf(r) ?? 0), 0)

  const columns = [
    { header: 'Request', kind: 'c-id' as const, cell: (r: ApprovalRequest) => r.code, csv: (r: ApprovalRequest) => r.code },
    { header: 'Title', kind: 'c-sub' as const, cell: (r: ApprovalRequest) => <strong>{r.title}</strong>, csv: (r: ApprovalRequest) => r.title },
    { header: 'Raised by', kind: 'c-more' as const, cell: (r: ApprovalRequest) => displayRaiser(r.raisedBy), csv: (r: ApprovalRequest) => displayRaiser(r.raisedBy) },
    { header: 'Raised on', kind: 'c-more' as const, cell: (r: ApprovalRequest) => fmtDate(r.raisedAt), csv: (r: ApprovalRequest) => r.raisedAt },
    { header: 'Amount', kind: 'c-amt' as const, cell: amountText, csv: (r: ApprovalRequest) => String(amountOf(r) ?? '') },
    { header: 'Status', kind: 'c-status' as const, cell: (r: ApprovalRequest) => <StatusBadge tone={TONE[r.status]}>{r.status}</StatusBadge>, csv: (r: ApprovalRequest) => r.status },
  ]

  return (
    <div ref={ref}>
      <PageHead
        crumb="Petty cash management"
        title="Petty cash management"
        desc="Petty cash requests from the PCM module: what is waiting for a decision, and a report of every request."
        actions={<Button icon="chevL" onClick={() => navigate('/approvals')}>Back to approvals</Button>}
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="grid stats">
        <StatTile label="Waiting for decision" value={open.length} icon="clock" tone="gold" />
        <StatTile label="Total approved amount" value={rupees.format(sum(approved))} icon="checkc" tone="green" />
        <StatTile label="Rejected amount" value={rupees.format(sum(rejected))} icon="xc" tone="purple" />
        <StatTile label="Requests" value={pcm.length} icon="clipboard" tone="blue" />
      </div>
      {tab === 'Pending approvals' ? (
        <TablePanel
          title="Pending approvals"
          subtitle="Petty cash requests waiting for a decision. Open a request to decide."
          rows={open}
          rowKey={(r) => r.id}
          columns={columns}
          searchText={(r) => `${r.code} ${r.title} ${displayRaiser(r.raisedBy)}`}
          searchPlaceholder="Search by ID, title or person…"
          exportName="core-petty-cash-pending"
          action={(r) => <Button size="sm" onClick={() => navigate(`/petty-cash/${r.id}`)}>Review</Button>}
        />
      ) : (
        <>
        <TablePanel
          title="Reports"
          subtitle="Every petty cash request, with its amount and where it stands."
          rows={pcm.filter(inRange)}
          filters={<>
            <FormGroup label="From date">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</FormGroup>
            <FormGroup label="To date">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</FormGroup>
          </>}
          rowKey={(r) => r.id}
          columns={columns}
          searchText={(r) => `${r.code} ${r.title} ${displayRaiser(r.raisedBy)}`}
          searchPlaceholder="Search by ID, title or person…"
          exportName="core-petty-cash-report"
          action={(r) => <Button size="sm" onClick={() => navigate(`/petty-cash/${r.id}`)}>View</Button>}
        />
        </>
      )}
    </div>
  )
}
