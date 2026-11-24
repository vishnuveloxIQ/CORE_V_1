import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/icons'
import { a11y } from '@/shared/lib/core'
import { notify } from '@/shared/lib/toast'
import { ApiError, errorText, fieldErrors, setTokens } from '@/shared/lib/api'
import { useAuth } from '../store/useAuth'
import { changePassword } from '../api'
import { PublicNav } from '../components/PublicNav'

const MIN_LENGTH = 12

/** Only send people back to a page inside this app. */
const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') && !['/login', '/change-password'].includes(next) ? next : '/dashboard'

/**
 * POST /auth/change-password for the signed-in user. Used when the server requires a new password (a temporary
 * password from an admin create or reset), and open to any signed-in user. It calls only auth routes, so it cannot
 * trigger PASSWORD_CHANGE_REQUIRED itself and loop back here. The current session stays signed in.
 */
export default function ChangePassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const forced = useAuth((s) => s.mustChangePassword)
  const passwordChanged = useAuth((s) => s.passwordChanged)
  const logout = useAuth((s) => s.logout)
  const next = safeNext(params.get('next'))
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fe, setFe] = useState<Record<string, string>>({})

  useEffect(() => { document.title = 'Change password | VeloxIQ' }, [])
  if (!user) return <Navigate to="/login?role=admin" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!current) errs.currentPassword = 'Enter your current password.'
    if (pw.length < MIN_LENGTH) errs.newPassword = `Use at least ${MIN_LENGTH} characters.`
    else if (pw === current) errs.newPassword = 'Choose a password different from the current one.'
    if (pw2 !== pw) errs.confirm = 'Passwords do not match.'
    setFe(errs)
    if (Object.keys(errs).length) return
    setError('')
    setBusy(true)
    try {
      const res = await changePassword(current, pw)
      // the server keeps this session; if it answers with a fresh token pair, keep that instead
      if (res && typeof res.accessToken === 'string' && typeof res.refreshToken === 'string') setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
      setCurrent(''); setPw(''); setPw2('')
      await passwordChanged()
      notify('Password changed. Other sessions were signed out.')
      navigate(next, { replace: true })
    } catch (err) {
      const named = fieldErrors(err)
      setFe(named)
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') setError(`Too many attempts. Try again${err.retryAfter ? ` in ${err.retryAfter} seconds` : ' later'}.`)
      else if (!Object.keys(named).length) setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (
    <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show}>
      <Icon name={show ? 'eyeOff' : 'eye'} />
    </button>
  )

  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <main className="pub-main pub-narrow">
        <section className="card">
          <div className="card-b">
            <h1 className="login-title">Change password</h1>
            <p className="login-sub">
              {forced
                ? 'You signed in with a temporary password. Choose a new password to continue.'
                : 'Choose a new password. Your other sessions will be signed out.'}
            </p>
            <form noValidate onSubmit={(e) => void submit(e)} className="stack" style={{ gap: 16 }}>
              {error && <div className="login-error" role="alert"><Icon name="alert" /><span>{error}</span></div>}
              <FormGroup label="Current password" required error={fe.currentPassword}>
                {(id, d) => (
                  <div className="pw-wrap">
                    <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(ev) => setCurrent(ev.target.value)} {...a11y(id, d, fe.currentPassword)} />
                    {toggle}
                  </div>
                )}
              </FormGroup>
              <FormGroup label="New password" required helper={`At least ${MIN_LENGTH} characters, different from the current one.`} error={fe.newPassword}>
                {(id, d) => <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(ev) => setPw(ev.target.value)} {...a11y(id, d, fe.newPassword)} />}
              </FormGroup>
              <FormGroup label="Confirm new password" required error={fe.confirm}>
                {(id, d) => <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(ev) => setPw2(ev.target.value)} {...a11y(id, d, fe.confirm)} />}
              </FormGroup>
              <Button type="submit" tone="primary" icon="key" disabled={busy} className="login-btn">{busy ? 'Saving…' : 'Change password'}</Button>
            </form>
            <p className="login-foot">
              <button type="button" className="pub-link" onClick={() => void logout().then(() => navigate('/login?role=admin', { replace: true }))}>Sign out instead</button>
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
