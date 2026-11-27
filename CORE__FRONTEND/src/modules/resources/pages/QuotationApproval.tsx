import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '@/modules/shell'
import { TablePanel } from '@/shared/ui/data/TablePanel'
import { Button } from '@/shared/ui/Button'
import { Note } from '@/shared/ui/Extras'
import { StatTile } from '@/shared/ui/StatTile'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate } from '@/shared/lib/format'
import { errorText } from '@/shared/lib/api'
import { quotationApi, type QuotationRecord } from '@/modules/core-data'

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const TONE = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' } as const
const LABEL = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' } as const

/** Quotation approval: quotations waiting for the administrator's decision, and the ones already decided. */
export default function QuotationApproval() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'quotation-approval')
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<QuotationRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    quotationApi.listQuotations().then(
      (list) => { if (live) { setQuotations(list); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    return () => { live = false }
  }, [tick])

  const reload = () => { setState('loading'); setTick((t) => t + 1) }
  const waiting = quotations.filter((q) => q.status === 'PENDING')
  const decided = quotations.filter((q) => q.status !== 'PENDING')
  const sum = (list: QuotationRecord[]) => list.reduce((n, q) => n + q.amount, 0)

  const columns = [
    { header: 'Quotation no.', kind: 'c-id' as const, cell: (q: QuotationRecord) => q.ref, csv: (q: QuotationRecord) => q.ref },
    { header: 'Vendor', kind: 'c-sub' as const, cell: (q: QuotationRecord) => <strong>{q.vendorName}</strong>, csv: (q: QuotationRecord) => q.vendorName },
    { header: 'Delivery to', kind: 'c-more' as const, cell: (q: QuotationRecord) => q.destination ?? '—', csv: (q: QuotationRecord) => q.destination ?? '' },
    { header: 'Date', kind: 'c-more' as const, cell: (q: QuotationRecord) => fmtDate(q.quotationDate), csv: (q: QuotationRecord) => q.quotationDate },
    { header: 'Payment terms', kind: 'c-more' as const, cell: (q: QuotationRecord) => q.paymentTerms ?? '—', csv: (q: QuotationRecord) => q.paymentTerms ?? '' },
    { header: 'Amount (incl. tax)', kind: 'c-amt' as const, cell: (q: QuotationRecord) => rupees.format(q.amount), csv: (q: QuotationRecord) => String(q.amount) },
    { header: 'Status', kind: 'c-status' as const, cell: (q: QuotationRecord) => <StatusBadge tone={TONE[q.status]}>{LABEL[q.status]}</StatusBadge>, csv: (q: QuotationRecord) => LABEL[q.status] },
  ]
  const search = (q: QuotationRecord) => `${q.ref} ${q.vendorName} ${q.destination ?? ''}`

  return (
    <div ref={ref}>
      <PageHead
        crumb="Quotation approval"
        title="Quotation approval"
        desc="Quotations waiting for the administrator's approval. Open one to see the full quotation and decide."
      />
      {state === 'error' && (
        <Note title="The quotations could not be loaded" icon="alert">
          {loadError} <Button size="sm" icon="refresh" onClick={reload}>Try again</Button>
        </Note>
      )}
      <div className="grid stats">
        <StatTile label="Waiting for approval" value={waiting.length} icon="clock" tone="gold" />
        <StatTile label="Value waiting" value={rupees.format(sum(waiting))} icon="files" tone="blue" />
        <StatTile label="Approved" value={decided.filter((q) => q.status === 'APPROVED').length} icon="checkc" tone="green" />
        <StatTile label="Rejected" value={decided.filter((q) => q.status === 'REJECTED').length} icon="xc" tone="purple" />
      </div>
      <TablePanel
        title="Requests waiting for admin approval"
        subtitle="Open a quotation to review the goods, charges, tax and terms."
        rows={waiting}
        rowKey={(q) => q.id}
        columns={columns}
        searchText={search}
        searchPlaceholder="Search by number or vendor…"
        exportName="core-quotations-waiting"
        action={(q) => <Button size="sm" onClick={() => navigate(`/quotation-approval/${q.id}`)}>Review</Button>}
      />
      {decided.length > 0 && (
        <TablePanel
          title="Decided"
          subtitle="Quotations the administrator has approved or rejected."
          rows={decided}
          rowKey={(q) => q.id}
          columns={columns}
          searchText={search}
          searchPlaceholder="Search by number or vendor…"
          exportName="core-quotations-decided"
          action={(q) => <Button size="sm" onClick={() => navigate(`/quotation-approval/${q.id}`)}>View</Button>}
        />
      )}
    </div>
  )
}
