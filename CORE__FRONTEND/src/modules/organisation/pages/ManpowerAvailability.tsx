import { useEffect, useRef, useState } from 'react'
import { PageHead } from '@/modules/shell'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { FormGroup, Select } from '@/shared/ui/Field'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate } from '@/shared/lib/format'
import { useCore } from '@/modules/core-data'
import { useApprovedPeople, type ApprovedStatus } from '../store/approvedPeople'

const TONE: Record<ApprovedStatus, 'pending' | 'review' | 'approved'> = {
  Approved: 'pending',
  'With HRMS': 'review',
  Onboarded: 'approved',
}

/**
 * Manpower availability: every person the company has taken on through the approved list, with where each one stands
 * (Approved, With HRMS or Onboarded). Read-only: people are approved and sent to HRMS from the Approved list.
 */
export default function ManpowerAvailability() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'manpower-availability')
  const projects = useCore((s) => s.projects)
  const people = useApprovedPeople((s) => s.people)
  const loadPeople = useApprovedPeople((s) => s.load)
  useEffect(() => { void loadPeople() }, [loadPeople])
  // '' shows every project; otherwise the project code the list is filtered to
  const [projectCode, setProjectCode] = useState('')
  const projectName = (code: string) => projects.find((p) => p.code === code)?.name ?? code
  const shown = (projectCode ? people.filter((p) => p.projectCode === projectCode) : people)
    .slice()
    .sort((a, b) => projectName(a.projectCode).localeCompare(projectName(b.projectCode)) || a.name.localeCompare(b.name))
  const count = (st: ApprovedStatus) => shown.filter((p) => p.status === st).length

  return (
    <div ref={ref}>
      <PageHead
        crumb="Manpower availability"
        title="Manpower availability"
        desc="Everyone the company has approved for its projects, and where each person stands."
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectCode} onChange={(e) => setProjectCode(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="grid stats">
        <StatTile label="Total people" value={shown.length} icon="users" tone="blue" />
        <StatTile label="Onboarded" value={count('Onboarded')} icon="checkc" tone="green" />
        <StatTile label="With HRMS" value={count('With HRMS')} icon="clock" tone="gold" />
        <StatTile label="Approved" value={count('Approved')} icon="userCheck" tone="purple" />
      </div>
      <TablePanel
        title="All people"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by name, designation, department or project."
        rows={shown}
        rowKey={(p) => p.id}
        columns={[
          { header: 'Name', kind: 'c-sub', cell: (p) => <strong>{p.name}</strong>, csv: (p) => p.name },
          { header: 'Designation', kind: 'c-more', cell: (p) => p.designation, csv: (p) => p.designation },
          { header: 'Department', kind: 'c-more', cell: (p) => p.department, csv: (p) => p.department },
          { header: 'Project', kind: 'c-more', cell: (p) => projectName(p.projectCode), csv: (p) => projectName(p.projectCode) },
          { header: 'Joining date', kind: 'c-more', cell: (p) => (p.joiningDate ? fmtDate(p.joiningDate) : '—'), csv: (p) => p.joiningDate },
          { header: 'Status', kind: 'c-status', cell: (p) => <StatusBadge tone={TONE[p.status]}>{p.status}</StatusBadge>, csv: (p) => p.status },
        ]}
        searchText={(p) => `${p.name} ${p.designation} ${p.department} ${projectName(p.projectCode)} ${p.status}`}
        searchPlaceholder="Search by name, designation, department or project…"
        statusOf={(p) => p.status}
        chipNoun="statuses"
        exportName="core-manpower-availability"
      />
    </div>
  )
}
