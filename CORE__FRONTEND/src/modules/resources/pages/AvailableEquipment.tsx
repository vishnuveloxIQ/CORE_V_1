import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Note } from '@/shared/ui/Extras'
import { StatTile } from '@/shared/ui/StatTile'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { Can, MANAGE } from '@/modules/auth'
import { typeIdByName, useCore, type EquipmentUnit } from '@/modules/core-data'
import { AssignUnitDialog } from '../components/EquipmentControls'

/**
 * Equipment that is free to be assigned to work: units whose availability is Available, with the location and
 * project each one is registered at. Read from the company equipment register (the same data as the register).
 * A unit can be assigned to a project from here (the same dialog as the register).
 */
export default function AvailableEquipment() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'available-equipment')
  const navigate = useNavigate()
  const { units, equipmentTypes } = useCore()
  const [assignFor, setAssignFor] = useState<EquipmentUnit | null>(null)
  const capacityOf = (u: EquipmentUnit) => [u.capacity, u.capacityUnit].filter(Boolean).join(' ')

  const available = units
    .filter((u) => u.availability === 'Available')
    .map((u) => ({ unit: u }))
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
        subtitle="Only units marked Available. Search by asset code, type, model or capacity."
        rows={available}
        rowKey={(r) => r.unit.id}
        columns={[
          { header: 'Asset', kind: 'c-sub', cell: (r) => <span><strong>{r.unit.assetCode}</strong><span className="sub">{r.unit.name ?? r.unit.makeModel ?? ''}</span></span>, csv: (r) => r.unit.assetCode },
          { header: 'Type', kind: 'c-more', cell: (r) => <span className="cell-pill">{r.unit.type}</span>, csv: (r) => r.unit.type },
          { header: 'Model', kind: 'c-more', cell: (r) => r.unit.model || '—', csv: (r) => r.unit.model ?? '' },
          { header: 'Capacity / size', kind: 'c-more', cell: (r) => capacityOf(r.unit) || '—', csv: (r) => capacityOf(r.unit) },
        ]}
        action={(r) => (
          <Can privilege={MANAGE.masters}>
            <Button size="sm" icon="plus" disabled={!typeIdByName(equipmentTypes, r.unit.type)} title={typeIdByName(equipmentTypes, r.unit.type) ? undefined : 'This type is not on the server yet'} onClick={() => setAssignFor(r.unit)}>Assign to project</Button>
          </Can>
        )}
        searchText={(r) => `${r.unit.assetCode} ${r.unit.name ?? ''} ${r.unit.type} ${r.unit.makeModel ?? ''} ${r.unit.model ?? ''} ${capacityOf(r.unit)}`}
        searchPlaceholder="Search by asset, type, model or capacity…"
        exportName="core-available-equipment"
      />
      {assignFor && <AssignUnitDialog unit={assignFor} onClose={() => setAssignFor(null)} />}
    </div>
  )
}
