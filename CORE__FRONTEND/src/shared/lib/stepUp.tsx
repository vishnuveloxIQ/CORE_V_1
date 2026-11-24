/* eslint-disable react-refresh/only-export-components */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { useState, type FormEvent } from 'react'
import { create } from 'zustand'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { api, errorText, hasStepUp, setStepUpToken } from '@/shared/lib/api'

// The step-up calls live here, beside the dialog that makes them, so shared code does not depend on a module.
/** The passkey challenge for a step-up check. A user with no passkey gets 409 STEP_UP_NO_PASSKEY. */
const stepUpOptions = () => api<PublicKeyCredentialRequestOptionsJSON>('POST', '/auth/step-up/options', { body: {} })
/** Checks the passkey answer and returns the step-up token and when it stops working. */
const stepUpVerify = (response: AuthenticationResponseJSON) =>
  api<{ stepUpToken: string; expiresAt: string }>('POST', '/auth/step-up/verify', { body: { response } })
/** Checks the signed-in user's password and returns a step-up token that works only where a password check is allowed. */
const stepUpPassword = (password: string) =>
  api<{ stepUpToken: string; expiresAt: string }>('POST', '/auth/step-up/password', { body: { password } })

/** What a step-up prompt can offer. */
export interface StepUpOptions {
  /** also accept the user's password (geo-fence changes do); without it only a passkey check counts */
  allowPassword?: boolean
}

/**
 * Step-up authentication: geo-fence changes and privilege grants need a fresh check on this device. The server
 * issues a five-minute step-up token after the check; the API client sends it on those routes. While a usable token
 * is held, requireStepUp resolves at once and no prompt is shown. A password check opens geo-fence changes only;
 * privilege grants always need a passkey.
 */
interface StepUpState {
  action: string | null
  allowPassword: boolean
  resolve: ((ok: boolean) => void) | null
  ask: (action: string, opts?: StepUpOptions) => Promise<boolean>
  finish: (ok: boolean) => void
}

const useStepUpStore = create<StepUpState>()((set, get) => ({
  action: null,
  allowPassword: false,
  resolve: null,
  ask: (action, opts) => new Promise<boolean>((resolve) => { get().resolve?.(false); set({ action, allowPassword: !!opts?.allowPassword, resolve }) }),
  finish: (ok) => { get().resolve?.(ok); set({ action: null, allowPassword: false, resolve: null }) },
}))

/** `if (await requireStepUp('Change geo-fence', { allowPassword: true })) save()`. Resolves true at once while a usable token is held. */
export const requireStepUp = (action: string, opts?: StepUpOptions): Promise<boolean> =>
  hasStepUp(opts) ? Promise.resolve(true) : useStepUpStore.getState().ask(action, opts)

export function StepUpHost() {
  const action = useStepUpStore((s) => s.action)
  const allowPassword = useStepUpStore((s) => s.allowPassword)
  const finish = useStepUpStore((s) => s.finish)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const close = (ok: boolean) => { setError(''); setBusy(false); setPassword(''); finish(ok) }

  const verify = async () => {
    setBusy(true)
    setError('')
    try {
      if (!browserSupportsWebAuthn()) throw new Error('This browser does not support passkeys. Use a browser that does, then try again.')
      const options = await stepUpOptions()
      const response = await startAuthentication({ optionsJSON: options })
      const { stepUpToken, expiresAt } = await stepUpVerify(response)
      setStepUpToken(stepUpToken, expiresAt, 'passkey')
      close(true)
    } catch (err) {
      setBusy(false)
      // the browser throws when the user dismisses the passkey prompt
      setError(err instanceof DOMException ? 'The passkey prompt was closed. Try again to continue.' : errorText(err))
    }
  }

  const verifyPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Type your password to continue.')
    setBusy(true)
    setError('')
    try {
      const { stepUpToken, expiresAt } = await stepUpPassword(password)
      setStepUpToken(stepUpToken, expiresAt, 'password')
      close(true)
    } catch (err) {
      setBusy(false)
      setPassword('')
      setError(errorText(err))
    }
  }

  return (
    <Modal open={!!action} onOpenChange={(o) => { if (!o) close(false) }} title="Verify it's you" description={allowPassword ? 'Passkey or password check' : 'Passkey check'}>
      <p style={{ marginTop: 0, color: 'var(--ink-2)', fontSize: 13.5 }}>
        {allowPassword
          ? <><strong>{action}</strong> needs a quick check. Use the passkey on this device, or type your password. The check lasts five minutes.</>
          : <><strong>{action}</strong> needs a passkey check. Use the passkey on this device to continue. The check lasts five minutes.</>}
      </p>
      {error && <p role="alert" className="login-error" style={{ marginTop: 0 }}>{error}</p>}
      {allowPassword ? (
        <>
          <form onSubmit={(e) => void verifyPassword(e)} noValidate>
            <label htmlFor="step-up-password" style={{ display: 'block', fontSize: 13, fontWeight: 650, marginBottom: 8 }}>Password</label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
            />
            <div className="form-actions">
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" tone="primary" icon="check" disabled={busy || !password}>
                {busy ? 'Checking…' : 'Verify with password'}
              </Button>
            </div>
          </form>
          <p style={{ margin: '14px 0 8px', color: 'var(--muted)', fontSize: 12.5 }}>Or use a passkey instead</p>
          <Button icon="fingerprint" disabled={busy} onClick={() => void verify()}>
            {busy ? 'Checking…' : 'Use passkey'}
          </Button>
        </>
      ) : (
        <div className="form-actions">
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button tone="primary" icon="fingerprint" disabled={busy} onClick={() => void verify()}>
            {busy ? 'Checking…' : 'Use passkey'}
          </Button>
        </div>
      )}
    </Modal>
  )
}
