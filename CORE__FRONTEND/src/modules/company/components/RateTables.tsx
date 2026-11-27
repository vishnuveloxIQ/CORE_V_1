import { useEffect } from 'react'
import { Card } from '@/shared/ui/Card'
import { MiniTable } from '@/shared/ui/Extras'
import { fmtDate } from '@/shared/lib/format'
import { useCore } from '@/modules/core-data'

const money = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }))

/**
 * The rates uploaded for a project, for the Fleet and Equipment module. Read from the rate tables; empty until a rate
 * sheet is uploaded on the Company policies page.
 */
export function EquipmentRateTable({ projectId }: { projectId: string }) {
  const rates = useCore((s) => s.equipmentRates);
  const versions = useCore((s) => s.policies);
  useEffect(() => {
    void useCore.getState().loadRates(projectId || undefined);
  }, [projectId]);
  const shown = projectId ? rates.filter((r) => r.projectId === projectId) : rates;
  const effective = (versionId: string | null) => versions.find((v) => v.id === versionId)?.effectiveFrom ?? '';
  return (
    <Card title="Rental and hire rates" subtitle={projectId ? 'Rates uploaded for the selected project.' : 'Rates uploaded for all projects. Choose a project to narrow the list.'}>
      <MiniTable
        head={['Equipment type', 'Basis', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Remarks', 'From']}
        empty="No equipment rates yet. Upload a rate sheet on the Company policies page."
        rows={shown.map((r) => [<strong key="t">{r.equipmentType}</strong>, r.rateBasis, r.unit, money(r.rate), money(r.amount), r.remarks || '—', fmtDate(effective(r.policyVersionId))])}
      />
    </Card>
  );
}

/** The rates uploaded for a project, for the Material management module. */
export function MaterialRateTable({ projectId }: { projectId: string }) {
  const rates = useCore((s) => s.materialRates);
  const versions = useCore((s) => s.policies);
  useEffect(() => {
    void useCore.getState().loadRates(projectId || undefined);
  }, [projectId]);
  const shown = projectId ? rates.filter((r) => r.projectId === projectId) : rates;
  const effective = (versionId: string | null) => versions.find((v) => v.id === versionId)?.effectiveFrom ?? '';
  return (
    <Card title="Material rates" subtitle={projectId ? 'Rates uploaded for the selected project.' : 'Rates uploaded for all projects. Choose a project to narrow the list.'}>
      <MiniTable
        head={['Material', 'Code', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Remarks', 'From']}
        empty="No material rates yet. Upload a rate sheet on the Company policies page."
        rows={shown.map((r) => [<strong key="m">{r.materialName}</strong>, r.materialCode || '—', r.uom, money(r.rate), money(r.amount), r.remarks || '—', fmtDate(effective(r.policyVersionId))])}
      />
    </Card>
  );
}
