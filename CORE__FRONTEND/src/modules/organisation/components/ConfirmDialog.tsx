import { Button } from '@/shared/ui/Button'
import { Note } from '@/shared/ui/Extras'
import { Modal } from '@/shared/ui/Modal'
import type { CoreUser } from '@/modules/core-data'
import { notify } from '@/shared/lib/toast'
import { useState } from 'react'
import { useCore } from '@/modules/core-data'
import { errorText } from '@/shared/lib/api'
import { idempotencyKey } from '@/shared/lib/api'
import { TempPasswordDialog, type TempPassword } from './TempPasswordDialog'

const RESET_MSG = 'A new temporary password will be issued and shown to you once. The user must change it at the next sign-in, and all of their active sessions will be ended.'
const REVOKE_MSG = 'User access revoked. Their active sessions have ended. Requests waiting on them stay at their level: change the approval chain to give those levels another approver.'

export type Confirm = { kind: 'status' | 'reset'; user: CoreUser } | null

/** Deactivate / reactivate / reset password, with a confirmation. Shared by the list and the detail page. */
export function ConfirmDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const { users, setUserActiveRemote, resetUserPasswordRemote } = useCore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // the reset's one-time password: held only while its dialog is open
  const [issued, setIssued] = useState<TempPassword | null>(null)
  if (issued) return <TempPasswordDialog entries={[issued]} title="Password reset" onClose={() => { setIssued(null); onClose() }} />
  if (!confirm) return null
  const u = confirm.user
  const activating = u.status === 'Inactive'
  const clashes = activating && u.role === 'Module head'
    ? u.modules.map((m) => [m, users.find((x) => x.id !== u.id && x.role === 'Module head' && x.status === 'Active' && x.modules.includes(m))] as const).filter(([, h]) => h)
    : []
  const what = u.role === 'Module head' ? 'module administrator' : 'approver'
  const title = confirm.kind === 'reset' ? 'Reset password?' : activating ? `Reactivate ${what}?` : `Deactivate ${what}?`
  const close = () => { setError(''); onClose() }
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      if (confirm.kind === 'reset') {
        // POST /users/{id}/password-reset: the password comes back once and is shown, never stored
        const temporaryPassword = await resetUserPasswordRemote(u.id, idempotencyKey())
        setError('')
        setIssued({ loginId: u.loginId, name: u.name, temporaryPassword })
        return
      }
      // POST /access/users/{id}/suspensions, or .../restore of the open suspension
      await setUserActiveRemote(u.id, activating, activating ? 'Reactivated from the Users screen' : 'Deactivated from the Users screen')
      notify(activating ? `${u.name} reactivated` : REVOKE_MSG)
      close()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onOpenChange={(o) => !o && close()} title={title}>
      <p style={{ marginTop: 0, fontSize: 13.5 }}>
        {confirm.kind === 'reset'
          ? RESET_MSG
          : activating
            ? <>{u.name} will regain {u.role === 'Module head' ? `their ${u.modules.join(', ')} privileges and scope` : 'approver access'} immediately.</>
            : 'Are you sure you want to revoke this user’s access? Their active sessions will end. Requests waiting on them are not moved to anyone else: change the approval chain to give those levels another approver.'}
      </p>
      {clashes.length > 0 && <Note title="One administrator per module" icon="ban">{clashes.map(([m, h]) => `${m} already has an active head (${h!.name})`).join('; ')}. Deactivate them first, or open {u.name} and untick {clashes.length === 1 ? 'that module' : 'those modules'}.</Note>}
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="form-actions">
        <Button onClick={close}>Cancel</Button>
        <Button tone={confirm.kind === 'status' && !activating ? 'danger' : 'primary'} disabled={busy || clashes.length > 0} onClick={() => void run()}>
          {confirm.kind === 'reset' ? 'Reset password' : activating ? 'Reactivate' : 'Deactivate'}
        </Button>
      </div>
    </Modal>
  )
}
