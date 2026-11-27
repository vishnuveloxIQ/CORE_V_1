import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { BulkUpload, type RowCheck } from '@/shared/ui/data/BulkUpload'
import { MiniTable } from '@/shared/ui/Extras'
import { StatusBadge } from '@/shared/ui/Status'
import { bulk } from '@/shared/lib/bulk'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { errorText } from '@/shared/lib/api'
import { policyState, useCore, type EquipmentRate, type MaterialRate, type PolicyKey, type PolicyVersion } from '@/modules/core-data'
import { Can, MANAGE } from '@/modules/auth'
import { ScopePicker, scopeIds, type ScopeValue } from './ScopePicker'

type RateKind = 'equipment-rates' | 'material-rates'
const BASIS = ['rental', 'hire'] as const

/** One row of an equipment rate sheet, checked and ready to save. */
interface EquipmentLine { effectiveFrom: string; equipmentType: string; rateBasis: 'rental' | 'hire'; unit: string; rate: number; amount: number | null; remarks: string }
/** One row of a material rate sheet, checked and ready to save. */
interface MaterialLine { effectiveFrom: string; materialName: string; materialCode: string; uom: string; rate: number; amount: number | null; remarks: string }

const money = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }))

/**
 * Upload of the Fleet and Equipment or Material management rate sheet for one project (Excel or CSV). Every row is
 * checked before anything is saved. The sheet is recorded as a policy version for the project, and its rows go to the
 * rate tables the module reads.
 */
export function RateSheetPanel({ kind, projectId, projectName, policies }: { kind: RateKind; projectId: string; projectName: string; policies: PolicyVersion[] }) {
  const [upload, setUpload] = useState(false)
  // where the uploaded sheet applies: the whole company (every project), or the chosen projects (the page's project by default)
  const [scope, setScope] = useState<ScopeValue>({ mode: 'projects', projectIds: [projectId] })
  const projects = useCore((s) => s.projects)
  const equipmentTypes = useCore((s) => s.equipmentTypes)
  const equipmentRates = useCore((s) => s.equipmentRates)
  const materialRates = useCore((s) => s.materialRates)
  const saveEquipment = useCore((s) => s.saveEquipmentRateSheet)
  const saveMaterial = useCore((s) => s.saveMaterialRateSheet)
  const isEquipment = kind === 'equipment-rates'
  const history = policyState(policies, kind as PolicyKey, undefined, projectId)

  const equipmentFields = [
    { key: 'equipment_type', label: 'Equipment type', required: true, example: equipmentTypes[0]?.name ?? 'Excavator', hint: `Types: ${equipmentTypes.map((t) => t.name).join(', ') || 'none yet'}` },
    { key: 'rate_basis', label: 'Rate basis', required: true, example: 'rental', hint: 'rental or hire' },
    { key: 'unit', label: 'Unit', required: true, example: 'hour', hint: 'for example hour, day or month' },
    { key: 'rate', label: 'Rate (₹)', required: true, example: '1800', hint: 'Number, 0 or more' },
    { key: 'amount', label: 'Amount (₹)', required: false, example: '', hint: 'Optional, number, 0 or more' },
    { key: 'remarks', label: 'Remarks', required: false, example: '' },
    { key: 'effective_from', label: 'Effective from', required: true, example: '2027-01-01', hint: 'yyyy-mm-dd' },
  ]
  const materialFields = [
    { key: 'material_name', label: 'Material name', required: true, example: 'Cement OPC 53' },
    { key: 'material_code', label: 'Material code', required: false, example: 'CEM-53' },
    { key: 'uom', label: 'Unit of measure', required: true, example: 'MT' },
    { key: 'rate', label: 'Rate (₹)', required: true, example: '6200', hint: 'Number, 0 or more' },
    { key: 'amount', label: 'Amount (₹)', required: false, example: '', hint: 'Optional, number, 0 or more' },
    { key: 'remarks', label: 'Remarks', required: false, example: '' },
    { key: 'effective_from', label: 'Effective from', required: true, example: '2027-01-01', hint: 'yyyy-mm-dd' },
  ]

  const optionalNumber = (v: string | undefined) => {
    if (!v || v.trim() === '') return { ok: true as const, value: null }
    const n = bulk.num(v)
    return Number.isFinite(n) && n >= 0 ? { ok: true as const, value: n } : { ok: false as const }
  }

  const validateEquipment = (records: Record<string, string>[]): RowCheck<EquipmentLine>[] =>
    records.map((r) => {
      const errors: string[] = []
      const type = equipmentTypes.find((t) => t.name.trim().toLowerCase() === (r.equipment_type ?? '').trim().toLowerCase())
      const basis = bulk.pick(r.rate_basis ?? '', BASIS)
      const rate = bulk.num(r.rate ?? '')
      const amount = optionalNumber(r.amount)
      if (!type) errors.push(`equipment_type ${r.equipment_type || '(blank)'} is not an equipment type on the server.`)
      if (!basis) errors.push('rate_basis must be rental or hire.')
      if (!(r.unit ?? '').trim()) errors.push('unit is required.')
      if (!Number.isFinite(rate) || rate < 0) errors.push('rate must be a number, 0 or more.')
      if (!amount.ok) errors.push('amount must be a number, 0 or more, or blank.')
      if (!bulk.date(r.effective_from ?? '')) errors.push('effective_from must be a date like 2027-01-01.')
      const label = `${type?.name ?? r.equipment_type ?? '?'} · ${basis ?? r.rate_basis ?? '?'} · ${r.unit || '?'}`
      if (errors.length) return { label, errors }
      return {
        label,
        value: {
          effectiveFrom: r.effective_from.trim(), equipmentType: type!.name, rateBasis: basis!, unit: r.unit.trim(),
          rate, amount: amount.ok ? amount.value : null, remarks: (r.remarks ?? '').trim(),
        },
      }
    })

  const validateMaterial = (records: Record<string, string>[]): RowCheck<MaterialLine>[] =>
    records.map((r) => {
      const errors: string[] = []
      const rate = bulk.num(r.rate ?? '')
      const amount = optionalNumber(r.amount)
      if (!(r.material_name ?? '').trim()) errors.push('material_name is required.')
      if (!(r.uom ?? '').trim()) errors.push('uom is required.')
      if (!Number.isFinite(rate) || rate < 0) errors.push('rate must be a number, 0 or more.')
      if (!amount.ok) errors.push('amount must be a number, 0 or more, or blank.')
      if (!bulk.date(r.effective_from ?? '')) errors.push('effective_from must be a date like 2027-01-01.')
      const label = `${r.material_name || '?'} · ${r.uom || '?'}`
      if (errors.length) return { label, errors }
      return {
        label,
        value: {
          effectiveFrom: r.effective_from.trim(), materialName: r.material_name.trim(), materialCode: (r.material_code ?? '').trim(),
          uom: r.uom.trim(), rate, amount: amount.ok ? amount.value : null, remarks: (r.remarks ?? '').trim(),
        },
      }
    })

  /** Groups the rows by effective date: one policy version per date. */
  const byDate = <T extends { effectiveFrom: string }>(rows: T[]) => {
    const groups = new Map<string, T[]>()
    for (const r of rows) groups.set(r.effectiveFrom, [...(groups.get(r.effectiveFrom) ?? []), r])
    return [...groups.entries()]
  }

  const importRows = async (rows: EquipmentLine[] | MaterialLine[]) => {
    const fileName = `${isEquipment ? 'Fleet and equipment' : 'Material management'} rate sheet ${new Date().toISOString().slice(0, 10)}`
    // the same rows are saved for each target project: every project when the scope is the whole company
    const targets = scopeIds(scope) ?? projects.map((p) => p.id);
    try {
      for (const target of targets) {
        if (isEquipment) {
          for (const [date, group] of byDate(rows as EquipmentLine[])) {
            await saveEquipment(target, fileName, date, group.map(({ effectiveFrom: _date, ...r }) => r))
          }
        } else {
          for (const [date, group] of byDate(rows as MaterialLine[])) {
            await saveMaterial(target, fileName, date, group.map(({ effectiveFrom: _date, ...r }) => r))
          }
        }
      }
      const scopeText = scope.mode === 'company' ? 'the whole company' : targets.length === 1 ? projectName : `${targets.length} projects`
      notify(`${rows.length} ${isEquipment ? 'equipment' : 'material'} rate${rows.length === 1 ? '' : 's'} saved for ${scopeText}`)
    } catch (err) {
      notify(`Rates not saved: ${errorText(err)}`, 8000)
    }
  }

  const rateRows = isEquipment ? equipmentRates.filter((r) => r.projectId === projectId) : materialRates.filter((r) => r.projectId === projectId)

  return (
    <>
      <Card
        title={`${isEquipment ? 'Equipment rates' : 'Material rates'} for ${projectName}`}
        subtitle={isEquipment ? 'Rental and hire rates the Fleet and Equipment module uses for this project.' : 'Rates the Material management module uses for this project.'}
        action={<Can privilege={MANAGE.masters}><Button tone="primary" icon="upload" disabled={scope.mode === 'projects' && scope.projectIds.length === 0} onClick={() => setUpload(true)}>Upload rate sheet</Button></Can>}
      >
        <ScopePicker value={scope} onChange={setScope} projects={projects} />
        {isEquipment ? (
          <MiniTable
            head={['Equipment type', 'Basis', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Remarks', 'From']}
            empty="No equipment rates for this project yet. Upload an Excel rate sheet."
            rows={(rateRows as EquipmentRate[]).map((r) => [<strong key="t">{r.equipmentType}</strong>, r.rateBasis, r.unit, money(r.rate), money(r.amount), r.remarks || '—', fmtDate(effectiveOf(history.versions, r.policyVersionId))])}
          />
        ) : (
          <MiniTable
            head={['Material', 'Code', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Remarks', 'From']}
            empty="No material rates for this project yet. Upload an Excel rate sheet."
            rows={(rateRows as MaterialRate[]).map((r) => [<strong key="m">{r.materialName}</strong>, r.materialCode || '—', r.uom, money(r.rate), money(r.amount), r.remarks || '—', fmtDate(effectiveOf(history.versions, r.policyVersionId))])}
          />
        )}
      </Card>

      <div style={{ marginTop: 18 }}>
        <Card title="Rate sheets uploaded" subtitle="Each upload is kept as a version for this project. Earlier uploads are not changed.">
          <MiniTable
            head={['Version', 'Effective from', 'Sheet', 'Rows', 'Status']}
            empty="No rate sheet has been uploaded for this project yet."
            rows={history.versions.map((v) => [
              `v${v.version}`,
              fmtDate(v.effectiveFrom),
              String((v.data as { fileName?: string } | undefined)?.fileName || v.reason || '—'),
              String((v.data as { rows?: number } | undefined)?.rows ?? '—'),
              <StatusBadge key="s" tone="approved">Published</StatusBadge>,
            ])}
          />
        </Card>
      </div>

      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun={isEquipment ? 'equipment rates' : 'material rates'}
        templateName={isEquipment ? 'core-equipment-rate-template' : 'core-material-rate-template'}
        fields={isEquipment ? equipmentFields : materialFields}
        validate={(records) => (isEquipment ? validateEquipment(records) : validateMaterial(records)) as RowCheck<EquipmentLine | MaterialLine>[]}
        onImport={(list) => void importRows(list as EquipmentLine[] | MaterialLine[])}
        note="Upload an Excel (.xlsx) or CSV rate sheet. Every row is checked before anything is saved."
      />
    </>
  )
}

/** The effective date of the version a rate row came from (blank when the version is not known). */
function effectiveOf(versions: { id: string; effectiveFrom: string }[], versionId: string | null) {
  return versions.find((v) => v.id === versionId)?.effectiveFrom ?? ''
}
