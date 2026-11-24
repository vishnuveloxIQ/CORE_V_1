import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/shared/ui/Button'
import { Muted, Note } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import { StatusBadge } from '@/shared/ui/Status'
import type { OfferLetterFile, OfferLetterRevision } from '@/modules/core-data'
import { cn } from '@/shared/lib/cn'
import { errorText } from '@/shared/lib/api'
import { fmtDateTime } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { Icon } from '@/shared/ui/icons'
import { fetchFileContent, useCore } from '@/modules/core-data'
import { useAuth } from '@/modules/auth'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'

const TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
}
const MAX = 2 * 1024 * 1024
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** data: URL → object URL (browsers block opening data: URLs directly). */
async function objectUrl(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob()
  return URL.createObjectURL(blob)
}

async function download(f: OfferLetterFile) {
  const url = await objectUrl(f.dataUrl)
  const a = document.createElement('a')
  a.href = url; a.download = f.fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The one offer letter format. Shows the current file; "Update format" lets the Tenant Admin pick a new file,
 * then choose to replace the current one or keep it. No versions to approve — the latest upload is the format.
 */
export function OfferLetterPanel({ compact, editing = true }: { compact?: boolean; editing?: boolean }) {
  const current = useCore((s) => s.company.offerLetter)
  const setOfferLetterRemote = useCore((s) => s.setOfferLetterRemote)
  const loadOrganisation = useCore((s) => s.loadOrganisation)
  const remote = useRemoteSave(() => loadOrganisation(true))
  const revisions = useCore((s) => s.offerLetterRevisions)
  const revisionsError = useCore((s) => s.offerLetterRevisionsError)
  const loadRevisions = useCore((s) => s.loadOfferLetterRevisions)
  // The history is for organisation managers only: GET /offer-letter/revisions needs organisation.manage.
  const canSeeHistory = useAuth((s) => s.privileges.includes('organisation.manage'))
  useEffect(() => { if (canSeeHistory) void loadRevisions() }, [canSeeHistory, loadRevisions])
  const input = useRef<HTMLInputElement>(null)
  const [updating, setUpdating] = useState(!current)
  const [next, setNext] = useState<Pick<OfferLetterFile, 'fileName' | 'mimeType' | 'size' | 'dataUrl'> | null>(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [preview, setPreview] = useState(false)
  const open = editing && updating

  const pick = (file: File | undefined) => {
    setError('')
    if (!file) return
    const type = TYPES[file.type] ? file.type : /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.doc$/i.test(file.name) ? 'application/msword' : ''
    if (!type) return setError('Use a PDF or Word file (.pdf, .doc, .docx).')
    if (file.size > MAX) return setError('The file must be 2 MB or smaller.')
    const reader = new FileReader()
    reader.onerror = () => setError('The file could not be read. Try again.')
    reader.onload = () => setNext({ fileName: file.name, mimeType: type, size: file.size, dataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }
  const keep = () => { setNext(null); setUpdating(false); setError(''); notify('Kept the current offer letter format') }
  const replace = async () => {
    if (!next) return
    const saved = await remote.run(next, async (key) => { await setOfferLetterRemote(next, key); return true })
    if (!saved) return
    notify(current ? `Offer letter format replaced with ${next.fileName}` : `Offer letter format uploaded: ${next.fileName}`)
    setNext(null); setUpdating(false)
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {current ? (
        <div className="file-card">
          <span className="file-ico"><Icon name="fileCheck" /></span>
          <div style={{ minWidth: 0 }}>
            <div className="row-actions" style={{ gap: 6 }}><strong className="file-name">{current.fileName}</strong><StatusBadge tone="approved">Current</StatusBadge></div>
            <span className="sub">{TYPES[current.mimeType] ?? 'File'} · {kb(current.size)} · revision {current.revision}</span>
            <span className="sub">Updated {fmtDateTime(current.updatedAt)} by {current.updatedBy}</span>
          </div>
        </div>
      ) : <Note title="No offer letter format yet" icon="alert" className="mt-0">HRMS cannot issue offer letters until a format is uploaded.</Note>}

      {canSeeHistory && <RevisionHistory rows={revisions} error={revisionsError} />}

      {current && !open && (
        <div className="row-actions">
          <Button size="sm" icon="eye" disabled={!current.dataUrl} onClick={() => setPreview(true)}>Preview</Button>
          <Button size="sm" icon="download" disabled={!current.dataUrl} onClick={() => void download(current)}>Download</Button>
          {editing && <Button size="sm" icon="upload" onClick={() => setUpdating(true)}>Update format</Button>}
        </div>
      )}
      {!editing && <Muted>Click “Edit profile” to upload or change the offer letter format.</Muted>}

      {open && !next && (
        <>
          <label className={cn('drop-zone', compact && 'is-compact', drag && 'is-drag')} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
            <input ref={input} type="file" className="sr-only" aria-label="Offer letter format file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
            <span className="drop-ico"><Icon name="upload" /></span>
            <strong>{current ? 'Drop the new format here' : 'Drop the offer letter format here'}</strong>
            <span>PDF or Word, up to 2 MB · or <u>choose a file</u></span>
          </label>
          {error && <p className="login-error" role="alert" style={{ margin: 0 }}><Icon name="alert" />{error}</p>}
          {current && <div className="row-actions"><Button size="sm" onClick={() => { setUpdating(false); setError('') }}>Cancel</Button></div>}
        </>
      )}

      {editing && next && (
        <div className="replace-box" role="group" aria-label="Replace the offer letter format?">
          <strong>{current ? 'Replace the current format?' : 'Use this file as the format?'}</strong>
          <div className="replace-grid">
            {current && <div><span className="k">Current</span><span>{current.fileName}</span><span className="sub">revision {current.revision}</span></div>}
            <div><span className="k">New</span><span>{next.fileName}</span><span className="sub">{TYPES[next.mimeType]} · {kb(next.size)}</span></div>
          </div>
          <p>HRMS uses the new file for every offer letter from now on. Letters already issued keep their wording.</p>
          {remote.error && <p className="login-error" role="alert" style={{ margin: 0 }}><Icon name="alert" />{remote.error}</p>}
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={keep}>{current ? 'Keep current' : 'Cancel'}</Button>
            <Button tone="primary" icon="check" disabled={remote.saving} onClick={() => void replace()}>{current ? 'Replace format' : 'Use this format'}</Button>
          </div>
        </div>
      )}

      {current && <PreviewDialog file={current} open={preview} onOpenChange={setPreview} />}
    </div>
  )
}

/** Every stored offer letter, newest first. Rows whose bytes are stored can be previewed and downloaded. */
function RevisionHistory({ rows, error }: { rows: OfferLetterRevision[]; error: string }) {
  const [busy, setBusy] = useState('')
  const [failure, setFailure] = useState('')

  const blobUrl = async (r: OfferLetterRevision) => URL.createObjectURL(await fetchFileContent(r.fileId))

  const preview = async (r: OfferLetterRevision) => {
    setFailure(''); setBusy(`${r.id}:preview`)
    try {
      const url = await blobUrl(r)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) { setFailure(errorText(err)) } finally { setBusy('') }
  }

  const save = async (r: OfferLetterRevision) => {
    setFailure(''); setBusy(`${r.id}:download`)
    try {
      const url = await blobUrl(r)
      const a = document.createElement('a')
      a.href = url; a.download = r.fileName
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setFailure(errorText(err)) } finally { setBusy('') }
  }

  return (
    <section className="stack" style={{ gap: 8 }} aria-label="Revision history">
      <strong>Revision history</strong>
      {error && <p className="login-error" role="alert" style={{ margin: 0 }}><Icon name="alert" />{error}</p>}
      {failure && <p className="login-error" role="alert" style={{ margin: 0 }}><Icon name="alert" />{failure}</p>}
      {!error && rows.length === 0 && <Muted>No revisions recorded yet.</Muted>}
      {rows.map((r) => (
        <div key={r.id} className="file-card">
          <span className="file-ico"><Icon name="fileCheck" /></span>
          <div style={{ minWidth: 0 }}>
            <span className="file-name">Revision {r.revision}: {r.fileName}</span>
            <span className="sub">{TYPES[r.mimeType] ?? 'File'} · {kb(r.size)}</span>
            <span className="sub">Uploaded {fmtDateTime(r.createdAt)} by {r.uploadedBy ?? 'Unknown'}</span>
            {r.hasContent
              ? <div className="row-actions" style={{ gap: 6 }}>
                  <Button size="sm" icon="eye" disabled={busy !== ''} onClick={() => void preview(r)}>Preview</Button>
                  <Button size="sm" icon="download" disabled={busy !== ''} onClick={() => void save(r)}>Download</Button>
                </div>
              : <span className="sub">No file stored, upload again to restore</span>}
          </div>
        </div>
      ))}
    </section>
  )
}

function PreviewDialog({ file, open, onOpenChange }:{ file: OfferLetterFile; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Offer letter format" size="full" description={`Preview of ${file.fileName}`}>
      {open && <PreviewBody file={file} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

function PreviewBody({ file, onClose }: { file: OfferLetterFile; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const isPdf = file.mimeType === 'application/pdf'
  useEffect(() => {
    if (!isPdf) return
    let u = ''
    let live = true
    objectUrl(file.dataUrl).then((x) => { u = x; if (live) setUrl(x); else URL.revokeObjectURL(x) }).catch(() => undefined)
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [file.dataUrl, isPdf])
  return (
    <>
      <p style={{ marginTop: 0, fontSize: 13 }}><strong>{file.fileName}</strong> · revision {file.revision} · updated {fmtDateTime(file.updatedAt)}</p>
      {isPdf
        ? (url ? <iframe ref={frameRef} className="pdf-frame" src={url} title={`Preview of ${file.fileName}`} /> : <div className="pdf-frame is-loading">Loading preview…</div>)
        : <Note title="Preview is for PDF files" icon="info" className="mt-0">Download the Word file to open it.</Note>}
      <div className="form-actions"><Button icon="download" onClick={() => void download(file)}>Download</Button>{isPdf && <Button icon="print" disabled={!url} onClick={() => frameRef.current?.contentWindow?.print()}>Print</Button>}<Button tone="primary" onClick={onClose}>Close</Button></div>
    </>
  )
}
