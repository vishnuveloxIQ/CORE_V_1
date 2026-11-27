import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHead } from '@/modules/shell'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormGroup, Textarea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { KV, Note } from '@/shared/ui/Extras'
import { StatusBadge } from '@/shared/ui/Status'
import { useEnter } from '@/shared/hooks/useMotion'
import { fmtDate, fmtDateTime } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { errorText } from '@/shared/lib/api'
import { quotationApi, type QuotationRecord } from '@/modules/core-data'
import { isFullAdvance, landedRate, MIN_QUOTATIONS, missingTerms, taxCheck } from '../utils/quotationChecks'

const num = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const TONE = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' } as const
const LABEL = { PENDING: 'Waiting for approval', APPROVED: 'Approved', REJECTED: 'Rejected' } as const
const right = { textAlign: 'right' as const }

/** One quotation as the administrator sees it before deciding: the vendor's quotation, then Approve or Reject. */
export default function QuotationDetail() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'quotation-detail')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [q, setQ] = useState<QuotationRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // approving with a note: asked when the payment terms are 100% advance
  const [approving, setApproving] = useState(false)
  const [note, setNote] = useState('')
  // every quotation, to find the others received for the same requirement
  const [all, setAll] = useState<QuotationRecord[]>([])

  useEffect(() => {
    let live = true
    quotationApi.getQuotation(id).then(
      (row) => { if (live) { setQ(row); setState('ready') } },
      (err: unknown) => { if (live) { setLoadError(errorText(err)); setState('error') } },
    )
    quotationApi.listQuotations().then((list) => { if (live) setAll(list) }, () => undefined)
    return () => { live = false }
  }, [id])

  if (!q) {
    return (
      <div ref={ref}>
        <PageHead crumb="Quotation approval" title="Quotation" />
        <Card>
          <EmptyState icon="files" title={state === 'loading' ? 'Loading the quotation…' : 'The quotation could not be loaded'}>
            {state === 'error' && <p>{loadError}</p>}
            <Button onClick={() => navigate('/quotation-approval')}>Back to quotation approval</Button>
          </EmptyState>
        </Card>
      </div>
    )
  }
  const d = q.document

  const decide = async (run: () => Promise<QuotationRecord>, done: string, fail: (msg: string) => void): Promise<boolean> => {
    setSaving(true)
    try {
      setQ(await run())
      notify(done)
      return true
    } catch (err) {
      fail(errorText(err))
      return false
    } finally {
      setSaving(false)
    }
  }
  const submitReject = (e: FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return setError('Give the reason for rejecting this quotation.')
    void decide(() => quotationApi.rejectQuotation(q.id, q.rowVersion, reason.trim()), `Quotation ${q.ref} rejected`, setError).then((ok) => { if (ok) setRejecting(false) })
  }
  const advance = isFullAdvance(d.termsOfPayment)
  const tax = taxCheck(d)
  const missing = missingTerms(d)
  // the quotations received for the same requirement (this one included); one without a key stands alone
  const others = d.comparison ? all.filter((x) => x.id !== q.id && x.document.comparison?.key === d.comparison?.key) : []
  const group = [q, ...others].sort((a, b) => a.amount - b.amount)
  const lowest = group[0]!.amount
  const approve = (withNote?: string) =>
    void decide(() => quotationApi.approveQuotation(q.id, q.rowVersion, withNote), `Quotation ${q.ref} approved`, (msg) => (approving ? setError(msg) : notify(msg))).then((ok) => { if (ok) setApproving(false) })
  const doApprove = () => {
    if (advance) { setNote(''); setError(''); setApproving(true) } else approve()
  }
  const submitApprove = (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return setError('Give the reason for accepting 100% advance payment.')
    approve(note.trim())
  }
  const stated = (v: string | undefined) => v ?? <span className="warn-text">Not stated</span>

  return (
    <div ref={ref}>
      <PageHead
        crumb={`Quotation approval / ${q.ref}`}
        title={`Quotation ${q.ref}`}
        desc={`From ${q.vendorName}`}
        actions={<>
          <Button icon="chevL" onClick={() => navigate('/quotation-approval')}>Back</Button>
          {q.status === 'PENDING' && <>
            <Button tone="danger" disabled={saving} onClick={() => { setReason(''); setError(''); setRejecting(true) }}>Reject</Button>
            <Button tone="primary" disabled={saving} onClick={doApprove}>Approve</Button>
          </>}
        </>}
      />
      {q.status !== 'PENDING' && (
        <Note title={`${LABEL[q.status]}${q.decidedAt ? ` on ${fmtDateTime(q.decidedAt)}` : ''}`} icon={q.status === 'APPROVED' ? 'checkc' : 'xc'}>
          {q.reason ? ` ${q.status === 'APPROVED' ? 'Note' : 'Reason'}: ${q.reason}` : ''}
        </Note>
      )}

      <Card title="Quotation" subtitle="Vendor quotation sent for approval">
        <div className="detail-grid">
          <KV k="Status"><StatusBadge tone={TONE[q.status]}>{LABEL[q.status]}</StatusBadge></KV>
          <KV k="Quotation no."><strong>{q.ref}</strong></KV>
          <KV k="Dated"><strong>{fmtDate(q.quotationDate)}</strong></KV>
          <KV k="Total (incl. tax)"><strong>{rupees.format(q.amount)}</strong></KV>
          <KV k="Mode / terms of payment"><strong>{d.termsOfPayment}</strong></KV>
          <KV k="Dispatched through"><strong>{d.refs.dispatchedThrough}</strong></KV>
          <KV k="Destination"><strong>{d.refs.destination}</strong></KV>
          <KV k="Place of supply"><strong>{d.placeOfSupply}</strong></KV>
          <KV k="Delivery period"><strong>{stated(d.commercial?.deliveryPeriod)}</strong></KV>
          <KV k="Quotation valid for"><strong>{stated(d.commercial?.validity)}</strong></KV>
          {/^(mt|ton|tonne|kg)$/i.test(d.qtyUnit) && <>
            <KV k="Weight basis"><strong>{stated(d.commercial?.weightBasis)}</strong></KV>
            <KV k="Test certificate"><strong>{stated(d.commercial?.testCertificate)}</strong></KV>
          </>}
        </div>
      </Card>

      <Card title="Checks before approving" subtitle="Points head office usually asks about. Resolve them with the vendor, or note why they are accepted.">
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>
            <strong>Quotations received:</strong> {group.length}{' '}
            {group.length < MIN_QUOTATIONS
              ? <span className="warn-text">Fewer than {MIN_QUOTATIONS}. Head office normally expects a comparison of at least {MIN_QUOTATIONS} quotations.</span>
              : <span>Compared below.</span>}
          </li>
          <li>
            <strong>Payment terms:</strong> {d.termsOfPayment}{' '}
            {advance && <span className="warn-text">100% advance. Try to negotiate payment on delivery, a part advance or credit, or note why it is accepted.</span>}
          </li>
          <li>
            <strong>Tax type:</strong> {d.taxLabel} @ {d.taxRate}%{' '}
            {tax ? <span className={tax.ok ? undefined : 'warn-text'}>{tax.message}</span> : <span className="warn-text">The vendor&rsquo;s state is not given, so the tax type could not be checked.</span>}
            {d.vendor.gstin && <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Vendor: {d.vendor.name}, GSTIN {d.vendor.gstin}{d.vendor.state ? `, ${d.vendor.state}` : ''}</div>}
          </li>
          <li>
            <strong>Brand, standard and terms:</strong>{' '}
            {missing.length ? <span className="warn-text">Not stated: {missing.join(', ')}.</span> : <span>Stated.</span>}
          </li>
          <li>
            <strong>Landed rate:</strong> the rate with the charges shared over the quantity, plus {d.taxRate}% tax, is shown in the goods table. Compare vendors on this figure, not on the basic rate.
          </li>
          <li>
            <strong>Vendor bank details:</strong> payment goes to the account shown below. Confirm it on the vendor&rsquo;s letterhead or a cancelled cheque before releasing money.
          </li>
        </ul>
      </Card>

      <Card title="Goods and services">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Sl no.</th><th>Description of goods and services</th><th>HSN/SAC</th><th style={right}>Quantity</th><th style={right}>Rate</th><th>Per</th><th style={right}>Amount (₹)</th><th style={right}>Landed rate (₹)</th></tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.no}>
                  <td>{l.no}</td>
                  <td><strong>{l.description}</strong>{l.details.map((t) => <div key={t} style={{ color: 'var(--muted)', fontSize: 12.5 }}>{t}</div>)}
                    <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Brand: {stated(l.brand)} · Standard: {stated(l.standard)}</div>
                  </td>
                  <td>{l.hsn}</td>
                  <td style={right}>{qty.format(l.quantity)} {l.unit}</td>
                  <td style={right}>{num.format(l.rate)}</td>
                  <td>{l.per}</td>
                  <td style={right}>{num.format(l.amount)}</td>
                  <td style={right}><strong>{num.format(landedRate(d, l))}</strong></td>
                </tr>
              ))}
              {d.charges.map((c) => (
                <tr key={c.label}><td></td><td>{c.label}</td><td>{c.hsn}</td><td></td><td></td><td></td><td style={right}>{num.format(c.amount)}</td><td></td></tr>
              ))}
              <tr>
                <td></td><td style={right}><em>{d.taxLabel} @ {d.taxRate}%</em></td><td></td><td></td><td></td><td></td><td style={right}>{num.format(d.taxAmount)}</td><td></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td></td><td style={right}><strong>Total</strong></td><td></td><td style={right}><strong>{qty.format(d.totalQty)} {d.qtyUnit}</strong></td><td></td><td></td>
                <td style={right}><strong>{rupees.format(d.total)}</strong></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {d.comparison && (
        <Card title="Comparison of quotations" subtitle={d.comparison.title}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  {d.lines.map((l) => <th key={l.no} style={right}>{l.description} {l.details.join(' ')}: landed rate (₹/{l.per})</th>)}
                  <th>Payment terms</th>
                  <th>Delivery</th>
                  <th style={right}>Total (incl. tax)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.map((x) => (
                  <tr key={x.id} style={x.id === q.id ? { fontWeight: 600 } : undefined}>
                    <td>
                      {x.id === q.id ? <>{x.vendorName} <span style={{ color: 'var(--muted)' }}>(this quotation)</span></> : <a href={`#/quotation-approval/${x.id}`}>{x.vendorName}</a>}
                      <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{x.ref}</div>
                    </td>
                    {d.lines.map((l, i) => {
                      const other = x.document.lines[i]
                      return <td key={l.no} style={right}>{other ? num.format(landedRate(x.document, other)) : '—'}<div style={{ color: 'var(--muted)', fontSize: 12.5 }}>basic {other ? num.format(other.rate) : '—'}</div></td>
                    })}
                    <td>{x.document.termsOfPayment}</td>
                    <td>{x.document.commercial?.deliveryPeriod ?? '—'}</td>
                    <td style={right}>{rupees.format(x.amount)}{x.amount === lowest && group.length > 1 && <div style={{ color: 'var(--green)', fontSize: 12.5 }}>Lowest</div>}</td>
                    <td><StatusBadge tone={TONE[x.status]}>{LABEL[x.status]}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Tax summary">
        <div className="table-wrap">
          <table>
            <thead><tr><th>HSN/SAC</th><th style={right}>Taxable value</th><th style={right}>{d.taxLabel} rate</th><th style={right}>Tax amount</th></tr></thead>
            <tbody>
              {d.hsnSummary.map((r) => (
                <tr key={r.hsn}><td>{r.hsn}</td><td style={right}>{num.format(r.taxable)}</td><td style={right}>{r.rate}%</td><td style={right}>{num.format(r.tax)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td><strong>Total</strong></td><td style={right}><strong>{num.format(d.taxable)}</strong></td><td></td><td style={right}><strong>{num.format(d.taxAmount)}</strong></td></tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="Vendor bank details">
        <div className="detail-grid">
          <KV k="Account holder"><strong>{d.bank.holder}</strong></KV>
          <KV k="Bank"><strong>{d.bank.bank}</strong></KV>
          <KV k="Account no."><strong>{d.bank.account}</strong></KV>
          <KV k="Branch and IFS code"><strong>{d.bank.branchIfsc}</strong></KV>
        </div>
      </Card>

      {approving && (
        <Modal open onOpenChange={(o) => !o && setApproving(false)} title="Approve quotation" description={`${q.ref} – ${q.vendorName}`}>
          <form noValidate onSubmit={submitApprove}>
            {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
            <p style={{ marginTop: 0 }}>The payment terms are {d.termsOfPayment}. Head office will ask why a 100% advance is accepted, so note it here.</p>
            <FormGroup label="Reason for accepting 100% advance" required>{(fid) => <Textarea id={fid} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</FormGroup>
            <div className="form-actions"><Button onClick={() => setApproving(false)}>Cancel</Button><Button tone="primary" type="submit" disabled={saving}>Approve quotation</Button></div>
          </form>
        </Modal>
      )}

      {rejecting && (
        <Modal open onOpenChange={(o) => !o && setRejecting(false)} title="Reject quotation" description={`${q.ref} – ${q.vendorName}`}>
          <form noValidate onSubmit={submitReject}>
            {error && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{error}</span></div>}
            <FormGroup label="Reason" required>{(fid) => <Textarea id={fid} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormGroup>
            <div className="form-actions"><Button onClick={() => setRejecting(false)}>Cancel</Button><Button tone="danger" type="submit">Reject quotation</Button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
