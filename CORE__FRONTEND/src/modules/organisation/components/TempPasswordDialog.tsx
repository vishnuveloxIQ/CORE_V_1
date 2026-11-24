import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { MiniTable, Note } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import { downloadText, toCsv } from '@/shared/lib/csv'

/** A login and its one-time temporary password, as the server returned it. Held only by the open dialog. */
export interface TempPassword { loginId: string; name: string; temporaryPassword: string }

/**
 * Shows temporary passwords once, straight from the server's answer. They live only in the caller's component state
 * while this dialog is open: never in the store, browser storage, logs or the audit page. Closing it discards them.
 */
export function TempPasswordDialog({ entries, title, onClose }: { entries: TempPassword[] | null; title?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (!entries?.length) return null
  const one = entries.length === 1 ? entries[0] : null
  const text = one ? one.temporaryPassword : entries.map((e) => `${e.loginId}\t${e.temporaryPassword}`).join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const close = () => { setCopied(false); onClose() }
  return (
    <Modal open onOpenChange={(o) => !o && close()} title={title ?? (one ? 'Temporary password' : 'Temporary passwords')}>
      <Note title="Shown only once" icon="alert" className="mt-0">
        {one ? 'This password' : 'These passwords'} will not be shown again. Copy {one ? 'it' : 'them'} now and pass {one ? 'it' : 'them'} on
        securely. The user must change the password at the next sign-in.
      </Note>
      {one ? (
        <div className="detail-grid" style={{ marginTop: 14 }}>
          <div><span className="sub">Login ID</span><strong>{one.loginId}</strong></div>
          <div>
            <span className="sub">Temporary password</span>
            <code aria-label="Temporary password" style={{ fontSize: 15, userSelect: 'all' }}>{one.temporaryPassword}</code>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <MiniTable head={['Login ID', 'Name', 'Temporary password']} rows={entries.map((e) => [
            <strong key="l">{e.loginId}</strong>, e.name, <code key="p" style={{ userSelect: 'all' }}>{e.temporaryPassword}</code>,
          ])} />
        </div>
      )}
      {copied && <p role="status" className="ok-text" style={{ marginBottom: 0 }}>Copied to the clipboard.</p>}
      <div className="form-actions">
        {!one && (
          <Button icon="download" onClick={() => downloadText('new-user-passwords.csv', toCsv(['login_id', 'name', 'temporary_password'], entries.map((e) => [e.loginId, e.name, e.temporaryPassword])))}>
            Download CSV
          </Button>
        )}
        <Button icon="copy" onClick={() => void copy()}>Copy</Button>
        <Button tone="primary" onClick={close}>Done</Button>
      </div>
    </Modal>
  )
}
