import type { Column } from '@/shared/ui/data/TablePanel'
import { Who } from '@/shared/ui/Avatar'
import { StatusBadge } from '@/shared/ui/Status'
import type { ApprovalRequest } from '@/modules/core-data'
import { REQUEST_TONE } from '@/modules/core-data'
import { fmtDate } from '@/shared/lib/format'

export const requestColumns = (open: (r: ApprovalRequest) => void): Column<ApprovalRequest>[] => [
  { header: 'Request', kind: 'c-id', cell: (r) => <button type="button" className="id-link" onClick={() => open(r)}>{r.code}</button>, csv: (r) => r.code },
  { header: 'Type', kind: 'c-more', cell: (r) => <span className="cell-pill">{r.type}</span>, csv: (r) => r.type },
  { header: 'Title / raised by', kind: 'c-sub', cell: (r) => <Who name={r.raisedBy} sub={`${r.title} · ${r.module}`} />, csv: (r) => `${r.title} (${r.raisedBy})` },
  { header: 'Level', kind: 'c-amt', cell: (r) => (r.status === 'Approved' || r.status === 'Rejected' ? '—' : `L${r.currentLevel}`), csv: (r) => `L${r.currentLevel}` },
  { header: 'Raised', kind: 'c-more', cell: (r) => fmtDate(r.raisedAt), csv: (r) => fmtDate(r.raisedAt) },
  { header: 'Needed by', kind: 'c-more', cell: (r) => (r.emergency ? <span className="warn-text">Emergency</span> : r.neededBy ? fmtDate(r.neededBy) : '—'), csv: (r) => (r.emergency ? 'Emergency' : r.neededBy ?? '') },
  { header: 'Status', kind: 'c-status', cell: (r) => <StatusBadge tone={REQUEST_TONE[r.status]}>{r.status}</StatusBadge>, csv: (r) => r.status },
]
