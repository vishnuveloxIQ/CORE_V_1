import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TablePanel, type Column } from '@/shared/ui/data/TablePanel'
import { Who } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { PageHead } from '@/modules/shell'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import type { Grievance } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { isUpcomingVisit, VISIT_TONE } from '../utils/visits'
import { fmtDate, relDay, todayISO } from '@/shared/lib/format'
import { useCore } from '@/modules/core-data'

/** 3.8 — grievances arrive as an ID, a short message and the date the person wants to visit Head Office. */
export default function GrievancesList() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'grievances')
  const navigate = useNavigate()
  const grievances = useCore((s) => s.grievances)
  const today = todayISO()
  const open = (id: string) => navigate(`/grievances/${id}`)
  const upcoming = grievances.filter((g) => isUpcomingVisit(g.status)).sort((a, b) => a.visitDate.localeCompare(b.visitDate))
  const next = upcoming.find((g) => g.visitDate >= today) ?? upcoming[0]
  const late = (g: Grievance) => isUpcomingVisit(g.status) && !!g.visitDate && g.visitDate < today

  const cols: Column<Grievance>[] = [
    { header: 'Grievance', kind: 'c-id', cell: (g) => <button type="button" className="id-link" onClick={() => open(g.id)}>{g.code}</button>, csv: (g) => g.code },
    { header: 'Raised by / message', kind: 'c-sub', cell: (g) => <Who name={g.raisedBy} sub={g.message} />, csv: (g) => `${g.raisedBy}: ${g.message}` },
    { header: 'Head Office visit', kind: 'c-amt', cell: (g) => <>{fmtDate(g.visitDate)}<span className={late(g) ? 'sub warn-text' : 'sub'}>{late(g) ? 'Date passed' : isUpcomingVisit(g.status) ? relDay(g.visitDate, today) : 'Closed'}</span></>, csv: (g) => g.visitDate },
    { header: 'Status', kind: 'c-status', cell: (g) => <StatusBadge tone={VISIT_TONE[g.status]}>{g.status}</StatusBadge>, csv: (g) => g.status },
  ]

  return (
    <div ref={ref}>
      <PageHead crumb="Grievances" title="Grievances" desc="Review grievances with their ID, the person who raised them, a brief message and the requested Head Office visit date. Confirm, reschedule or close each visit."
        actions={<Button tone="primary" icon="calendar" disabled={!next} onClick={() => next && open(next.id)}>Next Head Office visit</Button>} />
      <div className="grid stats">
        <StatTile label="Visit requests" value={grievances.filter((g) => g.status === 'Requested').length} icon="inbox" tone="gold" />
        <StatTile label="Upcoming visits" value={upcoming.filter((g) => g.status !== 'Requested' && g.visitDate >= today).length} icon="calendar" tone="blue" />
        <StatTile label="Visits today" value={upcoming.filter((g) => g.visitDate === today).length} icon="calendarClock" tone="rose" />
        <StatTile label="Closed" value={grievances.filter((g) => !isUpcomingVisit(g.status)).length} icon="checkc" tone="green" />
      </div>
      <TablePanel title="All Grievances" subtitle="Filter by status using the chips; pick more than one to combine. Listed by nearest visit date." columns={cols} rows={[...grievances].sort((a, b) => Number(!isUpcomingVisit(a.status)) - Number(!isUpcomingVisit(b.status)) || a.visitDate.localeCompare(b.visitDate))} rowKey={(g) => g.id}
        searchText={(g) => `${g.code} ${g.raisedBy} ${g.message} ${g.status} ${fmtDate(g.visitDate)}`} statusOf={(g) => g.status} chipNoun="statuses"
        action={(g) => <Button size="sm" onClick={() => open(g.id)}>{g.status === 'Requested' ? 'Confirm' : 'Open'}</Button>} searchPlaceholder="Search by ID, name, message or date…" exportName="core-grievances" />
    </div>
  )
}
