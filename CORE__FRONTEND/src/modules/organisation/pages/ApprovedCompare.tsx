import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHead } from '@/modules/shell'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormGroup, Select } from '@/shared/ui/Field'
import { MiniTable, Muted } from '@/shared/ui/Extras'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate, fmtDateTime } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { useCore } from '@/modules/core-data'
import { useApprovedPeople, type ApprovedPerson } from '../store/approvedPeople'

const isOnboarded = (p: ApprovedPerson) => p.status === 'Onboarded'

/**
 * The reason for a person who is not onboarded. The HR admin gives the reason outside this screen; the admin only
 * asks for it here, and sees the reason once it is recorded.
 */
function ReasonCell({ person }: { person: ApprovedPerson }) {
  const requestReason = useApprovedPeople((s) => s.requestReason)
  if (person.reason) return <span>{person.reason}</span>
  if (person.reasonRequestedAt) {
    return (
      <span>
        <Muted>No reason yet. Asked the HR admin on {fmtDateTime(person.reasonRequestedAt)}.</Muted>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 48 }}>
      <Muted>No reason yet.</Muted>
      <Button size="sm" icon="send" style={{ marginLeft: 16 }} onClick={() => { requestReason(person.id); notify(`Reason requested from the HR admin for ${person.name}`) }}>
        Reason
      </Button>
    </span>
  )
}

/** Approved people against onboarded people, with the reasons for those not onboarded yet. Opened from the Approved list. */
export default function ApprovedCompare() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'approved-compare')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projects = useCore((s) => s.projects)
  const people = useApprovedPeople((s) => s.people)
  const loadPeople = useApprovedPeople((s) => s.load)
  useEffect(() => { void loadPeople() }, [loadPeople])
  // '' shows every project; otherwise the project code, taken from the address
  const projectCode = params.get('project') ?? ''
  const setProject = (code: string) => setParams(code ? { project: code } : {}, { replace: true })

  const scoped = projectCode ? people.filter((p) => p.projectCode === projectCode) : people
  const scopeProjects = projectCode
    ? projects.filter((p) => p.code === projectCode)
    : projects.filter((p) => people.some((x) => x.projectCode === p.code))
  const countFor = (code: string) => {
    const list = people.filter((p) => p.projectCode === code)
    const onboarded = list.filter(isOnboarded).length
    return { approved: list.length, onboarded, pending: list.length - onboarded }
  }
  const total = scopeProjects.reduce(
    (t, p) => {
      const c = countFor(p.code)
      return { approved: t.approved + c.approved, onboarded: t.onboarded + c.onboarded, pending: t.pending + c.pending }
    },
    { approved: 0, onboarded: 0, pending: 0 },
  )
  const projectName = (code: string) => projects.find((p) => p.code === code)?.name ?? code

  return (
    <div ref={ref}>
      <PageHead
        crumb="Approved list"
        title="Compare approved and onboarded"
        desc="Approved people on each project against the people HRMS has onboarded. Ask the HR admin for the reason anyone is not onboarded yet."
        actions={<Button icon="chevL" onClick={() => navigate(projectCode ? `/approved-list?project=${projectCode}` : '/approved-list')}>Back to approved list</Button>}
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectCode} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>

      <Card title="Comparison" subtitle="Approved people against onboarded people, per project">
        <MiniTable
          head={['Project', 'Approved', 'Onboarded', 'Not yet onboarded']}
          empty="No approved people on this project yet."
          rows={[
            ...scopeProjects.map((p) => {
              const c = countFor(p.code)
              return [<strong key="n">{p.name}</strong>, c.approved, c.onboarded, c.pending]
            }),
            ...(scopeProjects.length > 1 ? [[<strong key="t">Total</strong>, total.approved, total.onboarded, total.pending]] : []),
          ]}
        />
      </Card>

      <div className="compare-full" style={{ marginTop: 18 }}>
        <TablePanel
          title="Onboarded and not onboarded"
          subtitle="For anyone not onboarded yet, ask the HR admin for the reason."
          rows={scoped}
          rowKey={(p) => p.id}
          columns={[
            { header: 'Sl no', kind: 'c-id', cell: (p) => scoped.indexOf(p) + 1, csv: (p) => String(scoped.indexOf(p) + 1) },
            { header: 'Employee name', kind: 'c-more', cell: (p) => p.name, csv: (p) => p.name },
            { header: 'Designation', kind: 'c-more', cell: (p) => p.designation, csv: (p) => p.designation },
            { header: 'Joining date', kind: 'c-more', cell: (p) => fmtDate(p.joiningDate), csv: (p) => p.joiningDate },
            { header: 'Status', kind: 'c-status', cell: (p) => (isOnboarded(p) ? 'Onboarded' : 'Not onboarded'), csv: (p) => (isOnboarded(p) ? 'Onboarded' : 'Not onboarded') },
            {
              header: 'Reason for not onboarding',
              kind: 'c-more',
              cell: (p) => (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {isOnboarded(p) ? <span className="sub">—</span> : <ReasonCell person={p} />}
                </div>
              ),
              csv: (p) => (isOnboarded(p) ? '' : p.reason ?? ''),
            },
          ]}
          searchText={(p) => `${projectName(p.projectCode)} ${p.name} ${p.designation}`}
          statusOf={(p) => (isOnboarded(p) ? 'Onboarded' : 'Not onboarded')}
          searchPlaceholder="Search by project, name or designation…"
          exportName="core-approved-compare"
          chipNoun="onboarding states"
        />
      </div>
    </div>
  )
}
