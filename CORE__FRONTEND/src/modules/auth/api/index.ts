import { api, type TokenPair } from '@/shared/lib/api'

/**
 * Auth routes not used by sign-in itself (login, refresh and logout live in useAuth and shared/lib/api).
 * The public routes send no bearer token and no Idempotency-Key.
 */

export interface MeRecord { id: string; loginId: string; name: string; email: string | null }
export const getMe = () => api<MeRecord>('GET', '/auth/me')

/** POST /auth/password-reset/request. The server sends a 6 digit code and answers 202. */
export const requestPasswordReset = (loginId: string) =>
  api<{ accepted: boolean }>('POST', '/auth/password-reset/request', { body: { loginId: loginId.trim() }, auth: false })
/** POST /auth/password-reset/confirm. */
export const confirmPasswordReset = (loginId: string, code: string, newPassword: string) =>
  api<{ passwordReset: boolean }>('POST', '/auth/password-reset/confirm', { body: { loginId: loginId.trim(), code, newPassword }, auth: false })

/**
 * POST /auth/change-password (signed in). Clears the forced-change flag and ends the user's other sessions; the
 * current session stays valid. If the server answers with a new token pair, the caller stores it.
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  api<Partial<TokenPair> & Record<string, unknown> | null>('POST', '/auth/change-password', { body: { currentPassword, newPassword } })

// ---------- passkeys (WebAuthn). Options are the server's PublicKeyCredential JSON for the browser (or @simplewebauthn/browser). ----------
export interface PasskeyView { id: string; label: string | null; createdAt: string }
type WebAuthnOptions = Record<string, unknown>
/** The browser's answers, as the JSON the server checks. */
export interface PasskeyRegistrationResponse {
  id: string; rawId: string; type: 'public-key'; authenticatorAttachment?: 'cross-platform' | 'platform'
  clientExtensionResults: Record<string, unknown>; response: { clientDataJSON: string; attestationObject: string; transports?: string[] }
}
export interface PasskeyAuthenticationResponse {
  id: string; rawId: string; type: 'public-key'; authenticatorAttachment?: 'cross-platform' | 'platform'
  clientExtensionResults: Record<string, unknown>; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null }
}

export const passkeyRegisterOptions = () => api<WebAuthnOptions>('POST', '/auth/passkeys/register/options', { body: {} })
export const passkeyRegisterVerify = (response: PasskeyRegistrationResponse, label?: string) =>
  api<PasskeyView>('POST', '/auth/passkeys/register/verify', { body: { response, label } })
export const listPasskeys = async () => (await api<{ passkeys: PasskeyView[] }>('GET', '/auth/passkeys')).passkeys
export const deletePasskey = (id: string) => api<{ removed: boolean }>('DELETE', `/auth/passkeys/${encodeURIComponent(id)}`)
export const passkeyLoginOptions = (loginId: string) =>
  api<WebAuthnOptions>('POST', '/auth/passkeys/login/options', { body: { loginId: loginId.trim() }, auth: false })
/** Returns the same tokens and user as POST /auth/login; pass the result to setTokens. */
export const passkeyLoginVerify = (loginId: string, response: PasskeyAuthenticationResponse, deviceLabel?: string) =>
  api<TokenPair & { user: MeRecord; mustChangePassword?: boolean }>('POST', '/auth/passkeys/login/verify', { body: { loginId: loginId.trim(), response, deviceLabel }, auth: false })
