import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Note } from '@/shared/ui/Extras'
import { StatTile } from '@/shared/ui/StatTile'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { useCore, type EquipmentUnit } from '@/modules/core-data'

/**
 * Equipment that is free to be assigned to work: units whose availability is Available, with the location and
 * project each one is registered at. Read from the company equipment register (the same data as the register).
 * Assigning a unit to a project is done on the register.
 */
export default function AvailableEquipment() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'available-equipment')
  const navigate = useNavigate()
  const { units, sites, projects } = useCore()

  const where = (u: EquipmentUnit) => {
    const site = sites.find((s) => s.id === u.chainageId)
    const project = site?.projectId ? projects.find((p) => p.id === site.projectId) : undefined
    return { location: site?.name ?? '—', project: project ? `${project.code} · ${project.name}` : 'Not assigned to a project' }
  }

  const available = units
    .filter((u) => u.availability === 'Available')
    .map((u) => ({ unit: u, ...where(u) }))
    .sort((a, b) => a.unit.assetCode.localeCompare(b.unit.assetCode))
  const types = new Set(available.map((r) => r.unit.type)).size

  return (
    <div ref={ref}>
      <PageHead
        crumb="Available equipment"
        title="Available equipment"
        desc="Machines that are free to be assigned to work: where each one is registered, and which project it belongs to."
        actions={<Button tone="primary" icon="truck" onClick={() => navigate('/equipment/register')}>Open the register</Button>}
      />
      <div className="grid stats">
        <StatTile label="Units available" value={available.length} icon="truck" tone="green" />
        <StatTile label="Equipment types" value={types} icon="layers" tone="blue" />
      </div>
      {units.length === 0 && (
        <Note title="No equipment registered yet" icon="info">
          Units appear here once they are added to the company equipment register.
        </Note>
      )}
      <TablePanel
        title="Available units"
        subtitle="Only units marked Available. Search by asset code, type, location or project."
        rows={available}
        rowKey={(r) => r.unit.id}
        columns={[
          { header: 'Asset', kind: 'c-sub', cell: (r) => <span><strong>{r.unit.assetCode}</strong><span className="sub">{r.unit.name ?? r.unit.makeModel ?? ''}</span></span>, csv: (r) => r.unit.assetCode },
          { header: 'Type', kind: 'c-more', cell: (r) => <span className="cell-pill">{r.unit.type}</span>, csv: (r) => r.unit.type },
          { header: 'Location', kind: 'c-more', cell: (r) => r.location, csv: (r) => r.location },
          { header: 'Project', kind: 'c-more', cell: (r) => <span style={{ whiteSpace: 'normal' }}>{r.project}</span>, csv: (r) => r.project },
        ]}
        searchText={(r) => `${r.unit.assetCode} ${r.unit.name ?? ''} ${r.unit.type} ${r.unit.makeModel ?? ''} ${r.location} ${r.project}`}
        searchPlaceholder="Search by asset, type, location or project…"
        exportName="core-available-equipment"
      />
    </div>
  )
}
