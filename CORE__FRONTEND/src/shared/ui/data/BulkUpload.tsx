import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { cn } from '@/shared/lib/cn'
import { csvRecords, downloadText, toCsv } from '@/shared/lib/csv'
import { spreadsheetRecords } from '@/shared/lib/spreadsheet'
import { notify } from '@/shared/lib/toast'
import { Icon } from '@/shared/ui/icons'

export interface BulkField {
  /** CSV column name (snake_case) */
  key: string
  label: string
  required?: boolean
  /** value used in the template's example row */
  example: string
  /** allowed values or format, shown in the column guide */
  hint?: string
}

/** Result of checking one CSV row: a value to import, or the reasons it can't be. */
export type RowCheck<T> = { label: string; value: T; errors?: undefined } | { label: string; errors: string[]; value?: undefined }

interface Props<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** plural noun, e.g. "materials" */
  noun: string
  fields: BulkField[]
  /** more example rows for the template, in field order */
  examples?: string[][]
  /** checks every row together, so duplicates inside the file are caught too */
  validate: (records: Record<string, string>[]) => RowCheck<T>[]
  onImport: (values: T[]) => void
  templateName: string
  /** shown under the drop zone */
  note?: ReactNode
  /** label for the import button, e.g. "Add to form" */
  importLabel?: string
}

const MAX_BYTES = 1024 * 1024
const MAX_ROWS = 500

/** Template → drop a CSV → see every row checked → import the good ones. */
export function BulkUpload<T>(props: Props<T>) {
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} title={`Bulk upload ${props.noun}`} description={`Upload a CSV file to add many ${props.noun} at once.`}>
      {props.open && <BulkBody {...props} />}
    </Modal>
  )
}

function BulkBody<T>({ noun, fields, examples = [], validate, onImport, onOpenChange, templateName, note, importLabel }: Props<T>) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<{ name: string; rows: RowCheck<T>[] } | null>(null)
  const [show, setShow] = useState<'all' | 'errors'>('all')

  const template = () => downloadText(`${templateName}.csv`, toCsv(fields.map((f) => f.key), [fields.map((f) => f.example), ...examples]))

  const read = (f: File | undefined) => {
    setError('')
    if (!f) return
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) return setError('Choose a .csv or .xlsx file.')
    if (f.size > MAX_BYTES) return setError('The file is larger than 1 MB. Split it into smaller files.')
    const reader = new FileReader()
    reader.onerror = () => setError('The file could not be read. Try again.')
    reader.onload = () => {
      const isSheet = /\.(xlsx|xls)$/i.test(f.name)
      const { keys, records } = isSheet
        ? spreadsheetRecords(reader.result as ArrayBuffer)
        : csvRecords(String(reader.result ?? ''))
      const missing = fields.filter((x) => x.required && !keys.includes(x.key)).map((x) => x.key)
      if (missing.length) return setError(`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template to see the exact headings.`)
      if (!records.length) return setError('The file has headings but no rows.')
      if (records.length > MAX_ROWS) return setError(`The file has ${records.length} rows. Upload at most ${MAX_ROWS} at a time.`)
      setFile({ name: f.name, rows: validate(records) })
      setShow('all')
    }
    if (/\.(xlsx|xls)$/i.test(f.name)) reader.readAsArrayBuffer(f)
    else reader.readAsText(f)
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]) }

  if (!file) {
    return (
      <>
        <div className="bulk-steps">
          <div><span className="step-n">1</span><div><strong>Get the template</strong><span>Fill one row per record. Keep the headings as they are.</span></div><Button size="sm" icon="download" onClick={template}>Download template</Button></div>
          <div><span className="step-n">2</span><div><strong>Upload the filled file</strong><span>CSV or Excel (.xlsx), up to 1 MB and {MAX_ROWS} rows. Every row is checked before anything is added.</span></div></div>
        </div>
        <label className={cn('drop-zone', drag && 'is-drag')} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          <input ref={input} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label={`CSV file of ${noun}`} onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} />
          <span className="drop-ico"><Icon name="upload" /></span>
          <strong>Drop the CSV or Excel file here</strong>
          <span>or <u>choose a file</u> from this computer</span>
        </label>
        {error && <p className="login-error" role="alert" style={{ marginTop: 12 }}><Icon name="alert" />{error}</p>}
        {note && <div style={{ marginTop: 12 }}>{note}</div>}
        <details className="faq-row bulk-guide">
          <summary><span>Column guide ({fields.length} columns)</span></summary>
          <div className="table-wrap mini-table">
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Column</th><th>What to Enter</th><th>Example</th></tr></thead>
              <tbody>{fields.map((f) => (
                <tr key={f.key}>
                  <td data-label="Column"><code>{f.key}</code>{f.required && <span className="required"> *</span>}</td>
                  <td data-label="What to enter">{f.label}{f.hint && <span className="sub">{f.hint}</span>}</td>
                  <td data-label="Example">{f.example || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
        <div className="form-actions"><Button onClick={() => onOpenChange(false)}>Cancel</Button></div>
      </>
    )
  }

  const ok = file.rows.filter((r) => !r.errors)
  const bad = file.rows.filter((r) => r.errors)
  const list = show === 'errors' ? file.rows.map((r, i) => ({ r, i })).filter((x) => x.r.errors) : file.rows.map((r, i) => ({ r, i }))
  const errorReport = () => downloadText(`${templateName}-errors.csv`, toCsv(['row', 'record', 'errors'], bad.map((r) => [String(file.rows.indexOf(r) + 2), r.label, (r.errors ?? []).join('; ')])))
  const run = () => {
    onImport(ok.map((r) => r.value as T))
    notify(`${ok.length} ${ok.length === 1 ? noun.replace(/s$/, '') : noun} added from ${file.name}`)
    onOpenChange(false)
  }

  return (
    <>
      <div className="bulk-file"><Icon name="files" /><strong>{file.name}</strong><button type="button" className="link-btn" onClick={() => { setFile(null); setError('') }}>Choose another file</button></div>
      <div className="gauge" style={{ margin: '14px 0' }}>
        <div><b>{file.rows.length}</b><span>Rows in file</span></div>
        <div><b className="ok-text">{ok.length}</b><span>Ready to add</span></div>
        <div><b className={bad.length ? 'warn-text' : undefined}>{bad.length}</b><span>With errors (skipped)</span></div>
      </div>
      {bad.length > 0 && (
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="seg-tabs" role="group" aria-label="Rows to show">
            <button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')}>All rows</button>
            <button type="button" aria-pressed={show === 'errors'} onClick={() => setShow('errors')}>Errors only</button>
          </div>
          <Button size="sm" icon="download" onClick={errorReport}>Error report</Button>
        </div>
      )}
      <div className="bulk-list" role="list" aria-label="Checked rows">
        {list.map(({ r, i }) => (
          <div key={i} role="listitem" className={cn('bulk-row', r.errors && 'has-error')}>
            <span className="bulk-n">Row {i + 2}</span>
            <div style={{ minWidth: 0 }}>
              <strong>{r.label || '(blank)'}</strong>
              {r.errors ? <ul>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : <span className="ok-text">Ready</span>}
            </div>
            <Icon name={r.errors ? 'xc' : 'checkc'} className={r.errors ? 'warn-text' : 'ok-text'} />
          </div>
        ))}
      </div>
      <div className="form-actions">
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button tone="primary" icon="upload" disabled={!ok.length} onClick={run}>{importLabel ?? `Add ${ok.length} ${ok.length === 1 ? noun.replace(/s$/, '') : noun}`}</Button>
      </div>
    </>
  )
}
