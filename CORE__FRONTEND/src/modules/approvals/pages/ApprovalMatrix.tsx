import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { byId } from '@/shared/lib/core'
import { scopeText } from '@/modules/core-data'
import { fmtDate } from '@/shared/lib/format'
import { chainState, useCore } from '@/modules/core-data'

/** 3.7 Approval matrix: every module's chains and approvers are set here only. */
export default function ApprovalMatrix() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'matrix')
  const navigate = useNavigate()
  const { chains, users, projects } = useCore()
  const nameOf = (id: string) => byId(users, id)?.name ?? '?'
  const open = (id: string) => navigate(`/approval-matrix/${id}`)
  // project chains sit right under the company chain of the same request type
  const SCOPE_ORDER = { Company: 0, Project: 1 } as const
  const firstOf = (t: string) => chains.findIndex((c) => c.requestType === t)
  const rows = chains.map((c) => ({ ...c, ...chainState(c) })).sort((a, b) => firstOf(a.requestType) - firstOf(b.requestType) || SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType])
  const stateOf = (r: (typeof rows)[number]) => (r.ready ? 'Ready' : 'Not usable')

  return (
    <div ref={ref}>
      <PageHead crumb="Approval matrix" title="Approval matrix" desc="Set one to four approval levels for each request type. A project chain overrides the company chain."
        actions={<>
          <Button icon="userCog" onClick={() => navigate('/users')}>Approvers and heads</Button>
          <Button tone="primary" icon="plus" onClick={() => navigate('/approval-matrix/new')}>New approval chain</Button>
        </>} />
      <div className="grid stats">
        <StatTile label="Approval chains" value={chains.length} icon="workflow" tone="blue" />
        <StatTile label="Project chains" value={chains.filter((c) => c.scopeType === 'Project').length} icon="folderTree" tone="purple" />
        <StatTile label="Not usable" value={rows.filter((r) => !r.ready).length} icon="ban" tone="rose" />
      </div>
      <TablePanel title="Approval chains" subtitle="Filter by scope or state using the chips; pick more than one to combine. Changes create a new version and apply to new requests only." rows={rows} rowKey={(r) => r.id}
        columns={[
          { header: 'Request type', kind: 'c-id', cell: (r) => <><button type="button" className="id-link" onClick={() => open(r.id)}>{r.requestType}</button></>, csv: (r) => r.requestType },
          { header: 'Applies to', kind: 'c-amt', cell: (r) => <span className="cell-pill">{scopeText(r.scopeType, r.scopeIds, projects)}</span>, csv: (r) => scopeText(r.scopeType, r.scopeIds, projects) },
          { header: 'Chain', kind: 'c-sub', cell: (r) => <><strong>{r.current.levels.map((l, i) => (l.approverId ? `L${i + 1} ${nameOf(l.approverId)}${r.requestType === 'Payments' && l.cashLimit ? ` (up to ₹${l.cashLimit.toLocaleString('en-IN')})` : ''}` : null)).filter(Boolean).join(' → ') || 'No approvers'}</strong><span className="sub">Raised by {r.raisedBy} · {r.module}</span></>, csv: (r) => r.current.levels.filter((l) => l.approverId).map((l) => nameOf(l.approverId)).join(' > ') },
          { header: 'Levels', kind: 'c-more', cell: (r) => `${r.levelsSet} ${r.levelsSet === 1 ? 'level' : 'levels'}`, csv: (r) => String(r.levelsSet) },
          { header: 'Version', kind: 'c-more', cell: (r) => <>v{r.current.version}<span className="sub">since {fmtDate(r.current.effectiveFrom)}{r.latest.version !== r.current.version ? ` · v${r.latest.version} scheduled` : ''}</span></>, csv: (r) => `v${r.current.version}` },
          { header: 'State', kind: 'c-status', cell: (r) => <StatusBadge tone={r.ready ? 'approved' : 'rejected'}>{stateOf(r)}</StatusBadge>, csv: stateOf },
        ]}
        searchText={(r) => `${r.id} ${r.requestType} ${r.module} ${scopeText(r.scopeType, r.scopeIds, projects)} ${r.current.levels.map((l) => nameOf(l.approverId)).join(' ')}`} statusOf={(r) => (r.ready ? `${r.scopeType} chains` : 'Not usable')}
        action={(r) => <Button size="sm" icon="pencil" onClick={() => open(r.id)}>Edit chain</Button>} exportName="core-approval-matrix" chipNoun="scopes" />
    </div>
  )
}
