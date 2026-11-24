import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { startAuthentication, browserSupportsWebAuthn, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { api, ApiError, onPasswordChangeRequired, onSessionExpired, SESSION_REPLACED_CODE, setTokens, type TokenPair } from '@/shared/lib/api'
import { passkeyLoginOptions, passkeyLoginVerify, type PasskeyAuthenticationResponse } from '../api'

/**
 * Sign-in against the Core API (POST /auth/login). The server checks the password, counts failures and locks
 * the account; the browser only shows the outcome. Tokens are held by the API client (shared/lib/api).
 */

/** The privilege that marks a tenant administrator (core_role access_admin). */
export const ADMIN_PRIVILEGE = 'access.manage'

export interface SignedInUser { id: string; loginId: string; name: string; email: string | null }

export type LoginResult = 'ok' | 'invalid' | 'locked' | 'offline' | 'error'

interface AuthState {
  /** login ID of the signed-in user, or null */
  user: string | null
  profile: SignedInUser | null
  /** privileges the server says this user holds (GET /auth/me/access) */
  privileges: string[]
  isAdmin: boolean
  signedInAt: string | null
  /** epoch ms until which the server asked us to wait (429 Retry-After) */
  lockedUntil: number
  /** last error text from the server, for the login page */
  lastError: string
  /** true right after a deliberate sign-out, so the guard does not add ?next= */
  signedOut: boolean
  /** true when the session ended because the user signed in on another device; the login page says so */
  sessionReplaced: boolean
  /** the server requires a new password (temporary password in use); the guard sends the user to /change-password */
  mustChangePassword: boolean
  login: (loginId: string, password: string) => Promise<LoginResult>
  /** Signs in with a passkey registered to the login ID (WebAuthn). A cancelled or unsupported attempt returns 'error' with lastError set. */
  loginWithPasskey: (loginId: string) => Promise<LoginResult>
  logout: () => Promise<void>
  clearSignedOut: () => void
  /** after POST /auth/change-password succeeds: clears the flag and re-reads the user's privileges */
  passwordChanged: () => Promise<void>
}

const storage = createJSONStorage(() => {
  try { sessionStorage.setItem('__t', '1'); sessionStorage.removeItem('__t'); return sessionStorage }
  catch { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
})

/** Callbacks run after a deliberate sign-out or a session the server ended (see onSignedOut). */
const signedOutListeners = new Set<() => void>()

/**
 * Runs `listener` after the user signs out or the server ends the session, so other modules can drop what the
 * previous user loaded (CORE-18-03). Returns a function that removes the listener.
 */
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener)
  return () => signedOutListeners.delete(listener)
}

const notifySignedOut = () => signedOutListeners.forEach((listener) => listener())

const signedOutState = { user: null, profile: null, privileges: [], isAdmin: false, signedInAt: null, mustChangePassword: false, sessionReplaced: false }

/** Stores the tokens of a successful sign-in and reads the user's privileges. Shared by password and passkey sign-in. */
async function applySignIn(
  result: TokenPair & { user: SignedInUser; mustChangePassword?: boolean },
  set: (partial: Partial<AuthState>) => void,
) {
  setTokens(result)
  let privileges: string[] = []
  try {
    privileges = await readPrivileges()
  } catch { /* access is optional for sign-in; screens that need it re-check on the server */ }
  set({
    user: result.user.loginId, profile: result.user, privileges, isAdmin: privileges.includes(ADMIN_PRIVILEGE),
    signedInAt: new Date().toISOString(), lockedUntil: 0, lastError: '', signedOut: false, sessionReplaced: false,
    mustChangePassword: result.mustChangePassword === true,
  })
}

/** Maps a failed sign-in request to the outcome the login page shows. */
function signInFailure(err: unknown, set: (partial: Partial<AuthState>) => void): LoginResult {
  if (!(err instanceof ApiError)) { set({ lastError: '' }); return 'error' }
  if (err.code === 'RATE_LIMITED') { set({ lockedUntil: Date.now() + (err.retryAfter ?? 30) * 1000, lastError: err.message }); return 'locked' }
  if (err.code === 'NETWORK_ERROR') { set({ lastError: err.message }); return 'offline' }
  if (err.status === 401) { set({ lastError: err.message }); return 'invalid' }
  set({ lastError: err.message })
  return 'error'
}

/** GET /auth/me/access (allowed while a password change is pending). */
const readPrivileges = async () => {
  const access = await api<{ privileges: { privilege: string }[] }>('GET', '/auth/me/access')
  return [...new Set(access.privileges.map((p) => p.privilege))]
}

/** Session lasts until the tab is closed (sessionStorage) or the user signs out. */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      ...signedOutState,
      lockedUntil: 0,
      lastError: '',
      signedOut: false,
      login: async (loginId, password) => {
        if (Date.now() < get().lockedUntil) return 'locked'
        try {
          const result = await api<TokenPair & { user: SignedInUser; mustChangePassword?: boolean }>('POST', '/auth/login', { body: { loginId: loginId.trim(), password }, auth: false })
          await applySignIn(result, set)
          return 'ok'
        } catch (err) {
          return signInFailure(err, set)
        }
      },
      loginWithPasskey: async (loginId) => {
        if (Date.now() < get().lockedUntil) return 'locked'
        if (!browserSupportsWebAuthn()) { set({ lastError: 'This browser does not support passkeys. Sign in with your password.' }); return 'error' }
        try {
          const options = await passkeyLoginOptions(loginId)
          const response = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON })
          const result = await passkeyLoginVerify(loginId, response as unknown as PasskeyAuthenticationResponse)
          await applySignIn(result as unknown as TokenPair & { user: SignedInUser; mustChangePassword?: boolean }, set)
          return 'ok'
        } catch (err) {
          // the browser throws when the user cancels the prompt; the server answers its own errors
          if (err instanceof ApiError) return signInFailure(err, set)
          set({ lastError: 'Passkey sign-in was cancelled or did not work. Try again, or sign in with your password.' })
          return 'error'
        }
      },
      logout: async () => {
        // end the session on the server; sign out locally whatever the answer
        try { if (get().user) await api('POST', '/auth/logout') } catch { /* already gone */ }
        setTokens(null)
        set({ ...signedOutState, signedOut: true })
        notifySignedOut()
      },
      clearSignedOut: () => set({ signedOut: false }),
      passwordChanged: async () => {
        set({ mustChangePassword: false })
        try {
          const privileges = await readPrivileges()
          set({ privileges, isAdmin: privileges.includes(ADMIN_PRIVILEGE) })
        } catch { /* keep the privileges read at sign-in */ }
      },
    }),
    {
      name: 'veloxiq-core-auth:v2',
      version: 2,
      storage,
      partialize: (s) => ({ user: s.user, profile: s.profile, privileges: s.privileges, isAdmin: s.isAdmin, signedInAt: s.signedInAt, lockedUntil: s.lockedUntil, mustChangePassword: s.mustChangePassword }),
    },
  ),
)

// a refused refresh means the server ended the session: drop the local sign-in so the guard sends the user to login
onSessionExpired((reason) => {
  setTokens(null)
  useAuth.setState({ ...signedOutState, sessionReplaced: reason === SESSION_REPLACED_CODE })
  notifySignedOut()
})

// a 403 PASSWORD_CHANGE_REQUIRED from any call: flag it, and the guard sends the signed-in user to /change-password
onPasswordChangeRequired(() => {
  if (useAuth.getState().user && !useAuth.getState().mustChangePassword) useAuth.setState({ mustChangePassword: true })
})
