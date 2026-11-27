import { useRef, useState } from 'react'
import { PageHead } from '@/modules/shell'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { FormGroup, Select } from '@/shared/ui/Field'
import { StatTile } from '@/shared/ui/StatTile'
import { useEnter } from '@/shared/hooks/useMotion'
import { StatusBadge } from '@/shared/ui/Status'
import { AVAIL_TONE, useCore, type EquipmentUnit } from '@/modules/core-data'

/**
 * Equipment assigned to projects: every unit placed on a project, with the project it is on and its current status (In use,
 * Under maintenance or Breakdown). The project filter narrows the list to one project.
 */
export default function AssignedEquipment() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'assigned-equipment')
  const { units, projects } = useCore()
  const [projectId, setProjectId] = useState('')
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? 'Unassigned'
  const capacityOf = (u: EquipmentUnit) => [u.capacity, u.capacityUnit].filter(Boolean).join(' ')
  // assigned = a unit with a project, whatever its status; sorted by project name, then asset code
  const assigned = units
    .filter((u) => !!u.projectId && (!projectId || u.projectId === projectId))
    .sort((a, b) => projectName(a.projectId).localeCompare(projectName(b.projectId)) || a.assetCode.localeCompare(b.assetCode))
  const projectCount = new Set(assigned.map((u) => u.projectId)).size

  return (
    <div ref={ref}>
      <PageHead
        crumb="Assigned equipment"
        title="Assigned equipment"
        desc="Machines assigned to each project, with their current status."
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
        <StatTile label="Assigned units" value={assigned.length} icon="truck" tone="green" />
        <StatTile label="Projects with equipment" value={projectCount} icon="layers" tone="blue" />
      </div>
      <TablePanel
        title="Assigned units"
        subtitle="Units assigned to a project, with their status. Choose a project above to see only its equipment."
        rows={assigned}
        rowKey={(u) => u.id}
        columns={[
          { header: 'Project', kind: 'c-sub', cell: (u) => <strong>{projectName(u.projectId)}</strong>, csv: (u) => projectName(u.projectId) },
          { header: 'Asset', kind: 'c-id', cell: (u) => u.assetCode, csv: (u) => u.assetCode },
          { header: 'Type', kind: 'c-more', cell: (u) => <span className="cell-pill">{u.type}</span>, csv: (u) => u.type },
          { header: 'Model', kind: 'c-more', cell: (u) => u.model || '—', csv: (u) => u.model ?? '' },
          { header: 'Capacity / size', kind: 'c-more', cell: (u) => capacityOf(u) || '—', csv: capacityOf },
          { header: 'Equipment status', kind: 'c-status', cell: (u) => <StatusBadge tone={AVAIL_TONE[u.availability]}>{u.availability}</StatusBadge>, csv: (u) => u.availability },
        ]}
        searchText={(u) => `${projectName(u.projectId)} ${u.assetCode} ${u.type} ${u.model ?? ''}`}
        searchPlaceholder="Search by project, asset, type or model…"
        statusOf={(u) => u.availability}
        chipNoun="statuses"
        exportName="core-assigned-equipment"
      />
    </div>
  )
}
