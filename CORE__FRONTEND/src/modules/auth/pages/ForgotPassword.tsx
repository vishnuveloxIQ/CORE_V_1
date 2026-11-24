import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import { Note } from '@/shared/ui/Extras'
import { a11y } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { useAuth } from '../store/useAuth'
import { confirmPasswordReset, requestPasswordReset } from '../api'
import { ApiError, errorText, fieldErrors, setTenantId } from '@/shared/lib/api'
import { PublicNav } from '../components/PublicNav'
import { tenantForLogin } from '../utils/tenants'

/**
 * Owner decision D10: until an email provider is chosen, the server accepts a fixed sample code and sends nothing.
 * The screen names it so testers can reset a password: VITE_SAMPLE_OTP_CODE when set, else 123456 in a development
 * build. A production build shows nothing unless the variable is set (for example on a staging build).
 */
const SAMPLE_OTP = (import.meta.env.VITE_SAMPLE_OTP_CODE as string | undefined) || (import.meta.env.DEV ? '123456' : '')

type Step = 'request' | 'verify'

const MAX_TRIES = 5

/**
 * Password reset against the Core API: POST /auth/password-reset/request sends a 6 digit code (the server chooses the
 * delivery), POST /auth/password-reset/confirm checks it and sets the new password. The server counts wrong codes.
 */
export default function ForgotPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const signedIn = useAuth((s) => s.user)
  const isAdmin = params.get('role') === 'admin'
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<Step>('request')
  const [loginId, setLoginId] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [tries, setTries] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fe, setFe] = useState<Record<string, string>>({})

  useEffect(() => { document.title = 'Reset password | VeloxIQ' }, [])
  if (signedIn) return <Navigate to="/dashboard" replace />

  const back = `/login?role=${isAdmin ? 'admin' : 'user'}`
  // TODO(backend): the API does not let the caller pick email or phone, or say where the code went
  const sentTo = 'your registered contact'

  const fail = (err: unknown) => {
    setFe(fieldErrors(err))
    if (err instanceof ApiError && err.code === 'RATE_LIMITED') setError(`Too many attempts. Try again${err.retryAfter ? ` in ${err.retryAfter} seconds` : ' later'}.`)
    else setError(errorText(err))
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!loginId.trim()) { setFe({ loginId: 'Enter your login ID.' }); return }
    if (!isAdmin && !/^[A-Za-z0-9]{3,6}\d{4}$/.test(loginId.trim())) { setFe({ loginId: 'Enter your login ID, for example ACME1234.' }); return }
    // the company comes from the login ID's prefix, as at sign-in; an unlisted prefix is never sent anywhere
    const tenant = tenantForLogin(loginId)
    if (!tenant) { setFe({ loginId: 'This login ID does not belong to a company set up here.' }); return }
    setTenantId(tenant)
    setFe({}); setError(null); setBusy(true)
    try {
      await requestPasswordReset(loginId)
      setTries(0); setCode(''); setPw(''); setPw2('')
      setStep('verify')
      notify('If the login ID exists, a one time password has been sent.')
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!/^\d{6}$/.test(code)) errs.code = 'Enter the 6 digit OTP.'
    if (pw.length < 8) errs.pw = 'Use at least 8 characters.'
    if (pw2 !== pw) errs.pw2 = 'Passwords do not match.'
    setFe(errs)
    if (Object.keys(errs).length) return
    if (tries >= MAX_TRIES) { setError('Too many wrong attempts. Request a new OTP.'); return }
    setError(null); setBusy(true)
    try {
      await confirmPasswordReset(loginId, code, pw)
      notify('Password changed. Sign in with your new password.')
      navigate(back, { replace: true })
    } catch (err) {
      const t = tries + 1
      setTries(t)
      if (t >= MAX_TRIES) setError('Too many wrong attempts. Request a new OTP.')
      else fail(err)
    } finally { setBusy(false) }
  }

  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <main className="pub-main pub-narrow">
        <section className="card">
          <div className="card-b">
            <h1 className="login-title">Reset password</h1>
            {step === 'request' ? (
              <>
                <p className="login-sub">
                  Enter your login ID. A one time password (OTP) is sent to your registered contact.
                </p>
                <form noValidate onSubmit={send} className="stack" style={{ gap: 16 }}>
                  <FormGroup label="Login ID" required error={fe.loginId}>
                    {(id, d) => <Input autoComplete="username" spellCheck={false} style={{ textTransform: 'uppercase' }} value={loginId} onChange={(ev) => setLoginId(ev.target.value.toUpperCase())} {...a11y(id, d, fe.loginId)} />}
                  </FormGroup>
                  <Button type="submit" tone="primary" icon="key" disabled={busy} className="login-btn">Send OTP</Button>
                </form>
              </>
            ) : (
              <>
                {SAMPLE_OTP ? (
                  <Note title="Testing: no email is sent yet" icon="info" className="mt-0">
                    Until email is set up, enter the sample OTP <b>{SAMPLE_OTP}</b> with your new password.
                  </Note>
                ) : (
                  <p className="login-sub">An OTP was sent to {sentTo}. Enter it with your new password.</p>
                )}
                <form noValidate onSubmit={verify} className="stack" style={{ gap: 16 }}>
                  {error && <div className="login-error" role="alert"><span>{error}</span></div>}
                  <FormGroup label="OTP" required error={fe.code}>
                    {(id, d) => <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))} {...a11y(id, d, fe.code)} />}
                  </FormGroup>
                  <FormGroup label="New password" required error={fe.pw}>
                    {(id, d) => (
                      <div className="pw-wrap">
                        <Input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(ev) => setPw(ev.target.value)} {...a11y(id, d, fe.pw)} />
                        <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                          <Icon name={showPw ? 'eyeOff' : 'eye'} />
                        </button>
                      </div>
                    )}
                  </FormGroup>
                  <FormGroup label="Confirm new password" required error={fe.pw2}>
                    {(id, d) => (
                      <div className="pw-wrap">
                        <Input type={showPw2 ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(ev) => setPw2(ev.target.value)} {...a11y(id, d, fe.pw2)} />
                        <button type="button" className="pw-toggle" onClick={() => setShowPw2((s) => !s)} aria-label={showPw2 ? 'Hide password' : 'Show password'} aria-pressed={showPw2}>
                          <Icon name={showPw2 ? 'eyeOff' : 'eye'} />
                        </button>
                      </div>
                    )}
                  </FormGroup>
                  <Button type="submit" tone="primary" icon="key" disabled={busy || tries >= MAX_TRIES} className="login-btn">Reset password</Button>
                  <button type="button" className="pub-link" onClick={() => { setStep('request'); setError(null) }}>Resend OTP</button>
                </form>
              </>
            )}
            <p className="login-foot"><Link to={back}>Back to login</Link></p>
          </div>
        </section>
      </main>
    </div>
  )
}
