import type { Column } from '@/shared/ui/data/TablePanel'
import { Who } from '@/shared/ui/Avatar'
import { StatusBadge } from '@/shared/ui/Status'
import type { ApprovalRequest, Project } from '@/modules/core-data'
import { projectOf, REQUEST_TONE } from '@/modules/core-data'
import { fmtDate } from '@/shared/lib/format'
import { displayPCM, displayRaiser } from '../utils/raiser'

export const requestColumns = (open: (r: ApprovalRequest) => void, projects: Project[] = []): Column<ApprovalRequest>[] => [
  { header: 'Request ID', kind: 'c-id', cell: (r) => <button type="button" className="id-link" onClick={() => open(r)}>{r.code}</button>, csv: (r) => r.code },
  { header: 'Type', kind: 'c-more', cell: (r) => <span className="cell-pill">{r.type}</span>, csv: (r) => r.type },
  { header: 'Project', kind: 'c-more', cell: (r) => projectOf(projects, r.chainageId)?.name ?? 'Company-wide', csv: (r) => projectOf(projects, r.chainageId)?.name ?? 'Company-wide' },
  { header: 'Title / raised by', kind: 'c-sub', cell: (r) => <Who name={displayRaiser(r.raisedBy)} sub={`${r.title} · ${displayPCM(r.module)}`} />, csv: (r) => `${r.title} (${displayRaiser(r.raisedBy)})` },
  { header: 'Level', kind: 'c-amt', cell: (r) => (r.status === 'Approved' || r.status === 'Rejected' ? '—' : `L${r.currentLevel}`), csv: (r) => `L${r.currentLevel}` },
  { header: 'Raised On', kind: 'c-more', cell: (r) => fmtDate(r.raisedAt), csv: (r) => fmtDate(r.raisedAt) },
  { header: 'Required by', kind: 'c-more', cell: (r) => (r.emergency ? <span className="warn-text">Emergency</span> : r.neededBy ? fmtDate(r.neededBy) : '—'), csv: (r) => (r.emergency ? 'Emergency' : r.neededBy ?? '') },
  { header: 'Status', kind: 'c-status', cell: (r) => <StatusBadge tone={REQUEST_TONE[r.status]}>{r.status}</StatusBadge>, csv: (r) => r.status },
]
