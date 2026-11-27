import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Note } from '@/shared/ui/Extras'
import { StatTile } from '@/shared/ui/StatTile'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { useCore, type Material } from '@/modules/core-data'

const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

interface Holding { storeId: string; store: string; location: string; free: number }
interface Row { material: Material; free: number; holdings: Holding[] }

/**
 * Materials that are free to be assigned to work: stock on hand less what is reserved, added up across stores, with
 * where each part sits. Only materials with free stock are listed. Read from the live stock the Stores module
 * publishes (GET /stock-levels); assigning them to a project is done in material planning.
 */
export default function AvailableMaterials() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'available-materials')
  const navigate = useNavigate()
  const { stock, stores, materials } = useCore()

  const rows: Row[] = materials
    .map((material) => {
      const holdings = stock
        .filter((s) => s.materialId === material.id && s.qty - s.reserved > 0)
        .map((s): Holding => {
          const store = stores.find((x) => x.id === s.storeId)
          return { storeId: s.storeId, store: store?.name ?? 'Unknown store', location: store?.location || '—', free: s.qty - s.reserved }
        })
        .sort((a, b) => b.free - a.free)
      return { material, holdings, free: holdings.reduce((n, h) => n + h.free, 0) }
    })
    .filter((r) => r.free > 0)
    .sort((a, b) => a.material.name.localeCompare(b.material.name))
  const storesWithStock = new Set(rows.flatMap((r) => r.holdings.map((h) => h.storeId))).size

  return (
    <div ref={ref}>
      <PageHead
        crumb="Available materials"
        title="Available materials"
        desc="Materials that are free to be assigned to work: on hand less reserved, across every store."
        actions={<Button tone="primary" icon="clipboard" onClick={() => navigate('/material-planning')}>Plan for a project</Button>}
      />
      <div className="grid stats">
        <StatTile label="Materials available" value={rows.length} icon="package" tone="green" />
        <StatTile label="Stores holding them" value={storesWithStock} icon="warehouse" tone="blue" />
      </div>
      {stock.length === 0 && (
        <Note title="No stock has been published yet" icon="info">
          Free quantities appear here once the Stores module publishes stock levels.
        </Note>
      )}
      <TablePanel
        title="Free stock by material"
        subtitle="Free stock is the quantity on hand less the quantity reserved. Search by material, store or location."
        rows={rows}
        rowKey={(r) => r.material.id}
        columns={[
          { header: 'Material', kind: 'c-sub', cell: (r) => <span><strong>{r.material.name}</strong><span className="sub">{r.material.code} · {r.material.category}</span></span>, csv: (r) => `${r.material.code} ${r.material.name}` },
          { header: 'Free', kind: 'c-amt', cell: (r) => <strong>{qty.format(r.free)} {r.material.uom}</strong>, csv: (r) => `${r.free} ${r.material.uom}` },
          {
            header: 'Store',
            kind: 'c-more',
            cell: (r) => (
              <span style={{ whiteSpace: 'normal' }}>
                {r.holdings.map((h) => <span key={h.storeId} style={{ display: 'block' }}>{h.store} ({h.location}): {qty.format(h.free)} {r.material.uom}</span>)}
              </span>
            ),
            csv: (r) => r.holdings.map((h) => `${h.store} (${h.location}): ${h.free}`).join('; '),
          },
        ]}
        searchText={(r) => `${r.material.code} ${r.material.name} ${r.material.category} ${r.holdings.map((h) => `${h.store} ${h.location}`).join(' ')}`}
        searchPlaceholder="Search by material, store or location…"
        exportName="core-available-materials"
      />
    </div>
  )
}
